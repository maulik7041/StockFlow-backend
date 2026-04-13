const mongoose = require('mongoose');

const piItemSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  hsnCode: { type: String, trim: true, default: '' },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  discount: { type: Number, default: 0 },
  gstRate: { type: Number, default: 0 },
});

piItemSchema.virtual('total').get(function () {
  const subtotal = this.quantity * this.unitPrice;
  return subtotal - (subtotal * this.discount) / 100;
});
piItemSchema.set('toJSON', { virtuals: true });
piItemSchema.set('toObject', { virtuals: true });

const proformaInvoiceSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    piNumber: { type: String },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    items: [piItemSchema],
    sameAsBilling: { type: Boolean, default: true },
    billingAddress: { type: String, trim: true },
    shippingAddress: { type: String, trim: true },
    freightCharges: { type: Number, default: 0 },
    taxType: { type: String, enum: ['Intra-state (CGST+SGST)', 'Inter-state (IGST)'], default: 'Intra-state (CGST+SGST)' },
    cgstAmount: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },
    igstAmount: { type: Number, default: 0 },
    status: { type: String, enum: ['Draft', 'Sent', 'Converted', 'Cancelled'], default: 'Draft' },
    piDate: { type: Date, default: Date.now },
    validUntil: { type: Date },
    totalAmount: { type: Number, default: 0 },
    notes: { type: String, trim: true },
    convertedSalesInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesInvoice', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

proformaInvoiceSchema.set('toJSON', { virtuals: true });
proformaInvoiceSchema.set('toObject', { virtuals: true });

proformaInvoiceSchema.index({ organization: 1, piNumber: 1 }, { unique: true, sparse: true });

proformaInvoiceSchema.pre('save', async function (next) {
  if (!this.piNumber) {
    const count = await mongoose.model('ProformaInvoice').countDocuments({ organization: this.organization });
    this.piNumber = `PI-${String(count + 1).padStart(5, '0')}`;
  }
  let subtotal = 0;
  let totalTax = 0;
  this.items.forEach(i => {
    const lineSub = (i.quantity * i.unitPrice) - ((i.quantity * i.unitPrice * i.discount) / 100);
    subtotal += lineSub;
    totalTax += lineSub * (i.gstRate || 0) / 100;
  });

  if (this.taxType === 'Inter-state (IGST)') {
    this.igstAmount = totalTax;
    this.cgstAmount = 0;
    this.sgstAmount = 0;
  } else {
    this.igstAmount = 0;
    this.cgstAmount = totalTax / 2;
    this.sgstAmount = totalTax / 2;
  }

  this.totalAmount = subtotal + (this.freightCharges || 0) + totalTax;
  next();
});

module.exports = mongoose.model('ProformaInvoice', proformaInvoiceSchema);
