const mongoose = require('mongoose');
const { generateNextNumber } = require('../utils/numberGenerator');

const debitNoteItemSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  hsnCode: { type: String, trim: true, default: '' },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  gstRate: { type: Number, default: 0 },
});

debitNoteItemSchema.virtual('total').get(function () {
  return this.quantity * this.unitPrice;
});
debitNoteItemSchema.set('toJSON', { virtuals: true });
debitNoteItemSchema.set('toObject', { virtuals: true });

const debitNoteSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    noteNumber: { type: String },
    // Generic party (Customer or Vendor)
    partyType: { type: String, enum: ['Customer', 'Vendor'], required: true },
    party: { type: mongoose.Schema.Types.ObjectId, required: true },
    // Mandatory reference document
    referenceDocumentType: { type: String, enum: ['SalesInvoice', 'PurchaseBill'], required: true },
    referenceDocumentId: { type: mongoose.Schema.Types.ObjectId, required: true },
    referenceNumber: { type: String, trim: true, default: '' },
    items: [debitNoteItemSchema],
    sameAsBilling: { type: Boolean, default: true },
    billingAddress: { type: String, trim: true },
    shippingAddress: { type: String, trim: true },
    freightCharges: { type: Number, default: 0 },
    taxType: { type: String, enum: ['Intra-state (CGST+SGST)', 'Inter-state (IGST)'], default: 'Intra-state (CGST+SGST)' },
    cgstAmount: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },
    igstAmount: { type: Number, default: 0 },
    status: { type: String, enum: ['Issued', 'Cancelled'], default: 'Issued' },
    noteDate: { type: Date, default: Date.now },
    totalAmount: { type: Number, default: 0 },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

debitNoteSchema.set('toJSON', { virtuals: true });
debitNoteSchema.set('toObject', { virtuals: true });

debitNoteSchema.index({ organization: 1, noteNumber: 1 }, { unique: true, sparse: true });

debitNoteSchema.pre('save', async function (next) {
  if (!this.noteNumber) {
    this.noteNumber = await generateNextNumber(this.organization, 'DebitNote', this.noteDate);
  }
  let subtotal = 0;
  let totalTax = 0;
  this.items.forEach(i => {
    const lineSub = i.quantity * i.unitPrice;
    subtotal += lineSub;
    totalTax += lineSub * (i.gstRate || 0) / 100;
  });

  // Add 18% GST on freight charges
  const freight = this.freightCharges || 0;
  const freightTax = freight * 0.18;
  totalTax += freightTax;

  if (this.taxType === 'Inter-state (IGST)') {
    this.igstAmount = totalTax;
    this.cgstAmount = 0;
    this.sgstAmount = 0;
  } else {
    this.igstAmount = 0;
    this.cgstAmount = totalTax / 2;
    this.sgstAmount = totalTax / 2;
  }

  this.totalAmount = subtotal + freight + totalTax;
  next();
});

module.exports = mongoose.model('DebitNote', debitNoteSchema);
