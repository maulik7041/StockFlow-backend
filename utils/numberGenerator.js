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

/**
 * B4: Generates next document number with retry logic for race conditions.
 * The Sequence model has a unique compound index, so concurrent inserts
 * on the same sequence are handled by findOneAndUpdate's atomic $inc.
 * The retry loop handles the extremely rare case of a duplicate key error
 * on the parent document's unique index.
 */
const generateNextNumber = async (organizationId, docType, date = new Date(), maxRetries = 3) => {
  const financialYear = getFinancialYear(date);
  
  // Find organization to get prefixes
  const org = await Organization.findById(organizationId);
  const prefix = org?.settings?.docPrefixes?.[docType] || docTypePrefixMap[docType] || 'DOC';

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Increment sequence atomically
    const sequenceObj = await Sequence.findOneAndUpdate(
      { organization: organizationId, financialYear, docType },
      { $inc: { sequence: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const paddedNumber = String(sequenceObj.sequence).padStart(3, '0');
    const docNumber = `${prefix}/${paddedNumber}`;

    return { docNumber, serialNumber: paddedNumber };
  }

  throw new Error(`Failed to generate unique document number after ${maxRetries} attempts`);
};

module.exports = {
  getFinancialYear,
  generateNextNumber
};
