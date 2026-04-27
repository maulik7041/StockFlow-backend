const PurchaseOrder = require('../models/PurchaseOrder');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { getPagination, getSort } = require('../utils/pagination');
const { getAdvancedFilter } = require('../utils/filter');

exports.getPOs = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { organization: req.organizationId, ...getAdvancedFilter(req.query) };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.vendor) filter.vendor = req.query.vendor;
    if (req.query.search) filter.poNumber = { $regex: req.query.search, $options: 'i' };

    const [pos, total] = await Promise.all([
      PurchaseOrder.find(filter).populate('vendor', 'name').populate('createdBy', 'name').sort(getSort(req.query)).skip(skip).limit(limit),
      PurchaseOrder.countDocuments(filter),
    ]);
    return sendPaginated(res, pos, total, page, limit);
  } catch (err) { next(err); }
};

exports.getPO = async (req, res, next) => {
  try {
    const po = await PurchaseOrder.findOne({ _id: req.params.id, organization: req.organizationId })
      .populate('vendor').populate('items.item', 'name unit').populate('createdBy', 'name');
    if (!po) return sendError(res, 'Purchase Order not found', 404);
    return sendSuccess(res, po);
  } catch (err) { next(err); }
};

exports.createPO = async (req, res, next) => {
  try {
    const { vendor, items, status, poDate, deliveryDate, notes, freightCharges, taxType } = req.body;
    const po = await PurchaseOrder.create({ vendor, items, status, poDate, deliveryDate, notes, freightCharges, taxType, organization: req.organizationId, createdBy: req.user._id, createdAt: Date.now(), updatedAt: Date.now() });
    return sendSuccess(res, po, 'Purchase Order created', 201);
  } catch (err) { next(err); }
};

exports.updatePO = async (req, res, next) => {
  try {
    const po = await PurchaseOrder.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!po) return sendError(res, 'Purchase Order not found', 404);
    if (['Complete', 'Cancelled'].includes(po.status)) return sendError(res, `Cannot edit a ${po.status} PO`, 400);
    // C3: Strip protected fields
    const { organization, createdBy, poNumber, totalAmount, ...safeBody } = req.body;
    Object.assign(po, safeBody);
    po.updatedAt = Date.now();
    await po.save();
    return sendSuccess(res, po, 'Purchase Order updated');
  } catch (err) { next(err); }
};

exports.cancelPO = async (req, res, next) => {
  try {
    const po = await PurchaseOrder.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!po) return sendError(res, 'Purchase Order not found', 404);
    if (po.status === 'Complete') return sendError(res, 'Cannot cancel a completed PO', 400);
    po.status = 'Cancelled';
    po.updatedAt = Date.now();
    await po.save();
    return sendSuccess(res, po, 'Purchase Order cancelled');
  } catch (err) { next(err); }
};
