const mongoose = require('mongoose');
const GRN = require('../models/GRN');
const PurchaseOrder = require('../models/PurchaseOrder');
const Inventory = require('../models/Inventory');
const StockTransaction = require('../models/StockTransaction');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { getPagination, getSort } = require('../utils/pagination');

exports.getGRNs = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { organization: req.organizationId };
    if (req.query.po) filter.purchaseOrder = req.query.po;
    const [grns, total] = await Promise.all([
      GRN.find(filter).populate('purchaseOrder', 'poNumber').populate('createdBy', 'name').sort(getSort(req.query)).skip(skip).limit(limit),
      GRN.countDocuments(filter),
    ]);
    return sendPaginated(res, grns, total, page, limit);
  } catch (err) { next(err); }
};

exports.getGRN = async (req, res, next) => {
  try {
    const grn = await GRN.findOne({ _id: req.params.id, organization: req.organizationId })
      .populate('purchaseOrder', 'poNumber vendor').populate('items.item', 'name sku unit');
    if (!grn) return sendError(res, 'GRN not found', 404);
    return sendSuccess(res, grn);
  } catch (err) { next(err); }
};

exports.createGRN = async (req, res, next) => {
  try {
    const { purchaseOrderId, items, notes, receivedAt } = req.body;
    const orgId = req.organizationId;

    const po = await PurchaseOrder.findOne({ _id: purchaseOrderId, organization: orgId });
    if (!po) throw new Error('Purchase Order not found');
    if (po.status === 'Cancelled') throw new Error('Cannot receive against a cancelled PO');

    for (const grnItem of items) {
      const poItem = po.items.find((i) => i.item.toString() === grnItem.item);
      if (!poItem) throw new Error(`Item ${grnItem.item} not found in PO`);
      const alreadyReceived = poItem.receivedQty || 0;
      if (alreadyReceived + grnItem.receivedQty > poItem.quantity) {
        throw new Error(`Received qty exceeds ordered qty for item ${grnItem.item}`);
      }
    }

    const grn = await GRN.create({ purchaseOrder: purchaseOrderId, organization: orgId, items, notes, receivedAt, createdBy: req.user._id });

    for (const grnItem of items) {
      let inv = await Inventory.findOne({ item: grnItem.item, organization: orgId });
      if (!inv) {
        inv = await Inventory.create({ item: grnItem.item, organization: orgId, currentStock: 0 });
      }
      inv.currentStock += grnItem.receivedQty;
      await inv.save();

      await StockTransaction.create({
        item: grnItem.item,
        organization: orgId,
        type: 'IN',
        quantity: grnItem.receivedQty,
        balanceAfter: inv.currentStock,
        refModel: 'GRN',
        refId: grn._id,
        note: `GRN ${grn.grnNumber}`,
        createdBy: req.user._id,
      });

      const poItem = po.items.find((i) => i.item.toString() === grnItem.item);
      if (poItem) poItem.receivedQty = (poItem.receivedQty || 0) + grnItem.receivedQty;
    }

    const allComplete = po.items.every((i) => i.receivedQty >= i.quantity);
    const anyReceived = po.items.some((i) => (i.receivedQty || 0) > 0);
    po.status = allComplete ? 'Complete' : anyReceived ? 'Partial' : po.status;
    await po.save();

    return sendSuccess(res, grn, 'GRN created and stock updated', 201);
  } catch (err) {
    return sendError(res, err.message, 400);
  }
};
