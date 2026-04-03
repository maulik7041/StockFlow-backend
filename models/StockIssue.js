const mongoose = require('mongoose');

const issueItemSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  quantity: { type: Number, required: true, min: 1 },
});

const stockIssueSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    issueNumber: { type: String },
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
  },
  { timestamps: true }
);

// Issue number unique per organization
stockIssueSchema.index({ organization: 1, issueNumber: 1 }, { unique: true, sparse: true });

stockIssueSchema.pre('save', async function (next) {
  if (!this.issueNumber) {
    const count = await mongoose.model('StockIssue').countDocuments({ organization: this.organization });
    this.issueNumber = `SI-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

module.exports = mongoose.model('StockIssue', stockIssueSchema);
