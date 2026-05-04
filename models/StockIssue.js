const mongoose = require('mongoose');
const { generateNextNumber } = require('../utils/numberGenerator');

const issueItemSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  quantity: { type: Number, required: true, min: 1 },
});

const stockIssueSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    issueNumber: { type: String },
    serialNumber: { type: String },
    items: [issueItemSchema],
    status: {
      type: String,
      enum: ['Draft', 'Issued', 'Cancelled'],
      default: 'Draft',
    },
    issueDate: { type: Date, default: Date.now },
    department: { type: String, trim: true },
    notes: { type: String, trim: true },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Issue number unique per organization
stockIssueSchema.index({ organization: 1, issueNumber: 1 }, { unique: true, sparse: true });

stockIssueSchema.pre('save', async function (next) {
  if (!this.issueNumber) {
    const { docNumber, serialNumber } = await generateNextNumber(this.organization, 'StockIssue', this.issueDate);
    this.issueNumber = docNumber;
    this.serialNumber = serialNumber;
  }
  next();
});

module.exports = mongoose.model('StockIssue', stockIssueSchema);
