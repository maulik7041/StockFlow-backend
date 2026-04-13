const mongoose = require('mongoose');

const poItemSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  hsnCode: { type: String, trim: true, default: '' },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  discount: { type: Number, default: 0 },
  gstRate: { type: Number, default: 0 },
  receivedQty: { type: Number, default: 0 },
});

poItemSchema.virtual('pendingQty').get(function () {
  return this.quantity - this.receivedQty;
});
poItemSchema.virtual('total').get(function () {
  const sub = this.quantity * this.unitPrice;
  return sub - (sub * (this.discount || 0)) / 100;
});
poItemSchema.set('toJSON', { virtuals: true });
poItemSchema.set('toObject', { virtuals: true });

const poSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    poNumber: { type: String },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    items: [poItemSchema],
    status: {
      type: String,
      enum: ['Draft', 'Sent', 'Complete', 'Cancelled'],
      default: 'Draft',
    },
    expectedDate: { type: Date },
    notes: { type: String, trim: true },
    totalAmount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    paymentStatus: { type: String, enum: ['Unpaid', 'Partially Paid', 'Paid'], default: 'Unpaid' },
    freightCharges: { type: Number, default: 0 },
    taxType: { type: String, enum: ['Intra-state (CGST+SGST)', 'Inter-state (IGST)'], default: 'Intra-state (CGST+SGST)' },
    cgstAmount: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },
    igstAmount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// PO number unique per organization
poSchema.index({ organization: 1, poNumber: 1 }, { unique: true, sparse: true });

poSchema.pre('save', async function (next) {
  if (!this.poNumber) {
    const count = await mongoose.model('PurchaseOrder').countDocuments({ organization: this.organization });
    this.poNumber = `PO-${String(count + 1).padStart(5, '0')}`;
  }
  let subtotal = 0;
  let totalTax = 0;
  this.items.forEach(i => {
    const lineSub = (i.quantity * i.unitPrice) - ((i.quantity * i.unitPrice * (i.discount || 0)) / 100);
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

  // Auto-calculate paymentStatus
  if (this.status !== 'Cancelled') {
    const paid = this.paidAmount || 0;
    if (paid <= 0) {
      this.paymentStatus = 'Unpaid';
    } else if (paid >= this.totalAmount) {
      this.paymentStatus = 'Paid';
    } else {
      this.paymentStatus = 'Partially Paid';
    }
  }
  next();
});

module.exports = mongoose.model('PurchaseOrder', poSchema);
