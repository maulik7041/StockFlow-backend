const mongoose = require('mongoose');
const SalesInvoice = require('../models/SalesInvoice');
const Inventory = require('../models/Inventory');
const StockTransaction = require('../models/StockTransaction');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { getPagination, getSort } = require('../utils/pagination');
const { getAdvancedFilter } = require('../utils/filter');

exports.getSales = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { organization: req.organizationId, ...getAdvancedFilter(req.query) };
    if (req.query.status) filter.status = req.query.status;
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
      .populate('customer').populate('items.item', 'name sku unit').populate('createdBy', 'name');
    if (!sale) return sendError(res, 'Invoice not found', 404);
    return sendSuccess(res, sale);
  } catch (err) { next(err); }
};

exports.createSale = async (req, res, next) => {
  try {
    const { customer, items, status, dueDate, notes } = req.body;
    const orgId = req.organizationId;

    for (const saleItem of items) {
      const inv = await Inventory.findOne({ item: saleItem.item, organization: orgId });
      if (!inv || inv.currentStock < saleItem.quantity) {
        throw new Error(`Insufficient stock for item ${saleItem.item}`);
      }
    }

    const invoice = await SalesInvoice.create({ customer, items, status: status || 'Issued', dueDate, notes, organization: orgId, createdBy: req.user._id });

    // Deduct stock
    for (const saleItem of items) {
      const inv = await Inventory.findOne({ item: saleItem.item, organization: orgId });
      inv.currentStock -= saleItem.quantity;
      await inv.save();

      await StockTransaction.create({
        item: saleItem.item,
        organization: orgId,
        type: 'OUT',
        quantity: saleItem.quantity,
        balanceAfter: inv.currentStock,
        refModel: 'SalesInvoice',
        refId: invoice._id,
        note: `Invoice ${invoice.invoiceNumber}`,
        createdBy: req.user._id,
      });
    }

    return sendSuccess(res, invoice, 'Sales invoice created', 201);
  } catch (err) {
    return sendError(res, err.message, 400);
  }
};

exports.updateSale = async (req, res, next) => {
  try {
    const invoice = await SalesInvoice.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!invoice) return sendError(res, 'Invoice not found', 404);
    if (invoice.status === 'Cancelled') return sendError(res, 'Cannot update a cancelled invoice', 400);
    const isCancelling = req.body.status === 'Cancelled' && invoice.status !== 'Cancelled';

    Object.assign(invoice, req.body);
    await invoice.save();

    if (isCancelling) {
      for (const saleItem of invoice.items) {
        const inv = await Inventory.findOne({ item: saleItem.item, organization: req.organizationId });
        if (inv) {
          inv.currentStock += saleItem.quantity;
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
          });
        }
      }
    }

    return sendSuccess(res, invoice, 'Invoice updated');
  } catch (err) { next(err); }
};
