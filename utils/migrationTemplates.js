const XLSX = require('xlsx');

/**
 * Template definitions for each importable entity.
 * Each template has:
 *   - columns: Array of { header, field, required, description, validValues }
 *   - sampleRows: Example data to include in the template
 */
const TEMPLATES = {
  Item: {
    sheetName: 'Items',
    columns: [
      { header: 'Name', field: 'name', required: true, description: 'Item/Product name (unique)' },
      { header: 'Category', field: 'category', required: true, description: 'e.g. Electronics, Stationery' },
      { header: 'Unit', field: 'unit', required: true, description: 'e.g. pcs, kg, litre, box, set, nos, mtr' },
      { header: 'Item Type', field: 'itemType', required: true, description: 'raw_material / finished_good / trading_item', validValues: ['raw_material', 'finished_good', 'trading_item'] },
      { header: 'Selling Price', field: 'sellingPrice', required: false, description: 'Default selling price (0 for raw materials)' },
      { header: 'Purchase Price', field: 'purchasePrice', required: false, description: 'Default purchase price (0 for finished goods)' },
      { header: 'HSN Code', field: 'hsnCode', required: false, description: 'HSN/SAC code for GST' },
      { header: 'GST Rate (%)', field: 'gstRate', required: false, description: '0, 5, 12, 18, or 28' },
      { header: 'Reorder Level', field: 'reorderLevel', required: false, description: 'Low stock alert threshold' },
      { header: 'Description', field: 'description', required: false, description: 'Optional description' },
    ],
    sampleRows: [
      { name: 'Laptop Stand', category: 'Electronics', unit: 'pcs', itemType: 'trading_item', sellingPrice: 1800, purchasePrice: 1200, hsnCode: '8473', gstRate: 18, reorderLevel: 5, description: 'Adjustable aluminum stand' },
      { name: 'Metal Base Frame', category: 'Hardware', unit: 'pcs', itemType: 'raw_material', sellingPrice: 0, purchasePrice: 450, hsnCode: '7326', gstRate: 18, reorderLevel: 10, description: '' },
    ],
  },

  Customer: {
    sheetName: 'Customers',
    columns: [
      { header: 'Name', field: 'name', required: true, description: 'Customer/Company name (unique)' },
      { header: 'Contact Person', field: 'contactPerson', required: false, description: 'Primary contact name' },
      { header: 'Phone', field: 'phone', required: false, description: 'Phone number' },
      { header: 'Email', field: 'email', required: false, description: 'Email address' },
      { header: 'Address', field: 'address', required: false, description: 'Full address' },
      { header: 'GSTIN', field: 'gstin', required: false, description: '15-character GSTIN' },
    ],
    sampleRows: [
      { name: 'Nexus Technologies', contactPerson: 'Vikram Patel', phone: '9543210987', email: 'vikram@nexus.com', address: '101 Tech Park, Mumbai', gstin: '27AACNT5678H1Z2' },
      { name: 'Green Solutions Pvt Ltd', contactPerson: 'Anita Joshi', phone: '9432109876', email: 'anita@greensol.com', address: '22 Industrial Area, Pune', gstin: '27AACGS6789I1Z1' },
    ],
  },

  Vendor: {
    sheetName: 'Vendors',
    columns: [
      { header: 'Name', field: 'name', required: true, description: 'Vendor/Supplier name (unique)' },
      { header: 'Contact Person', field: 'contactPerson', required: false, description: 'Primary contact name' },
      { header: 'Phone', field: 'phone', required: false, description: 'Phone number' },
      { header: 'Email', field: 'email', required: false, description: 'Email address' },
      { header: 'Address', field: 'address', required: false, description: 'Full address' },
      { header: 'GSTIN', field: 'gstin', required: false, description: '15-character GSTIN' },
    ],
    sampleRows: [
      { name: 'TechSupply Co.', contactPerson: 'Rahul Mehta', phone: '9876543210', email: 'rahul@techsupply.com', address: '5 Supply Chain Road, Delhi', gstin: '27AABCT1234F1Z5' },
      { name: 'Office World', contactPerson: 'Priya Shah', phone: '9765432109', email: 'priya@officeworld.com', address: '12 Stationery Lane, Bangalore', gstin: '29AABCO4567G1Z3' },
    ],
  },

  Inventory: {
    sheetName: 'Opening Stock',
    columns: [
      { header: 'Item Name', field: 'itemName', required: true, description: 'Must match an existing item name exactly' },
      { header: 'Opening Quantity', field: 'openingQuantity', required: true, description: 'Current stock count (positive number)' },
    ],
    sampleRows: [
      { itemName: 'Laptop Stand', openingQuantity: 50 },
      { itemName: 'USB-C Cable', openingQuantity: 200 },
    ],
  },

  SalesInvoice: {
    sheetName: 'Sales Invoices',
    columns: [
      { header: 'Invoice Number', field: 'invoiceNumber', required: true, description: 'Unique invoice number (e.g. INV/001)' },
      { header: 'Customer Name', field: 'customerName', required: true, description: 'Must match an existing customer' },
      { header: 'Invoice Date', field: 'invoiceDate', required: true, description: 'Date in DD/MM/YYYY or YYYY-MM-DD format' },
      { header: 'Due Date', field: 'dueDate', required: false, description: 'Payment due date' },
      { header: 'Item Name', field: 'itemName', required: true, description: 'Must match an existing item' },
      { header: 'Quantity', field: 'quantity', required: true, description: 'Number of units' },
      { header: 'Unit Price', field: 'unitPrice', required: true, description: 'Price per unit' },
      { header: 'GST Rate (%)', field: 'gstRate', required: false, description: 'GST percentage (0, 5, 12, 18, 28)' },
      { header: 'HSN Code', field: 'hsnCode', required: false, description: 'HSN/SAC code' },
      { header: 'Tax Type', field: 'taxType', required: false, description: 'Intra-state (CGST+SGST) or Inter-state (IGST)', validValues: ['Intra-state (CGST+SGST)', 'Inter-state (IGST)'] },
      { header: 'Freight Charges', field: 'freightCharges', required: false, description: 'Shipping/freight amount' },
      { header: 'Paid Amount', field: 'paidAmount', required: false, description: 'Amount already paid' },
      { header: 'Notes', field: 'notes', required: false, description: 'Additional notes' },
    ],
    sampleRows: [
      { invoiceNumber: 'INV/001', customerName: 'Nexus Technologies', invoiceDate: '01/04/2025', dueDate: '30/04/2025', itemName: 'Laptop Stand', quantity: 10, unitPrice: 1800, gstRate: 18, hsnCode: '8473', taxType: 'Intra-state (CGST+SGST)', freightCharges: 500, paidAmount: 0, notes: '' },
      { invoiceNumber: 'INV/001', customerName: 'Nexus Technologies', invoiceDate: '01/04/2025', dueDate: '30/04/2025', itemName: 'USB-C Cable', quantity: 50, unitPrice: 299, gstRate: 18, hsnCode: '8544', taxType: 'Intra-state (CGST+SGST)', freightCharges: 0, paidAmount: 0, notes: 'Multi-item invoice: rows with same invoice number are grouped' },
    ],
  },

  PurchaseBill: {
    sheetName: 'Purchase Bills',
    columns: [
      { header: 'Bill Number', field: 'billNumber', required: true, description: 'Unique bill number (e.g. PB/001)' },
      { header: 'Vendor Name', field: 'vendorName', required: true, description: 'Must match an existing vendor' },
      { header: 'Bill Date', field: 'billDate', required: true, description: 'Date in DD/MM/YYYY or YYYY-MM-DD format' },
      { header: 'Due Date', field: 'dueDate', required: false, description: 'Payment due date' },
      { header: 'Vendor Bill No', field: 'vendorBillNo', required: false, description: 'Vendor\'s own bill reference' },
      { header: 'Item Name', field: 'itemName', required: true, description: 'Must match an existing item' },
      { header: 'Quantity', field: 'quantity', required: true, description: 'Number of units' },
      { header: 'Unit Price', field: 'unitPrice', required: true, description: 'Price per unit' },
      { header: 'GST Rate (%)', field: 'gstRate', required: false, description: 'GST percentage (0, 5, 12, 18, 28)' },
      { header: 'HSN Code', field: 'hsnCode', required: false, description: 'HSN/SAC code' },
      { header: 'Tax Type', field: 'taxType', required: false, description: 'Intra-state (CGST+SGST) or Inter-state (IGST)', validValues: ['Intra-state (CGST+SGST)', 'Inter-state (IGST)'] },
      { header: 'Freight Charges', field: 'freightCharges', required: false, description: 'Shipping/freight amount' },
      { header: 'Paid Amount', field: 'paidAmount', required: false, description: 'Amount already paid' },
      { header: 'Notes', field: 'notes', required: false, description: 'Additional notes' },
    ],
    sampleRows: [
      { billNumber: 'PB/001', vendorName: 'TechSupply Co.', billDate: '05/04/2025', dueDate: '05/05/2025', vendorBillNo: 'TS-2025-101', itemName: 'Laptop Stand', quantity: 20, unitPrice: 1200, gstRate: 18, hsnCode: '8473', taxType: 'Intra-state (CGST+SGST)', freightCharges: 300, paidAmount: 5000, notes: '' },
    ],
  },
};

