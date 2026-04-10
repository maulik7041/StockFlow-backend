const StockIssue = require('../models/StockIssue');
const Inventory = require('../models/Inventory');
const StockTransaction = require('../models/StockTransaction');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { getPagination, getSort } = require('../utils/pagination');
const { getAdvancedFilter } = require('../utils/filter');
const Item = require('../models/Item');

exports.getIssues = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const sort = getSort(req.query);
    const filter = { organization: req.organizationId, ...getAdvancedFilter(req.query) };

    if (filter['item.name']) {
      const items = await Item.find({ name: filter['item.name'], organization: req.organizationId }).select('_id');
      filter['items.item'] = { $in: items.map(i => i._id) };
      delete filter['item.name'];
    }

    const [issues, total] = await Promise.all([
      StockIssue.find(filter)
        .populate('items.item', 'name')
        .populate('issuedBy', 'name email')
        .sort(sort).skip(skip).limit(limit),
      StockIssue.countDocuments(filter),
    ]);
    return sendPaginated(res, issues, total, page, limit, 'Stock issues fetched');
  } catch (err) { next(err); }
};

exports.getIssue = async (req, res, next) => {
  try {
    const issue = await StockIssue.findOne({ _id: req.params.id, organization: req.organizationId })
      .populate('items.item', 'name unit category')
      .populate('issuedBy', 'name');
    if (!issue) return sendError(res, 'Stock issue not found', 404);
    return sendSuccess(res, issue);
  } catch (err) { next(err); }
};

exports.createIssue = async (req, res, next) => {
  try {
    const { items, department, notes } = req.body;
    if (!items || !items.length) return sendError(res, 'Items required', 400);

    // 1. Verify enough stock and items exist
    const inventoryUpdates = [];
    for (const poItem of items) {
      const inv = await Inventory.findOne({ item: poItem.item, organization: req.organizationId });
      if (!inv || inv.currentStock < poItem.quantity) {
        return sendError(res, `Insufficient stock for item ID: ${poItem.item}`, 400);
      }
      inventoryUpdates.push({ inv, qty: poItem.quantity });
    }

    // 2. Create Stock Issue
    const issue = await StockIssue.create({
      organization: req.organizationId,
      items,
      department,
      notes,
      issuedBy: req.user.id,
      status: 'Issued'
    });

    // 3. Deduct stock and record transactions
    for (const update of inventoryUpdates) {
      const { inv, qty } = update;
      inv.currentStock -= qty;
      await inv.save();

      await StockTransaction.create({
        organization: req.organizationId,
        item: inv.item,
        type: 'OUT',
        quantity: qty,
        balanceAfter: inv.currentStock,
        refModel: 'StockIssue',
        refId: issue._id,
        note: `Stock Issue to ${department || 'General'}`,
        createdBy: req.user.id
      });
    }

    return sendSuccess(res, issue, 'Stock issued successfully', 201);
  } catch (err) { next(err); }
};
