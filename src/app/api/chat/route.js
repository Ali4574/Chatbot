// src/app/api/chat/route.js

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import mongoose from 'mongoose';
import CompanyInfo from '@/src/models/CompanyInfo';
import dotenv from 'dotenv';
import yahooFinance from 'yahoo-finance2';
import axios from 'axios';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from 'uuid';

dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;
const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE || 'Chatlogs'; // set your table name in .env.local
const AWS_REGION = process.env.AWS_REGION || 'ap-south-1';

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

// Create a DynamoDB client
const ddbClient = new DynamoDBClient({ region: AWS_REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

const functions = [
  {
    name: 'get_stock_price',
    description:
      'Get real-time stock price (current quote), historical price data, and basic information for one or more stock symbols. This function always returns data for Indian stocks only.',
    parameters: {
      type: 'object',
      properties: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Array of stock symbols like ["RELIANCE", "TCS"] for Reliance and TCS.',
        },
        underPrice: {
          type: 'number',
          description:
            'Optional: filter stocks with current price under this value (in INR).',
        },
      },
      required: ['symbols'],
    },
  },
  {
    name: 'get_crypto_price',
    description:
      'Get real-time cryptocurrency price (current quote), historical price data, and basic information for one or more crypto symbols. Optionally, specify the currency ("USD" or "INR") and a maximum price (underPrice).',
    parameters: {
      type: 'object',
      properties: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Array of cryptocurrency symbols like ["BTC", "ETH"] for Bitcoin and Ethereum.',
        },
        currency: {
          type: 'string',
          enum: ['USD', 'INR'],
          description:
            'Currency for the price. Default is USD. For INR conversion, use "INR".',
        },
        underPrice: {
          type: 'number',
          description:
            'Optional: filter cryptos with current price under this value (in the specified currency).',
        },
      },
      required: ['symbols'],
    },
  },
  {
    name: 'get_top_stocks',
    description:
      'Get the trending Indian stocks in real time using NSE data. Optionally, specify a price filter (underPrice).',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of top stocks to fetch (default is 10).',
        },
        underPrice: {
          type: 'number',
          description:
            'Optional: filter stocks with price under this value (in INR).',
        },
      },
    },
  },
  {
    name: 'get_top_cryptos',
    description:
      'Get the trending cryptocurrencies in real time. Optionally, specify the currency ("USD" or "INR") and a price filter (underPrice).',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of top cryptos to fetch (default is 10).',
        },
        currency: {
          type: 'string',
          enum: ['USD', 'INR'],
          description:
            'Currency for the price. Default is USD. For INR conversion, use "INR".',
        },
        underPrice: {
          type: 'number',
          description:
            'Optional: filter cryptos with current price under this value (in the specified currency).',
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
  {
    name: 'get_market_update',
    description:
      'Get a comprehensive update of the Indian stock market that includes trending NSE stocks and current market news.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of top stocks to fetch (default is 10).',
        },
        underPrice: {
          type: 'number',
          description:
            'Optional: filter stocks with price under this value (in INR).',
        },
      },
    },
  },
  {
    name: 'get_crypto_market_update',
    description:
      'Get a comprehensive update of the cryptocurrency market that includes trending cryptocurrencies and current crypto market news.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of top cryptocurrencies to fetch (default is 10).',
        },
        currency: {
          type: 'string',
          enum: ['USD', 'INR'],
          description:
            'Currency for the price. Default is USD. For INR conversion, use "INR".',
        },
        underPrice: {
          type: 'number',
          description:
            'Optional: filter cryptocurrencies with current price under this value (in the specified currency).',
        },
      },
    },
  },
];

/**
 * Helper: Fetch realtime data for a ticker.
 */
async function fetchRealtimeData(ticker) {
  try {
    const quote = await yahooFinance.quote(ticker);
    if (!quote) return null;
    const now = new Date().toISOString(); // "2025-02-06T05:00:00.000Z"
    return { dates: [now], prices: [quote.regularMarketPrice] };
  } catch (error) {
    console.error(`Error fetching realtime data for ${ticker}:`, error);
    return null;
  }
}

/**
 * Helper: Fetch historical data for a ticker.
 * This function retrieves historical closing prices from period1 to period2.
 */
async function fetchHistoricalData(ticker, period1, period2, interval = '1d') {
  try {
    const historical = await yahooFinance.historical(ticker, { period1, period2, interval });
    return historical.map(item => ({
      date: item.date,
      price: item.close,
    }));
  } catch (error) {
    console.error(`Error fetching historical data for ${ticker}:`, error);
    return [];
  }
}

/**
 * Helper: Fetch detailed info (company summary, profile, etc.) for a ticker.
 */
