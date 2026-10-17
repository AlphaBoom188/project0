// Pure math for dividend income (no network, no DB) -- the endpoint
// (portfolioController.getDividends) fetches dividend events and USD->THB
// history through priceHistory.js and hands plain arrays to these functions,
// so every rule here can be unit-tested with injected data.
//
// Rules (decided with the owner, see the Phase C section in CLAUDE.md):
//   * Only stock/etf holdings have dividends: Yahoo's chart endpoint is the
//     only source. Crypto, mutual funds and gold never do here -- there's no
//     dividend source for them (a fund's distributions aren't on Yahoo).
//   * Every date is a Bangkok calendar date 'YYYY-MM-DD'; an event's ex_date
//     is the Bangkok date of Yahoo's event timestamp.
//   * Received: for each event with ex-date D (on or before today), shares
//     held = open quantity replayed from lots with trade_date < D (a buy on
//     D itself is too late to get it) x amount per share, in the holding's
//     currency, then x the USD->THB close on D (forward-filled; 1 for THB).
//   * Projected (next 12 months): each event from the last 12 months, shifted
//     forward by exactly one year, x today's open shares x today's USD->THB.
//     Shifted dates on or before today are dropped. An estimate, not a
//     forecast of announced dividends.
//   * Gross amounts, before withholding tax: Thai 10% / US 15% withholding
//     depends on the account and treaty status, so it isn't modeled.
//   * Lots aren't split-adjusted but Yahoo's per-share amounts are, so a lot
//     bought before a split under-counts dividends from before that split.
const { computeLotSummary, round6 } = require('./lotMath');
const { addDays } = require('./performanceMath');

const DIVIDEND_MODES = ['monthly', 'quarterly', 'annual'];
const DIVIDEND_ASSET_TYPES = ['stock', 'etf'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const round2 = (value) => (value === null ? null : Math.round(value * 100) / 100);
const round4 = (value) => (value === null ? null : Math.round(value * 1e4) / 1e4);
const pad2 = (n) => String(n).padStart(2, '0');

// Same calendar date `years` later (or earlier, negative); Feb 29 becomes
// Feb 28 in a non-leap year.
function addYears(ymd, years) {
  const [year, month, day] = ymd.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year + years, month, 0)).getUTCDate();
  return `${year + years}-${pad2(month)}-${pad2(Math.min(day, daysInMonth))}`;
}

// Open quantity from the lots traded strictly before `ymd`.
function sharesHeldBefore(lots, ymd) {
  const before = lots.filter((lot) => lot.trade_date < ymd);
  return before.length > 0 ? computeLotSummary(before).quantity : 0;
}

// `closes` is [{ date, close }] sorted by date: the last close on or before
// `ymd`, else the first close, else `fallback` (the live rate).
function rateOn(closes, ymd, fallback = null) {
  let rate = null;
  for (const close of closes) {
    if (close.date > ymd) break;
    rate = close.close;
  }
  if (rate === null && closes.length > 0) rate = closes[0].close;
  return rate !== null ? rate : fallback;
}

// One holding's dividend events (received and projected) plus its totals.
// `events` is [{ ex_date, amount }] (per share, holding currency) sorted by
// ex_date; `fxCloses` the USD->THB daily closes, `currentFx` today's rate.
// Events where no shares were held are left out.
function holdingDividends({ lots, events, currency, fxCloses = [], currentFx = null, today }) {
  const isThb = currency === 'THB';
  const toThb = (amount, rate) => (rate === null || rate === undefined ? null : round6(amount * rate));
  const out = [];

  for (const event of events) {
    // Yahoo can list an announced ex-date that hasn't happened yet.
    if (event.ex_date > today) continue;
    const shares = sharesHeldBefore(lots, event.ex_date);
    if (shares <= 0) continue;
    const amount = round6(shares * event.amount);
    out.push({
      ex_date: event.ex_date,
      amount_per_share: event.amount,
      shares,
      amount,
      amount_thb: toThb(amount, isThb ? 1 : rateOn(fxCloses, event.ex_date, currentFx)),
      kind: 'received',
    });
  }

  const openShares = lots.length > 0 ? computeLotSummary(lots).quantity : 0;
  if (openShares > 0) {
    const yearAgo = addYears(today, -1);
    for (const event of events) {
      if (event.ex_date <= yearAgo || event.ex_date > today) continue;
      const exDate = addYears(event.ex_date, 1);
      if (exDate <= today) continue;
      const amount = round6(openShares * event.amount);
      out.push({
        ex_date: exDate,
        amount_per_share: event.amount,
        shares: openShares,
        amount,
        amount_thb: toThb(amount, isThb ? 1 : currentFx),
        kind: 'projected',
      });
    }
  }

  const sum = (kind, key) => round6(out.filter((e) => e.kind === kind && e[key] !== null).reduce((acc, e) => acc + e[key], 0));
  return {
    received: sum('received', 'amount'),
    received_thb: sum('received', 'amount_thb'),
    projected_12m: sum('projected', 'amount'),
    projected_12m_thb: sum('projected', 'amount_thb'),
    events: out.sort((a, b) => (a.ex_date < b.ex_date ? -1 : a.ex_date > b.ex_date ? 1 : 0)),
  };
}

