const mongoose = require('mongoose');
const { generateNextNumber } = require('../utils/numberGenerator');

const conversionItemSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  quantity: { type: Number, required: true, min: 1 },
});

const stockConversionSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    conversionNumber: { type: String },
    serialNumber: { type: String },
    inputItems: [conversionItemSchema],
    outputItems: [conversionItemSchema],
    status: {
      type: String,
      enum: ['Converted', 'Cancelled'],
      default: 'Converted',
    },
    conversionDate: { type: Date, default: Date.now },
    workOrderRef: { type: String, trim: true },
    notes: { type: String, trim: true },
    convertedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Conversion number unique per organization
stockConversionSchema.index({ organization: 1, conversionNumber: 1 }, { unique: true, sparse: true });

stockConversionSchema.pre('save', async function (next) {
  if (!this.conversionNumber) {
    const { docNumber, serialNumber } = await generateNextNumber(this.organization, 'StockConversion', this.conversionDate);
    this.conversionNumber = docNumber;
    this.serialNumber = serialNumber;
  }
  next();
});

module.exports = mongoose.model('StockConversion', stockConversionSchema);
