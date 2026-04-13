const Payment = require('../models/Payment');
const SalesInvoice = require('../models/SalesInvoice');
const PurchaseOrder = require('../models/PurchaseOrder');
const { sendSuccess, sendError } = require('../utils/response');

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

// Get payment history for a document
exports.getPayments = async (req, res, next) => {
  try {
    const { documentType, documentId } = req.query;
    const orgId = req.organizationId;

    if (!documentType || !documentId) {
      return sendError(res, 'documentType and documentId are required', 400);
    }

    const payments = await Payment.find({ organization: orgId, documentType, documentId })
      .populate('createdBy', 'name')
      .sort({ paymentDate: -1 });

    return sendSuccess(res, payments);
  } catch (err) { next(err); }
};
