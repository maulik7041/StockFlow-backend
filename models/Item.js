const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: [true, 'Item name is required'], trim: true },
    sku: { type: String, sparse: true, trim: true, uppercase: true },
    category: { type: String, required: [true, 'Category is required'], trim: true },
    unit: { type: String, required: [true, 'Unit is required'], trim: true, default: 'pcs' },
    description: { type: String, trim: true },
    reorderLevel: { type: Number, default: 0 },
    sellingPrice: { type: Number, default: 0 },
    purchasePrice: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// SKU unique per organization
itemSchema.index({ organization: 1, sku: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Item', itemSchema);
