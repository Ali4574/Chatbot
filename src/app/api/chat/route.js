// src/app/api/chat/route.js

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import mongoose from 'mongoose';
import CompanyInfo from '@/src/models/CompanyInfo';
import dotenv from 'dotenv';
import yahooFinance from 'yahoo-finance2';

export const dynamic = 'force-dynamic';

dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;

// Reuse MongoDB connection in a serverless environment
if (!mongoose.connection.readyState) {
  mongoose
    .connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    .then(() => console.log('Connected to MongoDB Atlas'))
    .catch((err) => console.error('MongoDB connection error:', err));
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Define the functions available to the assistant
const functions = [
  {
    name: 'get_stock_price',
    description:
      'Get real-time stock price (current quote) and basic information for one or more stock symbols.',
    parameters: {
      type: 'object',
      properties: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Array of stock symbols like ["AAPL", "GOOGL"] for Apple and Google.',
        },
      },
      required: ['symbols'],
    },
  },
  {
    name: 'get_crypto_price',
    description:
      'Get real-time cryptocurrency price (current quote) and basic information for one or more crypto symbols.',
    parameters: {
      type: 'object',
      properties: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Array of cryptocurrency symbols like ["BTC", "ETH"] for Bitcoin and Ethereum.',
        },
      },
      required: ['symbols'],
    },
  },
  {
    name: 'get_top_stocks',
    description: 'Get the trending stocks in real time.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of top stocks to fetch (default is 10).',
        },
      },
    },
  },
  {
    name: 'get_top_cryptos',
    description:
      'Get the trending cryptocurrencies in real time.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of top cryptos to fetch (default is 10).',
        },
      },
    },
  },
  {
    name: 'get_company_info',
    description: 'Get information about Profit Flow company and services',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: [
            'all',
            'features',
            'pricing',
            'benefits',
            'support',
            'faq',
            'subscription',
          ],
          description: 'Category of information requested',
        },
      },
    },
  },
];

/**
 * Helper: Fetch realtime data for a ticker.
 *
 * When the "realtime" option is passed, we simply fetch the quote and return
 * one data point with the current price and timestamp.
 */
async function fetchRealtimeData(ticker) {
  try {
    const quote = await yahooFinance.quote(ticker);
    if (!quote) return null;
    const now = new Date().toLocaleString();
    return { dates: [now], prices: [quote.regularMarketPrice] };
  } catch (error) {
    console.error(`Error fetching realtime data for ${ticker}:`, error);
    return null;
  }
}

/**
 * Fetch real-time stock data.
 * We adjust the symbol automatically if an exchange suffix is missing.
 */
async function getStockPrice(symbols) {
  const results = [];
  for (const symbol of symbols) {
    try {
      let querySymbol = symbol;
      // If the symbol doesn't include an exchange suffix and appears to be an Indian stock,
      // append ".NS". (Modify this logic for other exchanges as needed.)
      if (!symbol.includes('.') && /^[A-Z]+$/.test(symbol)) {
        querySymbol = `${symbol}.NS`;
      }
      // Fetch current quote info
      const quote = await yahooFinance.quote(querySymbol);
      // Fetch realtime data (a single data point)
      const rtData = await fetchRealtimeData(querySymbol);
      if (!rtData) {
        results.push({ symbol, error: 'No real-time data available' });
        continue;
      }
      results.push({
        symbol: querySymbol,
        name: quote.longName || symbol,
        dates: rtData.dates,
        prices: rtData.prices,
        change: quote.regularMarketChange,
        changePercentage: quote.regularMarketChangePercent,
        marketCap: quote.marketCap,
      });
    } catch (error) {
      console.error(`Error fetching stock price for ${symbol}:`, error);
      results.push({ symbol, error: 'Unable to fetch data' });
    }
  }
  return results;
}

/**
 * Fetch real-time cryptocurrency data.
 * Ensures the symbol is in the format recognized by Yahoo Finance.
 */
async function getCryptoPrice(symbols) {
  const results = [];
  for (let symbol of symbols) {
    try {
      // For cryptos, append "-USD" if not already present.
      if (!symbol.includes('-')) {
        symbol = `${symbol}-USD`;
      }
      const quote = await yahooFinance.quote(symbol);
      const rtData = await fetchRealtimeData(symbol);
      if (!rtData) {
        results.push({ symbol, error: 'No real-time data available' });
        continue;
      }
      results.push({
        symbol,
        name: quote.shortName || symbol,
        dates: rtData.dates,
        prices: rtData.prices,
        change: quote.regularMarketChange,
        changePercentage: quote.regularMarketChangePercent,
        marketCap: quote.marketCap,
      });
    } catch (error) {
      console.error(`Error fetching crypto price for ${symbol}:`, error);
      results.push({ symbol, error: 'Unable to fetch data' });
    }
  }
  return results;
}

/**
 * Fetch trending (top) stocks in real time.
 * We use yahooFinance.trendingSymbols to get popular tickers,
 * then retrieve each quote in realtime.
 */
