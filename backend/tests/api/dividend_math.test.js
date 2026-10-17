// Pure dividend math (services/dividendMath.js) with injected events, lots
// and FX: shares held at the ex-date (a buy on the ex-date is too late),
// per-date FX conversion, the one-year projection shift, the headline
// figures, Bangkok-calendar bucketing for all three modes, empty input.
const {
  DIVIDEND_MODES, addYears, sharesHeldBefore, rateOn, holdingDividends, summarizeDividends, periodStart, buildDividendSeries,
} = require('../../services/dividendMath');

let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures++; };
const near = (a, b, eps = 1e-6) => typeof a === 'number' && Math.abs(a - b) <= eps;
const lot = (side, quantity, trade_date, price = 100, created_at = `${trade_date}T05:00:00Z`) => ({ side, quantity, price, fee: 0, trade_date, created_at });

const TODAY = '2026-10-18';

// --- addYears / rateOn / periodStart ---
assert(addYears('2025-10-18', 1) === '2026-10-18' && addYears('2026-10-18', -1) === '2025-10-18', 'addYears shifts by exactly one calendar year');
assert(addYears('2024-02-29', 1) === '2025-02-28' && addYears('2024-02-29', 4) === '2028-02-29', 'Feb 29 clamps to Feb 28 in a non-leap year');
const fx = [{ date: '2026-03-02', close: 33 }, { date: '2026-03-06', close: 34 }, { date: '2026-06-01', close: 36 }];
assert(rateOn(fx, '2026-03-06') === 34 && rateOn(fx, '2026-03-08') === 34, 'FX on the date, forward-filled over a gap');
assert(rateOn(fx, '2026-01-01') === 33 && rateOn([], '2026-01-01', 32.5) === 32.5 && rateOn([], '2026-01-01') === null, 'before the series: first close; empty: the fallback');
assert(periodStart('monthly', '2026-10-18') === '2026-10-01' && periodStart('quarterly', '2026-08-31') === '2026-07-01' && periodStart('annual', '2026-10-18') === '2026-01-01', 'periodStart for each mode');
assert(DIVIDEND_MODES.join() === 'monthly,quarterly,annual', 'modes');

// --- Shares held exactly at the ex-date ---
const D = '2026-05-11';
assert(sharesHeldBefore([lot('buy', 10, D)], D) === 0, 'a buy ON the ex-date is excluded');
assert(sharesHeldBefore([lot('buy', 10, '2026-05-10')], D) === 10, 'a buy the day before is included');
assert(sharesHeldBefore([lot('buy', 10, '2026-01-02'), lot('sell', 4, '2026-05-01')], D) === 6, 'a sell before the ex-date reduces the shares');
assert(sharesHeldBefore([lot('buy', 10, '2026-01-02'), lot('sell', 4, D)], D) === 10, 'a sell on the ex-date still gets the dividend');
assert(near(sharesHeldBefore([lot('buy', 1.5, '2026-01-02'), lot('buy', 0.25, '2026-02-02')], D), 1.75), 'fractional shares');

// --- Received: shares x amount -> THB at that date's rate ---
const events = [
  { ex_date: '2025-02-10', amount: 0.25 }, // before the first buy: not held
  { ex_date: '2025-11-10', amount: 0.26 },
  { ex_date: '2026-02-09', amount: 0.26 },
  { ex_date: '2026-05-11', amount: 0.27 },
  { ex_date: '2026-08-10', amount: 0.27 },
  { ex_date: '2026-11-09', amount: 0.28 }, // announced, not yet happened
];
const lots = [lot('buy', 10, '2025-06-02'), lot('buy', 5, '2026-05-11'), lot('sell', 3, '2026-06-15')];
const usdFx = [{ date: '2025-11-10', close: 32 }, { date: '2026-02-09', close: 33 }, { date: '2026-05-11', close: 34 }, { date: '2026-08-07', close: 35 }];
const h = holdingDividends({ lots, events, currency: 'USD', fxCloses: usdFx, currentFx: 36, today: TODAY });
const received = h.events.filter((e) => e.kind === 'received');
assert(received.map((e) => e.ex_date).join() === '2025-11-10,2026-02-09,2026-05-11,2026-08-10', `received: only held, already-happened ex-dates (got ${received.map((e) => e.ex_date)})`);
assert(received[2].shares === 10 && near(received[2].amount, 2.7), 'May ex-date: the buy on that day is excluded (10 shares, $2.70)');
assert(received[3].shares === 12 && near(received[3].amount, 3.24), 'Aug ex-date: 15 bought - 3 sold = 12 shares');
assert(near(received[0].amount_thb, 2.6 * 32) && near(received[1].amount_thb, 2.6 * 33) && near(received[2].amount_thb, 2.7 * 34), 'each event converted at its own date\'s USD->THB');
assert(near(received[3].amount_thb, 3.24 * 35), 'a weekend/holiday ex-date uses the last earlier FX close');
assert(near(h.received, 2.6 + 2.6 + 2.7 + 3.24) && near(h.received_thb, 2.6 * 32 + 2.6 * 33 + 2.7 * 34 + 3.24 * 35), 'holding totals: received in USD and THB');
const thb = holdingDividends({ lots, events, currency: 'THB', fxCloses: usdFx, currentFx: 36, today: TODAY });
assert(thb.events.every((e) => e.amount_thb === e.amount), 'THB holding: rate 1, no FX');

