// Pure FIFO lot math (services/lotMath.js) -- no server or DB needed.
const { computeLotSummary, sortLots, lotTotal, LotValidationError } = require('../../services/lotMath');

let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures++; };
const near = (a, b, eps = 1e-6) => a !== null && Math.abs(a - b) < eps;
let seq = 0;
// created_at increases with every lot built, so same-day lots keep build order unless overridden.
const lot = (side, quantity, price, trade_date, extra = {}) => ({
  id: `l${++seq}`, side, quantity, price, fee: 0, trade_date, created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, seq)).toISOString(), ...extra,
});
const throwsValidation = (lots) => {
  try { computeLotSummary(lots); return null; } catch (e) { return e instanceof LotValidationError ? e.message : `wrong error: ${e.message}`; }
};

// --- Empty history ---
let s = computeLotSummary([]);
assert(s.quantity === 0 && s.cost_basis === 0 && s.average_cost === 0 && s.realized_gain === 0, 'no lots -> zero position');
assert(s.win_rate === null && s.lots_open === 0 && s.lots_closed === 0, 'no lots -> win_rate null, 0 open / 0 closed');

// --- Single buy, fee in cost basis ---
s = computeLotSummary([lot('buy', 10, 100, '2026-01-02', { fee: 5 })]);
assert(s.quantity === 10 && s.cost_basis === 1005, `buy fee adds to cost basis (got ${s.cost_basis})`);
assert(near(s.average_cost, 100.5), `average cost includes the fee (got ${s.average_cost})`);
assert(s.fees === 5 && s.lots_open === 1 && s.lots_closed === 0, 'fees total + 1 open lot');

// --- Two buys, partial sell consumes the first FIFO ---
const b1 = lot('buy', 10, 100, '2026-01-02');
const b2 = lot('buy', 10, 200, '2026-01-05');
const sell1 = lot('sell', 5, 150, '2026-01-10', { fee: 2 });
s = computeLotSummary([b1, b2, sell1]);
assert(s.quantity === 15, `open quantity after partial sell (got ${s.quantity})`);
assert(near(s.cost_basis, 500 + 2000), `open cost = remaining half of buy 1 + all of buy 2 (got ${s.cost_basis})`);
assert(near(s.average_cost, 2500 / 15), `average cost of the open position (got ${s.average_cost})`);
assert(near(s.realized_gain, 5 * 150 - 2 - 500), `realized = proceeds - fee - FIFO cost (got ${s.realized_gain})`);
assert(s.lots_open === 2 && s.lots_closed === 0 && s.win_rate === null, 'partial close: both buys still open, no win rate');
assert(s.per_lot[b1.id].remaining_quantity === 5 && !s.per_lot[b1.id].is_closed, 'per-lot: buy 1 half remaining, open');
assert(near(s.per_lot[sell1.id].realized_gain, 248), `per-lot: sell realized gain (got ${s.per_lot[sell1.id].realized_gain})`);

// --- Sell spanning two buys closes the first; win rate counts it ---
const sell2 = lot('sell', 10, 180, '2026-01-12');
s = computeLotSummary([b1, b2, sell1, sell2]);
assert(s.quantity === 5 && near(s.cost_basis, 1000), `sell spanning lots: 5 left of buy 2 (got ${s.quantity} / ${s.cost_basis})`);
// sell2 consumes 5 of b1 (cost 500) + 5 of b2 (cost 1000): proceeds 1800 -> +300
assert(near(s.realized_gain, 248 + 300), `realized accumulates across sells (got ${s.realized_gain})`);
assert(s.lots_open === 1 && s.lots_closed === 1, `Lots: 1 open / 1 closed (got ${s.lots_open} / ${s.lots_closed})`);
// b1 proceeds: 748 (from sell1) + 900 (half of sell2) = 1648 vs cost 1000 -> win
assert(s.win_rate === 100 && s.per_lot[b1.id].is_closed, `closed winning lot -> win rate 100 (got ${s.win_rate})`);
assert(near(s.per_lot[b1.id].realized_gain, 648), `per-lot: closed buy realized gain (got ${s.per_lot[b1.id].realized_gain})`);

// --- Losing closed lot -> win rate 50 ---
const b3 = lot('buy', 1, 1000, '2026-02-01');
const b4 = lot('buy', 1, 1000, '2026-02-02');
s = computeLotSummary([b3, b4, lot('sell', 1, 1200, '2026-02-03'), lot('sell', 1, 800, '2026-02-04')]);
assert(s.lots_closed === 2 && s.win_rate === 50, `one win + one loss -> 50% (got ${s.win_rate})`);
assert(s.quantity === 0 && s.cost_basis === 0 && s.average_cost === 0, 'fully sold -> quantity 0, cost 0, average 0');
assert(near(s.realized_gain, 0), `+200 and -200 realized net to 0 (got ${s.realized_gain})`);

// --- Break-even closed lot is not a win ---
s = computeLotSummary([lot('buy', 2, 50, '2026-03-01'), lot('sell', 2, 50, '2026-03-02')]);
assert(s.win_rate === 0, `break-even closed lot is not a win (got ${s.win_rate})`);

