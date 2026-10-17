// Pure performance-chart math (services/performanceMath.js) -- no server or DB needed.
const m = require('../../services/performanceMath');

let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures++; };
const near = (a, b, eps = 1e-6) => typeof a === 'number' && Math.abs(a - b) < eps;
let seq = 0;
const lot = (side, quantity, price, trade_date, extra = {}) => ({
  id: `l${++seq}`, side, quantity, price, fee: 0, trade_date, created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, seq)).toISOString(), ...extra,
});
const flat = (days, v) => days.map(() => v);

// --- Range start on the Bangkok calendar, clipped to the first trade ---
assert(m.rangeStartYmd('1m', '2026-10-18', '2020-01-01') === '2026-09-18', '1m = same day last month');
assert(m.rangeStartYmd('1m', '2026-03-31', '2020-01-01') === '2026-02-28', '1m from Mar 31 clamps to Feb 28');
assert(m.rangeStartYmd('3m', '2026-10-18', '2020-01-01') === '2026-07-18', '3m');
assert(m.rangeStartYmd('6m', '2026-10-18', '2020-01-01') === '2026-04-18', '6m');
assert(m.rangeStartYmd('1y', '2024-02-29', '2020-01-01') === '2023-02-28', '1y from a leap day clamps to Feb 28');
assert(m.rangeStartYmd('3y', '2026-10-18', '2020-01-01') === '2023-10-18' && m.rangeStartYmd('5y', '2026-10-18', '2020-01-01') === '2021-10-18', '3y / 5y');
assert(m.rangeStartYmd('ytd', '2026-10-18', '2020-01-01') === '2026-01-01', 'ytd starts on Jan 1 of the Bangkok year');
// 2026-12-31T20:00Z is already Jan 1 2027 in Bangkok -- the endpoint passes getBangkokYmd(), so YTD follows it.
const { getBangkokYmd } = require('../../services/bangkokDay');
assert(m.rangeStartYmd('ytd', getBangkokYmd(new Date('2026-12-31T20:00:00Z')), '2020-01-01') === '2027-01-01', 'ytd uses the Bangkok date (UTC Dec 31 evening = Bangkok Jan 1)');
assert(m.rangeStartYmd('all', '2026-10-18', '2025-05-05') === '2025-05-05', 'all starts at the first trade');
assert(m.rangeStartYmd('1y', '2026-10-18', '2026-08-01') === '2026-08-01', 'a range is clipped to the first trade date');
assert(m.rangeStartYmd('ytd', '2026-10-18', '2026-03-10') === '2026-03-10', 'ytd clipped too');
assert(m.rangeStartYmd('1y', '2026-10-18', null) === null, 'no lots -> no start');
assert(m.PERFORMANCE_RANGES.join() === '1m,3m,6m,ytd,1y,3y,5y,all', 'range list');

const days = m.eachDay('2026-02-26', '2026-03-03');
assert(days.join() === '2026-02-26,2026-02-27,2026-02-28,2026-03-01,2026-03-02,2026-03-03', `eachDay crosses month ends (got ${days})`);

// --- Forward-fill across gaps ---
const closes = [{ date: '2026-02-27', close: 10 }, { date: '2026-03-02', close: 12 }];
assert(m.forwardFill(closes, days).join() === '10,10,10,10,12,12', 'before the first close -> first close; weekend gap filled from Friday');
assert(m.forwardFill(closes, days, { backfill: false }).join() === ',10,10,10,12,12', 'backfill:false leaves days before the series null');
assert(m.forwardFill([], days).every((v) => v === null), 'empty series -> nulls');

// --- Open quantity with buys/sells mid-range ---
const d = m.eachDay('2026-03-01', '2026-03-05');
const lots = [lot('buy', 10, 100, '2026-03-02'), lot('sell', 4, 120, '2026-03-04'), lot('buy', 1, 110, '2026-03-04')];
assert(m.openQuantityByDay(lots, d).join() === '0,10,10,7,7', `open quantity per day (got ${m.openQuantityByDay(lots, d)})`);

// --- Daily valuation, flows, FX conversion ---
let s = m.dailySeries(d, [{ lots, prices: [100, 100, 110, 120, 120], fx: flat(d, 1) }]);
assert(s.value.join() === '0,1000,1100,840,840', `value = open quantity x close (got ${s.value})`);
assert(s.buys.join() === '0,1000,0,110,0' && s.sells.join() === '0,0,0,480,0', `cash flows on trade days (got ${s.buys} / ${s.sells})`);
assert(m.netInvested(s.buys, s.sells).join() === '0,1000,1000,630,630', 'net invested = buys - sells, cumulative');

