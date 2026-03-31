const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
const PurchaseOrder = require('../models/PurchaseOrder');
const SalesInvoice = require('../models/SalesInvoice');
const StockTransaction = require('../models/StockTransaction');
const Item = require('../models/Item');
const { sendSuccess } = require('../utils/response');

exports.stockReport = async (req, res, next) => {
  try {
    const orgId = req.organizationId;
    const inventory = await Inventory.find({ organization: orgId }).populate('item', 'name sku category unit reorderLevel sellingPrice purchasePrice');
    const report = inventory.filter((r) => r.item).map((r) => ({
      item: r.item.name, sku: r.item.sku, category: r.item.category, unit: r.item.unit,
      currentStock: r.currentStock, reorderLevel: r.item.reorderLevel,
      isLowStock: r.currentStock <= r.item.reorderLevel,
      stockValue: r.currentStock * r.item.purchasePrice,
    }));
    const totalValue = report.reduce((s, i) => s + i.stockValue, 0);
    return sendSuccess(res, { items: report, totalValue, totalItems: report.length, lowStockCount: report.filter((i) => i.isLowStock).length });
  } catch (err) { next(err); }
};

exports.purchaseReport = async (req, res, next) => {
  try {
    const orgId = req.organizationId;
    const { from, to } = req.query;
    const match = { organization: orgId };
    if (from || to) {
      match.createdAt = {};
      if (from) match.createdAt.$gte = new Date(from);
      if (to) match.createdAt.$lte = new Date(to);
    }
    const pos = await PurchaseOrder.find(match).populate('vendor', 'name');
    const summary = {
      total: pos.length,
      totalAmount: pos.reduce((s, p) => s + p.totalAmount, 0),
      byStatus: pos.reduce((acc, p) => { acc[p.status] = (acc[p.status] || 0) + 1; return acc; }, {}),
      orders: pos.map((p) => ({ poNumber: p.poNumber, vendor: p.vendor?.name, status: p.status, totalAmount: p.totalAmount, date: p.createdAt })),
    };
    return sendSuccess(res, summary);
  } catch (err) { next(err); }
};

exports.salesReport = async (req, res, next) => {
  try {
    const orgId = req.organizationId;
    const { from, to } = req.query;
    const match = { organization: orgId };
    if (from || to) {
      match.invoiceDate = {};
      if (from) match.invoiceDate.$gte = new Date(from);
      if (to) match.invoiceDate.$lte = new Date(to);
    }
    const sales = await SalesInvoice.find(match).populate('customer', 'name');
    const summary = {
      total: sales.length,
      totalRevenue: sales.filter((s) => s.status !== 'Cancelled').reduce((s, i) => s + i.totalAmount, 0),
      totalCollected: sales.reduce((s, i) => s + i.paidAmount, 0),
      byStatus: sales.reduce((acc, s) => { acc[s.status] = (acc[s.status] || 0) + 1; return acc; }, {}),
      invoices: sales.map((s) => ({ invoiceNumber: s.invoiceNumber, customer: s.customer?.name, status: s.status, totalAmount: s.totalAmount, paidAmount: s.paidAmount, date: s.invoiceDate })),
    };
    return sendSuccess(res, summary);
  } catch (err) { next(err); }
};

exports.profitReport = async (req, res, next) => {
  try {
    const orgId = req.organizationId;
    const { from, to } = req.query;
    const dateFilter = { organization: orgId };
    if (from || to) {
      dateFilter.createdAt = {};
      if (from) dateFilter.createdAt.$gte = new Date(from);
      if (to) dateFilter.createdAt.$lte = new Date(to);
    }

    const salesMatch = { organization: orgId, status: { $in: ['Issued', 'Paid'] }, ...(from || to ? { invoiceDate: dateFilter.createdAt } : {}) };
    const sales = await SalesInvoice.find(salesMatch).populate('items.item', 'purchasePrice');

    let revenue = 0, costOfGoods = 0;
    for (const sale of sales) {
      revenue += sale.totalAmount;
      for (const si of sale.items) { costOfGoods += (si.item?.purchasePrice || 0) * si.quantity; }
    }

    const purchaseMatch = { organization: orgId, status: { $ne: 'Cancelled' } };
    const pos = await PurchaseOrder.find(purchaseMatch);
    const purchaseSpend = pos.reduce((s, p) => s + p.totalAmount, 0);

    return sendSuccess(res, {
      revenue, costOfGoods,
      grossProfit: revenue - costOfGoods,
      grossMargin: revenue > 0 ? (((revenue - costOfGoods) / revenue) * 100).toFixed(2) + '%' : '0%',
      purchaseSpend,
    });
  } catch (err) { next(err); }
};

exports.dashboardStats = async (req, res, next) => {
  try {
    const orgId = req.organizationId;
    const [totalItems, totalVendors, totalCustomers, allInv, pendingPOs, recentSales, recentTransactions] = await Promise.all([
      Item.countDocuments({ organization: orgId, isActive: true }),
      mongoose.model('Vendor').countDocuments({ organization: orgId, isActive: true }),
      mongoose.model('Customer').countDocuments({ organization: orgId, isActive: true }),
      Inventory.find({ organization: orgId }).populate('item', 'reorderLevel'),
      PurchaseOrder.countDocuments({ organization: orgId, status: { $in: ['Draft', 'Sent', 'Partial'] } }),
      SalesInvoice.find({ organization: orgId, status: { $ne: 'Cancelled' } }).sort({ createdAt: -1 }).limit(5).populate('customer', 'name').select('invoiceNumber customer totalAmount status invoiceDate'),
      StockTransaction.find({ organization: orgId }).sort({ createdAt: -1 }).limit(10).populate('item', 'name sku').select('item type quantity balanceAfter createdAt'),
    ]);

    const lowStockCount = allInv.filter((r) => r.item && r.currentStock <= r.item.reorderLevel).length;

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const monthlyRevenue = await SalesInvoice.aggregate([
      { $match: { organization: new mongoose.Types.ObjectId(orgId), status: { $in: ['Issued', 'Paid'] }, invoiceDate: { $gte: sixMonthsAgo } } },
      { $group: { _id: { year: { $year: '$invoiceDate' }, month: { $month: '$invoiceDate' } }, revenue: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    return sendSuccess(res, { totalItems, totalVendors, totalCustomers, lowStockCount, pendingPOs, recentSales, recentTransactions, monthlyRevenue });
  } catch (err) { next(err); }
};
