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
// Cached in memory for 6 hours per (source, symbol, window) -- 12 hours for
// dividend history, which changes a few times a year. Concurrent requests for
// the same key share one fetch; a failed fetch isn't cached.
const { fetchWithTimeout } = require('./marketPrices');
const { getBangkokYmd } = require('./bangkokDay');
const { daysBetween } = require('./performanceMath');

const CACHE_MS = 6 * 60 * 60 * 1000;
const DIVIDEND_CACHE_MS = 12 * 60 * 60 * 1000;
const cache = new Map(); // key -> { at, maxAgeMs, promise, value }

// Yahoo answers a bare node fetch, and a short browser-like User-Agent, but
// 429s a full desktop-Chrome User-Agent string -- so keep it short.
const YAHOO_HEADERS = { 'User-Agent': 'Mozilla/5.0' };

function cached(key, loader, maxAgeMs = CACHE_MS) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.maxAgeMs) return hit.promise;
  const entry = { at: Date.now(), maxAgeMs, promise: null, value: undefined };
  entry.promise = loader().then(
    (value) => {
      entry.value = value;
      return value;
    },
    (error) => {
      if (cache.get(key) === entry) cache.delete(key);
      throw error;
    }
  );
  cache.set(key, entry);
  return entry.promise;
}

// The cached value if a fetch for `key` has already finished (and is still
// fresh), else null -- never starts a fetch. For reads that must stay fast
// (GET /api/portfolio/:u) and only use history someone else already loaded.
function peekCached(key) {
  const hit = cache.get(key);
  return hit && Date.now() - hit.at < hit.maxAgeMs && hit.value !== undefined ? hit.value : null;
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

async function fetchYahooChart(symbol, query, what = 'price history') {
  const response = await fetchWithTimeout(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`, {
    headers: YAHOO_HEADERS,
  });
  if (!response.ok) throw new Error(`Could not fetch ${what} for "${symbol}" (${response.status})`);
  const body = await response.json().catch(() => ({}));
  const result = body?.chart?.result?.[0];
  if (!result || !Array.isArray(result.timestamp)) throw new Error(`No ${what} found for "${symbol}"`);
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
const dailyClosesKey = (symbol, startYmd) => `yahoo:${symbol}:1d:${yahooRangeFor(startYmd)}`;
function getYahooDailyCloses(symbol, startYmd) {
  const range = yahooRangeFor(startYmd);
  return cached(dailyClosesKey(symbol, startYmd), async () => {
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

// Already-fetched daily closes for (symbol, startYmd), else null (no fetch).
const peekYahooDailyCloses = (symbol, startYmd) => peekCached(dailyClosesKey(symbol, startYmd));

// Every dividend Yahoo has for a stock/ETF, as [{ ex_date, amount }] sorted
// by ex_date: amount is per share in the listing currency, ex_date the
// Bangkok calendar date of the event. Only Yahoo has dividend data --
// crypto, mutual funds and gold have no source (see dividendMath.js).
//
// From the chart endpoint with events=div. With interval=1mo each event is
// keyed by the start of its monthly bar, not by its ex-date, so the date is
// read from the event's own `date` field. range=max is fine here: only the
// bar size changes with it, and the events come back complete either way.
// Amounts are split-adjusted by Yahoo (lots aren't, see dividendMath.js).
// A symbol that pays nothing (e.g. BRK-B) comes back with no events at all.
function getYahooDividends(symbol) {
  return cached(`yahoo-div:${symbol}`, async () => {
    const result = await fetchYahooChart(symbol, 'range=max&interval=1mo&events=div', 'dividend history');
    const events = Object.values(result.events?.dividends || {})
      .filter((event) => typeof event.amount === 'number' && typeof event.date === 'number')
      .map((event) => ({ ex_date: getBangkokYmd(new Date(event.date * 1000)), amount: event.amount }))
      .sort((a, b) => (a.ex_date < b.ex_date ? -1 : a.ex_date > b.ex_date ? 1 : 0));
    return { events, currency: result.meta?.currency || null };
  }, DIVIDEND_CACHE_MS);
}

// Same currency rule as getHoldingHistory: amounts in another currency than
// the holding's would be converted wrongly, so they're rejected.
function checkDividendCurrency(holding, dividends) {
  if (dividends.currency && dividends.currency !== holding.currency) {
    throw new Error(`"${holding.symbol}" is quoted in ${dividends.currency}, but this holding is in ${holding.currency}`);
  }
  return dividends.events;
}

async function getHoldingDividends(holding) {
  return checkDividendCurrency(holding, await getYahooDividends(holding.symbol));
}

// Already-fetched dividend events for a holding, else null (no fetch, and
// null on a currency mismatch too).
function peekHoldingDividends(holding) {
  const dividends = peekCached(`yahoo-div:${holding.symbol}`);
  if (!dividends) return null;
  try {
    return checkDividendCurrency(holding, dividends);
  } catch {
    return null;
  }
}

module.exports = {
  getYahooDailyCloses,
  getCoinGeckoDailyCloses,
  getHoldingHistory,
  closesFromChart,
  peekYahooDailyCloses,
  getYahooDividends,
  getHoldingDividends,
  peekHoldingDividends,
};
