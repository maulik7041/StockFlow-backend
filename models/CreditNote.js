const mongoose = require('mongoose');

const creditNoteItemSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  hsnCode: { type: String, trim: true, default: '' },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  gstRate: { type: Number, default: 0 },
});

creditNoteItemSchema.virtual('total').get(function () {
  return this.quantity * this.unitPrice;
});
creditNoteItemSchema.set('toJSON', { virtuals: true });
creditNoteItemSchema.set('toObject', { virtuals: true });

const creditNoteSchema = new mongoose.Schema(
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
    items: [creditNoteItemSchema],
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

creditNoteSchema.set('toJSON', { virtuals: true });
creditNoteSchema.set('toObject', { virtuals: true });

creditNoteSchema.index({ organization: 1, noteNumber: 1 }, { unique: true, sparse: true });

creditNoteSchema.pre('save', async function (next) {
  if (!this.noteNumber) {
    const count = await mongoose.model('CreditNote').countDocuments({ organization: this.organization });
    this.noteNumber = `CN-${String(count + 1).padStart(5, '0')}`;
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

module.exports = mongoose.model('CreditNote', creditNoteSchema);
