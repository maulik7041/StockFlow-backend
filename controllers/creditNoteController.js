const mongoose = require('mongoose');
const CreditNote = require('../models/CreditNote');
const SalesInvoice = require('../models/SalesInvoice');
const PurchaseBill = require('../models/PurchaseBill');
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { getPagination, getSort } = require('../utils/pagination');
const { getAdvancedFilter } = require('../utils/filter');
const { syncNoteAmountsToParent } = require('../utils/financialUtils');

exports.getCreditNotes = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { organization: req.organizationId, ...getAdvancedFilter(req.query) };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) filter.noteNumber = { $regex: req.query.search, $options: 'i' };

    const [notes, total] = await Promise.all([
      CreditNote.find(filter).populate('createdBy', 'name').sort(getSort(req.query)).skip(skip).limit(limit),
      CreditNote.countDocuments(filter),
    ]);

    // Hydrate customer names
    const customerIds = notes.map(n => n.party);
    const customers = customerIds.length ? await Customer.find({ _id: { $in: customerIds } }).select('name') : [];
    const partyMap = {};
    customers.forEach(c => { partyMap[c._id.toString()] = c.name; });

    // Hydrate ref doc numbers (Sales Invoice)
    const siIds = notes.map(n => n.referenceDocumentId);
    const siDocs = siIds.length ? await SalesInvoice.find({ _id: { $in: siIds } }).select('invoiceNumber') : [];
    const refMap = {};
    siDocs.forEach(d => { refMap[d._id.toString()] = d.invoiceNumber; });

    const enriched = notes.map(n => {
      const obj = n.toObject();
      obj.partyName = partyMap[n.party?.toString()] || 'Unknown';
      obj.referenceDocumentNumber = refMap[n.referenceDocumentId?.toString()] || '—';
      return obj;
    });

    return sendPaginated(res, enriched, total, page, limit);
  } catch (err) { next(err); }
};

exports.getCreditNote = async (req, res, next) => {
  try {
    const note = await CreditNote.findOne({ _id: req.params.id, organization: req.organizationId })
      .populate('items.item', 'name unit hsnCode').populate('createdBy', 'name');
    if (!note) return sendError(res, 'Credit note not found', 404);

    const obj = note.toObject();
    // Populate customer
    const cust = await Customer.findById(note.party);
    obj.partyData = cust;
    // Populate reference Sales Invoice
    const si = await SalesInvoice.findById(note.referenceDocumentId).select('invoiceNumber customer totalAmount');
    obj.referenceDocument = si;

    return sendSuccess(res, obj);
  } catch (err) { next(err); }
};

exports.createCreditNote = async (req, res, next) => {
  try {
    const { party, referenceDocumentId, items, noteDate, notes, sameAsBilling, billingAddress, shippingAddress, freightCharges, taxType, referenceNumber } = req.body;
    const orgId = req.organizationId;

    // Credit Notes are always against a Customer + Sales Invoice
    const doc = await SalesInvoice.findOne({ _id: referenceDocumentId, organization: orgId });
    if (!doc) return sendError(res, 'Referenced Sales Invoice not found', 400);
    if (doc.customer.toString() !== party) return sendError(res, 'Customer does not match the referenced Invoice', 400);

    const note = await CreditNote.create({
      partyType: 'Customer', party, referenceDocumentType: 'SalesInvoice', referenceDocumentId,
      items, noteDate: noteDate || Date.now(), notes, sameAsBilling, billingAddress, shippingAddress,
      freightCharges, taxType, referenceNumber,
      organization: orgId, createdBy: req.user._id, updatedBy: req.user._id,
      createdAt: Date.now(), updatedAt: Date.now(),
    });

    // Trigger financial sync
    await syncNoteAmountsToParent(note.referenceDocumentType, note.referenceDocumentId);

    return sendSuccess(res, note, 'Credit note created', 201);
  } catch (err) {
    return sendError(res, 'Failed to create credit note. Please try again.', 400);
  }
};

exports.updateCreditNote = async (req, res, next) => {
  try {
    const note = await CreditNote.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!note) return sendError(res, 'Credit note not found', 404);
    if (note.status === 'Cancelled') return sendError(res, 'Cannot update a cancelled credit note', 400);

    // C3: Strip protected fields
    const { organization, createdBy, totalAmount, noteNumber, status, ...safeBody } = req.body;
    Object.assign(note, safeBody);
    note.updatedBy = req.user._id;
    note.updatedAt = Date.now();
    await note.save();

    // Trigger financial sync
    await syncNoteAmountsToParent(note.referenceDocumentType, note.referenceDocumentId);

    return sendSuccess(res, note, 'Credit note updated');
  } catch (err) { next(err); }
};

// Fetch items from a reference document for auto-populating note
exports.getReferenceDocumentItems = async (req, res, next) => {
  try {
    const { type, id } = req.query;
    const orgId = req.organizationId;
    let items = [];
    // Credit Notes only reference Sales Invoices
    const doc = await SalesInvoice.findOne({ _id: id, organization: orgId }).populate('items.item', 'name unit hsnCode');
    if (doc) items = doc.items;
    return sendSuccess(res, items);
  } catch (err) { next(err); }
};

exports.cancelCreditNote = async (req, res, next) => {
  try {
    const note = await CreditNote.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!note) return sendError(res, 'Credit note not found', 404);
    if (note.status === 'Cancelled') return sendError(res, 'Credit note is already cancelled', 400);

    note.status = 'Cancelled';
    note.updatedBy = req.user._id;
    note.updatedAt = Date.now();
    await note.save();

    // Trigger financial sync
    await syncNoteAmountsToParent(note.referenceDocumentType, note.referenceDocumentId);

    return sendSuccess(res, note, 'Credit note cancelled');
  } catch (err) { next(err); }
};
