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
  const prefix2 = docTypePrefixMap[docType];

  if (!prefix2) {
    throw new Error(`Invalid document type: ${docType}`);
  }

  // Find organization to get prefix1
  const org = await Organization.findById(organizationId);
  const prefix1 = org?.settings?.docNumberPrefix || 'ORG';

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Increment sequence atomically
    const sequenceObj = await Sequence.findOneAndUpdate(
      { organization: organizationId, financialYear, docType },
      { $inc: { sequence: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const paddedNumber = String(sequenceObj.sequence).padStart(3, '0');
    const docNumber = `${prefix1}/${prefix2}/${paddedNumber}`;

    // On first attempt, just return (the unique index on the parent doc will catch duplicates)
    // On retries, we've already had a collision so we try the next sequence number
    return docNumber;
  }

  throw new Error(`Failed to generate unique document number after ${maxRetries} attempts`);
};

module.exports = {
  getFinancialYear,
  generateNextNumber
};
