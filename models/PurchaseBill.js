const mongoose = require('mongoose');

const pbItemSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  hsnCode: { type: String, trim: true, default: '' },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  gstRate: { type: Number, default: 0 },
});

pbItemSchema.virtual('total').get(function () {
  return this.quantity * this.unitPrice;
});
pbItemSchema.set('toJSON', { virtuals: true });
pbItemSchema.set('toObject', { virtuals: true });

const purchaseBillSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    billNumber: { type: String },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
    grn: { type: mongoose.Schema.Types.ObjectId, ref: 'GRN', default: null },
    items: [pbItemSchema],
    billDate: { type: Date, default: Date.now },
    dueDate: { type: Date },
    freightCharges: { type: Number, default: 0 },
    taxType: { type: String, enum: ['Intra-state (CGST+SGST)', 'Inter-state (IGST)'], default: 'Intra-state (CGST+SGST)' },
    cgstAmount: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },
    igstAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    cnAmount: { type: Number, default: 0 },
    dnAmount: { type: Number, default: 0 },
    paymentStatus: { type: String, enum: ['Unpaid', 'Partially Paid', 'Paid'], default: 'Unpaid' },
    status: { type: String, enum: ['Active', 'Cancelled'], default: 'Active' },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

purchaseBillSchema.virtual('balanceDue').get(function () {
  return (this.totalAmount + (this.cnAmount || 0) - (this.dnAmount || 0)) - (this.paidAmount || 0);
});
purchaseBillSchema.set('toJSON', { virtuals: true });
purchaseBillSchema.set('toObject', { virtuals: true });

purchaseBillSchema.index({ organization: 1, billNumber: 1 }, { unique: true, sparse: true });

purchaseBillSchema.pre('save', async function (next) {
  if (!this.billNumber) {
    const count = await mongoose.model('PurchaseBill').countDocuments({ organization: this.organization });
    this.billNumber = `PB-${String(count + 1).padStart(5, '0')}`;
  }
  let subtotal = 0;
  let totalTax = 0;
  this.items.forEach(i => {
    const lineSub = i.quantity * i.unitPrice;
    subtotal += lineSub;
    totalTax += lineSub * (i.gstRate || 0) / 100;
  });

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
    const netTotal = (this.totalAmount + (this.cnAmount || 0) - (this.dnAmount || 0));
    if (paid <= 0) {
      if (netTotal <= 0 && (this.cnAmount || this.dnAmount)) {
          this.paymentStatus = 'Paid';
      } else {
          this.paymentStatus = 'Unpaid';
      }
    } else if (paid >= netTotal) {
      this.paymentStatus = 'Paid';
    } else {
      this.paymentStatus = 'Partially Paid';
    }
  }
  next();
});

module.exports = mongoose.model('PurchaseBill', purchaseBillSchema);
