const mongoose = require('mongoose');
const ProformaInvoice = require('../models/ProformaInvoice');
const SalesInvoice = require('../models/SalesInvoice');
const Inventory = require('../models/Inventory');
const StockTransaction = require('../models/StockTransaction');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { getPagination, getSort } = require('../utils/pagination');
const { getAdvancedFilter } = require('../utils/filter');

// GET all proforma invoices
exports.getProformaInvoices = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { organization: req.organizationId, ...getAdvancedFilter(req.query) };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.customer) filter.customer = req.query.customer;
    if (req.query.search) filter.piNumber = { $regex: req.query.search, $options: 'i' };

    const [invoices, total] = await Promise.all([
      ProformaInvoice.find(filter).populate('customer', 'name').populate('createdBy', 'name').sort(getSort(req.query)).skip(skip).limit(limit),
      ProformaInvoice.countDocuments(filter),
    ]);
    return sendPaginated(res, invoices, total, page, limit);
  } catch (err) { next(err); }
};

// GET single proforma invoice
exports.getProformaInvoice = async (req, res, next) => {
  try {
    const pi = await ProformaInvoice.findOne({ _id: req.params.id, organization: req.organizationId })
      .populate('customer').populate('items.item', 'name unit hsnCode').populate('createdBy', 'name').populate('convertedSalesInvoiceId', 'invoiceNumber');
    if (!pi) return sendError(res, 'Proforma Invoice not found', 404);
    return sendSuccess(res, pi);
  } catch (err) { next(err); }
};

// CREATE proforma invoice
exports.createProformaInvoice = async (req, res, next) => {
  try {
    const { customer, items, piDate, validUntil, notes, sameAsBilling, billingAddress, shippingAddress, freightCharges, taxType, status } = req.body;
    const orgId = req.organizationId;

    const pi = await ProformaInvoice.create({
      customer, items, status: status || 'Draft',
      piDate: piDate || Date.now(), validUntil, notes,
      sameAsBilling, billingAddress, shippingAddress, freightCharges, taxType,
      organization: orgId, createdBy: req.user._id, updatedBy: req.user._id,
      createdAt: Date.now(), updatedAt: Date.now()
    });

    return sendSuccess(res, pi, 'Proforma Invoice created', 201);
  } catch (err) {
    return sendError(res, err.message, 400);
  }
};

// UPDATE proforma invoice
exports.updateProformaInvoice = async (req, res, next) => {
  try {
    const pi = await ProformaInvoice.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!pi) return sendError(res, 'Proforma Invoice not found', 404);
    if (pi.status === 'Converted') return sendError(res, 'Cannot edit a converted Proforma Invoice', 400);
    if (pi.status === 'Cancelled') return sendError(res, 'Cannot edit a cancelled Proforma Invoice', 400);

    Object.assign(pi, req.body);
    pi.updatedBy = req.user._id;
    pi.updatedAt = Date.now();
    await pi.save();

    return sendSuccess(res, pi, 'Proforma Invoice updated');
  } catch (err) { next(err); }
};

// CONVERT proforma to sales invoice
exports.convertToSalesInvoice = async (req, res, next) => {
  try {
    const pi = await ProformaInvoice.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!pi) return sendError(res, 'Proforma Invoice not found', 404);
    if (pi.convertedSalesInvoiceId) return sendError(res, 'This Proforma Invoice has already been converted', 400);
    if (pi.status === 'Cancelled') return sendError(res, 'Cannot convert a cancelled Proforma Invoice', 400);

    // The request body contains the (potentially edited) sales invoice data
    const saleData = req.body;
    const orgId = req.organizationId;

    // Check stock availability
    for (const saleItem of saleData.items) {
      const inv = await Inventory.findOne({ item: saleItem.item, organization: orgId });
      if (!inv || inv.currentStock < saleItem.quantity) {
        throw new Error(`Insufficient stock for item ${saleItem.item}`);
      }
    }

    // Create sales invoice with source document reference
    const invoice = await SalesInvoice.create({
      ...saleData,
      sourceDocumentType: 'ProformaInvoice',
      sourceDocumentId: pi._id,
      organization: orgId,
      createdBy: req.user._id,
      updatedBy: req.user._id,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    // Deduct stock
    for (const saleItem of saleData.items) {
      const inv = await Inventory.findOne({ item: saleItem.item, organization: orgId });
      inv.currentStock -= saleItem.quantity;
      inv.updatedAt = Date.now();
      await inv.save();

      await StockTransaction.create({
        item: saleItem.item,
        organization: orgId,
        type: 'OUT',
        quantity: saleItem.quantity,
        balanceAfter: inv.currentStock,
        refModel: 'SalesInvoice',
        refId: invoice._id,
        note: `Invoice ${invoice.invoiceNumber} (from ${pi.piNumber})`,
        createdBy: req.user._id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    // Update proforma invoice
    pi.convertedSalesInvoiceId = invoice._id;
    pi.status = 'Converted';
    pi.updatedBy = req.user._id;
    pi.updatedAt = Date.now();
    await pi.save();

    return sendSuccess(res, invoice, 'Proforma Invoice converted to Sales Invoice', 201);
  } catch (err) {
    return sendError(res, err.message, 400);
  }
};
