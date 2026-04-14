const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  hsnCode: { type: String, trim: true, default: '' },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  gstRate: { type: Number, default: 0 },
});

saleItemSchema.virtual('total').get(function () {
  return this.quantity * this.unitPrice;
});
saleItemSchema.set('toJSON', { virtuals: true });
saleItemSchema.set('toObject', { virtuals: true });

const salesInvoiceSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    invoiceNumber: { type: String },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    items: [saleItemSchema],
    sameAsBilling: { type: Boolean, default: true },
    billingAddress: { type: String, trim: true },
    shippingAddress: { type: String, trim: true },
    freightCharges: { type: Number, default: 0 },
    taxType: { type: String, enum: ['Intra-state (CGST+SGST)', 'Inter-state (IGST)'], default: 'Intra-state (CGST+SGST)' },
    cgstAmount: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },
    igstAmount: { type: Number, default: 0 },
    status: { type: String, enum: ['Issued', 'Paid', 'Cancelled'], default: 'Issued' },
    invoiceDate: { type: Date, default: Date.now },
    dueDate: { type: Date },
    totalAmount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    paymentStatus: { type: String, enum: ['Unpaid', 'Partially Paid', 'Paid', 'Overdue'], default: 'Unpaid' },
    notes: { type: String, trim: true },
    sourceDocumentType: { type: String, enum: ['ProformaInvoice', null], default: null },
    sourceDocumentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

salesInvoiceSchema.virtual('balanceDue').get(function () {
  return this.totalAmount - this.paidAmount;
});
salesInvoiceSchema.set('toJSON', { virtuals: true });
salesInvoiceSchema.set('toObject', { virtuals: true });

salesInvoiceSchema.index({ organization: 1, invoiceNumber: 1 }, { unique: true, sparse: true });

salesInvoiceSchema.pre('save', async function (next) {
  if (!this.invoiceNumber) {
    const count = await mongoose.model('SalesInvoice').countDocuments({ organization: this.organization });
    this.invoiceNumber = `INV-${String(count + 1).padStart(5, '0')}`;
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

  // Auto-calculate paymentStatus
  if (this.status !== 'Cancelled') {
    const paid = this.paidAmount || 0;
    if (paid <= 0) {
      this.paymentStatus = this.dueDate && new Date(this.dueDate) < new Date() ? 'Overdue' : 'Unpaid';
    } else if (paid >= this.totalAmount) {
      this.paymentStatus = 'Paid';
    } else {
      this.paymentStatus = this.dueDate && new Date(this.dueDate) < new Date() ? 'Overdue' : 'Partially Paid';
    }
  }
  next();
});

module.exports = mongoose.model('SalesInvoice', salesInvoiceSchema);
