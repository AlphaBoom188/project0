// Daily close history for the performance chart: stocks/ETFs, the USD->THB
// rate and the S&P 500 / SET benchmarks from Yahoo's chart endpoint (same
// keyless endpoint as marketPrices.js), crypto from CoinGecko's market_chart.
// mutual_fund/gold have no history source at all (same reason they have no
// live price) -- the chart values them flat at their manual price.
//
// Every series comes back as [{ date: 'YYYY-MM-DD', close }] sorted by date,
// one entry per trading day, dated on the exchange's own calendar (a US close
// on Oct 16 New York time is Oct 16 here, not the Bangkok date it lands on).
//
// Cached in memory for 6 hours per (source, symbol, window). Concurrent
// requests for the same key share one fetch; a failed fetch isn't cached.
const { fetchWithTimeout } = require('./marketPrices');
const { getBangkokYmd } = require('./bangkokDay');
const { daysBetween } = require('./performanceMath');

const CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map(); // key -> { at, promise }

// Yahoo answers a bare node fetch, and a short browser-like User-Agent, but
// 429s a full desktop-Chrome User-Agent string -- so keep it short.
const YAHOO_HEADERS = { 'User-Agent': 'Mozilla/5.0' };

function cached(key, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
  const promise = loader().catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, { at: Date.now(), promise });
  return promise;
}

// Smallest Yahoo range that reaches back to startYmd (plus a 10-day margin so
// a weekend/holiday start still has an earlier close to forward-fill from).
// 'max' isn't used: Yahoo silently switches it to 3-month bars.
const YAHOO_RANGES = [['3mo', 88], ['6mo', 180], ['1y', 362], ['2y', 727], ['5y', 1822], ['10y', 3648]];
function yahooRangeFor(startYmd) {
  const needed = daysBetween(startYmd, getBangkokYmd()) + 10;
  const match = YAHOO_RANGES.find(([, days]) => days >= needed);
  return match ? match[0] : 'full';
}

async function fetchYahooChart(symbol, query) {
  const response = await fetchWithTimeout(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`, {
    headers: YAHOO_HEADERS,
  });
  if (!response.ok) throw new Error(`Could not fetch price history for "${symbol}" (${response.status})`);
  const body = await response.json().catch(() => ({}));
  const result = body?.chart?.result?.[0];
  if (!result || !Array.isArray(result.timestamp)) throw new Error(`No price history found for "${symbol}"`);
  return result;
}

// Last non-null close per exchange-local date (meta.gmtoffset), so hourly
// bars collapse to one daily close too.
function closesFromChart(result) {
  const offsetMs = (result.meta?.gmtoffset || 0) * 1000;
  const closes = result.indicators?.quote?.[0]?.close || [];
  const byDate = new Map();
  result.timestamp.forEach((ts, i) => {
    if (typeof closes[i] === 'number') byDate.set(new Date(ts * 1000 + offsetMs).toISOString().slice(0, 10), closes[i]);
  });
  return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, close]) => ({ date, close }));
}

// Yahoo daily closes covering startYmd..today, plus the currency Yahoo
// quotes the symbol in. Some indexes have no daily bars at all -- ^SET.BK
// returns a single bar for every daily range -- so a series that comes back
// with fewer than 2 days is rebuilt from hourly bars instead (Yahoo serves
// ~2-3 years of those, so SET history doesn't reach back further than that).
function getYahooDailyCloses(symbol, startYmd) {
  const range = yahooRangeFor(startYmd);
  return cached(`yahoo:${symbol}:1d:${range}`, async () => {
    const result = await fetchYahooChart(symbol, range === 'full' ? 'period1=0&period2=9999999999&interval=1d' : `range=${range}&interval=1d`);
    let closes = closesFromChart(result);
    if (closes.length < 2) closes = closesFromChart(await fetchYahooChart(symbol, 'range=730d&interval=1h'));
    if (closes.length === 0) throw new Error(`No price history found for "${symbol}"`);
    return { closes, currency: result.meta?.currency || null };
  });
}

// CoinGecko daily prices in the holding's currency. The public API only
// serves the last 365 days (days=max is a 401 without a paid plan), so older
// days get the first available price (the usual "before the series starts"
// rule). Points are dated on the Bangkok calendar; the last one is "now".
const COINGECKO_DAYS = [30, 90, 180, 365];
function getCoinGeckoDailyCloses(coinId, currency, startYmd) {
  const needed = daysBetween(startYmd, getBangkokYmd()) + 2;
  const days = COINGECKO_DAYS.find((d) => d >= needed) || 365;
  const vs = currency.toLowerCase();
  return cached(`coingecko:${coinId}:${vs}:${days}`, async () => {
    const response = await fetchWithTimeout(
      `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=${vs}&days=${days}&interval=daily`
    );
    if (!response.ok) throw new Error(`Could not fetch price history for "${coinId}" (${response.status})`);
    const body = await response.json().catch(() => ({}));
    if (!Array.isArray(body.prices) || body.prices.length === 0) throw new Error(`No price history found for "${coinId}"`);
    const byDate = new Map();
    for (const [ms, price] of body.prices) if (typeof price === 'number') byDate.set(getBangkokYmd(new Date(ms)), price);
    const closes = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, close]) => ({ date, close }));
    return { closes, currency: currency.toUpperCase() };
  });
}

// Dispatches by asset_type; null for the manual-only types (no history).
// A Yahoo series in a different currency than the holding is rejected, same
// rule as a live price refresh.
async function getHoldingHistory(holding, startYmd) {
  if (holding.asset_type === 'crypto') return getCoinGeckoDailyCloses(holding.symbol, holding.currency, startYmd);
  if (holding.asset_type === 'stock' || holding.asset_type === 'etf') {
    const history = await getYahooDailyCloses(holding.symbol, startYmd);
    if (history.currency && history.currency !== holding.currency) {
      throw new Error(`"${holding.symbol}" is quoted in ${history.currency}, but this holding is in ${holding.currency}`);
    }
    return history;
  }
  return null;
}

module.exports = { getYahooDailyCloses, getCoinGeckoDailyCloses, getHoldingHistory, closesFromChart };