/**
 * Generates an Excel workbook buffer for a given entity template.
 * Includes a Data sheet with headers + sample rows, and an Instructions sheet.
 */
function generateTemplate(entity) {
  const template = TEMPLATES[entity];
  if (!template) throw new Error(`Unknown entity: ${entity}`);

  const wb = XLSX.utils.book_new();

  // --- Data sheet ---
  const headers = template.columns.map(c => c.header);
  const sampleData = template.sampleRows.map(row =>
    template.columns.map(c => row[c.field] ?? '')
  );

  const wsData = [headers, ...sampleData];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws['!cols'] = template.columns.map(c => ({ wch: Math.max(c.header.length + 4, 18) }));

  XLSX.utils.book_append_sheet(wb, ws, template.sheetName);

  // --- Instructions sheet ---
  const instrData = [
    ['Field', 'Required', 'Description', 'Valid Values'],
    ...template.columns.map(c => [
      c.header,
      c.required ? 'Yes' : 'No',
      c.description,
      c.validValues ? c.validValues.join(', ') : '',
    ]),
    [],
    ['INSTRUCTIONS:'],
    ['1. Fill in your data starting from Row 2 (Row 1 is the header — do not modify it).'],
    ['2. Delete the sample rows before importing.'],
    ['3. Fields marked "Required" must have a value in every row.'],
    ['4. Save the file as .xlsx or .csv before uploading.'],
    ['5. For multi-item documents (invoices/bills), use the same document number on multiple rows.'],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instrData);
  wsInstr['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 55 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instructions');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Parses an uploaded Excel/CSV buffer into an array of row objects.
 * Returns { rows: [{...}], headers: [...] }
 */
function parseUpload(buffer, entity) {
  const template = TEMPLATES[entity];
  if (!template) throw new Error(`Unknown entity: ${entity}`);

  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  // Use first sheet (could be data sheet or only sheet in CSV)
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  if (!rawRows.length) return { rows: [], headers: [] };

  // Map Excel headers → field names
  const headerMap = {};
  template.columns.forEach(c => {
    headerMap[c.header.toLowerCase().trim()] = c.field;
  });

  const rows = rawRows.map((raw, idx) => {
    const mapped = { _rowIndex: idx + 2 }; // +2 because row 1 is header, 0-indexed
    for (const [excelKey, value] of Object.entries(raw)) {
      const field = headerMap[excelKey.toLowerCase().trim()];
      if (field) {
        mapped[field] = typeof value === 'string' ? value.trim() : value;
      }
    }
    return mapped;
  });

  return { rows, headers: Object.keys(rawRows[0] || {}) };
}

/**
 * Returns the template definition for validation purposes.
 */
function getTemplateDefinition(entity) {
  return TEMPLATES[entity] || null;
}

function getAvailableEntities() {
  return Object.keys(TEMPLATES);
}

module.exports = { generateTemplate, parseUpload, getTemplateDefinition, getAvailableEntities, TEMPLATES };