// --- Sell fee can turn a gain into a loss ---
s = computeLotSummary([lot('buy', 1, 100, '2026-03-01', { fee: 1 }), lot('sell', 1, 101, '2026-03-02', { fee: 1 })]);
assert(near(s.realized_gain, -1) && s.win_rate === 0 && s.fees === 2, `fees on both sides: 100 - 102 = -1 (got ${s.realized_gain})`);

// --- Fractional shares to 6 decimals, no float drift ---
const fb = [lot('buy', 0.1, 311.69, '2026-04-01'), lot('buy', 0.2, 311.69, '2026-04-01'), lot('buy', 0.13186, 311.69, '2026-04-02')];
s = computeLotSummary([...fb, lot('sell', 0.3, 320, '2026-04-03')]);
assert(s.quantity === 0.13186, `0.1 + 0.2 + 0.13186 - 0.3 = 0.13186 exactly (got ${s.quantity})`);
assert(s.lots_closed === 2 && s.lots_open === 1, 'the 0.1 and 0.2 lots are fully closed');
s = computeLotSummary([lot('buy', 1.000001, 10, '2026-04-01'), lot('sell', 1, 10, '2026-04-02')]);
assert(s.quantity === 0.000001 && s.lots_open === 1, `a millionth of a share stays open (got ${s.quantity})`);
assert(throwsValidation([lot('buy', 0.333333, 1, '2026-04-01'), lot('sell', 0.333334, 1, '2026-04-02')]) !== null, 'selling one micro-share more than held is rejected');

// --- Sell over holding is rejected ---
let msg = throwsValidation([lot('buy', 5, 10, '2026-05-01'), lot('sell', 6, 10, '2026-05-02')]);
assert(msg !== null && /exceeds the 5 shares/.test(msg), `sell larger than holding -> LotValidationError (got "${msg}")`);
msg = throwsValidation([lot('sell', 1, 10, '2026-05-01')]);
assert(msg !== null, 'sell with no prior buys is rejected');
// The buy exists in total, but only after the sell's date.
msg = throwsValidation([lot('sell', 5, 10, '2026-05-01'), lot('buy', 5, 10, '2026-05-02')]);
assert(msg !== null && /2026-05-01/.test(msg), `sell dated before the buy is rejected (got "${msg}")`);

// --- Same-day ordering by created_at ---
const early = '2026-01-01T00:00:00Z';
const late = '2026-01-01T00:00:10Z';
const sameDaySell = lot('sell', 5, 10, '2026-06-01', { created_at: early });
const sameDayBuy = lot('buy', 5, 10, '2026-06-01', { created_at: late });
assert(throwsValidation([sameDayBuy, sameDaySell]) !== null, 'same day: a sell created before the buy is rejected');
assert(throwsValidation([{ ...sameDaySell, created_at: late }, { ...sameDayBuy, created_at: early }]) === null, 'same day: buy created first, then sell -> valid');
// A lot not yet inserted (no created_at) sorts last within its day.
assert(throwsValidation([{ ...sameDayBuy, created_at: early }, { side: 'sell', quantity: 5, price: 10, trade_date: '2026-06-01' }]) === null, 'new lot without created_at sorts after existing same-day lots');
const order = sortLots([lot('buy', 1, 1, '2026-07-02'), lot('buy', 1, 1, '2026-07-01', { created_at: late }), lot('buy', 1, 1, '2026-07-01', { created_at: early })]);
assert(order[0].created_at === early && order[1].created_at === late && order[2].trade_date === '2026-07-02', 'sortLots: trade_date, then created_at');

// --- FIFO by trade date, not by input order ---
const later = lot('buy', 1, 300, '2026-08-05');
const earlier = lot('buy', 1, 100, '2026-08-01');
s = computeLotSummary([later, earlier, lot('sell', 1, 200, '2026-08-10')]);
assert(near(s.realized_gain, 100) && s.per_lot[earlier.id].is_closed && !s.per_lot[later.id].is_closed, `FIFO follows trade_date, not array order (got ${s.realized_gain})`);

// --- Numeric strings from Postgres are handled ---
s = computeLotSummary([{ id: 'x', side: 'buy', quantity: '2.500000', price: '40.0000', fee: '1.0000', trade_date: '2026-09-01', created_at: early }]);
assert(s.quantity === 2.5 && s.cost_basis === 101, `NUMERIC strings parse (got ${s.quantity} / ${s.cost_basis})`);

// --- lotTotal ---
assert(lotTotal({ side: 'buy', quantity: 0.43186, price: 311.69, fee: 1 }) === 135.606443, `buy total = shares x price + fee (got ${lotTotal({ side: 'buy', quantity: 0.43186, price: 311.69, fee: 1 })})`);
assert(lotTotal({ side: 'sell', quantity: 2, price: 10, fee: 1 }) === 19, 'sell total = shares x price - fee');

process.exit(failures ? 1 : 0);
