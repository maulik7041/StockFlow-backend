const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    itemType: { type: String, enum: ['raw_material', 'finished_good', 'trading_item'], required: true, default: 'trading_item' },
    name: { type: String, required: [true, 'Item name is required'], trim: true },
    category: { type: String, required: [true, 'Category is required'], trim: true },
    unit: { type: String, required: [true, 'Unit is required'], trim: true, default: 'pcs' },
    description: { type: String, trim: true },
    reorderLevel: { type: Number, default: 0 },
    sellingPrice: { type: Number, default: 0 },
    purchasePrice: { type: Number, default: 0 },
    gstRate: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);



module.exports = mongoose.model('Item', itemSchema);