async function fetchDetailedInfo(ticker) {
  try {
    const detailedInfo = await yahooFinance.quoteSummary(ticker, {
      modules: ['summaryDetail', 'summaryProfile', 'assetProfile']
    });
    return detailedInfo;
  } catch (error) {
    console.error(`Error fetching detailed info for ${ticker}:`, error);
    return null;
  }
}

/**
 * Helper: Fetch recent news for a ticker using the search endpoint.
 */
async function fetchNews(ticker) {
  try {
    const searchResult = await yahooFinance.search(ticker, { lang: 'en-IN', region: 'IN' });
    return searchResult.news || [];
  } catch (error) {
    console.error(`Error fetching news for ${ticker}:`, error);
    return [];
  }
}

/**
 * New Helper: Fetch general market news using a broad search query.
 */
async function fetchMarketNews() {
  try {
    // Use a broad search query to retrieve general Indian market news
    const searchResult = await yahooFinance.search("Indian stock market", { lang: 'en-IN', region: 'IN' });
    return searchResult.news || [];
  } catch (error) {
    console.error("Error fetching market news:", error);
    return [];
  }
}

/**
 * New Helper: Fetch crypto market news using a broad search query.
 */
async function fetchCryptoMarketNews() {
  try {
    // Use a broad search query to retrieve crypto market news
    const searchResult = await yahooFinance.search("cryptocurrency market news", { lang: 'en-IN', region: 'IN' });
    return searchResult.news || [];
  } catch (error) {
    console.error("Error fetching crypto market news:", error);
    return [];
  }
}

/**
 * Fetch real-time stock data for Indian stocks.
 * This function automatically appends ".NS" to symbols if not provided.
 */
async function getStockPrice(symbols, underPrice) {
  const results = [];
  const now = new Date();
  const past7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // past 7 days

  for (let symbol of symbols) {
    try {
      let querySymbol = symbol;
      if (!symbol.includes('.') && /^[A-Z]+$/.test(symbol)) {
        querySymbol = `${symbol}.NS`;
      }
      const quote = await yahooFinance.quote(querySymbol);
      const rtData = await fetchRealtimeData(querySymbol);
      if (!rtData) {
        results.push({ symbol, error: 'No real-time data available' });
        continue;
      }
      const history = await fetchHistoricalData(querySymbol, past7Days, now, '1d');
      const detailedInfo = await fetchDetailedInfo(querySymbol);
      const news = await fetchNews(querySymbol);

      results.push({
        symbol: querySymbol,
        name: quote.longName || symbol,
        dates: rtData.dates,
        prices: rtData.prices,
        history,
        change: quote.regularMarketChange,
        changePercentage: quote.regularMarketChangePercent,
        marketCap: quote.marketCap,
        detailedInfo, // contains summaryDetail, summaryProfile, assetProfile
        news // recent news articles
      });
    } catch (error) {
      console.error(`Error fetching stock price for ${symbol}:`, error);
      results.push({ symbol, error: 'Unable to fetch data' });
    }
  }
  if (underPrice !== undefined) {
    return results.filter((r) => r.prices[0] < underPrice);
  }
  return results;
}

/**
 * Fetch trending (top) Indian stocks in real time using NSE data.
 */
async function getTopStocks(limit = 10, underPrice) {
  let results = [];
  const now = new Date();
  const past7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // past 7 days

  try {
    // Get cookies from NSE homepage
    const cookieResponse = await axios.get('https://www.nseindia.com', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const cookies = cookieResponse.headers['set-cookie'];
    const cookieHeader = cookies ? cookies.join('; ') : '';

    // Use cookies to access the trending stocks endpoint
    const nseResponse = await axios.get(
      'https://www.nseindia.com/api/live-analysis-variations?index=gainers',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.nseindia.com/',
          'Cookie': cookieHeader,
        },
      }
    );
    const trendingData = nseResponse.data?.NIFTY?.data;
    if (!trendingData || trendingData.length === 0) {
      throw new Error('No trending data available from NSE API');
    }
    // Extract symbols and ensure they have the ".NS" suffix
    const symbols = trendingData
      .map((item) => item.symbol)
      .slice(0, limit)
      .map((sym) => (sym.includes('.') ? sym : sym + '.NS'));
    for (const symbol of symbols) {
      try {
        const quote = await yahooFinance.quote(symbol);
        const rtData = await fetchRealtimeData(symbol);
        if (!rtData) continue;
        // Fetch 7-day historical data for each top stock
        const history = await fetchHistoricalData(symbol, past7Days, now, '1d');
        const detailedInfo = await fetchDetailedInfo(symbol);
        const news = await fetchNews(symbol);
        results.push({
          symbol,
          name: quote.longName || symbol,
          dates: rtData.dates,
          prices: rtData.prices,
          history,
          change: quote.regularMarketChange,
          changePercentage: quote.regularMarketChangePercent,
          marketCap: quote.marketCap,
          detailedInfo,
          news
        });
      } catch (err) {
        console.error(`Error fetching realtime data for ${symbol}:`, err);
      }
    }
  } catch (error) {
    console.error('Error fetching top stocks from NSE:', error);
    return { error: 'Unable to fetch trending Indian stocks from NSE.' };
  }
  if (underPrice !== undefined) {
    results = results.filter((r) => r.prices[0] < underPrice);
  }
  return results;
}

