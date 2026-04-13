const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    documentType: { type: String, enum: ['SalesInvoice', 'PurchaseOrder'], required: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    paymentDate: { type: Date, default: Date.now },
    mode: { type: String, enum: ['Cash', 'Bank Transfer', 'UPI', 'Cheque', 'Credit Card', 'Other'], default: 'Bank Transfer' },
    referenceNumber: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

paymentSchema.index({ documentType: 1, documentId: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
