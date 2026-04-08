const Inventory = require('../models/Inventory');
const StockTransaction = require('../models/StockTransaction');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { getPagination, getSort } = require('../utils/pagination');
const { getAdvancedFilter } = require('../utils/filter');

exports.getInventory = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { organization: req.organizationId, ...getAdvancedFilter(req.query) };

    if (filter['item.name'] || filter['item.category']) {
      const Item = require('../models/Item');
      const itemFilter = { organization: req.organizationId };
      if (filter['item.name']) itemFilter.name = filter['item.name'];
      if (filter['item.category']) itemFilter.category = filter['item.category'];

      const items = await Item.find(itemFilter).select('_id');
      filter.item = { $in: items.map(i => i._id) };
      delete filter['item.name'];
      delete filter['item.category'];
    }

    if (filter.status) {
      if (filter.status.$regex && filter.status.$regex.toLowerCase() === 'out') {
        filter.currentStock = 0;
      }
      delete filter.status;
    }

    const [records, total] = await Promise.all([
      Inventory.find(filter).populate('item', 'name sku category unit reorderLevel').sort({ updatedAt: -1 }).skip(skip).limit(limit),
      Inventory.countDocuments(filter),
    ]);

    const data = records.map((r) => {
      const obj = r.toJSON();
      obj.isLowStock = r.item && r.currentStock <= r.item.reorderLevel;
      return obj;
    });

    return sendPaginated(res, data, total, page, limit, 'Inventory fetched');
  } catch (err) { next(err); }
};

exports.adjustStock = async (req, res, next) => {
  try {
    const { itemId, quantity, type, note } = req.body;
    if (!itemId || !quantity || !type) return sendError(res, 'itemId, quantity and type required', 400);

    let inv = await Inventory.findOne({ item: itemId, organization: req.organizationId });
    if (!inv) return sendError(res, 'Inventory record not found', 404);

    if (type === 'OUT' && inv.currentStock < quantity) {
      return sendError(res, 'Insufficient stock', 400);
    }

    inv.currentStock = type === 'IN' ? inv.currentStock + quantity : inv.currentStock - quantity;
    await inv.save();

    await StockTransaction.create({
      item: itemId,
      organization: req.organizationId,
      type: 'ADJUST',
      quantity,
      balanceAfter: inv.currentStock,
      refModel: 'Adjustment',
      note,
      createdBy: req.user._id,
    });

    return sendSuccess(res, inv, 'Stock adjusted');
  } catch (err) { next(err); }
};

exports.getTransactions = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const sort = getSort(req.query);
    const filter = { organization: req.organizationId, ...getAdvancedFilter(req.query) };
    if (req.query.item) filter.item = req.query.item;
    if (req.query.type) filter.type = req.query.type;

    if (filter['item.name']) {
      const Item = require('../models/Item');
      const items = await Item.find({ name: filter['item.name'], organization: req.organizationId }).select('_id');
      filter.item = { $in: items.map(i => i._id) };
      delete filter['item.name'];
    }

    const [transactions, total] = await Promise.all([
      StockTransaction.find(filter)
        .populate('item', 'name sku unit')
        .populate('createdBy', 'name')
        .sort(sort).skip(skip).limit(limit),
      StockTransaction.countDocuments(filter),
    ]);
    return sendPaginated(res, transactions, total, page, limit, 'Transactions fetched');
  } catch (err) { next(err); }
};
