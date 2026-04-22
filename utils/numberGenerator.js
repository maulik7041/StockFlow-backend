const Sequence = require('../models/Sequence');
const Organization = require('../models/Organization');

const getFinancialYear = (date) => {
  const d = new Date(date);
  const month = d.getMonth(); // 0-indexed, 0 = Jan, 3 = April
  const year = d.getFullYear();
  
  if (month >= 3) {
    // April to December
    return `${year}-${(year + 1).toString().slice(-2)}`;
  } else {
    // January to March
    return `${year - 1}-${year.toString().slice(-2)}`;
  }
};

const docTypePrefixMap = {
  SalesInvoice: 'INV',
  PurchaseOrder: 'PO',
  GRN: 'GRN',
  PurchaseBill: 'PB',
  CreditNote: 'CN',
  DebitNote: 'DN',
  ProformaInvoice: 'PI'
};

const generateNextNumber = async (organizationId, docType, date = new Date()) => {
  const financialYear = getFinancialYear(date);
  const prefix2 = docTypePrefixMap[docType];

  if (!prefix2) {
    throw new Error(`Invalid document type: ${docType}`);
  }

  // Find organization to get prefix1
  const org = await Organization.findById(organizationId);
  const prefix1 = org?.settings?.docNumberPrefix || 'ORG';

  // Increment sequence atomically
  const sequenceObj = await Sequence.findOneAndUpdate(
    { organization: organizationId, financialYear, docType },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const paddedNumber = String(sequenceObj.sequence).padStart(3, '0');
  
  return `${prefix1}/${prefix2}/${paddedNumber}`;
};

module.exports = {
  getFinancialYear,
  generateNextNumber
};
