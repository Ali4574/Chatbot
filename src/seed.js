// seed.js
import mongoose from 'mongoose';
import CompanyInfo from './models/CompanyInfo.js';
import dotenv from 'dotenv';

// Specify the path to .env.local
dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI in environment variables');
  process.exit(1);
}

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(async () => {
  console.log('Connected to MongoDB Atlas.');

  // Your company info object
  const companyData = {
    name: "Profit Flow",
    tagline: "Unleash the Power of SMART Trading",
    description: "AI-powered trading system providing actionable insights and trading signals",
    features: [
      "Zero trading skills needed",
      "Works across all markets (stocks, forex, crypto)",
      "Real-time AI-powered signals",
      "Emotion-free trading decisions",
      "Simple clean interface",
      "24/7 customer support"
    ],
    pricing: {
      original: 9999,
      discounted: 2999,
      currency: "₹",
      offer: "75% OFF New Year Sale!",
      guarantee: "3-day risk free trial",
      includes: ["Premium Indicators", "Tutorials", "Course", "Trading Guide"],
      buyNowLink: "https://cosmofeed.com/vig/65e733e79b0cd40013a65409"
    },
    benefits: {
      without: ["Losing Trades", "Confusing Charts", "Missed Opportunities"],
      with: ["Clear Signals", "Confident Trading", "Time Savings"]
    },
    faq: {
      beginner: "Absolutely! Our system guides beginners while offering advanced tools for pros.",
      access: "Instant access after purchase through TradingView integration.",
      markets: "Works with stocks, forex, and cryptocurrencies.",
      support: "24/7 support via email and live chat."
    }
  };

  // Upsert the company info (insert if not exists, update if exists)
  await CompanyInfo.findOneAndUpdate(
    { name: companyData.name },
    companyData,
    { upsert: true, new: true }
  );
  console.log('Company info seeded successfully.');
  mongoose.disconnect();
})
.catch(err => {
  console.error('Error connecting to MongoDB Atlas:', err);
});
