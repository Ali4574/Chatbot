// models/CompanyInfo.js
import mongoose from 'mongoose';

const CompanyInfoSchema = new mongoose.Schema({
  name: { type: String, required: true },
  tagline: String,
  description: String,
  features: [String],
  pricing: {
    original: Number,
    discounted: Number,
    currency: String,
    offer: String,
    guarantee: String,
    includes: [String],
    buyNowLink: String,
  },
  benefits: {
    without: [String],
    with: [String],
  },
  faq: {
    beginner: String,
    access: String,
    markets: String,
    support: String,
  },
});

// Use existing model if it exists (for hot-reloading or serverless environments)
const CompanyInfo = mongoose.models.CompanyInfo || mongoose.model('CompanyInfo', CompanyInfoSchema);
export default CompanyInfo;
