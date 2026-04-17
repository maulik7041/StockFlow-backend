const Payment = require('../models/Payment');
const SalesInvoice = require('../models/SalesInvoice');
const PurchaseOrder = require('../models/PurchaseOrder');
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const { sendSuccess, sendError } = require('../utils/response');
const { getAdvancedFilter } = require('../utils/filter');
const mongoose = require('mongoose');

// Record a single payment against one document (backward-compatible)
exports.recordPayment = async (req, res, next) => {
  try {
    const { documentType, documentId, amount, paymentDate, mode, referenceNumber, notes } = req.body;
    const orgId = req.organizationId;

    if (!documentType || !documentId || !amount || amount <= 0) {
      return sendError(res, 'documentType, documentId, and a positive amount are required', 400);
    }

    let document;
    let partyType, partyId;
    if (documentType === 'SalesInvoice') {
      document = await SalesInvoice.findOne({ _id: documentId, organization: orgId }).populate('customer', 'name');
      partyType = 'Customer';
      partyId = document?.customer?._id;
    } else if (documentType === 'PurchaseOrder') {
      document = await PurchaseOrder.findOne({ _id: documentId, organization: orgId }).populate('vendor', 'name');
      partyType = 'Vendor';
      partyId = document?.vendor?._id;
    } else {
      return sendError(res, 'Invalid document type', 400);
    }

    if (!document) return sendError(res, 'Document not found', 404);
    if (document.status === 'Cancelled') return sendError(res, 'Cannot record payment for a cancelled document', 400);

    // Create payment record with single allocation
    const payment = await Payment.create({
      organization: orgId,
      documentType,
      documentId,
      allocations: [{ documentType, documentId, amount: +amount }],
      partyType,
      partyId,
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

// Record a bulk payment allocated across multiple documents
exports.recordBulkPayment = async (req, res, next) => {
  try {
    const { partyType, partyId, amount, allocations, paymentDate, mode, referenceNumber, notes } = req.body;
    const orgId = req.organizationId;

    if (!partyType || !partyId || !amount || amount <= 0) {
      return sendError(res, 'partyType, partyId, and a positive amount are required', 400);
    }
    if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
      return sendError(res, 'At least one allocation is required', 400);
    }

    // Validate total allocations match payment amount
    const totalAllocated = allocations.reduce((sum, a) => sum + (+a.amount || 0), 0);
    if (Math.abs(totalAllocated - (+amount)) > 0.01) {
      return sendError(res, `Allocation total (₹${totalAllocated}) does not match payment amount (₹${amount})`, 400);
    }

    // Determine document type based on party type
    const expectedDocType = partyType === 'Customer' ? 'SalesInvoice' : 'PurchaseOrder';

    // Phase 1: Validate ALL allocations first (no writes)
    const docsToUpdate = [];
    for (const alloc of allocations) {
      if (alloc.documentType !== expectedDocType) {
        return sendError(res, `Invalid document type ${alloc.documentType} for ${partyType}`, 400);
      }
      if (!alloc.documentId || !alloc.amount || +alloc.amount <= 0) {
        return sendError(res, 'Remove invoices/POs with ₹0 allocation before recording payment', 400);
      }

      let doc;
      if (alloc.documentType === 'SalesInvoice') {
        doc = await SalesInvoice.findOne({ _id: alloc.documentId, organization: orgId });
      } else {
        doc = await PurchaseOrder.findOne({ _id: alloc.documentId, organization: orgId });
      }

      if (!doc) return sendError(res, `Document ${alloc.documentId} not found`, 404);
      if (doc.status === 'Cancelled') return sendError(res, `Cannot allocate payment to cancelled document`, 400);

      const balance = doc.totalAmount - (doc.paidAmount || 0);
      if (+alloc.amount > balance + 0.01) {
        return sendError(res, `Allocation amount ₹${alloc.amount} exceeds balance ₹${balance.toFixed(2)}`, 400);
      }

      docsToUpdate.push({ doc, amount: +alloc.amount });
    }

    // Phase 2: All validated — now update documents
    for (const { doc, amount: allocAmount } of docsToUpdate) {
      doc.paidAmount = (doc.paidAmount || 0) + allocAmount;
      doc.updatedAt = Date.now();
      await doc.save();
    }

    // Create single payment record with all allocations
    const payment = await Payment.create({
      organization: orgId,
      // Legacy fields: set to first allocation for basic compat
      documentType: allocations[0].documentType,
      documentId: allocations[0].documentId,
      allocations: allocations.map(a => ({
        documentType: a.documentType,
        documentId: a.documentId,
        amount: +a.amount,
      })),
      partyType,
      partyId,
      amount: +amount,
      paymentDate: paymentDate || Date.now(),
      mode: mode || 'Bank Transfer',
      referenceNumber: referenceNumber || '',
      notes: notes || '',
      createdBy: req.user._id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return sendSuccess(res, { payment }, 'Bulk payment recorded', 201);
  } catch (err) {
    return sendError(res, err.message, 400);
  }
};

// Get unpaid/partially-paid documents for a party
exports.getUnpaidDocuments = async (req, res, next) => {
  try {
    const { partyType, partyId } = req.query;
    const orgId = req.organizationId;

    if (!partyType || !partyId) {
      return sendError(res, 'partyType and partyId are required', 400);
    }

    let documents = [];

    if (partyType === 'Customer') {
      const invoices = await SalesInvoice.find({
        organization: orgId,
        customer: partyId,
        status: { $ne: 'Cancelled' },
        $expr: { $gt: ['$totalAmount', { $ifNull: ['$paidAmount', 0] }] }
      }).select('invoiceNumber invoiceDate totalAmount paidAmount paymentStatus').sort({ invoiceDate: 1 });

      documents = invoices.map(inv => ({
        _id: inv._id,
        documentType: 'SalesInvoice',
        documentNumber: inv.invoiceNumber,
        date: inv.invoiceDate,
        totalAmount: inv.totalAmount,
        paidAmount: inv.paidAmount || 0,
        balance: inv.totalAmount - (inv.paidAmount || 0),
        paymentStatus: inv.paymentStatus,
      }));
    } else if (partyType === 'Vendor') {
      const pos = await PurchaseOrder.find({
        organization: orgId,
        vendor: partyId,
        status: { $ne: 'Cancelled' },
        $expr: { $gt: ['$totalAmount', { $ifNull: ['$paidAmount', 0] }] }
      }).select('poNumber createdAt totalAmount paidAmount paymentStatus').sort({ createdAt: 1 });

      documents = pos.map(po => ({
        _id: po._id,
        documentType: 'PurchaseOrder',
        documentNumber: po.poNumber,
        date: po.createdAt,
        totalAmount: po.totalAmount,
        paidAmount: po.paidAmount || 0,
        balance: po.totalAmount - (po.paidAmount || 0),
        paymentStatus: po.paymentStatus,
      }));
    } else {
      return sendError(res, 'Invalid partyType', 400);
    }

    return sendSuccess(res, documents);
  } catch (err) { next(err); }
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
    
    // Support legacy documentType/documentId if passed directly
    if (req.query.documentType && !req.query.documentId) {
      // When filtering by type only (e.g. from Payments Ledger), search in both legacy and allocations
      query.$or = [
        { documentType: req.query.documentType },
        { 'allocations.documentType': req.query.documentType }
      ];
      delete query.documentType;
    }
    if (req.query.documentId) {
      // Search in both legacy field and allocations array
      const docId = req.query.documentId;
      const orConditions = [
        { documentId: docId },
        { 'allocations.documentId': new mongoose.Types.ObjectId(docId) }
      ];
      if (query.$or) {
        // Combine with existing $or using $and
        query.$and = [{ $or: query.$or }, { $or: orConditions }];
        delete query.$or;
      } else {
        query.$or = orConditions;
      }
      delete query.documentId;
      if (req.query.documentType) {
        // Also filter by document type when both are provided
        delete query.documentType;
      }
    }

    // Handle virtual/cross-document filters: Document Number and Party Name
    const docNumFilter = filters.documentNumber;
    const partyFilter = filters.partyName;

    if ((docNumFilter && docNumFilter.val) || (partyFilter && partyFilter.val)) {
      const matchIds = [];

      // 1. Search Sales Invoices
      const siMatchQuery = { organization: orgId };
      const siOrConditions = [];
      if (docNumFilter?.val) siOrConditions.push({ invoiceNumber: { $regex: docNumFilter.val, $options: 'i' } });
      if (partyFilter?.val) {
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
        const vendors = await Vendor.find({ organization: orgId, name: { $regex: partyFilter.val, $options: 'i' } }).select('_id');
        poOrConditions.push({ vendor: { $in: vendors.map(v => v._id) } });
      }
      if (poOrConditions.length > 0) poMatchQuery.$or = poOrConditions;

      const matchedPOs = await PurchaseOrder.find(poMatchQuery).select('_id');
      matchedPOs.forEach(po => matchIds.push(po._id));

      // Search in both legacy and allocations
      query.$or = [
        { documentId: { $in: matchIds } },
        { 'allocations.documentId': { $in: matchIds } }
      ];
      delete query.documentNumber;
      delete query.partyName;
    }

    const payments = await Payment.find(query)
      .populate('createdBy', 'name')
      .sort({ paymentDate: -1 });

    // Collect all referenced document IDs from both legacy and allocations
    const allDocRefs = [];
    payments.forEach(p => {
      if (p.allocations && p.allocations.length > 0) {
        p.allocations.forEach(a => allDocRefs.push({ type: a.documentType, id: a.documentId }));
      } else if (p.documentId) {
        allDocRefs.push({ type: p.documentType, id: p.documentId });
      }
    });

    const siIds = allDocRefs.filter(r => r.type === 'SalesInvoice').map(r => r.id);
    const poIds = allDocRefs.filter(r => r.type === 'PurchaseOrder').map(r => r.id);

    const invoices = await SalesInvoice.find({ _id: { $in: siIds } }, 'invoiceNumber customer').populate('customer', 'name');
    const pos = await PurchaseOrder.find({ _id: { $in: poIds } }, 'poNumber vendor').populate('vendor', 'name');

    const paymentData = payments.map(p => {
      const obj = p.toObject();

      // Build allocation display info
      if (obj.allocations && obj.allocations.length > 0) {
        obj.allocationDetails = obj.allocations.map(a => {
          if (a.documentType === 'SalesInvoice') {
            const inv = invoices.find(i => i._id.toString() === a.documentId.toString());
            return { ...a, documentNumber: inv ? inv.invoiceNumber : 'Deleted', partyName: inv?.customer?.name || 'Unknown' };
          } else {
            const po = pos.find(i => i._id.toString() === a.documentId.toString());
            return { ...a, documentNumber: po ? po.poNumber : 'Deleted', partyName: po?.vendor?.name || 'Unknown' };
          }
        });
        // For top-level display
        obj.documentNumber = obj.allocationDetails.map(a => a.documentNumber).join(', ');
        obj.partyName = obj.allocationDetails[0]?.partyName || 'Unknown';

        // When queried for a specific document, show the allocated amount for that document
        if (req.query.documentId) {
          const matchingAlloc = obj.allocations.find(a => a.documentId.toString() === req.query.documentId);
          if (matchingAlloc) {
            obj.allocatedAmount = matchingAlloc.amount;
          }
        }
      } else {
        // Legacy single-document payment
        if (p.documentType === 'SalesInvoice') {
          const inv = invoices.find(i => i._id.toString() === p.documentId?.toString());
          obj.documentNumber = inv ? inv.invoiceNumber : 'Deleted';
          obj.partyName = inv?.customer?.name || 'Unknown';
        } else {
          const po = pos.find(i => i._id.toString() === p.documentId?.toString());
          obj.documentNumber = po ? po.poNumber : 'Deleted';
          obj.partyName = po?.vendor?.name || 'Unknown';
        }
      }
      return obj;
    });

    return sendSuccess(res, paymentData);
  } catch (err) { next(err); }
};
