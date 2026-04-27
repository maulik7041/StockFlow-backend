const CreditNote = require('../models/CreditNote');
const DebitNote = require('../models/DebitNote');
const SalesInvoice = require('../models/SalesInvoice');
const PurchaseBill = require('../models/PurchaseBill');

/**
 * Recalculates and updates cnAmount and dnAmount on the parent document (SalesInvoice or PurchaseBill).
 * M7: Uses single findById + set + save pattern to avoid double-write.
 * @param {string} parentType - 'SalesInvoice' or 'PurchaseBill'
 * @param {string} parentId - ID of the parent document
 */
async function syncNoteAmountsToParent(parentType, parentId) {
  if (!parentId) return;

  const [cnResults, dnResults] = await Promise.all([
    CreditNote.aggregate([
      { $match: { referenceDocumentId: new (require('mongoose').Types.ObjectId)(parentId), status: 'Issued' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]),
    DebitNote.aggregate([
      { $match: { referenceDocumentId: new (require('mongoose').Types.ObjectId)(parentId), status: 'Issued' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ])
  ]);

  const cnAmount = cnResults.length > 0 ? cnResults[0].total : 0;
  const dnAmount = dnResults.length > 0 ? dnResults[0].total : 0;

  let doc;
  if (parentType === 'SalesInvoice') {
    doc = await SalesInvoice.findById(parentId);
  } else if (parentType === 'PurchaseBill') {
    doc = await PurchaseBill.findById(parentId);
  }

  if (doc) {
    doc.cnAmount = cnAmount;
    doc.dnAmount = dnAmount;
    await doc.save(); // Triggers pre-save hook for paymentStatus recalc
  }
}

module.exports = { syncNoteAmountsToParent };
