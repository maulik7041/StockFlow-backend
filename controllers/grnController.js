const mongoose = require('mongoose');
const GRN = require('../models/GRN');
const PurchaseOrder = require('../models/PurchaseOrder');
const Inventory = require('../models/Inventory');
const StockTransaction = require('../models/StockTransaction');
const Item = require('../models/Item');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { getPagination, getSort } = require('../utils/pagination');
const { getAdvancedFilter } = require('../utils/filter');

exports.getGRNs = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { organization: req.organizationId, ...getAdvancedFilter(req.query) };
    if (req.query.po) filter.purchaseOrder = req.query.po;
    const [grns, total] = await Promise.all([
      GRN.find(filter).populate('purchaseOrder', 'poNumber vendor').populate('createdBy', 'name').sort(getSort(req.query)).skip(skip).limit(limit),
      GRN.countDocuments(filter),
    ]);
    return sendPaginated(res, grns, total, page, limit);
  } catch (err) { next(err); }
};

exports.getGRN = async (req, res, next) => {
  try {
    const grn = await GRN.findOne({ _id: req.params.id, organization: req.organizationId })
      .populate('purchaseOrder', 'poNumber vendor').populate('items.item', 'name unit');
    if (!grn) return sendError(res, 'GRN not found', 404);
    return sendSuccess(res, grn);
  } catch (err) { next(err); }
};

exports.createGRN = async (req, res, next) => {
  try {
    const { purchaseOrderId, items, notes, receivedAt, vendorBillNo, vendorBillDate } = req.body;
    const orgId = req.organizationId;

    const po = await PurchaseOrder.findOne({ _id: purchaseOrderId, organization: orgId });
    if (!po) throw new Error('Purchase Order not found');
    if (po.status === 'Cancelled') throw new Error('Cannot receive against a cancelled PO');

    for (const grnItem of items) {
      const poItem = po.items.find((i) => i.item.toString() === grnItem.item);
      if (!poItem) {
        const itemDoc = await Item.findById(grnItem.item).select('name');
        throw new Error(`Item "${itemDoc?.name || 'Unknown'}" not found in this Purchase Order`);
      }
      const alreadyReceived = poItem.receivedQty || 0;
      if (alreadyReceived + grnItem.receivedQty > poItem.quantity) {
        const itemDoc = await Item.findById(grnItem.item).select('name');
        throw new Error(`Received quantity exceeds ordered quantity for "${itemDoc?.name || 'Unknown Item'}"`);
      }
    }

    const grn = await GRN.create({ purchaseOrder: purchaseOrderId, organization: orgId, items, notes, receivedAt, vendorBillNo, vendorBillDate, createdBy: req.user._id, createdAt: Date.now(), updatedAt: Date.now() });

    for (const grnItem of items) {
      let inv = await Inventory.findOne({ item: grnItem.item, organization: orgId });
      if (!inv) {
        inv = await Inventory.create({ item: grnItem.item, organization: orgId, currentStock: 0, createdAt: Date.now(), updatedAt: Date.now() });
      }
      inv.currentStock += grnItem.receivedQty;
      inv.updatedAt = Date.now();
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
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const poItem = po.items.find((i) => i.item.toString() === grnItem.item);
      if (poItem) poItem.receivedQty = (poItem.receivedQty || 0) + grnItem.receivedQty;
    }

    const allComplete = po.items.every((i) => i.receivedQty >= i.quantity);
    if (allComplete) {
      po.status = 'Complete';
    }
    po.updatedAt = Date.now();
    await po.save();

    return sendSuccess(res, grn, 'GRN created and stock updated', 201);
  } catch (err) {
    return sendError(res, 'Failed to create GRN. Please try again.', 400);
  }
};

exports.cancelGRN = async (req, res, next) => {
  try {
    const grn = await GRN.findOne({ _id: req.params.id, organization: req.organizationId }).populate('purchaseOrder');
    if (!grn) return sendError(res, 'GRN not found', 404);
    if (grn.status === 'Cancelled') return sendError(res, 'GRN is already cancelled', 400);

    // M5: Verify sufficient stock before reversing
    for (const grnItem of grn.items) {
      const inv = await Inventory.findOne({ item: grnItem.item, organization: req.organizationId });
      if (!inv || inv.currentStock < grnItem.receivedQty) {
        const itemDoc = await Item.findById(grnItem.item).select('name');
        return sendError(res, `Cannot cancel GRN: insufficient stock to reverse "${itemDoc?.name || 'Unknown Item'}". Current stock: ${inv?.currentStock || 0}, needs: ${grnItem.receivedQty}`, 400);
      }
    }

    for (const item of grn.items) {
      let inv = await Inventory.findOne({ item: item.item, organization: req.organizationId });
      if (inv) {
        inv.currentStock -= item.receivedQty;
        await inv.save();

        await StockTransaction.create({
          item: item.item,
          organization: req.organizationId,
          type: 'OUT',
          quantity: item.receivedQty,
          balanceAfter: inv.currentStock,
          refModel: 'GRN',
          refId: grn._id,
          note: `Cancelled GRN ${grn.grnNumber}`,
          createdBy: req.user._id,
        });
      }
    }

    const po = grn.purchaseOrder;
    if (po) {
      let allComplete = true;
      for (const grnItem of grn.items) {
        const poItem = po.items.find(i => i.item.toString() === grnItem.item.toString());
        if (poItem) poItem.receivedQty = (poItem.receivedQty || 0) - grnItem.receivedQty;
      }
      po.items.forEach(i => {
        if ((i.receivedQty || 0) < i.quantity) allComplete = false;
      });
      if (!allComplete && po.status === 'Complete') po.status = 'Active';
      await po.save();
    }

    grn.status = 'Cancelled';
    await grn.save();
    return sendSuccess(res, grn, 'GRN Cancelled Successfully');
  } catch(err) { next(err); }
};
