// Live USD->THB rate for the portfolio: every holding has a currency (THB or
// USD, migration 015), and totals/allocation are shown in THB. Same keyless
// Yahoo chart endpoint as stock prices (symbol "USDTHB=X").
//
// Cached in memory for 15 minutes. A failed refresh keeps serving the last
// good rate (and waits another 15 minutes before retrying, so a Yahoo outage
// doesn't add a 10s timeout to every portfolio read). If no rate has ever
// been fetched, it throws -- USD is never silently treated as THB.
const { fetchYahooQuote } = require('./marketPrices');

const CACHE_MS = 15 * 60 * 1000;
let cached = null; // { rate, fetchedAt, checkedAt }
let inflight = null;

async function getUsdThbRate() {
  if (cached && Date.now() - cached.checkedAt < CACHE_MS) return cached.rate;
  if (!inflight) {
    inflight = fetchYahooQuote('USDTHB=X')
      .then(({ price }) => {
        cached = { rate: price, fetchedAt: Date.now(), checkedAt: Date.now() };
        return price;
      })
      .catch((error) => {
        if (cached) {
          console.error(`USD->THB refresh failed, keeping the last rate (${cached.rate}):`, error.message);
          cached.checkedAt = Date.now();
          return cached.rate;
        }
        throw new Error(`The USD->THB exchange rate is unavailable right now (${error.message}) -- try again shortly`);
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

module.exports = { getUsdThbRate };
