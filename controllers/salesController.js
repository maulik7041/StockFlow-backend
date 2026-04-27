const mongoose = require('mongoose');
const SalesInvoice = require('../models/SalesInvoice');
const Inventory = require('../models/Inventory');
const StockTransaction = require('../models/StockTransaction');
const Item = require('../models/Item');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { getPagination, getSort } = require('../utils/pagination');
const { getAdvancedFilter } = require('../utils/filter');

exports.getSales = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { organization: req.organizationId, ...getAdvancedFilter(req.query) };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.paymentStatus) filter.paymentStatus = { $in: req.query.paymentStatus.split(',') };
    if (req.query.customer) filter.customer = req.query.customer;
    if (req.query.search) filter.invoiceNumber = { $regex: req.query.search, $options: 'i' };

    const [sales, total] = await Promise.all([
      SalesInvoice.find(filter).populate('customer', 'name').populate('createdBy', 'name').sort(getSort(req.query)).skip(skip).limit(limit),
      SalesInvoice.countDocuments(filter),
    ]);
    return sendPaginated(res, sales, total, page, limit);
  } catch (err) { next(err); }
};

exports.getSale = async (req, res, next) => {
  try {
    const sale = await SalesInvoice.findOne({ _id: req.params.id, organization: req.organizationId })
      .populate('customer').populate('items.item', 'name unit hsnCode').populate('createdBy', 'name');
    if (!sale) return sendError(res, 'Invoice not found', 404);
    return sendSuccess(res, sale);
  } catch (err) { next(err); }
};

exports.createSale = async (req, res, next) => {
  try {
    const { customer, items, status, invoiceDate, dueDate, notes, sameAsBilling, billingAddress, shippingAddress, freightCharges, taxType, sourceDocumentType, sourceDocumentId } = req.body;
    const orgId = req.organizationId;

    // C5: Atomically check and deduct stock using $gte guard (no replica set needed)
    const deductedItems = [];
    try {
      for (const saleItem of items) {
        const inv = await Inventory.findOneAndUpdate(
          { item: saleItem.item, organization: orgId, currentStock: { $gte: saleItem.quantity } },
          { $inc: { currentStock: -saleItem.quantity }, $set: { updatedAt: Date.now() } },
          { new: true }
        );
        if (!inv) {
          const itemDoc = await Item.findById(saleItem.item).select('name');
          throw new Error(`Insufficient stock for "${itemDoc?.name || 'Unknown Item'}". Please check available quantity.`);
        }
        deductedItems.push({ item: saleItem.item, quantity: saleItem.quantity, balanceAfter: inv.currentStock });
      }
    } catch (stockErr) {
      // Rollback any already-deducted items
      for (const d of deductedItems) {
        await Inventory.findOneAndUpdate(
          { item: d.item, organization: orgId },
          { $inc: { currentStock: d.quantity } }
        );
      }
      return sendError(res, stockErr.message, 400);
    }

    const invoice = await SalesInvoice.create({ customer, items, status: status || 'Issued', invoiceDate: invoiceDate || Date.now(), dueDate, notes, sameAsBilling, billingAddress, shippingAddress, freightCharges, taxType, sourceDocumentType, sourceDocumentId, organization: orgId, createdBy: req.user._id, updatedBy: req.user._id, createdAt: Date.now(), updatedAt: Date.now() });

    // Record stock transactions
    for (const d of deductedItems) {
      await StockTransaction.create({
        item: d.item,
        organization: orgId,
        type: 'OUT',
        quantity: d.quantity,
        balanceAfter: d.balanceAfter,
        refModel: 'SalesInvoice',
        refId: invoice._id,
        note: `Invoice ${invoice.invoiceNumber}`,
        createdBy: req.user._id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    return sendSuccess(res, invoice, 'Sales invoice created', 201);
  } catch (err) {
    return sendError(res, 'Failed to create invoice. Please try again.', 400);
  }
};

exports.updateSale = async (req, res, next) => {
  try {
    const invoice = await SalesInvoice.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!invoice) return sendError(res, 'Invoice not found', 404);
    if (invoice.status === 'Cancelled') return sendError(res, 'Cannot update a cancelled invoice', 400);

    // B2: Block edits if payments exist (only allow limited fields)
    const hasPayments = (invoice.paidAmount || 0) > 0;

    // C4: Block item editing after creation
    if (req.body.items) {
      return sendError(res, 'Cannot modify items after invoice creation. Cancel the invoice and create a new one.', 400);
    }

    // B3/C6: Block cancellation if payments exist
    const isCancelling = req.body.status === 'Cancelled' && invoice.status !== 'Cancelled';
    if (isCancelling && hasPayments) {
      return sendError(res, 'Cannot cancel an invoice with recorded payments. Delete all payments first.', 400);
    }

    if (hasPayments) {
      // Only allow safe fields when payments exist
      const safeFields = ['status', 'notes', 'dueDate'];
      const attemptedFields = Object.keys(req.body);
      const unsafeFields = attemptedFields.filter(f => !safeFields.includes(f));
      if (unsafeFields.length > 0) {
        return sendError(res, `Cannot edit ${unsafeFields.join(', ')} after payments have been recorded. Delete payments first.`, 400);
      }
    }

    // C3: Strip protected fields (mass assignment protection)
    const { organization, createdBy, paidAmount, cnAmount, dnAmount, paymentStatus, totalAmount, invoiceNumber, ...safeBody } = req.body;

    Object.assign(invoice, safeBody);
    invoice.updatedBy = req.user._id;
    invoice.updatedAt = Date.now();
    await invoice.save();

    if (isCancelling) {
      for (const saleItem of invoice.items) {
        const inv = await Inventory.findOne({ item: saleItem.item, organization: req.organizationId });
        if (inv) {
          inv.currentStock += saleItem.quantity;
          inv.updatedAt = Date.now();
          await inv.save();

          await StockTransaction.create({
            item: saleItem.item,
            organization: req.organizationId,
            type: 'IN',
            quantity: saleItem.quantity,
            balanceAfter: inv.currentStock,
            refModel: 'SalesInvoice',
            refId: invoice._id,
            note: `Cancelled Invoice ${invoice.invoiceNumber}`,
            createdBy: req.user._id,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      }
    }

    return sendSuccess(res, invoice, 'Invoice updated');
  } catch (err) { next(err); }
};
