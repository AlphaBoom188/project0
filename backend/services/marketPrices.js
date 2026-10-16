// Live price lookups for the Investment Portfolio feature. Deliberately only
// covers 'stock'/'etf' and 'crypto' -- 'mutual_fund' and 'gold' have no
// reliable free global pricing API (Thai mutual fund NAVs in particular are
// on neither service below), so those two are manual-price-entry only; see
// migration 011's header comment. Both endpoints here are public and keyless,
// which also means unofficial/best-effort -- failures are expected sometimes
// and must surface a clear message rather than crash the request.

const FETCH_TIMEOUT_MS = 10000;

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// Yahoo Finance's unofficial, keyless chart endpoint -- works for stocks and
// ETFs on supported exchanges. `symbol` is a plain ticker (e.g. "AAPL", "VOO").
async function fetchStockOrEtfPrice(symbol) {
  const response = await fetchWithTimeout(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  if (!response.ok) {
    throw new Error(`Could not fetch a price for "${symbol}" (${response.status})`);
  }
  const body = await response.json().catch(() => ({}));
  const price = body?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (typeof price !== 'number') {
    throw new Error(`No market price found for "${symbol}" -- check the ticker is correct`);
  }
  return price;
}

// CoinGecko's public simple-price endpoint. `coinId` is a CoinGecko coin id
// (e.g. "bitcoin", "ethereum"), NOT a ticker like "BTC" -- tickers aren't
// unique across coins, so CoinGecko requires its own id namespace instead.
async function fetchCryptoPrice(coinId) {
  const response = await fetchWithTimeout(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=usd`
  );
  if (!response.ok) {
    throw new Error(`Could not fetch a price for "${coinId}" (${response.status})`);
  }
  const body = await response.json().catch(() => ({}));
  const price = body?.[coinId]?.usd;
  if (typeof price !== 'number') {
    throw new Error(`No market price found for "${coinId}" -- use its CoinGecko id (e.g. "bitcoin"), not a ticker`);
  }
  return price;
}

const MANUAL_ONLY_TYPES = ['mutual_fund', 'gold'];

// Dispatches by asset_type. Throws (with a message safe to show the user) for
// a type that has no live source, or when the upstream lookup itself fails.
async function fetchPriceForHolding(assetType, symbol) {
  if (MANUAL_ONLY_TYPES.includes(assetType)) {
    throw new Error(`${assetType.replace('_', ' ')} prices aren't available live -- update current_price manually instead`);
  }
  if (assetType === 'crypto') return fetchCryptoPrice(symbol);
  if (assetType === 'stock' || assetType === 'etf') return fetchStockOrEtfPrice(symbol);
  throw new Error(`Unknown asset_type "${assetType}"`);
}

module.exports = { fetchStockOrEtfPrice, fetchCryptoPrice, fetchPriceForHolding, MANUAL_ONLY_TYPES };
