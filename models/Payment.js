const mongoose = require('mongoose');

const allocationSchema = new mongoose.Schema({
  documentType: { type: String, enum: ['SalesInvoice', 'PurchaseBill'], required: true },
  documentId: { type: mongoose.Schema.Types.ObjectId, required: true },
  amount: { type: Number, required: true, min: 0.01 },
}, { _id: false });

const paymentSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    documentType: { type: String, enum: ['SalesInvoice', 'PurchaseBill'] },
    documentId: { type: mongoose.Schema.Types.ObjectId, index: true },
    allocations: [allocationSchema],
    // Party info
    partyType: { type: String, enum: ['Customer', 'Vendor'] },
    partyId: { type: mongoose.Schema.Types.ObjectId },
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
paymentSchema.index({ 'allocations.documentType': 1, 'allocations.documentId': 1 });
paymentSchema.index({ partyType: 1, partyId: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
