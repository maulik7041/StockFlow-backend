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
      status: 'Issued',
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    // 3. Deduct stock and record transactions
    for (const update of inventoryUpdates) {
      const { inv, qty } = update;
      inv.currentStock -= qty;
      inv.updatedAt = Date.now();
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
        createdBy: req.user.id,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    return sendSuccess(res, issue, 'Stock issued successfully', 201);
  } catch (err) { next(err); }
};

exports.cancelStockIssue = async (req, res, next) => {
  try {
    const issue = await StockIssue.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!issue) return sendError(res, 'Stock Issue not found', 404);
    if (issue.status === 'Cancelled') return sendError(res, 'Already cancelled', 400);

    if (issue.status === 'Issued') {
      for (const item of issue.items) {
        let inv = await Inventory.findOne({ item: item.item, organization: req.organizationId });
        if (inv) {
          inv.currentStock += item.quantity;
          inv.updatedAt = Date.now();
          await inv.save();

          await StockTransaction.create({
            item: item.item,
            organization: req.organizationId,
            type: 'IN',
            quantity: item.quantity,
            balanceAfter: inv.currentStock,
            refModel: 'StockIssue',
            refId: issue._id,
            note: `Cancelled Stock Issue ${issue.issueNumber}`,
            createdBy: req.user._id,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      }
    }

    issue.status = 'Cancelled';
    issue.updatedAt = Date.now();
    await issue.save();
    return sendSuccess(res, issue, 'Stock Issue Cancelled');
  } catch(err) { next(err); }
};
