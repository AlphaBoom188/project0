// Investment lots (migration 015): lot endpoints, the holding cache recompute,
// FIFO realized gain / win rate through the API, validation, cross-user 404s,
// currency defaults, day's gain, and THB totals consistent with fx_usd_thb.
const { BASE } = require('../lib');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const U = 'test_lots_001';
const OTHER = 'test_lots_002';
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures++; };
const near = (a, b, eps = 0.0001) => typeof a === 'number' && Math.abs(a - b) < eps;
const api = (p, o = {}) =>
  fetch(`${BASE}/api${p}`, { headers: { 'Content-Type': 'application/json' }, ...o }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const post = (p, body) => api(p, { method: 'POST', body: JSON.stringify(body) });
const put = (p, body) => api(p, { method: 'PUT', body: JSON.stringify(body) });
const del = (p) => api(p, { method: 'DELETE' });

async function cleanup() {
  for (const u of [U, OTHER]) {
    await db.from('asset_lots').delete().eq('line_user_id', u);
    await db.from('asset_holdings').delete().eq('line_user_id', u);
    await db.from('users').delete().eq('line_user_id', u);
  }
}
const cachedRow = async (id) => (await db.from('asset_holdings').select('quantity, average_cost').eq('id', id).single()).data;
const lotCount = async (holdingId) => (await db.from('asset_lots').select('id').eq('holding_id', holdingId)).data.length;

(async () => {
  await cleanup();
  await post('/users', { line_user_id: U, display_name: 'Lots Test' });
  await post('/users', { line_user_id: OTHER, display_name: 'Lots Other' });

  // --- Create: holding + opening buy lot, currency defaults ---
  const nvda = await post(`/portfolio/${U}`, { asset_type: 'stock', symbol: 'NVDA', name: 'NVIDIA', quantity: 10, average_cost: 100, trade_date: '2026-01-05' });
  assert(nvda.status === 201 && nvda.body.holding.currency === 'USD', `US stock defaults to USD (got ${nvda.status} ${nvda.body.holding?.currency})`);
  assert(nvda.body.holding.lots_open === 1 && nvda.body.holding.quantity === 10, 'create holding adds one opening buy lot');
  const H = nvda.body.holding.id;
  const ptt = await post(`/portfolio/${U}`, { asset_type: 'stock', symbol: 'ptt.bk', quantity: 100, average_cost: 30, trade_date: '2026-02-01' });
  assert(ptt.body.holding?.currency === 'THB', `.BK symbol (any case) defaults to THB (got ${ptt.body.holding?.currency})`);
  const gold = await post(`/portfolio/${U}`, { asset_type: 'gold', symbol: 'GOLD-BAHT', quantity: 2, average_cost: 40000, current_price: 42000 });
  assert(gold.body.holding?.currency === 'THB', 'gold defaults to THB');
  const explicit = await post(`/portfolio/${U}`, { asset_type: 'crypto', symbol: 'bitcoin', quantity: 0.01, average_cost: 3000000, currency: 'THB' });
  assert(explicit.body.holding?.currency === 'THB', 'an explicit currency overrides the default');
  const badCur = await post(`/portfolio/${U}`, { asset_type: 'stock', symbol: 'X', quantity: 1, average_cost: 1, currency: 'EUR' });
  assert(badCur.status === 400, `unsupported currency rejected (got ${badCur.status})`);
  const futureCreate = await post(`/portfolio/${U}`, { asset_type: 'stock', symbol: 'X', quantity: 1, average_cost: 1, trade_date: '2999-01-01' });
  assert(futureCreate.status === 400, `future trade_date on create rejected (got ${futureCreate.status})`);

  const opening = await api(`/portfolio/${U}/${H}/lots`);
  assert(opening.status === 200 && opening.body.lots.length === 1 && opening.body.lots[0].side === 'buy' && opening.body.lots[0].trade_date === '2026-01-05', 'opening lot dated trade_date');
  const todayLot = await api(`/portfolio/${U}/${gold.body.holding.id}/lots`);
  const bangkokToday = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  assert(todayLot.body.lots[0].trade_date === bangkokToday, `opening lot defaults to today's Bangkok date (got ${todayLot.body.lots[0]?.trade_date})`);

  // --- Add a buy with a fee: cache recomputed ---
  const buy2 = await post(`/portfolio/${U}/${H}/lots`, { side: 'buy', quantity: 10, price: 200, fee: 5, trade_date: '2026-02-01', comment: 'adding' });
  assert(buy2.status === 201 && buy2.body.lot.total === 2005, `buy lot created, total = shares x price + fee (got ${buy2.status} ${buy2.body.lot?.total})`);
  assert(near(buy2.body.holding.cost_basis, 3005) && near(buy2.body.holding.average_cost, 150.25), `buy fee in cost basis (got ${buy2.body.holding?.cost_basis})`);
  let row = await cachedRow(H);
  assert(parseFloat(row.quantity) === 20 && parseFloat(row.average_cost) === 150.25, `holding cache recomputed after create (got ${JSON.stringify(row)})`);
  const buy2Id = buy2.body.lot.id;

  // --- Sell: FIFO realized gain, closed lot, win rate ---
  const sell = await post(`/portfolio/${U}/${H}/lots`, { side: 'sell', quantity: 15, price: 180, fee: 3, trade_date: '2026-03-01' });
  // proceeds 2700 - 3 = 2697; FIFO cost = all of lot 1 (1000) + half of lot 2 (1002.5)
  assert(sell.status === 201 && near(sell.body.holding.realized_gain, 694.5), `FIFO realized gain via API (got ${sell.body.holding?.realized_gain})`);
  assert(sell.body.holding.quantity === 5 && near(sell.body.holding.cost_basis, 1002.5), 'open position after the sell');
  assert(sell.body.holding.lots_open === 1 && sell.body.holding.lots_closed === 1 && sell.body.holding.win_rate === 100, 'Lots: 1 open / 1 closed, win rate 100');
  assert(sell.body.lot.total === 2697, 'sell total = shares x price - fee');
  const sellId = sell.body.lot.id;
  row = await cachedRow(H);
  assert(parseFloat(row.quantity) === 5, `cache quantity after sell (got ${row.quantity})`);

  const states = await api(`/portfolio/${U}/${H}/lots`);
  const openingState = states.body.lots.find((l) => l.trade_date === '2026-01-05');
  const buy2State = states.body.lots.find((l) => l.id === buy2Id);
  assert(openingState.is_closed === true && buy2State.is_closed === false && buy2State.remaining_quantity === 5, 'per-lot open/closed state');
  assert(states.body.lots[0].id === sellId, 'holding lots are newest trade first');

  // --- Validation: nothing written on a 400 ---
  const before = await lotCount(H);
  const oversell = await post(`/portfolio/${U}/${H}/lots`, { side: 'sell', quantity: 6, price: 1, trade_date: '2026-04-01' });
  assert(oversell.status === 400 && /exceeds/.test(oversell.body.error), `sell over holding -> 400 (got ${oversell.status} ${oversell.body.error})`);
  const early = await post(`/portfolio/${U}/${H}/lots`, { side: 'sell', quantity: 1, price: 1, trade_date: '2026-01-01' });
  assert(early.status === 400, `sell dated before any buy -> 400 (got ${early.status})`);
  for (const [body, label] of [
    [{ side: 'hold', quantity: 1, price: 1 }, 'bad side'],
    [{ side: 'buy', quantity: 0, price: 1 }, 'zero quantity'],
    [{ side: 'buy', quantity: 1, price: -1 }, 'negative price'],
    [{ side: 'buy', quantity: 1 }, 'missing price'],
    [{ side: 'buy', quantity: 1, price: 1, fee: -1 }, 'negative fee'],
    [{ side: 'buy', quantity: 1, price: 1, trade_date: '2026-02-30' }, 'invalid date'],
    [{ side: 'buy', quantity: 1, price: 1, trade_date: '2999-01-01' }, 'future date'],
  ]) {
    const r = await post(`/portfolio/${U}/${H}/lots`, body);
    assert(r.status === 400, `${label} -> 400 (got ${r.status} ${r.body.error})`);
  }
  assert((await lotCount(H)) === before, 'rejected lots wrote nothing');

  // --- Edit: invalid history rejected, valid edit recomputes ---
  const shrink = await put(`/portfolio/${U}/lots/${buy2Id}`, { quantity: 4 });
  assert(shrink.status === 400, `editing a buy so the later sell exceeds holdings -> 400 (got ${shrink.status})`);
  const unchanged = (await db.from('asset_lots').select('quantity').eq('id', buy2Id).single()).data;
  assert(parseFloat(unchanged.quantity) === 10, 'rejected edit left the lot unchanged');
  const reprice = await put(`/portfolio/${U}/lots/${sellId}`, { price: 200 });
  assert(reprice.status === 200 && near(reprice.body.holding.realized_gain, 994.5), `editing the sell price recomputes realized gain (got ${reprice.body.holding?.realized_gain})`);
  assert(reprice.body.lot.side === 'sell' && parseFloat(reprice.body.lot.quantity) === 15, 'partial edit keeps the other fields');

  // --- Delete: invalid history rejected, valid delete recomputes ---
  const openingId = openingState.id;
  const delBuy = await del(`/portfolio/${U}/lots/${openingId}`);
  assert(delBuy.status === 400, `deleting a buy the sell depends on -> 400 (got ${delBuy.status})`);
  assert((await lotCount(H)) === 3, 'rejected delete removed nothing');
  const delSell = await del(`/portfolio/${U}/lots/${sellId}`);
  assert(delSell.status === 200 && delSell.body.holding.quantity === 20 && delSell.body.holding.realized_gain === 0 && delSell.body.holding.win_rate === null, 'deleting the sell restores the position');
  row = await cachedRow(H);
  assert(parseFloat(row.quantity) === 20, `cache recomputed after delete (got ${row.quantity})`);

  // --- Fully sold holding stays listed as a closed position ---
  const PTT = ptt.body.holding.id;
  await post(`/portfolio/${U}/${PTT}/lots`, { side: 'sell', quantity: 100, price: 35, trade_date: '2026-03-01' });
  row = await cachedRow(PTT);
  assert(parseFloat(row.quantity) === 0, `fully sold -> cached quantity 0 (got ${row.quantity})`);

  // --- PUT holding: currency ok, quantity/average_cost rejected ---
  const curChange = await put(`/portfolio/${U}/${explicit.body.holding.id}`, { currency: 'USD' });
  assert(curChange.status === 200 && curChange.body.holding.currency === 'USD', 'PUT can change currency');
  const curBad = await put(`/portfolio/${U}/${explicit.body.holding.id}`, { currency: 'JPY' });
  assert(curBad.status === 400, 'PUT rejects an unsupported currency');
  const qtyPut = await put(`/portfolio/${U}/${H}`, { average_cost: 1 });
  assert(qtyPut.status === 400 && /lot/.test(qtyPut.body.error), 'PUT average_cost -> 400 pointing at lots');

  // --- Day's gain: (current - previous_close) x open quantity ---
  const G = gold.body.holding.id;
  await db.from('asset_holdings').update({ previous_close: 41000 }).eq('id', G);

  // --- Portfolio: per-holding fields + THB totals consistent with fx_usd_thb ---
  const pf = await api(`/portfolio/${U}`);
  const fx = pf.body.fx_usd_thb;
  assert(pf.status === 200 && typeof fx === 'number' && fx > 10 && fx < 100, `fx_usd_thb present (got ${fx})`);
  const byId = Object.fromEntries(pf.body.holdings.map((h) => [h.id, h]));
  const pttH = byId[PTT];
  assert(pttH && pttH.quantity === 0 && near(pttH.realized_gain, 500) && near(pttH.total_gain, 500) && pttH.lots_closed === 1, `closed position listed with realized gain (got ${JSON.stringify(pttH && { q: pttH.quantity, r: pttH.realized_gain })})`);
  assert(near(pttH.realized_gain_thb, 500), 'THB holding: *_thb equals own-currency figures');
  const goldH = byId[G];
  assert(near(goldH.day_gain, 2000) && near(goldH.day_gain_percent, (1000 / 41000) * 100), `day gain from previous_close (got ${goldH.day_gain} / ${goldH.day_gain_percent})`);
  assert(byId[H].day_gain === null, 'day gain null without a price/previous close');
  const nvdaH = byId[H];
  assert(near(nvdaH.market_value_thb, nvdaH.market_value * fx, 0.01) && near(nvdaH.cost_basis_thb, nvdaH.cost_basis * fx, 0.01), 'USD holding: *_thb = own-currency x fx_usd_thb');
  const sumOf = (k) => pf.body.holdings.reduce((acc, h) => acc + h[k], 0);
  assert(near(pf.body.totals.total_value, sumOf('market_value_thb'), 0.01), 'totals.total_value = sum of market_value_thb');
  assert(near(pf.body.totals.total_gain, sumOf('total_gain_thb'), 0.01), 'totals.total_gain = unrealized + realized, in THB');
  assert(near(pf.body.totals.realized_gain, 500, 0.01) && near(pf.body.totals.day_gain, 2000, 0.01), 'totals realized + day gain in THB');
  const allocSum = Object.values(pf.body.allocation_by_type).reduce((a, b) => a + b, 0);
  assert(near(allocSum, 100, 0.001), `allocation sums to 100% (got ${allocSum})`);
  for (const key of ['unrealized_gain', 'unrealized_gain_percent', 'fees', 'total_gain_percent', 'win_rate', 'lots_open', 'lots_closed', 'total_gain_thb', 'day_gain_thb']) {
    if (!(key in nvdaH)) assert(false, `holding has ${key}`);
  }
  assert(near(nvdaH.fees, 5), `fees total (got ${nvdaH.fees})`);

  // --- All lots for the Transactions tab ---
  const all = await api(`/portfolio/${U}/lots`);
  const dates = all.body.lots.map((l) => l.trade_date);
  assert(all.status === 200 && all.body.lots.length === 6, `GET /lots returns every lot (got ${all.body.lots?.length})`);
  assert(dates.every((d, i) => i === 0 || dates[i - 1] >= d), 'GET /lots newest trade_date first');
  const pttSell = all.body.lots.find((l) => l.holding_id === PTT && l.side === 'sell');
  assert(pttSell.holding.symbol === 'ptt.bk' && pttSell.holding.currency === 'THB' && pttSell.holding.asset_type === 'stock' && pttSell.total === 3500, 'lots carry holding symbol/currency/asset_type + total');

  // --- Cross-user: another user's holding/lot is a 404 and stays untouched ---
  const lotId = buy2Id;
  assert((await api(`/portfolio/${OTHER}/${H}/lots`)).status === 404, "GET another user's holding lots -> 404");
  assert((await post(`/portfolio/${OTHER}/${H}/lots`, { side: 'buy', quantity: 1, price: 1 })).status === 404, "POST a lot on another user's holding -> 404");
  const xPut = await put(`/portfolio/${OTHER}/lots/${lotId}`, { price: 1 });
  assert(xPut.status === 404 && xPut.body.error === 'Lot not found', `PUT another user's lot -> 404 (got ${xPut.status} ${JSON.stringify(xPut.body)})`);
  assert((await del(`/portfolio/${OTHER}/lots/${lotId}`)).status === 404, "DELETE another user's lot -> 404");
  assert((await lotCount(H)) === 2, "another user's lot writes changed nothing");
  assert((await api(`/portfolio/${OTHER}/lots`)).body.lots.length === 0, "GET /lots doesn't leak another user's lots");
  const bad = await put(`/portfolio/${U}/lots/not-a-uuid`, { price: 1 });
  assert(bad.status === 400 && bad.body.error === 'Invalid lot id', `malformed lot id -> 400 (got ${bad.status} ${bad.body.error})`);

  // --- Deleting a holding removes its lots ---
  await del(`/portfolio/${U}/${PTT}`);
  assert((await lotCount(PTT)) === 0, 'deleting a holding cascades to its lots');

  await cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); await cleanup(); process.exit(1); });