// --- Projected: last 12 months shifted one year, x today's shares x today's FX ---
const projected = h.events.filter((e) => e.kind === 'projected');
assert(projected.map((e) => e.ex_date).join() === '2026-11-10,2027-02-09,2027-05-11,2027-08-10', `projection = last 12 months' ex-dates + 1 year (got ${projected.map((e) => e.ex_date)})`);
assert(projected.every((e) => e.shares === 12 && e.ex_date > TODAY), 'projected at today\'s open shares, all after today');
assert(near(projected[0].amount, 12 * 0.26) && near(projected[0].amount_thb, 12 * 0.26 * 36), 'projected amount at today\'s USD->THB');
assert(near(h.projected_12m_thb, 12 * 36 * (0.26 + 0.26 + 0.27 + 0.27)), 'projected 12m total');
assert(!h.events.some((e) => e.ex_date === '2027-11-09' || e.ex_date === '2026-11-09'), 'an announced future event is neither received nor re-projected');
const edge = holdingDividends({ lots: [lot('buy', 1, '2020-01-02')], events: [{ ex_date: '2025-10-18', amount: 1 }, { ex_date: '2025-10-19', amount: 1 }], currency: 'THB', today: TODAY });
assert(edge.events.filter((e) => e.kind === 'projected').map((e) => e.ex_date).join() === '2026-10-19', 'an event exactly a year ago would land on today -> dropped (past dates never projected)');
const soldOut = holdingDividends({ lots: [lot('buy', 5, '2025-01-02'), lot('sell', 5, '2026-03-02')], events, currency: 'THB', today: TODAY });
assert(soldOut.events.every((e) => e.kind === 'received') && soldOut.projected_12m_thb === 0 && soldOut.received > 0, 'fully sold: past dividends kept, nothing projected');

// --- Summary: trailing 12m, YoY, yields, averages ---
const ev = (ex_date, amount_thb, kind = 'received') => ({ ex_date, amount_thb, kind });
const sample = [ev('2024-12-01', 100), ev('2025-06-01', 200), ev('2025-10-18', 50), ev('2025-10-19', 300), ev('2026-10-18', 900), ev('2027-01-05', 600, 'projected'), ev('2027-04-05', 600, 'projected')];
const s = summarizeDividends(sample, { today: TODAY, totalValueThb: 60000, costBasisThb: 40000 });
assert(s.trailing_12m_thb === 1200, `trailing 12m = received in the last 365 days, today included (got ${s.trailing_12m_thb})`);
assert(near(s.yoy_pct, ((1200 - 350) / 350) * 100, 1e-4), `YoY vs the 365 days before that (got ${s.yoy_pct})`);
assert(s.projected_12m_thb === 1200 && s.portfolio_yield_pct === 2 && s.yield_on_cost_pct === 3, `portfolio yield = projected / value, yield on cost = projected / cost basis (got ${s.portfolio_yield_pct}, ${s.yield_on_cost_pct})`);
assert(s.avg_monthly_thb === 100 && near(s.avg_daily_thb, Math.round((1200 / 365) * 100) / 100), 'averages: trailing / 12 and / 365');
const noPrior = summarizeDividends([ev('2026-05-01', 10)], { today: TODAY, totalValueThb: 0, costBasisThb: 0 });
assert(noPrior.yoy_pct === null && noPrior.portfolio_yield_pct === null && noPrior.yield_on_cost_pct === null, 'no prior-year income -> YoY null; zero value/cost -> yields null');

