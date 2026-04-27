const PurchaseBill = require('../models/PurchaseBill');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { getPagination, getSort } = require('../utils/pagination');
const { getAdvancedFilter } = require('../utils/filter');

exports.getPurchaseBills = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { organization: req.organizationId, ...getAdvancedFilter(req.query) };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.paymentStatus) filter.paymentStatus = { $in: req.query.paymentStatus.split(',') };
    if (req.query.vendor) filter.vendor = req.query.vendor;
    if (req.query.search) filter.billNumber = { $regex: req.query.search, $options: 'i' };

    const [bills, total] = await Promise.all([
      PurchaseBill.find(filter).populate('vendor', 'name').populate('purchaseOrder', 'poNumber').populate('createdBy', 'name').sort(getSort(req.query)).skip(skip).limit(limit),
      PurchaseBill.countDocuments(filter),
    ]);
    return sendPaginated(res, bills, total, page, limit);
  } catch (err) { next(err); }
};

exports.getPurchaseBill = async (req, res, next) => {
  try {
    const bill = await PurchaseBill.findOne({ _id: req.params.id, organization: req.organizationId })
      .populate('vendor').populate('purchaseOrder', 'poNumber').populate('grn', 'grnNumber').populate('items.item', 'name unit hsnCode').populate('createdBy', 'name');
    if (!bill) return sendError(res, 'Purchase Bill not found', 404);
    return sendSuccess(res, bill);
  } catch (err) { next(err); }
};

exports.createPurchaseBill = async (req, res, next) => {
  try {
    const { vendor, items, billDate, dueDate, notes, freightCharges, taxType, purchaseOrder, grn, vendorBillNo } = req.body;
    const orgId = req.organizationId;

    const bill = await PurchaseBill.create({
      vendor, items, billDate: billDate || Date.now(), dueDate, notes, freightCharges, taxType,
      purchaseOrder: purchaseOrder || null, grn: grn || null, vendorBillNo: vendorBillNo || '',
      organization: orgId, createdBy: req.user._id, updatedBy: req.user._id,
      createdAt: Date.now(), updatedAt: Date.now(),
    });

    return sendSuccess(res, bill, 'Purchase Bill created', 201);
  } catch (err) {
    return sendError(res, 'Failed to create Purchase Bill. Please try again.', 400);
  }
};

exports.updatePurchaseBill = async (req, res, next) => {
  try {
    const bill = await PurchaseBill.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!bill) return sendError(res, 'Purchase Bill not found', 404);
    if (bill.status === 'Cancelled') return sendError(res, 'Cannot update a cancelled Purchase Bill', 400);

    const hasPayments = (bill.paidAmount || 0) > 0;

    // B2: Block item editing after creation
    if (req.body.items) {
      return sendError(res, 'Cannot modify items after bill creation. Cancel and create a new bill.', 400);
    }

    // B3: Block cancellation if payments exist
    if (req.body.status === 'Cancelled' && hasPayments) {
      return sendError(res, 'Cannot cancel a bill with recorded payments. Delete all payments first.', 400);
    }

    if (hasPayments) {
      const safeFields = ['status', 'notes', 'dueDate'];
      const attemptedFields = Object.keys(req.body);
      const unsafeFields = attemptedFields.filter(f => !safeFields.includes(f));
      if (unsafeFields.length > 0) {
        return sendError(res, `Cannot edit ${unsafeFields.join(', ')} after payments have been recorded. Delete payments first.`, 400);
      }
    }

    // C3: Strip protected fields
    const { paidAmount, cnAmount, dnAmount, paymentStatus, totalAmount, billNumber, organization, createdBy, ...safeBody } = req.body;
    Object.assign(bill, safeBody);
    bill.updatedBy = req.user._id;
    bill.updatedAt = Date.now();
    await bill.save();

    return sendSuccess(res, bill, 'Purchase Bill updated');
  } catch (err) { next(err); }
};

exports.cancelPurchaseBill = async (req, res, next) => {
  try {
    const bill = await PurchaseBill.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!bill) return sendError(res, 'Purchase Bill not found', 404);
    if (bill.status === 'Cancelled') return sendError(res, 'Already cancelled', 400);

    // C6/B3: Block cancellation if payments exist
    if ((bill.paidAmount || 0) > 0) {
      return sendError(res, 'Cannot cancel a bill with recorded payments. Delete all payments first.', 400);
    }

    bill.status = 'Cancelled';
    bill.updatedBy = req.user._id;
    bill.updatedAt = Date.now();
    await bill.save();

    return sendSuccess(res, bill, 'Purchase Bill cancelled');
  } catch (err) { next(err); }
};
