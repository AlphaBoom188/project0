// Live price lookups for the Investment Portfolio feature. Deliberately only
// covers 'stock'/'etf' and 'crypto' -- 'mutual_fund' and 'gold' have no
// reliable free global pricing API (Thai mutual fund NAVs in particular are
// on neither service below), so those two are manual-price-entry only; see
// migration 011's header comment. Both endpoints here are public and keyless,
// which also means unofficial/best-effort -- failures are expected sometimes
// and must surface a clear message rather than crash the request.

const FETCH_TIMEOUT_MS = 10000;

// Also used by priceHistory.js (which passes a User-Agent header in `options`).
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// Yahoo Finance's unofficial, keyless chart endpoint -- works for stocks and
// ETFs on supported exchanges (and FX pairs like "USDTHB=X", see fxRates.js).
// `symbol` is a plain ticker (e.g. "AAPL", "VOO", "PTT.BK"). Returns the price,
// the previous close (for "Day's gain") and the currency Yahoo quotes it in.
async function fetchYahooQuote(symbol) {
  const response = await fetchWithTimeout(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  if (!response.ok) {
    throw new Error(`Could not fetch a price for "${symbol}" (${response.status})`);
  }
  const body = await response.json().catch(() => ({}));
  const meta = body?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  if (typeof price !== 'number') {
    throw new Error(`No market price found for "${symbol}" -- check the ticker is correct`);
  }
  const previousClose = meta.chartPreviousClose ?? meta.previousClose;
  return { price, previousClose: typeof previousClose === 'number' ? previousClose : null, currency: meta.currency || null };
}

async function fetchStockOrEtfPrice(symbol) {
  return (await fetchYahooQuote(symbol)).price;
}

// CoinGecko's public simple-price endpoint. `coinId` is a CoinGecko coin id
// (e.g. "bitcoin", "ethereum"), NOT a ticker like "BTC" -- tickers aren't
// unique across coins, so CoinGecko requires its own id namespace instead.
// CoinGecko has no "previous close" (crypto trades 24/7), so it's derived from
// the 24h change: previous = price / (1 + change%), i.e. the price 24h ago.
async function fetchCryptoQuote(coinId, currency = 'USD') {
  const vs = currency.toLowerCase();
  const response = await fetchWithTimeout(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=${vs}&include_24hr_change=true`
  );
  if (!response.ok) {
    throw new Error(`Could not fetch a price for "${coinId}" (${response.status})`);
  }
  const body = await response.json().catch(() => ({}));
  const price = body?.[coinId]?.[vs];
  if (typeof price !== 'number') {
    throw new Error(`No market price found for "${coinId}" -- use its CoinGecko id (e.g. "bitcoin"), not a ticker`);
  }
  const change = body[coinId][`${vs}_24h_change`];
  return { price, previousClose: typeof change === 'number' ? price / (1 + change / 100) : null, currency: currency.toUpperCase() };
}

async function fetchCryptoPrice(coinId) {
  return (await fetchCryptoQuote(coinId)).price;
}

const MANUAL_ONLY_TYPES = ['mutual_fund', 'gold'];

// Dispatches by asset_type. Throws (with a message safe to show the user) for
// a type that has no live source, or when the upstream lookup itself fails.
// `currency` is the holding's currency: crypto is priced in it directly, while
// a Yahoo quote in a different currency is rejected instead of being stored
// as if it were in the holding's currency.
async function fetchQuoteForHolding(assetType, symbol, currency = 'USD') {
  if (MANUAL_ONLY_TYPES.includes(assetType)) {
    throw new Error(`${assetType.replace('_', ' ')} prices aren't available live -- update current_price manually instead`);
  }
  if (assetType === 'crypto') return fetchCryptoQuote(symbol, currency);
  if (assetType === 'stock' || assetType === 'etf') {
    const quote = await fetchYahooQuote(symbol);
    if (quote.currency && quote.currency !== currency) {
      throw new Error(`"${symbol}" is quoted in ${quote.currency}, but this holding is in ${currency} -- change the holding's currency`);
    }
    return quote;
  }
  throw new Error(`Unknown asset_type "${assetType}"`);
}

async function fetchPriceForHolding(assetType, symbol, currency) {
  return (await fetchQuoteForHolding(assetType, symbol, currency)).price;
}

module.exports = {
  fetchWithTimeout,
  fetchYahooQuote,
  fetchStockOrEtfPrice,
  fetchCryptoQuote,
  fetchCryptoPrice,
  fetchQuoteForHolding,
  fetchPriceForHolding,
  MANUAL_ONLY_TYPES,
};
