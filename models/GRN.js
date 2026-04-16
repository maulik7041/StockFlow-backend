const mongoose = require('mongoose');

const grnItemSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  orderedQty: { type: Number, required: true },
  receivedQty: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true },
});

grnItemSchema.virtual('total').get(function () {
  return this.receivedQty * this.unitPrice;
});
grnItemSchema.set('toJSON', { virtuals: true });
grnItemSchema.set('toObject', { virtuals: true });

const grnSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    grnNumber: { type: String },
    billNo: { type: String, trim: true },
    billDate: { type: Date },
    purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true },
    items: [grnItemSchema],
    receivedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['Active', 'Cancelled'], default: 'Active' },
    notes: { type: String, trim: true },
    totalAmount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

grnSchema.index({ organization: 1, grnNumber: 1 }, { unique: true, sparse: true });

grnSchema.pre('save', async function (next) {
  if (!this.grnNumber) {
    const count = await mongoose.model('GRN').countDocuments({ organization: this.organization });
    this.grnNumber = `GRN-${String(count + 1).padStart(5, '0')}`;
  }
  this.totalAmount = this.items.reduce((sum, i) => sum + i.receivedQty * i.unitPrice, 0);
  next();
});

module.exports = mongoose.model('GRN', grnSchema);