// Headline figures, all THB. `events` is every holding's events together;
// totalValueThb / costBasisThb are the portfolio's current value and open
// cost basis (loadPortfolio's totals). Trailing = received in the last 365
// days; YoY compares it with the 365 days before that (null without any).
function summarizeDividends(events, { today, totalValueThb, costBasisThb }) {
  const yearAgo = addDays(today, -365);
  const twoYearsAgo = addDays(today, -730);
  const sum = (filter) => events.filter((e) => e.amount_thb !== null && filter(e)).reduce((acc, e) => acc + e.amount_thb, 0);
  const trailing = sum((e) => e.kind === 'received' && e.ex_date > yearAgo && e.ex_date <= today);
  const prior = sum((e) => e.kind === 'received' && e.ex_date > twoYearsAgo && e.ex_date <= yearAgo);
  const projected = sum((e) => e.kind === 'projected');
  const percentOf = (value, base) => (base > 0 ? round4((value / base) * 100) : null);
  return {
    trailing_12m_thb: round2(trailing),
    yoy_pct: prior > 0 ? round4(((trailing - prior) / prior) * 100) : null,
    projected_12m_thb: round2(projected),
    portfolio_yield_pct: percentOf(projected, totalValueThb),
    yield_on_cost_pct: percentOf(projected, costBasisThb),
    avg_monthly_thb: round2(trailing / 12),
    avg_daily_thb: round2(trailing / 365),
  };
}

// First date of the period (Bangkok calendar) that `ymd` falls in.
function periodStart(mode, ymd) {
  const year = ymd.slice(0, 4);
  const month = Number(ymd.slice(5, 7));
  if (mode === 'annual') return `${year}-01-01`;
  if (mode === 'quarterly') return `${year}-${pad2(Math.floor((month - 1) / 3) * 3 + 1)}-01`;
  return `${year}-${pad2(month)}-01`;
}

function periodLabel(mode, start) {
  const year = start.slice(0, 4);
  const month = Number(start.slice(5, 7));
  if (mode === 'annual') return year;
  if (mode === 'quarterly') return `Q${Math.floor((month - 1) / 3) + 1} ${year}`;
  return `${MONTH_LABELS[month - 1]} ${year}`;
}

// The first day of the month `n` months after (or before) ymd's month.
function shiftMonths(ymd, n) {
  const d = new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-01`;
}

// Bars for the chart, one per Bangkok calendar period:
//   monthly   -- the 11 months before this one, this month, and the next 12
//                (so every projected date, up to today + 1 year, has a bar);
//   quarterly -- the 3 quarters before this one, this quarter, the next 4;
//   annual    -- every year from the first lot's year through next year.
// A period holds both parts where they overlap (this month/quarter/year:
// received so far + projected for the rest), drawn stacked. Received events
// older than the first bar are left out of monthly/quarterly.
function buildDividendSeries(mode, events, today, firstTradeYmd = null) {
  const current = periodStart(mode, today);
  const starts = [];
  if (mode === 'annual') {
    const thisYear = Number(today.slice(0, 4));
    const firstYear = firstTradeYmd ? Math.min(Number(firstTradeYmd.slice(0, 4)), thisYear) : thisYear;
    for (let year = firstYear; year <= thisYear + 1; year++) starts.push(`${year}-01-01`);
  } else {
    const step = mode === 'quarterly' ? 3 : 1;
    const [before, after] = mode === 'quarterly' ? [3, 4] : [11, 12];
    for (let k = -before; k <= after; k++) starts.push(shiftMonths(current, k * step));
  }

  const buckets = new Map(starts.map((start) => [start, { label: periodLabel(mode, start), period_start: start, received_thb: 0, projected_thb: 0 }]));
  for (const event of events) {
    const bucket = buckets.get(periodStart(mode, event.ex_date));
    if (!bucket || event.amount_thb === null) continue;
    bucket[event.kind === 'received' ? 'received_thb' : 'projected_thb'] += event.amount_thb;
  }
  return [...buckets.values()].map((b) => ({ ...b, received_thb: round2(b.received_thb), projected_thb: round2(b.projected_thb) }));
}

module.exports = {
  DIVIDEND_MODES,
  DIVIDEND_ASSET_TYPES,
  addYears,
  sharesHeldBefore,
  rateOn,
  holdingDividends,
  summarizeDividends,
  periodStart,
  buildDividendSeries,
};
