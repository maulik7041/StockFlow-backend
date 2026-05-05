const { v4: uuidv4 } = require('uuid');
const MigrationLog = require('../models/MigrationLog');
const Item = require('../models/Item');
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const Inventory = require('../models/Inventory');
const SalesInvoice = require('../models/SalesInvoice');
const PurchaseBill = require('../models/PurchaseBill');
const StockTransaction = require('../models/StockTransaction');
const { generateTemplate, parseUpload, getTemplateDefinition, getAvailableEntities } = require('../utils/migrationTemplates');
const { sendSuccess } = require('../utils/response');

// ── Helpers ─────────────────────────────────────────────────────
function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  const s = String(val).trim();
  // DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);
  // YYYY-MM-DD
  const ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymd) return new Date(+ymd[1], +ymd[2] - 1, +ymd[3]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function num(v, fallback = 0) {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

// ── Validators per entity ───────────────────────────────────────
function validateItemRow(row, idx, existingNames) {
  const errors = [];
  if (!row.name) errors.push({ row: idx, field: 'name', message: 'Name is required' });
  if (!row.category) errors.push({ row: idx, field: 'category', message: 'Category is required' });
  if (!row.unit) errors.push({ row: idx, field: 'unit', message: 'Unit is required' });
  const validTypes = ['raw_material', 'finished_good', 'trading_item'];
  if (!row.itemType || !validTypes.includes(row.itemType)) {
    errors.push({ row: idx, field: 'itemType', message: `Item Type must be one of: ${validTypes.join(', ')}` });
  }
  if (row.gstRate !== undefined && row.gstRate !== '' && ![0, 5, 12, 18, 28].includes(num(row.gstRate, -1))) {
    errors.push({ row: idx, field: 'gstRate', message: 'GST Rate must be 0, 5, 12, 18, or 28' });
  }
  const warnings = [];
  if (row.name && existingNames.has(row.name.toLowerCase())) {
    warnings.push({ row: idx, field: 'name', message: `Item "${row.name}" already exists — will be skipped` });
  }
  return { errors, warnings };
}

function validateCustomerRow(row, idx, existingNames) {
  const errors = [];
  if (!row.name) errors.push({ row: idx, field: 'name', message: 'Name is required' });
  const warnings = [];
  if (row.name && existingNames.has(row.name.toLowerCase())) {
    warnings.push({ row: idx, field: 'name', message: `Customer "${row.name}" already exists — will be skipped` });
  }
  return { errors, warnings };
}

function validateVendorRow(row, idx, existingNames) {
  const errors = [];
  if (!row.name) errors.push({ row: idx, field: 'name', message: 'Name is required' });
  const warnings = [];
  if (row.name && existingNames.has(row.name.toLowerCase())) {
    warnings.push({ row: idx, field: 'name', message: `Vendor "${row.name}" already exists — will be skipped` });
  }
  return { errors, warnings };
}

function validateInventoryRow(row, idx, itemMap) {
  const errors = [];
  if (!row.itemName) errors.push({ row: idx, field: 'itemName', message: 'Item Name is required' });
  else if (!itemMap.has(row.itemName.toLowerCase())) {
    errors.push({ row: idx, field: 'itemName', message: `No item found matching "${row.itemName}"` });
  }
  if (row.openingQuantity === undefined || row.openingQuantity === '' || num(row.openingQuantity) < 0) {
    errors.push({ row: idx, field: 'openingQuantity', message: 'Opening Quantity must be a positive number' });
  }
  return { errors, warnings: [] };
}

function validateSalesInvoiceRow(row, idx, customerMap, itemMap) {
  const errors = [];
  if (!row.invoiceNumber) errors.push({ row: idx, field: 'invoiceNumber', message: 'Invoice Number is required' });
  if (!row.customerName) errors.push({ row: idx, field: 'customerName', message: 'Customer Name is required' });
  else if (!customerMap.has(row.customerName.toLowerCase())) {
    errors.push({ row: idx, field: 'customerName', message: `No customer found matching "${row.customerName}"` });
  }
  if (!row.invoiceDate) errors.push({ row: idx, field: 'invoiceDate', message: 'Invoice Date is required' });
  else if (!parseDate(row.invoiceDate)) errors.push({ row: idx, field: 'invoiceDate', message: 'Invalid date format' });
  if (!row.itemName) errors.push({ row: idx, field: 'itemName', message: 'Item Name is required' });
  else if (!itemMap.has(row.itemName.toLowerCase())) {
    errors.push({ row: idx, field: 'itemName', message: `No item found matching "${row.itemName}"` });
  }
  if (!row.quantity || num(row.quantity) <= 0) errors.push({ row: idx, field: 'quantity', message: 'Quantity must be > 0' });
  if (row.unitPrice === undefined || row.unitPrice === '' || num(row.unitPrice) < 0) errors.push({ row: idx, field: 'unitPrice', message: 'Unit Price is required' });
  return { errors, warnings: [] };
}

function validatePurchaseBillRow(row, idx, vendorMap, itemMap) {
  const errors = [];
  if (!row.billNumber) errors.push({ row: idx, field: 'billNumber', message: 'Bill Number is required' });
  if (!row.vendorName) errors.push({ row: idx, field: 'vendorName', message: 'Vendor Name is required' });
  else if (!vendorMap.has(row.vendorName.toLowerCase())) {
    errors.push({ row: idx, field: 'vendorName', message: `No vendor found matching "${row.vendorName}"` });
  }
  if (!row.billDate) errors.push({ row: idx, field: 'billDate', message: 'Bill Date is required' });
  else if (!parseDate(row.billDate)) errors.push({ row: idx, field: 'billDate', message: 'Invalid date format' });
  if (!row.itemName) errors.push({ row: idx, field: 'itemName', message: 'Item Name is required' });
  else if (!itemMap.has(row.itemName.toLowerCase())) {
    errors.push({ row: idx, field: 'itemName', message: `No item found matching "${row.itemName}"` });
  }
  if (!row.quantity || num(row.quantity) <= 0) errors.push({ row: idx, field: 'quantity', message: 'Quantity must be > 0' });
  if (row.unitPrice === undefined || row.unitPrice === '' || num(row.unitPrice) < 0) errors.push({ row: idx, field: 'unitPrice', message: 'Unit Price is required' });
  return { errors, warnings: [] };
}

// ── Executors per entity ────────────────────────────────────────
async function executeItems(rows, orgId, userId) {
  const existing = await Item.find({ organization: orgId }).select('name');
  const existingSet = new Set(existing.map(i => i.name.toLowerCase()));
  const createdIds = [];
  let skipped = 0;

  for (const row of rows) {
    if (existingSet.has(row.name.toLowerCase())) { skipped++; continue; }
    const item = await Item.create({
      organization: orgId,
      name: row.name,
      category: row.category,
      unit: row.unit || 'pcs',
      itemType: row.itemType || 'trading_item',
      sellingPrice: num(row.sellingPrice),
      purchasePrice: num(row.purchasePrice),
      hsnCode: row.hsnCode || '',
      gstRate: num(row.gstRate),
      reorderLevel: num(row.reorderLevel),
      description: row.description || '',
    });
    // Auto-create inventory record
    const inv = await Inventory.create({ organization: orgId, item: item._id, currentStock: 0 });
    createdIds.push(item._id, inv._id);
    existingSet.add(row.name.toLowerCase());
  }
  return { createdIds, skipped };
}

async function executeCustomers(rows, orgId) {
  const existing = await Customer.find({ organization: orgId }).select('name');
  const existingSet = new Set(existing.map(c => c.name.toLowerCase()));
  const createdIds = [];
  let skipped = 0;

  for (const row of rows) {
    if (existingSet.has(row.name.toLowerCase())) { skipped++; continue; }
    const c = await Customer.create({
      organization: orgId, name: row.name,
      contactPerson: row.contactPerson || '', phone: row.phone || '',
      email: row.email || '', address: row.address || '',
      gstin: row.gstin || '',
    });
    createdIds.push(c._id);
    existingSet.add(row.name.toLowerCase());
  }
  return { createdIds, skipped };
}

async function executeVendors(rows, orgId) {
  const existing = await Vendor.find({ organization: orgId }).select('name');
  const existingSet = new Set(existing.map(v => v.name.toLowerCase()));
  const createdIds = [];
  let skipped = 0;

  for (const row of rows) {
    if (existingSet.has(row.name.toLowerCase())) { skipped++; continue; }
    const v = await Vendor.create({
      organization: orgId, name: row.name,
      contactPerson: row.contactPerson || '', phone: row.phone || '',
      email: row.email || '', address: row.address || '',
      gstin: row.gstin || '',
    });
    createdIds.push(v._id);
    existingSet.add(row.name.toLowerCase());
  }
  return { createdIds, skipped };
}

async function executeInventory(rows, orgId, userId) {
  const items = await Item.find({ organization: orgId }).select('name');
  const itemMap = new Map(items.map(i => [i.name.toLowerCase(), i._id]));
  const createdIds = [];
  let skipped = 0;

  for (const row of rows) {
    const itemId = itemMap.get(row.itemName.toLowerCase());
    if (!itemId) { skipped++; continue; }
    const qty = num(row.openingQuantity);
    const inv = await Inventory.findOneAndUpdate(
      { organization: orgId, item: itemId },
      { $set: { currentStock: qty } },
      { upsert: true, new: true }
    );
    const tx = await StockTransaction.create({
      organization: orgId, item: itemId, type: 'ADJUST',
      quantity: qty, balanceAfter: qty, refModel: 'Adjustment',
      note: 'Migration: Opening stock', createdBy: userId,
    });
    createdIds.push(tx._id);
  }
  return { createdIds, skipped };
}

async function executeSalesInvoices(rows, orgId, userId) {
  const customers = await Customer.find({ organization: orgId }).select('name');
  const customerMap = new Map(customers.map(c => [c.name.toLowerCase(), c._id]));
  const items = await Item.find({ organization: orgId }).select('name hsnCode gstRate');
  const itemMap = new Map(items.map(i => [i.name.toLowerCase(), i]));

  // Group rows by invoice number
  const grouped = {};
  for (const row of rows) {
    const key = row.invoiceNumber;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(row);
  }

  const createdIds = [];
  let skipped = 0;

  // Check existing invoice numbers
  const existingInvs = await SalesInvoice.find({ organization: orgId }).select('invoiceNumber');
  const existingNums = new Set(existingInvs.map(i => i.invoiceNumber));

  for (const [invNum, invRows] of Object.entries(grouped)) {
    if (existingNums.has(invNum)) { skipped += invRows.length; continue; }
    const first = invRows[0];
    const customerId = customerMap.get(first.customerName.toLowerCase());
    if (!customerId) { skipped += invRows.length; continue; }

    const lineItems = invRows.map(r => {
      const it = itemMap.get(r.itemName.toLowerCase());
      return {
        item: it._id, hsnCode: r.hsnCode || it.hsnCode || '',
        quantity: num(r.quantity), unitPrice: num(r.unitPrice),
        gstRate: r.gstRate !== undefined && r.gstRate !== '' ? num(r.gstRate) : (it.gstRate || 0),
      };
    }).filter(li => li.item);

    if (!lineItems.length) { skipped += invRows.length; continue; }

    const si = await SalesInvoice.create({
      organization: orgId, customer: customerId,
      invoiceNumber: invNum,
      invoiceDate: parseDate(first.invoiceDate) || new Date(),
      dueDate: parseDate(first.dueDate) || undefined,
      items: lineItems,
      taxType: first.taxType || 'Intra-state (CGST+SGST)',
      freightCharges: num(first.freightCharges),
      paidAmount: num(first.paidAmount),
      notes: first.notes || '',
      status: 'Issued',
      createdBy: userId,
    });
    createdIds.push(si._id);
  }
  return { createdIds, skipped };
}

async function executePurchaseBills(rows, orgId, userId) {
  const vendors = await Vendor.find({ organization: orgId }).select('name');
  const vendorMap = new Map(vendors.map(v => [v.name.toLowerCase(), v._id]));
  const items = await Item.find({ organization: orgId }).select('name hsnCode gstRate');
  const itemMap = new Map(items.map(i => [i.name.toLowerCase(), i]));

  const grouped = {};
  for (const row of rows) {
    const key = row.billNumber;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(row);
  }

  const createdIds = [];
  let skipped = 0;

  const existingBills = await PurchaseBill.find({ organization: orgId }).select('billNumber');
  const existingNums = new Set(existingBills.map(b => b.billNumber));

  for (const [billNum, billRows] of Object.entries(grouped)) {
    if (existingNums.has(billNum)) { skipped += billRows.length; continue; }
    const first = billRows[0];
    const vendorId = vendorMap.get(first.vendorName.toLowerCase());
    if (!vendorId) { skipped += billRows.length; continue; }

    const lineItems = billRows.map(r => {
      const it = itemMap.get(r.itemName.toLowerCase());
      return {
        item: it._id, hsnCode: r.hsnCode || it.hsnCode || '',
        quantity: num(r.quantity), unitPrice: num(r.unitPrice),
        gstRate: r.gstRate !== undefined && r.gstRate !== '' ? num(r.gstRate) : (it.gstRate || 0),
      };
    }).filter(li => li.item);

    if (!lineItems.length) { skipped += billRows.length; continue; }

    const pb = await PurchaseBill.create({
      organization: orgId, vendor: vendorId,
      billNumber: billNum, vendorBillNo: first.vendorBillNo || '',
      billDate: parseDate(first.billDate) || new Date(),
      dueDate: parseDate(first.dueDate) || undefined,
      items: lineItems,
      taxType: first.taxType || 'Intra-state (CGST+SGST)',
      freightCharges: num(first.freightCharges),
      paidAmount: num(first.paidAmount),
      notes: first.notes || '',
      status: 'Active',
      createdBy: userId,
    });
    createdIds.push(pb._id);
  }
  return { createdIds, skipped };
}

// ── Controller endpoints ────────────────────────────────────────

exports.downloadTemplate = async (req, res, next) => {
  try {
    const { entity } = req.params;
    const buffer = generateTemplate(entity);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=BizzOps_${entity}_Template.xlsx`);
    res.send(Buffer.from(buffer));
  } catch (err) { next(err); }
};

exports.validate = async (req, res, next) => {
  try {
    const orgId = req.organizationId;
    const { entity } = req.body;
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    if (!entity) return res.status(400).json({ success: false, message: 'Entity type is required' });

    const { rows } = parseUpload(req.file.buffer, entity);
    if (!rows.length) return sendSuccess(res, { valid: false, totalRows: 0, errors: [{ row: 0, field: '', message: 'File is empty or has no data rows' }], warnings: [], preview: [] });

    let allErrors = [], allWarnings = [];

    if (entity === 'Item') {
      const existing = await Item.find({ organization: orgId }).select('name');
      const existingNames = new Set(existing.map(i => i.name.toLowerCase()));
      rows.forEach(r => {
        const { errors, warnings } = validateItemRow(r, r._rowIndex, existingNames);
        allErrors.push(...errors); allWarnings.push(...warnings);
      });
    } else if (entity === 'Customer') {
      const existing = await Customer.find({ organization: orgId }).select('name');
      const existingNames = new Set(existing.map(c => c.name.toLowerCase()));
      rows.forEach(r => {
        const { errors, warnings } = validateCustomerRow(r, r._rowIndex, existingNames);
        allErrors.push(...errors); allWarnings.push(...warnings);
      });
    } else if (entity === 'Vendor') {
      const existing = await Vendor.find({ organization: orgId }).select('name');
      const existingNames = new Set(existing.map(v => v.name.toLowerCase()));
      rows.forEach(r => {
        const { errors, warnings } = validateVendorRow(r, r._rowIndex, existingNames);
        allErrors.push(...errors); allWarnings.push(...warnings);
      });
    } else if (entity === 'Inventory') {
      const items = await Item.find({ organization: orgId }).select('name');
      const itemMap = new Map(items.map(i => [i.name.toLowerCase(), i._id]));
      rows.forEach(r => {
        const { errors, warnings } = validateInventoryRow(r, r._rowIndex, itemMap);
        allErrors.push(...errors); allWarnings.push(...warnings);
      });
    } else if (entity === 'SalesInvoice') {
      const customers = await Customer.find({ organization: orgId }).select('name');
      const customerMap = new Map(customers.map(c => [c.name.toLowerCase(), c._id]));
      const items = await Item.find({ organization: orgId }).select('name');
      const itemMap = new Map(items.map(i => [i.name.toLowerCase(), i._id]));
      rows.forEach(r => {
        const { errors, warnings } = validateSalesInvoiceRow(r, r._rowIndex, customerMap, itemMap);
        allErrors.push(...errors); allWarnings.push(...warnings);
      });
    } else if (entity === 'PurchaseBill') {
      const vendors = await Vendor.find({ organization: orgId }).select('name');
      const vendorMap = new Map(vendors.map(v => [v.name.toLowerCase(), v._id]));
      const items = await Item.find({ organization: orgId }).select('name');
      const itemMap = new Map(items.map(i => [i.name.toLowerCase(), i._id]));
      rows.forEach(r => {
        const { errors, warnings } = validatePurchaseBillRow(r, r._rowIndex, vendorMap, itemMap);
        allErrors.push(...errors); allWarnings.push(...warnings);
      });
    }

    const errorRows = new Set(allErrors.map(e => e.row));
    const validRows = rows.filter(r => !errorRows.has(r._rowIndex)).length;
    const preview = rows.slice(0, 10).map(r => { const { _rowIndex, ...rest } = r; return rest; });

    return sendSuccess(res, {
      valid: allErrors.length === 0,
      totalRows: rows.length,
      validRows,
      errors: allErrors,
      warnings: allWarnings,
      preview,
    });
  } catch (err) { next(err); }
};

exports.execute = async (req, res, next) => {
  try {
    const orgId = req.organizationId;
    const userId = req.userId;
    const { entity } = req.body;
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    if (!entity) return res.status(400).json({ success: false, message: 'Entity type is required' });

    const batchId = uuidv4();
    const { rows } = parseUpload(req.file.buffer, entity);

    const log = await MigrationLog.create({
      organization: orgId, batchId, entity, status: 'executing',
      totalRows: rows.length, createdBy: userId, startedAt: new Date(),
    });

    try {
      let result;
      if (entity === 'Item') result = await executeItems(rows, orgId, userId);
      else if (entity === 'Customer') result = await executeCustomers(rows, orgId);
      else if (entity === 'Vendor') result = await executeVendors(rows, orgId);
      else if (entity === 'Inventory') result = await executeInventory(rows, orgId, userId);
      else if (entity === 'SalesInvoice') result = await executeSalesInvoices(rows, orgId, userId);
      else if (entity === 'PurchaseBill') result = await executePurchaseBills(rows, orgId, userId);
      else return res.status(400).json({ success: false, message: `Unsupported entity: ${entity}` });

      log.status = 'completed';
      log.successCount = result.createdIds.length;
      log.skippedCount = result.skipped;
      log.createdIds = result.createdIds;
      log.completedAt = new Date();
      await log.save();

      return sendSuccess(res, {
        batchId, status: 'completed',
        totalRows: rows.length, successCount: result.createdIds.length,
        skippedCount: result.skipped,
      });
    } catch (execErr) {
      log.status = 'failed';
      log.errors = [{ row: 0, field: '', message: execErr.message }];
      log.completedAt = new Date();
      await log.save();
      throw execErr;
    }
  } catch (err) { next(err); }
};

exports.getStatus = async (req, res, next) => {
  try {
    const log = await MigrationLog.findOne({ batchId: req.params.batchId, organization: req.organizationId });
    if (!log) return res.status(404).json({ success: false, message: 'Migration batch not found' });
    return sendSuccess(res, log);
  } catch (err) { next(err); }
};

exports.rollback = async (req, res, next) => {
  try {
    const log = await MigrationLog.findOne({ batchId: req.params.batchId, organization: req.organizationId });
    if (!log) return res.status(404).json({ success: false, message: 'Migration batch not found' });
    if (log.status === 'rolled_back') return res.status(400).json({ success: false, message: 'Already rolled back' });
    if (log.status !== 'completed') return res.status(400).json({ success: false, message: 'Can only rollback completed migrations' });

    const Model = { Item, Customer, Vendor, SalesInvoice, PurchaseBill }[log.entity];
    if (Model) {
      await Model.deleteMany({ _id: { $in: log.createdIds } });
    }
    // For Inventory entity, we delete stock transactions (createdIds are tx IDs)
    if (log.entity === 'Inventory') {
      await StockTransaction.deleteMany({ _id: { $in: log.createdIds } });
    }
    // If Items were rolled back, also delete their inventory records
    if (log.entity === 'Item') {
      await Inventory.deleteMany({ item: { $in: log.createdIds.filter(id => id) } });
    }

    log.status = 'rolled_back';
    await log.save();
    return sendSuccess(res, { message: 'Migration rolled back successfully', batchId: log.batchId });
  } catch (err) { next(err); }
};

exports.getHistory = async (req, res, next) => {
  try {
    const logs = await MigrationLog.find({ organization: req.organizationId })
      .sort({ createdAt: -1 }).limit(50)
      .populate('createdBy', 'name');
    return sendSuccess(res, logs);
  } catch (err) { next(err); }
};
