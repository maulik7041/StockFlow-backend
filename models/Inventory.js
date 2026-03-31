const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    currentStock: { type: Number, default: 0 },
    reserved: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// One inventory record per item per organization
inventorySchema.index({ organization: 1, item: 1 }, { unique: true });

inventorySchema.virtual('availableStock').get(function () {
  return this.currentStock - this.reserved;
});

inventorySchema.set('toJSON', { virtuals: true });
inventorySchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Inventory', inventorySchema);
