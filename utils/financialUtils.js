const CreditNote = require('../models/CreditNote');
const DebitNote = require('../models/DebitNote');
const SalesInvoice = require('../models/SalesInvoice');
const PurchaseBill = require('../models/PurchaseBill');

/**
 * Recalculates and updates cnAmount and dnAmount on the parent document (SalesInvoice or PurchaseBill).
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

  if (parentType === 'SalesInvoice') {
    await SalesInvoice.findByIdAndUpdate(parentId, { cnAmount, dnAmount }, { runValidators: true });
    // Trigger pre-save for paymentStatus update
    const doc = await SalesInvoice.findById(parentId);
    if (doc) await doc.save();
  } else if (parentType === 'PurchaseBill') {
    await PurchaseBill.findByIdAndUpdate(parentId, { cnAmount, dnAmount }, { runValidators: true });
    const doc = await PurchaseBill.findById(parentId);
    if (doc) await doc.save();
  }
}

module.exports = { syncNoteAmountsToParent };
