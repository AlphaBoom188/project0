// Pure math for the portfolio performance chart (no network, no DB) -- the
// endpoint (portfolioController.getPerformance) fetches price/FX/benchmark
// history through priceHistory.js and hands plain arrays to these functions,
// so every rule here can be unit-tested with injected series.
//
// Rules (decided with the owner, see the Phase B section in CLAUDE.md):
//   * Every day is a Bangkok calendar date 'YYYY-MM-DD'. Ranges end today and
//     never start before the user's first lot trade_date; 'ytd' starts on
//     Bangkok Jan 1, 'all' on the first trade date.
//   * Daily value = sum over holdings of (open quantity at the end of that
//     day, replayed from lots with trade_date <= day) x that day's close (the
//     holding's currency) x that day's USD->THB (1 for THB holdings).
//   * Missing closes (weekends, holidays) are forward-filled from the last
//     known close; days before a series starts use its first close.
//   * Net invested = buys (shares x price + fee) minus sells (shares x price
//     - fee), each converted at that day's USD->THB.
//   * Return = time-weighted return, chain-linked daily so cash flows don't
//     count as performance: buys are treated as arriving at the start of the
//     day (they're in the denominator), sells as leaving at the end of it.
//     Only TWR -- the spec's MWR/SR toggles and its "Deposits" benchmark are
//     deferred.
const { computeLotSummary, sortLots, lotTotal } = require('./lotMath');

const DAY_MS = 24 * 60 * 60 * 1000;
const PERFORMANCE_RANGES = ['1m', '3m', '6m', 'ytd', '1y', '3y', '5y', 'all'];
const RANGE_MONTHS = { '1m': 1, '3m': 3, '6m': 6, '1y': 12, '3y': 36, '5y': 60 };

const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (fromYmd, toYmd) => Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / DAY_MS);

// Same calendar day `months` earlier, clamped to the end of a shorter month
// (Mar 31 - 1m = Feb 28, not Mar 3 the way Date.UTC would roll it).
function monthsBefore(ymd, months) {
  const [year, month, day] = ymd.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 - months, 1));
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, daysInMonth))).toISOString().slice(0, 10);
}

// The range's first Bangkok date, clipped to the first trade (null with no lots).
function rangeStartYmd(range, todayYmd, firstTradeYmd) {
  if (!firstTradeYmd) return null;
  let start;
  if (range === 'all') start = firstTradeYmd;
  else if (range === 'ytd') start = `${todayYmd.slice(0, 4)}-01-01`;
  else start = monthsBefore(todayYmd, RANGE_MONTHS[range]);
  return start < firstTradeYmd ? firstTradeYmd : start;
}

function eachDay(startYmd, endYmd) {
  const days = [];
  for (let day = startYmd; day <= endYmd; day = addDays(day, 1)) days.push(day);
  return days;
}

// `closes` is [{ date, close }] sorted by date. Returns one value per day:
// the last close on or before it; before the first close, the first close
// (or null with backfill: false -- used for benchmarks, see below). An empty
// series gives all nulls.
function forwardFill(closes, days, { backfill = true } = {}) {
  const out = [];
  let i = 0;
  let last = null;
  for (const day of days) {
    while (i < closes.length && closes[i].date <= day) last = closes[i++].close;
    out.push(last !== null ? last : backfill && closes.length > 0 ? closes[0].close : null);
  }
  return out;
}

// Open quantity at the end of each day. Lots are only replayed again on days
// where a lot was added, so long ranges stay cheap.
function openQuantityByDay(lots, days) {
  const sorted = sortLots(lots);
  const out = [];
  let applied = 0;
  let quantity = 0;
  for (const day of days) {
    const before = applied;
    while (applied < sorted.length && sorted[applied].trade_date <= day) applied++;
    if (applied !== before) quantity = computeLotSummary(sorted.slice(0, applied)).quantity;
    out.push(quantity);
  }
  return out;
}

// Daily THB value and cash flows for a set of positions. Each position is
// { lots, prices, fx }: prices and fx are aligned with `days` (already
// forward-filled; fx all 1 for a THB holding). Lots dated before days[0]
// count as flows on days[0].
function dailySeries(days, positions) {
  const value = days.map(() => 0);
  const buys = days.map(() => 0);
  const sells = days.map(() => 0);
  for (const { lots, prices, fx } of positions) {
    const quantities = openQuantityByDay(lots, days);
    for (let i = 0; i < days.length; i++) value[i] += quantities[i] * prices[i] * fx[i];
    for (const lot of lots) {
      let i = days.indexOf(lot.trade_date);
      if (i === -1) {
        if (lot.trade_date > days[days.length - 1]) continue;
        i = 0;
      }
      const amount = lotTotal(lot) * fx[i];
      if (lot.side === 'buy') buys[i] += amount;
      else sells[i] += amount;
    }
  }
  return { value, buys, sells };
}

// Cumulative buys minus sells.
function netInvested(buys, sells) {
  let total = 0;
  return buys.map((buy, i) => (total += buy - sells[i]));
}

// One day's time-weighted return: (end value + sells - buys - start value) /
// (start value + buys). 0 when nothing was invested that day.
function dayReturn(previousValue, value, buy, sell) {
  const base = previousValue + buy;
  return base > 0 ? (value + sell - buy - previousValue) / base : 0;
}

// TWR in percent for each day, chain-linked from 0% on the first day.
function chainTwr(value, buys, sells) {
  let growth = 1;
  return value.map((v, i) => {
    if (i > 0) growth *= 1 + dayReturn(value[i - 1], v, buys[i], sells[i]);
    return (growth - 1) * 100;
  });
}

// Percent change against the first non-null value; nulls stay null.
function rebasePercent(series) {
  const base = series.find((v) => v !== null && v > 0);
  return series.map((v) => (v === null || base === undefined ? null : (v / base - 1) * 100));
}

// At most `limit` points, evenly spaced, always keeping the first and last.
function downsample(points, limit = 120) {
  if (points.length <= limit) return points;
  const out = [];
  let lastIndex = -1;
  for (let k = 0; k < limit; k++) {
    const index = Math.round((k * (points.length - 1)) / (limit - 1));
    if (index !== lastIndex) out.push(points[index]);
    lastIndex = index;
  }
  return out;
}

// Price for a holding with no history (mutual_fund/gold, or a failed fetch):
// its current price, else its average cost -- or, once fully sold (average
// cost 0), the average buy price, so its past value isn't drawn as zero.
function fallbackPrice(holding, lots) {
  if (holding.current_price !== null && holding.current_price !== undefined) return parseFloat(holding.current_price);
  const averageCost = parseFloat(holding.average_cost || 0);
  if (averageCost > 0) return averageCost;
  const bought = lots.filter((l) => l.side === 'buy');
  const quantity = bought.reduce((sum, l) => sum + parseFloat(l.quantity), 0);
  return quantity > 0 ? bought.reduce((sum, l) => sum + parseFloat(l.quantity) * parseFloat(l.price), 0) / quantity : 0;
}

module.exports = {
  PERFORMANCE_RANGES,
  addDays,
  daysBetween,
  monthsBefore,
  rangeStartYmd,
  eachDay,
  forwardFill,
  openQuantityByDay,
  dailySeries,
  netInvested,
  dayReturn,
  chainTwr,
  rebasePercent,
  downsample,
  fallbackPrice,
};