// --- Series bucketing (Bangkok calendar) ---
const all = [...h.events, ev('2026-10-01', 7), ev('2026-10-25', 5, 'projected')];
const monthly = buildDividendSeries('monthly', all, TODAY, '2025-06-02');
assert(monthly.length === 24 && monthly[0].period_start === '2025-11-01' && monthly[11].period_start === '2026-10-01' && monthly[23].period_start === '2027-10-01', `monthly: 11 past months + this month + 12 ahead (got ${monthly.length}, ${monthly[0].period_start}..${monthly[23].period_start})`);
assert(monthly[0].label === 'Nov 2025' && monthly[11].label === 'Oct 2026', 'monthly labels');
assert(monthly[11].received_thb === 7 && monthly[11].projected_thb === 5, 'this month holds both received so far and projected');
const sumOf = (series, key) => Math.round(series.reduce((acc, b) => acc + b[key], 0) * 100) / 100;
const projectedTotal = Math.round(all.filter((e) => e.kind === 'projected').reduce((a, e) => a + e.amount_thb, 0) * 100) / 100;
assert(near(sumOf(monthly, 'projected_thb'), projectedTotal, 0.011), 'monthly bars carry every projected amount');
const quarterly = buildDividendSeries('quarterly', all, TODAY, '2025-06-02');
assert(quarterly.length === 8 && quarterly[0].period_start === '2026-01-01' && quarterly[3].label === 'Q4 2026' && quarterly[7].label === 'Q4 2027', `quarterly: 3 past + this + 4 ahead (got ${quarterly.map((q) => q.label)})`);
assert(near(quarterly[0].received_thb, Math.round(2.6 * 33 * 100) / 100, 0.011) && near(sumOf(quarterly, 'projected_thb'), projectedTotal, 0.011), 'quarterly buckets: Q1 2026 received, all projected');
const annual = buildDividendSeries('annual', all, TODAY, '2025-06-02');
assert(annual.map((a) => a.label).join() === '2025,2026,2027', `annual: first lot's year through next year (got ${annual.map((a) => a.label)})`);
const year2026Received = all.filter((e) => e.kind === 'received' && e.ex_date.startsWith('2026')).reduce((a, e) => a + e.amount_thb, 0);
const year2026Projected = all.filter((e) => e.kind === 'projected' && e.ex_date.startsWith('2026')).reduce((a, e) => a + e.amount_thb, 0);
assert(near(annual[1].received_thb, year2026Received, 0.011) && near(annual[1].projected_thb, year2026Projected, 0.011) && annual[1].projected_thb > 0, 'current year = received so far + projected remainder (two parts)');
assert(annual[0].projected_thb === 0 && annual[2].received_thb === 0 && annual[2].projected_thb > 0, 'past year received only, next year projected only');
assert(near(sumOf(annual, 'received_thb'), Math.round(all.filter((e) => e.kind === 'received').reduce((a, e) => a + e.amount_thb, 0) * 100) / 100, 0.011), 'annual received sums to all-time received');
// A Bangkok date at a month edge stays in its own month.
const edgeSeries = buildDividendSeries('monthly', [ev('2026-09-30', 1), ev('2026-10-01', 2)], TODAY);
assert(edgeSeries[10].received_thb === 1 && edgeSeries[11].received_thb === 2, 'Sep 30 and Oct 1 land in their own months');

// --- Empty input ---
const empty = holdingDividends({ lots: [], events: [], currency: 'USD', today: TODAY });
assert(empty.events.length === 0 && empty.received === 0 && empty.projected_12m_thb === 0, 'no lots, no events -> zeros');
const emptySummary = summarizeDividends([], { today: TODAY, totalValueThb: 0, costBasisThb: 0 });
assert(emptySummary.trailing_12m_thb === 0 && emptySummary.projected_12m_thb === 0 && emptySummary.yoy_pct === null && emptySummary.avg_daily_thb === 0, 'empty summary');
const emptyAnnual = buildDividendSeries('annual', [], TODAY, null);
assert(emptyAnnual.map((a) => a.label).join() === '2026,2027' && buildDividendSeries('monthly', [], TODAY).every((b) => b.received_thb === 0 && b.projected_thb === 0), 'empty series: zero bars (annual: this year + next)');

process.exit(failures ? 1 : 0);
