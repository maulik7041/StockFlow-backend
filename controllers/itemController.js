const Item = require('../models/Item');
const Inventory = require('../models/Inventory');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { getPagination, getSort } = require('../utils/pagination');
const { getAdvancedFilter } = require('../utils/filter');

exports.getItems = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const sort = getSort(req.query);
    const filter = { organization: req.organizationId, ...getAdvancedFilter(req.query) };
    if (req.query.search) {
      filter.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { category: { $regex: req.query.search, $options: 'i' } },
      ];
    }
    if (req.query.category) filter.category = req.query.category;
    if (req.query.itemType) filter.itemType = { $in: req.query.itemType.split(',') };
    if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';

    const [items, total] = await Promise.all([
      Item.find(filter).sort(sort).skip(skip).limit(limit),
      Item.countDocuments(filter),
    ]);
    return sendPaginated(res, items, total, page, limit, 'Items fetched');
  } catch (err) { next(err); }
};

exports.getItem = async (req, res, next) => {
  try {
    const item = await Item.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!item) return sendError(res, 'Item not found', 404);
    return sendSuccess(res, item);
  } catch (err) { next(err); }
};

exports.createItem = async (req, res, next) => {
  try {
    const item = await Item.create({ ...req.body, organization: req.organizationId, createdAt: Date.now(), updatedAt: Date.now() });
    await Inventory.create({ item: item._id, organization: req.organizationId, currentStock: 0, createdAt: Date.now(), updatedAt: Date.now() });
    return sendSuccess(res, item, 'Item created', 201);
  } catch (err) { next(err); }
};

exports.updateItem = async (req, res, next) => {
  try {
    const item = await Item.findOneAndUpdate(
      { _id: req.params.id, organization: req.organizationId },
      { ...req.body, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );
    if (!item) return sendError(res, 'Item not found', 404);
    return sendSuccess(res, item, 'Item updated');
  } catch (err) { next(err); }
};

exports.deleteItem = async (req, res, next) => {
  try {
    const item = await Item.findOneAndUpdate(
      { _id: req.params.id, organization: req.organizationId },
      { isActive: false, updatedAt: Date.now() },
      { new: true }
    );
    if (!item) return sendError(res, 'Item not found', 404);
    return sendSuccess(res, null, 'Item deactivated');
  } catch (err) { next(err); }
};

exports.getCategories = async (req, res, next) => {
  try {
    const categories = await Item.distinct('category', { organization: req.organizationId });
    return sendSuccess(res, categories, 'Categories fetched');
  } catch (err) { next(err); }
};