const usdLots = [lot('buy', 2, 50, '2026-03-02', { fee: 1 })];
const fx = [35, 35, 36, 36, 34];
s = m.dailySeries(d, [{ lots: usdLots, prices: [50, 50, 55, 55, 55], fx }]);
assert(near(s.value[2], 2 * 55 * 36) && near(s.value[4], 2 * 55 * 34), `USD holding valued at that day's USD->THB (got ${s.value})`);
assert(near(s.buys[1], 101 * 35), `USD buy (incl. fee) converted at the trade day's rate (got ${s.buys[1]})`);
const sellUsd = [...usdLots, lot('sell', 1, 60, '2026-03-05', { fee: 2 })];
s = m.dailySeries(d, [{ lots: sellUsd, prices: flat(d, 50), fx }]);
assert(near(s.sells[4], 58 * 34), `sell proceeds net of fee at that day's rate (got ${s.sells[4]})`);
s = m.dailySeries(d, [
  { lots: [lot('buy', 1, 100, '2026-03-01')], prices: flat(d, 100), fx: flat(d, 1) },
  { lots: [lot('buy', 1, 10, '2026-03-01')], prices: flat(d, 10), fx: flat(d, 30) },
]);
assert(s.value.every((v) => v === 400), 'THB + USD holdings summed in THB');
s = m.dailySeries(d, [{ lots: [lot('buy', 1, 100, '2026-02-01')], prices: flat(d, 100), fx: flat(d, 1) }]);
assert(s.buys[0] === 100 && s.value[0] === 100, 'a lot before the first day counts on the first day');

// --- TWR: a big buy mid-period doesn't change it when prices are flat ---
const d10 = m.eachDay('2026-03-01', '2026-03-10');
s = m.dailySeries(d10, [{ lots: [lot('buy', 1, 100, '2026-03-01'), lot('buy', 100, 100, '2026-03-05')], prices: flat(d10, 100), fx: flat(d10, 1) }]);
let twr = m.chainTwr(s.value, s.buys, s.sells);
assert(s.value[9] === 10100 && twr.every((v) => near(v, 0)), `flat prices + a 100x deposit-like buy -> TWR stays 0% (got ${twr[9]})`);

// Price +10% then the big buy, then +10% again: TWR = 1.1 x 1.1 - 1 = 21%, regardless of the buy.
const prices = [100, 100, 110, 110, 110, 110, 121, 121, 121, 121];
s = m.dailySeries(d10, [{ lots: [lot('buy', 1, 100, '2026-03-01'), lot('buy', 50, 110, '2026-03-05')], prices, fx: flat(d10, 1) }]);
twr = m.chainTwr(s.value, s.buys, s.sells);
assert(near(twr[9], 21, 1e-9), `TWR chain-links +10% and +10% to +21% across a mid-period buy (got ${twr[9]})`);
s = m.dailySeries(d10, [{ lots: [lot('buy', 1, 100, '2026-03-01')], prices, fx: flat(d10, 1) }]);
assert(near(m.chainTwr(s.value, s.buys, s.sells)[9], 21, 1e-9), 'same TWR without the buy');

// A full sell mid-period: the return up to the sell counts, nothing after it.
s = m.dailySeries(d10, [{ lots: [lot('buy', 2, 100, '2026-03-01'), lot('sell', 2, 110, '2026-03-03')], prices, fx: flat(d10, 1) }]);
twr = m.chainTwr(s.value, s.buys, s.sells);
assert(near(twr[2], 10) && near(twr[9], 10), `sold out at +10% -> TWR stays +10% (got ${twr[2]}, ${twr[9]})`);
assert(twr[0] === 0, 'TWR is 0% on the first day');
// Buy on the first day of a later range: the day's own gain counts from cost.
assert(near(m.dayReturn(0, 105, 100, 0), 0.05) && m.dayReturn(0, 0, 0, 0) === 0, 'dayReturn from cost / with nothing invested');

// --- Benchmark rebasing ---
const r = m.rebasePercent([null, 200, 210, 190]);
assert(r[0] === null && r[1] === 0 && near(r[2], 5) && near(r[3], -5), `rebase to 0% at the first available day (got ${r})`);

// --- Fallback price for holdings with no history ---
assert(m.fallbackPrice({ current_price: '42000', average_cost: 40000 }, []) === 42000, 'fallback: current_price first');
assert(m.fallbackPrice({ current_price: null, average_cost: 40000 }, []) === 40000, 'fallback: average cost without a price');
assert(m.fallbackPrice({ current_price: null, average_cost: 0 }, [lot('buy', 1, 10, '2026-01-01'), lot('buy', 3, 30, '2026-01-02'), lot('sell', 4, 50, '2026-01-03')]) === 25,
  'fallback: average buy price once fully sold');

// --- Downsampling ---
const many = m.eachDay('2021-10-18', '2026-10-18').map((date) => ({ date }));
const down = m.downsample(many, 120);
assert(down.length <= 120 && down.length >= 100, `5y of days downsampled to <= 120 (got ${down.length})`);
assert(down[0] === many[0] && down[down.length - 1] === many[many.length - 1], 'downsampling keeps the first and last point');
assert(down.every((p, i) => i === 0 || p.date > down[i - 1].date), 'downsampled points stay in order');
const few = many.slice(0, 31);
assert(m.downsample(few, 120) === few, 'short series untouched');
assert(m.downsample(many.slice(0, 121), 120).length === 120, 'one over the limit -> exactly the limit');

process.exit(failures ? 1 : 0);