/**
 * Fetch real-time cryptocurrency data.
 * This function mirrors the stocks function by fetching:
 * - Realtime data
 * - Historical data (past 7 days)
 * - Detailed info and recent news (if available)
 */
async function getCryptoPrice(symbols, currency = 'USD', underPrice) {
  let conversionRate = 1;
  if (currency === 'INR') {
    try {
      const rateQuote = await yahooFinance.quote('USDINR=X');
      conversionRate = rateQuote.regularMarketPrice || 1;
    } catch (error) {
      console.error('Error fetching conversion rate:', error);
    }
  }
  const results = [];
  const now = new Date();
  const past7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // past 7 days
  for (let symbol of symbols) {
    try {
      if (!symbol.includes('-')) {
        symbol = `${symbol}-USD`;
      }
      const quote = await yahooFinance.quote(symbol);
      const rtData = await fetchRealtimeData(symbol);
      if (!rtData) {
        results.push({ symbol, error: 'No real-time data available' });
        continue;
      }
      let price = rtData.prices[0];
      if (currency === 'INR') {
        price = price * conversionRate;
      }
      // Fetch historical data similar to stocks
      const history = await fetchHistoricalData(symbol, past7Days, now, '1d');
      // Optionally, fetch detailed info and news for a more complete response
      let detailedInfo = null;
      let news = [];
      try {
        detailedInfo = await fetchDetailedInfo(symbol);
        news = await fetchNews(symbol);
      } catch (err) {
        console.error(`Error fetching detailed info or news for ${symbol}:`, err);
      }
      results.push({
        symbol,
        name: quote.shortName || symbol,
        dates: rtData.dates,
        prices: [price],
        history,
        change: quote.regularMarketChange,
        changePercentage: quote.regularMarketChangePercent,
        marketCap: quote.marketCap,
        detailedInfo,
        news,
      });
    } catch (error) {
      console.error(`Error fetching crypto price for ${symbol}:`, error);
      results.push({ symbol, error: 'Unable to fetch data' });
    }
  }
  if (underPrice !== undefined) {
    const filtered = results.filter((r) => r.prices[0] < underPrice);
    return filtered.length > 0 ? filtered : [{ message: `No cryptocurrencies found with a price under ${underPrice}.` }];
  }
  return results;
}

/**
 * Fetch trending (top) cryptocurrencies in real time.
 */
