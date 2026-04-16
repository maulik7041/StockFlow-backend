const Payment = require('../models/Payment');
const SalesInvoice = require('../models/SalesInvoice');
const PurchaseOrder = require('../models/PurchaseOrder');
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const { sendSuccess, sendError } = require('../utils/response');
const { getAdvancedFilter } = require('../utils/filter');
const mongoose = require('mongoose');

// Record a payment against a Sales Invoice or Purchase Order
exports.recordPayment = async (req, res, next) => {
  try {
    const { documentType, documentId, amount, paymentDate, mode, referenceNumber, notes } = req.body;
    const orgId = req.organizationId;

    if (!documentType || !documentId || !amount || amount <= 0) {
      return sendError(res, 'documentType, documentId, and a positive amount are required', 400);
    }

    let document;
    if (documentType === 'SalesInvoice') {
      document = await SalesInvoice.findOne({ _id: documentId, organization: orgId });
    } else if (documentType === 'PurchaseOrder') {
      document = await PurchaseOrder.findOne({ _id: documentId, organization: orgId });
    } else {
      return sendError(res, 'Invalid document type', 400);
    }

    if (!document) return sendError(res, 'Document not found', 404);
    if (document.status === 'Cancelled') return sendError(res, 'Cannot record payment for a cancelled document', 400);

    // Create payment record
    const payment = await Payment.create({
      organization: orgId,
      documentType,
      documentId,
      amount: +amount,
      paymentDate: paymentDate || Date.now(),
      mode: mode || 'Bank Transfer',
      referenceNumber: referenceNumber || '',
      notes: notes || '',
      createdBy: req.user._id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Update document paidAmount (triggers paymentStatus recalc via pre-save)
    document.paidAmount = (document.paidAmount || 0) + (+amount);
    document.updatedAt = Date.now();
    await document.save();

    return sendSuccess(res, { payment, paidAmount: document.paidAmount, paymentStatus: document.paymentStatus }, 'Payment recorded', 201);
  } catch (err) {
    return sendError(res, err.message, 400);
  }
};

// Get payment history
exports.getPayments = async (req, res, next) => {
  try {
    const orgId = req.organizationId;
    let filters = {};
    if (req.query._filters) {
      try { filters = JSON.parse(req.query._filters); } catch (e) {}
    }

    let query = { organization: orgId, ...getAdvancedFilter(req.query) };
    
    // Support legacy documentType/documentId if passed directly (though _filters is preferred)
    if (req.query.documentType) query.documentType = req.query.documentType;
    if (req.query.documentId) query.documentId = req.query.documentId;

    // Handle virtual/cross-document filters: Document Number and Party Name
    const docNumFilter = filters.documentNumber;
    const partyFilter = filters.partyName;

    if ((docNumFilter && docNumFilter.val) || (partyFilter && partyFilter.val)) {
      const matchIds = [];
      const regex = new RegExp(docNumFilter?.val || partyFilter?.val, 'i');

      // 1. Search Sales Invoices
      const siMatchQuery = { organization: orgId };
      const siOrConditions = [];
      if (docNumFilter?.val) siOrConditions.push({ invoiceNumber: { $regex: docNumFilter.val, $options: 'i' } });
      if (partyFilter?.val) {
        // Find customers matching the party name
        const customers = await Customer.find({ organization: orgId, name: { $regex: partyFilter.val, $options: 'i' } }).select('_id');
        siOrConditions.push({ customer: { $in: customers.map(c => c._id) } });
      }
      if (siOrConditions.length > 0) siMatchQuery.$or = siOrConditions;

      const matchedSIs = await SalesInvoice.find(siMatchQuery).select('_id');
      matchedSIs.forEach(si => matchIds.push(si._id));

      // 2. Search Purchase Orders
      const poMatchQuery = { organization: orgId };
      const poOrConditions = [];
      if (docNumFilter?.val) poOrConditions.push({ poNumber: { $regex: docNumFilter.val, $options: 'i' } });
      if (partyFilter?.val) {
        // Find vendors matching the party name
        const vendors = await Vendor.find({ organization: orgId, name: { $regex: partyFilter.val, $options: 'i' } }).select('_id');
        poOrConditions.push({ vendor: { $in: vendors.map(v => v._id) } });
      }
      if (poOrConditions.length > 0) poMatchQuery.$or = poOrConditions;

      const matchedPOs = await PurchaseOrder.find(poMatchQuery).select('_id');
      matchedPOs.forEach(po => matchIds.push(po._id));

      // Only return payments for matched documents
      query.documentId = { $in: matchIds };
      // Also remove the raw filter strings from the final Payment query to avoid errors on the Payment model
      delete query.documentNumber;
      delete query.partyName;
    }

    const payments = await Payment.find(query)
      .populate('createdBy', 'name')
      .sort({ paymentDate: -1 });

    const siIds = payments.filter(p => p.documentType === 'SalesInvoice').map(p => p.documentId);
    const poIds = payments.filter(p => p.documentType === 'PurchaseOrder').map(p => p.documentId);

    const invoices = await SalesInvoice.find({ _id: { $in: siIds } }, 'invoiceNumber customer').populate('customer', 'name');
    const pos = await PurchaseOrder.find({ _id: { $in: poIds } }, 'poNumber vendor').populate('vendor', 'name');

    const paymentData = payments.map(p => {
       const obj = p.toObject();
       if (p.documentType === 'SalesInvoice') {
         const inv = invoices.find(i => i._id.toString() === p.documentId.toString());
         obj.documentNumber = inv ? inv.invoiceNumber : 'Deleted';
         obj.partyName = inv?.customer?.name || 'Unknown';
       } else {
         const po = pos.find(i => i._id.toString() === p.documentId.toString());
         obj.documentNumber = po ? po.poNumber : 'Deleted';
         obj.partyName = po?.vendor?.name || 'Unknown';
       }
       return obj;
    });

    return sendSuccess(res, paymentData);
  } catch (err) { next(err); }
};
