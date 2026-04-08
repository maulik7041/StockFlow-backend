const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  discount: { type: Number, default: 0 },
});

saleItemSchema.virtual('total').get(function () {
  const subtotal = this.quantity * this.unitPrice;
  return subtotal - (subtotal * this.discount) / 100;
});
saleItemSchema.set('toJSON', { virtuals: true });
saleItemSchema.set('toObject', { virtuals: true });

const salesInvoiceSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    invoiceNumber: { type: String },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    items: [saleItemSchema],
    status: { type: String, enum: ['Issued', 'Paid', 'Cancelled'], default: 'Issued' },
    invoiceDate: { type: Date, default: Date.now },
    dueDate: { type: Date },
    totalAmount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
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
  this.totalAmount = this.items.reduce((sum, i) => {
    const subtotal = i.quantity * i.unitPrice;
    return sum + subtotal - (subtotal * i.discount) / 100;
  }, 0);
  next();
});

module.exports = mongoose.model('SalesInvoice', salesInvoiceSchema);
