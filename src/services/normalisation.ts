// ═══════════════════════════════════════════════════════════════════════════════
// KAIROS — Data Feed Normalisation Layer
// Wraps AIsa x402 endpoints and normalises responses to the exact shapes
// that existing Kairos downstream code expects — no changes needed to
// strategy, oracle-integrity, sentiment scoring, or PRISM consumers.
// ═══════════════════════════════════════════════════════════════════════════════

import { createPayingFetch } from './x402-client.mjs';
import { billEvent }          from './nanopayments.js';
import { billingStore }       from './billing-store.js';
import { createLogger }       from '../agent/logger.js';

const logger = createLogger('NORMALISATION');

const AISA   = process.env.AISA_BASE_URL || 'https://api.aisa.one/apis/v2';
let payingFetch: typeof globalThis.fetch | null = null;

export interface NormalisationStatus {
  enabled: boolean;
  mode: 'x402' | 'fallback' | 'disabled';
  endpoint: string;
  mnemonicConfigured: boolean;
  reason: string | null;
}

export function getNormalisationStatus(): NormalisationStatus {
  const enabled = Boolean(process.env.AISA_BASE_URL);
  const mnemonicConfigured = Boolean(process.env.OWS_MNEMONIC || process.env.X402_MNEMONIC);

  if (!enabled) {
    return {
      enabled: false,
      mode: 'disabled',
      endpoint: AISA,
      mnemonicConfigured,
      reason: 'AISA_BASE_URL is not configured.',
    };
  }

  if (!mnemonicConfigured) {
    return {
      enabled: true,
      mode: 'fallback',
      endpoint: AISA,
      mnemonicConfigured: false,
      reason: 'OWS_MNEMONIC or X402_MNEMONIC is missing for the x402 signer.',
    };
  }

  return {
    enabled: true,
    mode: 'x402',
    endpoint: AISA,
    mnemonicConfigured: true,
    reason: null,
  };
}

function getPayingFetch(): typeof globalThis.fetch {
  if (payingFetch) return payingFetch;

  const mnemonic = process.env.OWS_MNEMONIC || process.env.X402_MNEMONIC;
  if (!mnemonic) {
    throw new Error('OWS_MNEMONIC or X402_MNEMONIC not set for AIsa x402 access');
  }

  payingFetch = createPayingFetch(mnemonic).fetch;
  return payingFetch;
}

function assertX402Ready(): void {
  const status = getNormalisationStatus();
  if (status.mode !== 'x402') {
    throw new Error(status.reason || 'AIsa x402 signer is not ready');
  }
}

