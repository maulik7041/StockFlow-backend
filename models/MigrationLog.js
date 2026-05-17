const mongoose = require('mongoose');

const migrationErrorSchema = new mongoose.Schema({
  row: { type: Number },
  field: { type: String },
  message: { type: String },
}, { _id: false });

const migrationLogSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    batchId: { type: String, required: true, unique: true },
    entity: {
      type: String,
      required: true,
      enum: ['Item', 'Customer', 'Vendor', 'Inventory', 'SalesInvoice', 'PurchaseBill', 'Payment', 'CreditNote', 'DebitNote'],
    },
    status: {
      type: String,
      enum: ['validating', 'executing', 'completed', 'failed', 'rolled_back'],
      default: 'validating',
    },
    totalRows: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    skippedCount: { type: Number, default: 0 },
    errors: [migrationErrorSchema],
    warnings: [migrationErrorSchema],
    createdIds: [{ type: mongoose.Schema.Types.ObjectId }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

migrationLogSchema.index({ organization: 1, createdAt: -1 });

module.exports = mongoose.model('MigrationLog', migrationLogSchema);