async function getTopCryptos(limit = 10, currency = 'USD', underPrice) {
  let conversionRate = 1;
  if (currency === 'INR') {
    try {
      const rateQuote = await yahooFinance.quote('USDINR=X');
      conversionRate = rateQuote.regularMarketPrice || 1;
    } catch (error) {
      console.error('Error fetching conversion rate:', error);  
    }
  }
  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1`
    );
    const coins = await response.json();
    if (!coins || !coins.length) {
      throw new Error('Failed to fetch top cryptocurrencies');
    }
    let results = [];
    const now = new Date();
    const past7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    for (const coin of coins) {
      const symbol = `${coin.symbol.toUpperCase()}-USD`; // Yahoo Finance format
      try {
        const quote = await yahooFinance.quote(symbol);
        const rtData = await fetchRealtimeData(symbol);
        if (!rtData) continue;
        let price = rtData.prices[0];
        if (currency === 'INR') {
          price = price * conversionRate;
        }
        // Fetch historical data for the crypto
        const history = await fetchHistoricalData(symbol, past7Days, now, '1d');
        results.push({
          symbol,
          name: quote.shortName || coin.name,
          dates: rtData.dates,
          prices: [price],
          history,
          change: quote.regularMarketChange,
          changePercentage: quote.regularMarketChangePercent,
          marketCap: quote.marketCap,
        });
      } catch (err) {
        console.error(`Error processing ${symbol}:`, err);
      }
    }
    if (underPrice !== undefined) {
      results = results.filter((r) => r.prices[0] < underPrice);
      return results.length > 0 ? results : [{ message: `No cryptocurrencies found with a price under ${underPrice}.` }];
    }
    return results;
  } catch (error) {
    console.error('Error fetching top cryptos:', error);
    return { error: 'Unable to fetch top cryptos' };
  }
}

/**
 * New Function: Fetch crypto market update by combining trending cryptos and crypto market news.
 */
async function getCryptoMarketUpdate(limit = 10, currency = 'USD', underPrice) {
  const topCryptos = await getTopCryptos(limit, currency, underPrice);
  const cryptoNews = await fetchCryptoMarketNews();
  return {
    topCryptos,
    newsHighlights: cryptoNews.slice(0, 5) // return top 5 crypto news headlines for brevity
  };
}

/**
 * New Function: Fetch market update by combining trending stocks and market news.
 */
async function getMarketUpdate(limit = 10, underPrice) {
  const topStocks = await getTopStocks(limit, underPrice);
  const marketNews = await fetchMarketNews();
  return {
    topStocks,
    newsHighlights: marketNews.slice(0, 5) // return top 5 news headlines for brevity
  };
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

    // Call OpenAI to get the initial assistant response.
    const initialResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a highly specialized financial analyst assistant focused exclusively on Indian stocks and crypto analysis. Provide responses in structured markdown format with clear bullet points, proper spacing between topics, and dynamic chart headings based on the query. Respond in a professional tone and include relevant suggestions when applicable. If a user asks about stocks outside of India, still provide Indian stock data only.',
        },
        ...messages,
      ],
      functions,
      function_call: 'auto',
    });
    const message = initialResponse.choices[0].message;

    // Generate a unique messageId for logging.
    const messageId = uuidv4();
    const userMessages = messages.filter(msg => msg.role === 'user');
    const lastUserMessage = userMessages.length > 0 ? userMessages[userMessages.length - 1].content : '';

    // If OpenAI requested a function call, process that.
    if (message.function_call) {
      const functionName = message.function_call.name;
      const args = JSON.parse(message.function_call.arguments || '{}');
      let functionResponse;

      // Dispatch to the appropriate helper function.
      switch (functionName) {
        case 'get_stock_price':
          functionResponse = await getStockPrice(args.symbols, args.underPrice);
          break;
        case 'get_top_stocks':
          functionResponse = await getTopStocks(args.limit || 2, args.underPrice);
          break;
        case 'get_crypto_price':
          functionResponse = await getCryptoPrice(args.symbols, args.currency || 'USD', args.underPrice);
          break;
        case 'get_top_cryptos':
          functionResponse = await getTopCryptos(args.limit || 2, args.currency || 'USD', args.underPrice);
          break;
        case 'get_company_info':
          functionResponse = await getCompanyInfo(args);
          break;
        case 'get_market_update':
          functionResponse = await getMarketUpdate(args.limit || 2, args.underPrice);
          break;
        case 'get_crypto_market_update':
          functionResponse = await getCryptoMarketUpdate(args.limit || 2, args.currency || 'USD', args.underPrice);
          break;
        default:
          functionResponse = { error: 'Function not supported' };
      }

      // Generate the final assistant response (for brevity, similar to your original code)
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
Data:
${JSON.stringify(functionResponse, null, 2)}

Ensure your response is engaging, well-structured, and adapts to the query context without using tables.`;
        finalResponse = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            ...messages,
            {
              role: 'system',
              content:
                'You are a highly specialized financial analyst assistant focused exclusively on Indian stocks and crypto analysis. Provide responses in structured markdown format with clear bullet points, proper spacing between topics, and dynamic chart headings based on the query. Respond in a professional tone and include relevant suggestions when applicable. If a user asks about stocks outside of India, still provide Indian stock data only.',
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

      // Write a new log record to DynamoDB with the user query, assistant response, and empty feedback.
      const logItem = {
        messageId: messageId,
        timestamp: new Date().toISOString(),
        userQuery: lastUserMessage,
        chatbotResponse: finalResponse.choices[0].message.content,
        actions: {
          like: false,
          dislike: false,
          report: false,
          reportMessage: ""
        },
      };
      
      try {
        await ddbDocClient.send(new PutCommand({
          TableName: DYNAMODB_TABLE,
          Item: logItem,
        }));
        console.log('Log written to DynamoDB:', messageId);
      } catch (ddbError) {
        console.error('Error writing log to DynamoDB:', ddbError);
      }

      return NextResponse.json({
        ...finalResponse.choices[0].message,
        rawData: functionResponse,
        functionName: message.function_call.name,
        messageId, // return this ID so that feedback updates can reference it
      });
    } else {
      // If no function call was made, simply return the assistant content.
      return NextResponse.json({
        role: 'assistant',
        content:
          message.content || "I'm here to help! Could you please clarify your request?",
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
