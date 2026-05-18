const mongoose = require('mongoose');
const DebitNote = require('../models/DebitNote');
const SalesInvoice = require('../models/SalesInvoice');
const PurchaseBill = require('../models/PurchaseBill');
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { getPagination, getSort } = require('../utils/pagination');
const { getAdvancedFilter } = require('../utils/filter');
const { syncNoteAmountsToParent } = require('../utils/financialUtils');

exports.getDebitNotes = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { organization: req.organizationId, ...getAdvancedFilter(req.query) };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) filter.noteNumber = { $regex: req.query.search, $options: 'i' };

    const [notes, total] = await Promise.all([
      DebitNote.find(filter).populate('createdBy', 'name').sort(getSort(req.query)).skip(skip).limit(limit),
      DebitNote.countDocuments(filter),
    ]);

    // Hydrate vendor names
    const vendorIds = notes.map(n => n.party);
    const vendors = vendorIds.length ? await Vendor.find({ _id: { $in: vendorIds } }).select('name') : [];
    const partyMap = {};
    vendors.forEach(v => { partyMap[v._id.toString()] = v.name; });

    // Hydrate ref doc numbers (Purchase Bill)
    const pbIds = notes.map(n => n.referenceDocumentId);
    const pbDocs = pbIds.length ? await PurchaseBill.find({ _id: { $in: pbIds } }).select('billNumber') : [];
    const refMap = {};
    pbDocs.forEach(d => { refMap[d._id.toString()] = d.billNumber; });

    const enriched = notes.map(n => {
      const obj = n.toObject();
      obj.partyName = partyMap[n.party?.toString()] || 'Unknown';
      obj.referenceDocumentNumber = refMap[n.referenceDocumentId?.toString()] || '—';
      return obj;
    });

    return sendPaginated(res, enriched, total, page, limit);
  } catch (err) { next(err); }
};

exports.getDebitNote = async (req, res, next) => {
  try {
    const note = await DebitNote.findOne({ _id: req.params.id, organization: req.organizationId })
      .populate('items.item', 'name unit hsnCode').populate('createdBy', 'name');
    if (!note) return sendError(res, 'Debit note not found', 404);

    const obj = note.toObject();
    // Populate vendor
    const vend = await Vendor.findById(note.party);
    obj.partyData = vend;
    // Populate reference Purchase Bill
    const pb = await PurchaseBill.findById(note.referenceDocumentId).select('billNumber vendor totalAmount');
    obj.referenceDocument = pb;

    return sendSuccess(res, obj);
  } catch (err) { next(err); }
};

exports.createDebitNote = async (req, res, next) => {
  try {
    const { party, referenceDocumentId, items, noteDate, notes, sameAsBilling, billingAddress, shippingAddress, freightCharges, taxType, referenceNumber } = req.body;
    const orgId = req.organizationId;

    // Debit Notes are always against a Vendor + Purchase Bill
    const doc = await PurchaseBill.findOne({ _id: referenceDocumentId, organization: orgId });
    if (!doc) return sendError(res, 'Referenced Purchase Bill not found', 400);
    if (doc.vendor.toString() !== party) return sendError(res, 'Vendor does not match the referenced Bill', 400);

    const note = await DebitNote.create({
      partyType: 'Vendor', party, referenceDocumentType: 'PurchaseBill', referenceDocumentId,
      items, noteDate: noteDate || Date.now(), notes, sameAsBilling, billingAddress, shippingAddress,
      freightCharges, taxType, referenceNumber,
      organization: orgId, createdBy: req.user._id, updatedBy: req.user._id,
      createdAt: Date.now(), updatedAt: Date.now(),
    });

    // Trigger financial sync
    await syncNoteAmountsToParent(note.referenceDocumentType, note.referenceDocumentId);

    return sendSuccess(res, note, 'Debit note created', 201);
  } catch (err) {
    return sendError(res, 'Failed to create debit note. Please try again.', 400);
  }
};

exports.updateDebitNote = async (req, res, next) => {
  try {
    const note = await DebitNote.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!note) return sendError(res, 'Debit note not found', 404);
    if (note.status === 'Cancelled') return sendError(res, 'Cannot update a cancelled debit note', 400);

    // C3: Strip protected fields
    const { organization, createdBy, totalAmount, noteNumber, status, ...safeBody } = req.body;
    Object.assign(note, safeBody);
    note.updatedBy = req.user._id;
    note.updatedAt = Date.now();
    await note.save();

    // Trigger financial sync
    await syncNoteAmountsToParent(note.referenceDocumentType, note.referenceDocumentId);

    return sendSuccess(res, note, 'Debit note updated');
  } catch (err) { next(err); }
};

// Fetch items from a reference document for auto-populating note
exports.getReferenceDocumentItems = async (req, res, next) => {
  try {
    const { type, id } = req.query;
    const orgId = req.organizationId;
    let items = [];
    // Debit Notes only reference Purchase Bills
    const doc = await PurchaseBill.findOne({ _id: id, organization: orgId }).populate('items.item', 'name unit hsnCode');
    if (doc) items = doc.items;
    return sendSuccess(res, items);
  } catch (err) { next(err); }
};

exports.cancelDebitNote = async (req, res, next) => {
  try {
    const note = await DebitNote.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!note) return sendError(res, 'Debit note not found', 404);
    if (note.status === 'Cancelled') return sendError(res, 'Debit note is already cancelled', 400);

    note.status = 'Cancelled';
    note.updatedBy = req.user._id;
    note.updatedAt = Date.now();
    await note.save();

    // Trigger financial sync
    await syncNoteAmountsToParent(note.referenceDocumentType, note.referenceDocumentId);

    return sendSuccess(res, note, 'Debit note cancelled');
  } catch (err) { next(err); }
};