async function getTopStocks(limit = 10) {
  try {
    const trending = await yahooFinance.trendingSymbols('US');
    if (!trending?.quotes?.length) {
      throw new Error('No trending stocks data available');
    }
    const symbols = trending.quotes.map((q) => q.symbol).slice(0, limit);
    const results = [];
    for (const symbol of symbols) {
      try {
        const quote = await yahooFinance.quote(symbol);
        const rtData = await fetchRealtimeData(symbol);
        if (!rtData) continue;
        results.push({
          symbol,
          name: quote.longName || symbol,
          dates: rtData.dates,
          prices: rtData.prices,
          change: quote.regularMarketChange,
          changePercentage: quote.regularMarketChangePercent,
          marketCap: quote.marketCap,
        });
      } catch (err) {
        console.error(`Error fetching realtime data for ${symbol}:`, err);
      }
    }
    return results;
  } catch (error) {
    console.error('Error fetching top stocks:', error);
    return { error: 'Unable to fetch top stocks' };
  }
}

/**
 * Fetch trending (top) cryptocurrencies in real time.
 * Uses a preset list of popular crypto tickers.
 */
async function getTopCryptos(limit = 10) {
  try {
    // Fetch top cryptos by market cap from CoinGecko
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1`
    );
    const coins = await response.json();
    if (!coins || !coins.length) {
      throw new Error('Failed to fetch top cryptocurrencies');
    }

    const results = [];
    for (const coin of coins) {
      const symbol = `${coin.symbol.toUpperCase()}-USD`; // Convert to Yahoo Finance format
      try {
        // Fetch data from Yahoo Finance
        const quote = await yahooFinance.quote(symbol);
        const rtData = await fetchRealtimeData(symbol);
        if (!rtData) continue;
        results.push({
          symbol,
          name: quote.shortName || coin.name,
          dates: rtData.dates,
          prices: rtData.prices,
          change: quote.regularMarketChange,
          changePercentage: quote.regularMarketChangePercent,
          marketCap: quote.marketCap,
        });
      } catch (err) {
        console.error(`Error processing ${symbol}:`, err);
      }
    }
    return results;
  } catch (error) {
    console.error('Error fetching top cryptos:', error);
    return { error: 'Unable to fetch top cryptos' };
  }
}

/**
 * Fetch company information from MongoDB Atlas.
 */
async function getCompanyInfo(args) {
  let category = args?.category || 'all';
  if (category === 'subscription') {
    category = 'pricing';
  }
  const companyDoc = await CompanyInfo.findOne({ name: 'Profit Flow' }).lean();
  if (!companyDoc) {
    throw new Error('Company information not found in the database.');
  }
  return category === 'all' ? companyDoc : { [category]: companyDoc[category] };
}

export async function POST(request) {
  try {
    const { messages } = await request.json();

    const initialResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      functions,
      function_call: 'auto',
    });
    const message = initialResponse.choices[0].message;

    if (message.function_call) {
      const functionName = message.function_call.name;
      const args = JSON.parse(message.function_call.arguments || '{}');
      let functionResponse;

      switch (functionName) {
        case 'get_stock_price':
          functionResponse = await getStockPrice(args.symbols);
          break;
        case 'get_crypto_price':
          functionResponse = await getCryptoPrice(args.symbols);
          break;
        case 'get_top_stocks':
          functionResponse = await getTopStocks(args.limit || 10);
          break;
        case 'get_top_cryptos':
          functionResponse = await getTopCryptos(args.limit || 10);
          break;
        case 'get_company_info':
          functionResponse = await getCompanyInfo(args);
          break;
        default:
          functionResponse = { error: 'Function not supported' };
      }

      let finalResponse;
      if (functionName === 'get_company_info') {
        finalResponse = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            ...messages,
            {
              role: 'system',
              content:
                'You are a friendly advisor providing company information. Keep your response clear, concise, and conversational. Limit your answer to under three paragraphs and include any offers naturally.',
            },
            {
              role: 'user',
              content: `Company Data:\n${JSON.stringify(functionResponse, null, 2)}`,
            },
          ],
          temperature: 0.7,
          max_tokens: 500,
        });
      } else {
        const responseTemplate = `Please generate a creative and professional financial update using the data provided below.

• **Current Data / Key Metrics:** Clearly state the current price or list top metrics.
• **Statistics Summary:** Present the key statistics as bullet points with adequate spacing.
• **Market Context:** Include a brief one to two sentence overview of the market.
• **Relevant News:** Add a note on recent news (use a placeholder if actual data is unavailable).
• **Disclaimer:** End with a standard disclaimer.

Data:
${JSON.stringify(functionResponse, null, 2)}

Ensure your response is engaging, well-structured, and adapts to the query context.`;

        finalResponse = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            ...messages,
            {
              role: 'system',
              content:
                'You are a financial analyst assistant. Provide responses in structured markdown format with clear bullet points, proper spacing between topics, and dynamic chart headings based on the query. Respond in a professional tone and include suggestions when relevant.',
            },
            {
              role: 'user',
              content: responseTemplate,
            },
          ],
          temperature: 0.6,
          max_tokens: 1000,
        });
      }

      return NextResponse.json({
        ...finalResponse.choices[0].message,
        rawData: functionResponse,
        functionName: message.function_call.name,
      });
    } else {
      return NextResponse.json({
        role: 'assistant',
        content:
          message.content ||
          "I'm here to help! Could you please clarify your request?",
      });
    }
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      {
        error: 'Financial data currently unavailable. Please try again later.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
