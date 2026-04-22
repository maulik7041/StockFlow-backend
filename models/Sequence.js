const mongoose = require('mongoose');

const sequenceSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  financialYear: { type: String, required: true }, // e.g. "2024-25"
  docType: { 
    type: String, 
    required: true, 
    enum: ['SalesInvoice', 'PurchaseOrder', 'GRN', 'PurchaseBill', 'CreditNote', 'DebitNote', 'ProformaInvoice'] 
  },
  sequence: { type: Number, default: 0 },
});

// Ensure uniqueness per organization, financial year and document type
sequenceSchema.index({ organization: 1, financialYear: 1, docType: 1 }, { unique: true });

module.exports = mongoose.model('Sequence', sequenceSchema);
