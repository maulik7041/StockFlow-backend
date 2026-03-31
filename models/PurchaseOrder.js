const mongoose = require('mongoose');

const poItemSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  receivedQty: { type: Number, default: 0 },
});

poItemSchema.virtual('pendingQty').get(function () {
  return this.quantity - this.receivedQty;
});
poItemSchema.virtual('total').get(function () {
  return this.quantity * this.unitPrice;
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
      enum: ['Draft', 'Sent', 'Partial', 'Complete', 'Cancelled'],
      default: 'Draft',
    },
    expectedDate: { type: Date },
    notes: { type: String, trim: true },
    totalAmount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
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
  this.totalAmount = this.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  next();
});

module.exports = mongoose.model('PurchaseOrder', poSchema);