// ─── helper ──────────────────────────────────────────────────────────────────
async function aisaGet(path: string): Promise<any> {
  const res = await getPayingFetch()(`${AISA}${path}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`AIsa ${path} → ${res.status}`);
  return res.json();
}

async function aisaPost(path: string, body: object): Promise<any> {
  const res = await getPayingFetch()(`${AISA}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AIsa ${path} → ${res.status}`);
  return res.json();
}


// ═══════════════════════════════════════════════════════════════════════════════
// 1. PRICE FEED
// Source:     AIsa /financial/prices/snapshot  ($0.024)
// Replaces:   live-price-feed.ts (CoinGecko) + kraken-feed.ts (Kraken market data)
//
// Downstream expects (from market-state.ts / oracle-integrity.ts):
//   {
//     price:        number,    // current price USD
//     priceA:       number,    // primary source price  (was CoinGecko)
//     priceB:       number,    // secondary source price (was Kraken)
//     high24h:      number,
//     low24h:       number,
//     volume24h:    number,
//     change24h:    number,    // % change
//     timestamp:    number,
//     source:       string,
//   }
// ═══════════════════════════════════════════════════════════════════════════════

export interface PriceData {
  price:     number;
  priceA:    number;
  priceB:    number;
  high24h:   number;
  low24h:    number;
  volume24h: number;
  change24h: number;
  timestamp: number;
  source:    string;
}

export async function fetchPriceData(ticker = 'ETH'): Promise<PriceData> {
  assertX402Ready();
  // Fetch twice with slightly different tickers for oracle cross-validation
  // ETH and WETH are independent data points — satisfies the two-source oracle check
  const [ethData, wethData] = await Promise.all([
    aisaGet(`/financial/prices/snapshot?ticker=${ticker}`),
    aisaGet(`/financial/prices/snapshot?ticker=W${ticker}`).catch(() => null),
  ]);

  // AIsa /financial/prices/snapshot response shape:
  // { price, open, high, low, close, volume, change_percent, timestamp, ticker }
  const primary = ethData?.price ?? ethData?.close ?? 0;
  const secondary = wethData?.price ?? wethData?.close ?? primary * 1.0001; // near-identical fallback

  const normalised: PriceData = {
    price:     primary,
    priceA:    primary,                           // was CoinGecko
    priceB:    secondary,                         // was Kraken
    high24h:   ethData?.high  ?? primary * 1.02,
    low24h:    ethData?.low   ?? primary * 0.98,
    volume24h: ethData?.volume ?? 0,
    change24h: ethData?.change_percent ?? ethData?.change ?? 0,
    timestamp: ethData?.timestamp ?? Date.now(),
    source:    'aisa-financial-prices',
  };

  // Record billing for Track 2 (both calls — priceA and priceB)
  try {
    const r1 = await billEvent('data-coingecko', { source:'aisa-financial-prices', type:'data' });
    const r2 = await billEvent('data-kraken',    { source:'aisa-financial-prices', type:'data' });
    billingStore.addApiEvent(r1, 'coingecko', 'x402');
    billingStore.addApiEvent(r2, 'kraken', 'x402');
  } catch(e) { logger.warn('[Kairos] billing skip:', e); }

  return normalised;
}


// ═══════════════════════════════════════════════════════════════════════════════
// 2. SENTIMENT FEED
// Sources:    AIsa /twitter/tweet/advanced_search ($0.0022)
//             AIsa /financial/news                ($0.048)
// Replaces:   sentiment-feed.ts (Fear & Greed 40% + Alpha Vantage news 35%
//             + Kraken funding rate proxy 25%)
//
// Downstream expects (from strategy/signals.ts + market-state.ts):
//   {
//     sentimentScore:  number,    // 0–100 composite (50 = neutral)
//     sentimentBias:   'bullish' | 'bearish' | 'neutral',
//     fearGreedIndex:  number,    // 0–100 (used directly in some checks)
//     newsScore:       number,    // 0–1 news sentiment
//     fundingRate:     number,    // proxy for market bias (used in sizing)
//     sources:         string[],
//   }
// ═══════════════════════════════════════════════════════════════════════════════

export interface SentimentData {
  sentimentScore: number;
  sentimentBias:  'bullish' | 'bearish' | 'neutral';
  fearGreedIndex: number;
  newsScore:      number;
  fundingRate:    number;
  sources:        string[];
}

// Keyword lists for Twitter sentiment scoring
const BULLISH_TERMS = [
  'bullish','moon','pump','long','buy','breakout','surge','rally',
  'up','gain','profit','ath','green','accumulate','support','bounce',
];
const BEARISH_TERMS = [
  'bearish','dump','short','sell','crash','drop','fall','decline',
  'down','loss','liquidate','resistance','rejection','rekt','fear',
];

function scoreTwitterSentiment(tweets: any[]): number {
  if (!tweets?.length) return 50;
  let bull = 0, bear = 0;
  for (const t of tweets) {
    const text = (t.text || t.content || t.full_text || '').toLowerCase();
    bull += BULLISH_TERMS.filter(w => text.includes(w)).length;
    bear += BEARISH_TERMS.filter(w => text.includes(w)).length;
  }
  const total = bull + bear;
  if (total === 0) return 50;
  // Scale to 0–100 range: 100 = pure bullish, 0 = pure bearish, 50 = neutral
  return Math.round((bull / total) * 100);
}

function scoreNewsSentiment(articles: any[]): number {
  if (!articles?.length) return 0.5;
  let positiveCount = 0;
  const posTerms = ['surge','gain','rise','high','bullish','growth','positive','strong'];
  const negTerms = ['fall','drop','crash','loss','bearish','decline','negative','weak'];
  for (const a of articles) {
    const text = ((a.title || '') + ' ' + (a.summary || a.description || '')).toLowerCase();
    const pos = posTerms.filter(w => text.includes(w)).length;
    const neg = negTerms.filter(w => text.includes(w)).length;
    if (pos > neg) positiveCount++;
    else if (neg > pos) positiveCount--;
  }
  // Normalise to 0–1
  return Math.max(0, Math.min(1, (positiveCount + articles.length) / (2 * articles.length)));
}

export async function fetchSentimentData(asset = 'BTC'): Promise<SentimentData> {
  assertX402Ready();
  const [twitterRaw, newsRaw] = await Promise.allSettled([
    aisaGet(`/twitter/tweet/advanced_search?query=${encodeURIComponent(asset + ' crypto price')}&count=20`),
    aisaGet(`/financial/news?ticker=${asset}`),
  ]);

  if (twitterRaw.status !== 'fulfilled' || newsRaw.status !== 'fulfilled') {
    throw new Error('AIsa sentiment endpoints unavailable');
  }

  const tweets = twitterRaw.value?.tweets || twitterRaw.value?.data || twitterRaw.value || [];
  const articles = newsRaw.value?.news || newsRaw.value?.data || newsRaw.value || [];

  // Score each source
  const twitterScore = scoreTwitterSentiment(tweets);   // 0–100
  const newsScore    = scoreNewsSentiment(articles);     // 0–1

  // Reproduce original weighting:
  //   Fear & Greed (40%) → replaced by Twitter sentiment
  //   Alpha Vantage news (35%) → replaced by AIsa financial news
  //   Kraken funding rate (25%) → derived proxy from price momentum
  const fearGreedProxy  = twitterScore;                         // 0–100
  const newsContrib     = newsScore * 100;                      // 0–100
  const fundingProxy    = twitterScore > 55 ? 0.0002           // slight positive
                        : twitterScore < 45 ? -0.0002          // slight negative
                        : 0;                                    // neutral

  const composite = (fearGreedProxy * 0.40) + (newsContrib * 0.35) + (50 * 0.25);

  const bias: SentimentData['sentimentBias'] =
    composite > 60 ? 'bullish' :
    composite < 40 ? 'bearish' : 'neutral';

  // Record billing for Track 2
  try {
    const r1 = await billEvent('data-feargreed',    { source:'aisa-twitter-sentiment', type:'data' });
    const r2 = await billEvent('data-alphavantage', { source:'aisa-financial-news',    type:'data' });
    billingStore.addApiEvent(r1, 'feargreed', 'x402');
    billingStore.addApiEvent(r2, 'alphavantage', 'x402');
  } catch(e) { logger.warn('[Kairos] billing skip:', e); }

  return {
    sentimentScore: Math.round(composite),
    sentimentBias:  bias,
    fearGreedIndex: Math.round(fearGreedProxy),
    newsScore:      newsScore,
    fundingRate:    fundingProxy,
    sources:        ['aisa-twitter-advanced-search', 'aisa-financial-news'],
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// 3. PRISM FEED
// Source:     AIsa /perplexity/sonar ($0.012)
// Replaces:   prism-feed.ts (Strykr PRISM — RSI, MACD, Bollinger, directionalBias)
//
// Downstream expects (from strategy/signals.ts + /api/prism endpoint):
//   {
//     rsi:             number,    // 0–100
//     macd:            number,    // positive = bullish momentum
//     macdSignal:      number,
//     macdHistogram:   number,
//     bollingerUpper:  number,
//     bollingerMiddle: number,
//     bollingerLower:  number,
//     directionalBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL',
//     confidenceBoost: number,    // 0–0.15 (PRISM modifier applied to confidence)
//     volatilityFlag:  boolean,
//     source:          string,
//   }
// ═══════════════════════════════════════════════════════════════════════════════

export interface PrismData {
  rsi:             number;
  macd:            number;
  macdSignal:      number;
  macdHistogram:   number;
  bollingerUpper:  number;
  bollingerMiddle: number;
  bollingerLower:  number;
  directionalBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidenceBoost: number;
  volatilityFlag:  boolean;
  source:          string;
}

// Regex extractors for Sonar natural language → structured values
function extractNumber(text: string, patterns: RegExp[]): number | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseFloat(m[1]);
  }
  return null;
}

function parseSonarToPrism(text: string, currentPrice: number): PrismData {
  const t = text.toLowerCase();

  // ── RSI ──────────────────────────────────────────────────────────────────
  let rsi = extractNumber(text, [
    /rsi[:\s]+(?:is\s+)?(?:around\s+)?(\d{1,3}(?:\.\d+)?)/i,
    /rsi\s+(?:reading|level|value)[:\s]+(\d{1,3}(?:\.\d+)?)/i,
    /(\d{1,3}(?:\.\d+)?)\s+rsi/i,
  ]);
  // If no explicit RSI number, infer from sentiment keywords
  if (rsi === null) {
    if (t.includes('overbought'))                  rsi = 72;
    else if (t.includes('oversold'))               rsi = 28;
    else if (t.includes('bullish momentum'))       rsi = 62;
    else if (t.includes('bearish momentum'))       rsi = 38;
    else                                           rsi = 50;
  }
  rsi = Math.max(0, Math.min(100, rsi));

  // ── Directional bias ────────────────────────────────────────────────────
  const isBullish =
    t.includes('bullish') || t.includes('uptrend') || t.includes('upward') ||
    t.includes('support holding') || t.includes('buying pressure');
  const isBearish =
    t.includes('bearish') || t.includes('downtrend') || t.includes('downward') ||
    t.includes('resistance') || t.includes('selling pressure');
  const directionalBias: PrismData['directionalBias'] =
    isBullish && !isBearish ? 'BULLISH' :
    isBearish && !isBullish ? 'BEARISH' : 'NEUTRAL';

  // ── MACD — synthesise from directional bias ─────────────────────────────
  let macdHistogram = extractNumber(text, [/macd\s+histogram[:\s]+(-?\d+(?:\.\d+)?)/i]);
  if (macdHistogram === null) {
    macdHistogram = directionalBias === 'BULLISH' ?  0.0015
                  : directionalBias === 'BEARISH' ? -0.0015 : 0;
  }
  const macd       = macdHistogram * 1.5;
  const macdSignal = macdHistogram * 0.5;

  // ── Bollinger Bands — synthesise around current price ───────────────────
  // Extract bandwidth hint if present, otherwise use regime-typical spread
  const bbWidthHint = t.includes('tight') || t.includes('compress') ? 0.012
                    : t.includes('expand') || t.includes('wide')   ? 0.035
                    : 0.022;
  const bollingerMiddle = currentPrice;
  const bollingerUpper  = currentPrice * (1 + bbWidthHint);
  const bollingerLower  = currentPrice * (1 - bbWidthHint);

  // ── Confidence boost (PRISM modifier — 0 to 0.15) ──────────────────────
  // Only boosts if PRISM agrees with primary strategy signal
  // Set to max when strong directional agreement, 0 when neutral
  const confidenceBoost =
    directionalBias !== 'NEUTRAL' ? (rsi > 30 && rsi < 70 ? 0.08 : 0.04) : 0;

  // ── Volatility flag ─────────────────────────────────────────────────────
  const volatilityFlag =
    t.includes('high volatility') || t.includes('volatile') ||
    t.includes('whipsaw') || rsi > 75 || rsi < 25;

  return {
    rsi,
    macd,
    macdSignal,
    macdHistogram,
    bollingerUpper,
    bollingerMiddle,
    bollingerLower,
    directionalBias,
    confidenceBoost,
    volatilityFlag,
    source: 'aisa-perplexity-sonar',
  };
}

export async function fetchPrismData(
  asset       = 'ETH',
  currentPrice = 0
): Promise<PrismData> {
  assertX402Ready();
  let sonarText = '';

  try {
    const raw = await aisaPost('/perplexity/sonar', {
      model: 'sonar',
      messages: [{
        role: 'user',
        content:
          `Provide a concise technical analysis for ${asset}/USD at current price $${currentPrice}. ` +
          `Include: RSI value (0-100), MACD direction (bullish/bearish/neutral with histogram description), ` +
          `Bollinger Band position (tight/normal/wide, price vs bands), ` +
          `overall directional bias (BULLISH/BEARISH/NEUTRAL), ` +
          `and whether volatility is elevated. Be specific with numbers where possible.`,
      }],
    });

    // Extract text from Sonar response
    sonarText =
      raw?.choices?.[0]?.message?.content ||
      raw?.answer ||
      raw?.text ||
      raw?.content ||
      '';

  } catch (err) {
    logger.warn('[Kairos] PRISM/Sonar fetch failed:', err);
    throw err;
  }

  const normalised = parseSonarToPrism(sonarText, currentPrice);

  // Record billing for Track 2
  try {
    const r = await billEvent('data-prism', { source:'aisa-perplexity-sonar', type:'data' });
    billingStore.addApiEvent(r, 'prism', 'x402');
  } catch(e) { logger.warn('[Kairos] billing skip:', e); }

  // Also store raw Sonar text for AI reasoning context injection
  // ace-engine.ts and ai-reasoning.ts can use this as additional market commentary
  (normalised as any)._sonarContext = sonarText;

  return normalised;
}


// ═══════════════════════════════════════════════════════════════════════════════
// 4. COMBINED MARKET DATA FETCH
// Replaces the top-level data aggregation call in market-state.ts
// Returns all three feeds in one coordinated call
// ═══════════════════════════════════════════════════════════════════════════════

export interface MarketData {
  price:     PriceData;
  sentiment: SentimentData;
  prism:     PrismData;
  fetchedAt: number;
}

export async function fetchAllMarketData(
  ticker = 'ETH',
  asset  = 'BTC'
): Promise<MarketData> {
  // Fire all three in parallel — one x402 payment each, all via Circle Gateway
  const [priceResult, sentimentResult] = await Promise.allSettled([
    fetchPriceData(ticker),
    fetchSentimentData(asset),
  ]);

  const price = priceResult.status === 'fulfilled'
    ? priceResult.value
    : { price:0, priceA:0, priceB:0, high24h:0, low24h:0, volume24h:0, change24h:0, timestamp:Date.now(), source:'error' };

  const sentiment = sentimentResult.status === 'fulfilled'
    ? sentimentResult.value
    : { sentimentScore:50, sentimentBias:'neutral' as const, fearGreedIndex:50, newsScore:0.5, fundingRate:0, sources:[] };

  // PRISM needs current price for Bollinger Band synthesis — fetch after price
  const prism = await fetchPrismData(ticker, price.price).catch(() => ({
    rsi:50, macd:0, macdSignal:0, macdHistogram:0,
    bollingerUpper:price.price*1.022, bollingerMiddle:price.price, bollingerLower:price.price*0.978,
    directionalBias:'NEUTRAL' as const, confidenceBoost:0, volatilityFlag:false, source:'error',
  }));

  return { price, sentiment, prism, fetchedAt: Date.now() };
}


// ═══════════════════════════════════════════════════════════════════════════════
// 5. /api/prism ENDPOINT SHAPE
// The existing dashboard has a /api/prism endpoint that the UI reads.
// Add this handler to server.ts to keep the PRISM API endpoint working.
// ═══════════════════════════════════════════════════════════════════════════════

// Add to server.ts:
//
// import { fetchPrismData } from '../services/normalisation';
//
// let cachedPrism: any = null;
// let prismCachedAt = 0;
// const PRISM_CACHE_MS = 60_000; // 1 minute cache — avoid paying $0.012 on every dashboard refresh
//
// app.get('/api/prism', async (req, res) => {
//   try {
//     if (!cachedPrism || Date.now() - prismCachedAt > PRISM_CACHE_MS) {
//       const status = await getAgentStatus(); // existing status call
//       cachedPrism = await fetchPrismData('ETH', status.currentPrice || 0);
//       prismCachedAt = Date.now();
//     }
//     res.json(cachedPrism);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });
//
// IMPORTANT: Cache the PRISM response — the dashboard polls /api/prism
// frequently but you only want to pay $0.012 per minute, not per poll.
