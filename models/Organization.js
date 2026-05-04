const mongoose = require('mongoose');
const slugify = require('slugify');

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Organization name is required'], trim: true },
    slug: { type: String, unique: true, lowercase: true, trim: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    plan: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
    gstNumber: { type: String, trim: true },
    address: { type: String, trim: true },
    settings: {
      currency: { type: String, default: 'INR' },
      timezone: { type: String, default: 'Asia/Kolkata' },
      logo: { type: String },
      termsAndConditions: { type: String, default: '' },
      poTermsAndConditions: { type: String, default: '' },
      piTermsAndConditions: { type: String, default: '' },
      cnTermsAndConditions: { type: String, default: '' },
      dnTermsAndConditions: { type: String, default: '' },
      pbTermsAndConditions: { type: String, default: '' },
      docPrefixes: {
        SalesInvoice: { type: String, default: 'INV' },
        PurchaseOrder: { type: String, default: 'PO' },
        GRN: { type: String, default: 'GRN' },
        PurchaseBill: { type: String, default: 'PB' },
        CreditNote: { type: String, default: 'CN' },
        DebitNote: { type: String, default: 'DN' },
        ProformaInvoice: { type: String, default: 'PI' },
        StockIssue: { type: String, default: 'SI' }
      }
    },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

organizationSchema.pre('save', async function (next) {
  if (this.isModified('name') || !this.slug) {
    let baseSlug = slugify(this.name, { lower: true, strict: true });
    let slug = baseSlug;
    let count = 1;
    while (await mongoose.model('Organization').exists({ slug, _id: { $ne: this._id } })) {
      slug = `${baseSlug}-${count++}`;
    }
    this.slug = slug;
  }
  next();
});

module.exports = mongoose.model('Organization', organizationSchema);
