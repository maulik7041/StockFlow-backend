const Payment = require('../models/Payment');
const SalesInvoice = require('../models/SalesInvoice');
const PurchaseBill = require('../models/PurchaseBill');
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { getPagination, getSort } = require('../utils/pagination');
const { getAdvancedFilter } = require('../utils/filter');
const mongoose = require('mongoose');

// Record a single payment against one document
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
    } else if (documentType === 'PurchaseBill') {
      document = await PurchaseBill.findOne({ _id: documentId, organization: orgId }).populate('vendor', 'name');
      partyType = 'Vendor';
      partyId = document?.vendor?._id;
    } else {
      return sendError(res, 'Invalid document type', 400);
    }

    if (!document) return sendError(res, 'Document not found', 404);
    if (document.status === 'Cancelled') return sendError(res, 'Cannot record payment for a cancelled document', 400);

    // H7: Validate payment does not exceed remaining balance
    const netTotal = document.totalAmount + (document.dnAmount || 0) - (document.cnAmount || 0);
    const remainingBalance = netTotal - (document.paidAmount || 0);
    if (+amount > remainingBalance + 0.01) {
      return sendError(res, `Payment amount ₹${amount} exceeds remaining balance ₹${remainingBalance.toFixed(2)}`, 400);
    }

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
    return sendError(res, 'Failed to record payment. Please try again.', 400);
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
    const expectedDocType = partyType === 'Customer' ? 'SalesInvoice' : 'PurchaseBill';

    // Phase 1: Validate ALL allocations first (no writes)
    const docsToUpdate = [];
    for (const alloc of allocations) {
      if (alloc.documentType !== expectedDocType) {
        return sendError(res, `Invalid document type ${alloc.documentType} for ${partyType}`, 400);
      }
      if (!alloc.documentId || !alloc.amount || +alloc.amount <= 0) {
        return sendError(res, 'Remove invoices/bills with ₹0 allocation before recording payment', 400);
      }

      let doc;
      if (alloc.documentType === 'SalesInvoice') {
        doc = await SalesInvoice.findOne({ _id: alloc.documentId, organization: orgId });
      } else {
        doc = await PurchaseBill.findOne({ _id: alloc.documentId, organization: orgId });
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
    return sendError(res, 'Failed to record bulk payment. Please try again.', 400);
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
        $expr: {
          $gt: [
            { $subtract: [{ $add: ['$totalAmount', { $ifNull: ['$dnAmount', 0] }] }, { $ifNull: ['$cnAmount', 0] }] },
            { $ifNull: ['$paidAmount', 0] }
          ]
        }
      }).select('invoiceNumber invoiceDate totalAmount paidAmount paymentStatus dnAmount cnAmount').sort({ invoiceDate: 1 });

      documents = invoices.map(inv => {
        const netPayable = inv.totalAmount + (inv.dnAmount || 0) - (inv.cnAmount || 0);
        return {
          _id: inv._id,
          documentType: 'SalesInvoice',
          documentNumber: inv.invoiceNumber,
          date: inv.invoiceDate,
          totalAmount: netPayable,
          paidAmount: inv.paidAmount || 0,
          balance: netPayable - (inv.paidAmount || 0),
          paymentStatus: inv.paymentStatus,
        };
      });
    } else if (partyType === 'Vendor') {
      const bills = await PurchaseBill.find({
        organization: orgId,
        vendor: partyId,
        status: { $ne: 'Cancelled' },
        $expr: {
          $gt: [
            { $subtract: [{ $add: ['$totalAmount', { $ifNull: ['$dnAmount', 0] }] }, { $ifNull: ['$cnAmount', 0] }] },
            { $ifNull: ['$paidAmount', 0] }
          ]
        }
      }).select('billNumber billDate totalAmount paidAmount paymentStatus dnAmount cnAmount').sort({ billDate: 1 });

      documents = bills.map(bill => {
        const netPayable = bill.totalAmount + (bill.dnAmount || 0) - (bill.cnAmount || 0);
        return {
          _id: bill._id,
          documentType: 'PurchaseBill',
          documentNumber: bill.billNumber,
          date: bill.billDate,
          totalAmount: netPayable,
          paidAmount: bill.paidAmount || 0,
          balance: netPayable - (bill.paidAmount || 0),
          paymentStatus: bill.paymentStatus,
        };
      });
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
    
    if (req.query.documentType && !req.query.documentId) {
      query.$or = [
        { documentType: req.query.documentType },
        { 'allocations.documentType': req.query.documentType }
      ];
      delete query.documentType;
    }
    if (req.query.documentId) {
      const docId = req.query.documentId;
      const orConditions = [
        { documentId: docId },
        { 'allocations.documentId': new mongoose.Types.ObjectId(docId) }
      ];
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: orConditions }];
        delete query.$or;
      } else {
        query.$or = orConditions;
      }
      delete query.documentId;
      if (req.query.documentType) {
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

      // 2. Search Purchase Bills
      const pbMatchQuery = { organization: orgId };
      const pbOrConditions = [];
      if (docNumFilter?.val) pbOrConditions.push({ billNumber: { $regex: docNumFilter.val, $options: 'i' } });
      if (partyFilter?.val) {
        const vendors = await Vendor.find({ organization: orgId, name: { $regex: partyFilter.val, $options: 'i' } }).select('_id');
        pbOrConditions.push({ vendor: { $in: vendors.map(v => v._id) } });
      }
      if (pbOrConditions.length > 0) pbMatchQuery.$or = pbOrConditions;

      const matchedPBs = await PurchaseBill.find(pbMatchQuery).select('_id');
      matchedPBs.forEach(pb => matchIds.push(pb._id));

      // Search in both legacy and allocations
      query.$or = [
        { documentId: { $in: matchIds } },
        { 'allocations.documentId': { $in: matchIds } }
      ];
      delete query.documentNumber;
      delete query.partyName;
    }

    // M6: Add pagination
    const { page, limit, skip } = getPagination(req.query);
    const [payments, total] = await Promise.all([
      Payment.find(query)
        .populate('createdBy', 'name')
        .sort({ paymentDate: -1 })
        .skip(skip)
        .limit(limit),
      Payment.countDocuments(query),
    ]);

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
    const pbIds = allDocRefs.filter(r => r.type === 'PurchaseBill').map(r => r.id);

    const invoices = await SalesInvoice.find({ _id: { $in: siIds } }, 'invoiceNumber customer').populate('customer', 'name');
    const bills = await PurchaseBill.find({ _id: { $in: pbIds } }, 'billNumber vendor').populate('vendor', 'name');

    const paymentData = payments.map(p => {
      const obj = p.toObject();

      // Build allocation display info
      if (obj.allocations && obj.allocations.length > 0) {
        obj.allocationDetails = obj.allocations.map(a => {
          if (a.documentType === 'SalesInvoice') {
            const inv = invoices.find(i => i._id.toString() === a.documentId.toString());
            return { ...a, documentNumber: inv ? inv.invoiceNumber : 'Deleted', partyName: inv?.customer?.name || 'Unknown' };
          } else {
            const bill = bills.find(i => i._id.toString() === a.documentId.toString());
            return { ...a, documentNumber: bill ? bill.billNumber : 'Deleted', partyName: bill?.vendor?.name || 'Unknown' };
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
        // Single-document payment
        if (p.documentType === 'SalesInvoice') {
          const inv = invoices.find(i => i._id.toString() === p.documentId?.toString());
          obj.documentNumber = inv ? inv.invoiceNumber : 'Deleted';
          obj.partyName = inv?.customer?.name || 'Unknown';
        } else {
          const bill = bills.find(i => i._id.toString() === p.documentId?.toString());
          obj.documentNumber = bill ? bill.billNumber : 'Deleted';
          obj.partyName = bill?.vendor?.name || 'Unknown';
        }
      }
      return obj;
    });

    return sendPaginated(res, paymentData, total, page, limit, 'Payments fetched');
  } catch (err) { next(err); }
};

// B1: Delete a payment and reverse the paidAmount on linked documents
exports.deletePayment = async (req, res, next) => {
  try {
    const payment = await Payment.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!payment) return sendError(res, 'Payment not found', 404);

    // Reverse allocations on linked documents
    if (payment.allocations && payment.allocations.length > 0) {
      for (const alloc of payment.allocations) {
        let doc;
        if (alloc.documentType === 'SalesInvoice') {
          doc = await SalesInvoice.findById(alloc.documentId);
        } else if (alloc.documentType === 'PurchaseBill') {
          doc = await PurchaseBill.findById(alloc.documentId);
        }
        if (doc) {
          doc.paidAmount = Math.max(0, (doc.paidAmount || 0) - alloc.amount);
          doc.updatedAt = Date.now();
          await doc.save(); // Triggers paymentStatus recalc
        }
      }
    } else if (payment.documentId) {
      // Legacy single-document payment
      let doc;
      if (payment.documentType === 'SalesInvoice') {
        doc = await SalesInvoice.findById(payment.documentId);
      } else if (payment.documentType === 'PurchaseBill') {
        doc = await PurchaseBill.findById(payment.documentId);
      }
      if (doc) {
        doc.paidAmount = Math.max(0, (doc.paidAmount || 0) - payment.amount);
        doc.updatedAt = Date.now();
        await doc.save();
      }
    }

    // Delete the payment record
    await Payment.findByIdAndDelete(payment._id);

    return sendSuccess(res, null, 'Payment deleted and reversed successfully');
  } catch (err) { next(err); }
};
