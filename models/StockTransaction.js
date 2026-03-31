const mongoose = require('mongoose');

const stockTransactionSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    type: { type: String, enum: ['IN', 'OUT', 'ADJUST'], required: true },
    quantity: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    refModel: { type: String, enum: ['GRN', 'SalesInvoice', 'Adjustment'], default: 'Adjustment' },
    refId: { type: mongoose.Schema.Types.ObjectId },
    note: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('StockTransaction', stockTransactionSchema);
