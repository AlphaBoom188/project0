// Portfolio performance endpoint (GET /api/portfolio/:u/performance): real
// Yahoo/CoinGecko history, so values vary -- this checks structure, invariants
// and relationships (last point = total value, Today/All = portfolio totals,
// sorted in-range dates, rebased series), a deterministic flat manual-price
// portfolio (TWR 0% across a mid-range buy), validation, the empty user,
// cross-user isolation and `missing` for a bogus symbol.
const { BASE } = require('../lib');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const U = 'test_perf_001';
const GOLD = 'test_perf_002';
const EMPTY = 'test_perf_003';
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures++; };
const near = (a, b, eps = 0.02) => typeof a === 'number' && Math.abs(a - b) <= eps;
const api = (p, o = {}) =>
  fetch(`${BASE}/api${p}`, { headers: { 'Content-Type': 'application/json' }, ...o }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const post = (p, body) => api(p, { method: 'POST', body: JSON.stringify(body) });
const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() + 7 * 3600 * 1000 - n * 86400000).toISOString().slice(0, 10);

async function cleanup() {
  for (const u of [U, GOLD, EMPTY]) {
    await db.from('asset_lots').delete().eq('line_user_id', u);
    await db.from('asset_holdings').delete().eq('line_user_id', u);
    await db.from('users').delete().eq('line_user_id', u);
  }
}

(async () => {
  await cleanup();
  for (const u of [U, GOLD, EMPTY]) await post('/users', { line_user_id: u, display_name: 'Perf Test' });

  // U: a USD stock bought, topped up and partly sold; a THB stock; a bogus symbol.
  const aapl = await post(`/portfolio/${U}`, { asset_type: 'stock', symbol: 'AAPL', quantity: 2, average_cost: 200, trade_date: daysAgo(300) });
  const A = aapl.body.holding.id;
  await post(`/portfolio/${U}/${A}/lots`, { side: 'buy', quantity: 1, price: 220, fee: 1, trade_date: daysAgo(120) });
  await post(`/portfolio/${U}/${A}/lots`, { side: 'sell', quantity: 1, price: 240, trade_date: daysAgo(40) });
  await post(`/portfolio/${U}`, { asset_type: 'stock', symbol: 'PTT.BK', quantity: 100, average_cost: 32, trade_date: daysAgo(200) });
  const bogus = await post(`/portfolio/${U}`, { asset_type: 'stock', symbol: 'ZZZNOTREAL1', quantity: 1, average_cost: 50, trade_date: daysAgo(60) });
  // Fixed live prices (fresh) so the totals don't depend on a refresh.
  await db.from('asset_holdings').update({ current_price: 250, previous_close: 245, priced_at: new Date().toISOString() }).eq('id', A);
  await db.from('asset_holdings').update({ current_price: 55, priced_at: new Date().toISOString() }).eq('id', bogus.body.holding.id);

  // GOLD: manual-only, flat price, with a big mid-range buy at that same price.
  const gold = await post(`/portfolio/${GOLD}`, { asset_type: 'gold', symbol: 'GOLD-BAHT', quantity: 1, average_cost: 40000, current_price: 40000, trade_date: daysAgo(20) });
  await post(`/portfolio/${GOLD}/${gold.body.holding.id}/lots`, { side: 'buy', quantity: 9, price: 40000, trade_date: daysAgo(10) });

  // --- Validation + empty user ---
  const bad = await api(`/portfolio/${U}/performance?range=2w`);
  assert(bad.status === 400 && /range must be one of/.test(bad.body.error), `invalid range -> 400 (got ${bad.status})`);
  const empty = await api(`/portfolio/${EMPTY}/performance?range=1y`);
  assert(empty.status === 200 && Array.isArray(empty.body.points) && empty.body.points.length === 0, `user with no lots -> 200, no points (got ${empty.status})`);
  assert(empty.body.start_date === null && empty.body.end_date === today && empty.body.summary.total_value_thb === 0 && empty.body.missing.length === 0, 'empty response shape');
  const defaulted = await api(`/portfolio/${EMPTY}/performance`);
  assert(defaulted.body.range === '1y', 'range defaults to 1y');

  // --- Real portfolio, every range ---
  const portfolio = (await api(`/portfolio/${U}`)).body;
  const started = Date.now();
  const res = await api(`/portfolio/${U}/performance?range=1y`);
  const secs = (Date.now() - started) / 1000;
  const p = res.body;
  assert(res.status === 200, `1y performance -> 200 (got ${res.status} ${JSON.stringify(p).slice(0, 200)})`);
  assert(secs < 20, `answers in reasonable time (took ${secs.toFixed(1)}s)`);
  const last = p.points[p.points.length - 1];
  assert(p.start_date === daysAgo(300) && p.end_date === today, `1y start clipped to the first trade (got ${p.start_date} .. ${p.end_date})`);
  assert(p.points[0].date === p.start_date && last.date === today, 'first point = start date, last point = today');
  assert(p.points.length <= 120 && p.points.length > 50, `downsampled to <= 120 points (got ${p.points.length})`);
  assert(p.points.every((pt, i) => i === 0 || pt.date > p.points[i - 1].date), 'points sorted by date');
  assert(p.points.every((pt) => pt.date >= p.start_date && pt.date <= p.end_date), 'every point inside the range');
  assert(near(last.value_thb, p.summary.total_value_thb) && near(p.summary.total_value_thb, portfolio.totals.total_value),
    `last value_thb = summary.total_value_thb = portfolio total (got ${last.value_thb} / ${p.summary.total_value_thb} / ${portfolio.totals.total_value})`);
  assert(near(p.summary.all_gain_thb, portfolio.totals.total_gain) && near(p.summary.today_gain_thb, portfolio.totals.day_gain),
    `All / Today gains are the portfolio totals (got ${p.summary.all_gain_thb}, ${p.summary.today_gain_thb})`);
  const prevValue = portfolio.totals.total_value - portfolio.totals.day_gain;
  assert(near(p.summary.today_pct, (portfolio.totals.day_gain / prevValue) * 100, 0.001), `today_pct against the previous-close value (got ${p.summary.today_pct})`);
  assert(typeof p.summary.all_pct === 'number' && typeof p.summary.yesterday_gain_thb === 'number', 'all_pct and yesterday gain are numbers');
  assert(p.points[0].twr_pct === 0 && p.points[0].sp500_pct === 0, 'TWR and S&P 500 rebased to 0% at the range start');
  assert(p.points.every((pt) => typeof pt.value_thb === 'number' && typeof pt.invested_thb === 'number' && typeof pt.twr_pct === 'number'), 'value / invested / TWR present on every point');
  // Invested: AAPL 2x200 + 1x221 - 1x240 (USD) + PTT 3200 + ZZZ 50 USD, USD at roughly 28..40 THB.
  const usdNet = 400 + 221 - 240 + 50;
  assert(last.invested_thb > 3200 + usdNet * 28 && last.invested_thb < 3200 + usdNet * 40, `net invested in THB in the expected band (got ${last.invested_thb})`);
  assert(p.points[0].invested_thb > 400 * 28 && p.points[0].invested_thb < 400 * 40, `first day invested = the opening 2 x $200 at that day's rate (got ${p.points[0].invested_thb})`);

  assert(p.missing.length === 1 && p.missing[0].symbol === 'ZZZNOTREAL1' && p.missing[0].error, `missing lists only the bogus symbol (got ${JSON.stringify(p.missing)})`);
  const { sp500, set } = p.benchmarks;
  assert(sp500 && sp500.level > 1000 && typeof sp500.day_change_pct === 'number', `S&P 500 card (got ${JSON.stringify(sp500)})`);
  assert(near(sp500.range_change_pct, last.sp500_pct, 0.0001), 'S&P 500 range change = the last rebased point');
  assert(set && set.level > 500 && typeof set.day_change_pct === 'number' && near(set.range_change_pct, last.set_pct, 0.0001), `SET card (got ${JSON.stringify(set)})`);
  const firstSet = p.points.find((pt) => pt.set_pct !== null);
  assert(firstSet && firstSet.set_pct === 0, 'SET rebased to 0% at its first available day');

  for (const range of ['1m', '3m', '6m', 'ytd', '3y', '5y', 'all']) {
    const r = (await api(`/portfolio/${U}/performance?range=${range}`)).body;
    const ok = r.range === range && r.points.length > 0 && r.points.length <= 120 && r.points[0].date === r.start_date && r.points[r.points.length - 1].date === today
      && r.start_date >= daysAgo(300) && r.points[0].twr_pct === 0 && near(r.points[r.points.length - 1].value_thb, p.summary.total_value_thb);
    assert(ok, `${range}: in range, starts at 0%, ends at the total value (start ${r.start_date}, ${r.points.length} points)`);
  }
  const ytd = (await api(`/portfolio/${U}/performance?range=ytd`)).body;
  const jan1 = `${today.slice(0, 4)}-01-01`;
  assert(ytd.start_date === (jan1 > daysAgo(300) ? jan1 : daysAgo(300)), `ytd starts Jan 1 Bangkok (or the first trade) (got ${ytd.start_date})`);
  const oneMonth = (await api(`/portfolio/${U}/performance?range=1m`)).body;
  assert(oneMonth.points.length >= 28 && oneMonth.points.length <= 32, `1m is daily (got ${oneMonth.points.length} points)`);
  const all = (await api(`/portfolio/${U}/performance?range=all`)).body;
  assert(all.start_date === daysAgo(300), 'all starts at the first lot');

  // --- Deterministic: flat manual-price portfolio with a 9x top-up ---
  const g = (await api(`/portfolio/${GOLD}/performance?range=1m`)).body;
  assert(g.start_date === daysAgo(20) && g.points.length === 21, `gold-only 1m clipped to the first trade, one point per day (got ${g.start_date}, ${g.points.length})`);
  assert(g.points.every((pt) => pt.twr_pct === 0), 'flat price + big mid-range buy -> TWR 0% throughout');
  assert(g.points[0].value_thb === 40000 && g.points[g.points.length - 1].value_thb === 400000, 'value steps from 40,000 to 400,000 with the buy');
  assert(g.points[g.points.length - 1].invested_thb === 400000 && g.summary.total_value_thb === 400000 && g.summary.all_gain_thb === 0 && g.summary.all_pct === 0, 'invested = value, no gain');
  assert(g.summary.yesterday_gain_thb === 0 && g.missing.length === 0, 'yesterday 0, nothing missing (manual-only needs no history)');

  // --- Isolation: neither user's figures include the other's holdings ---
  assert(!p.points.some((pt) => pt.value_thb >= 400000) && p.summary.total_value_thb < 400000, "U's chart doesn't include GOLD's 400,000");
  assert(g.points.every((pt) => pt.value_thb <= 400000) && !g.missing.some((x) => x.symbol === 'ZZZNOTREAL1'), "GOLD's chart doesn't include U's holdings");
  const leak = await api(`/portfolio/${EMPTY}/performance?range=all`);
  assert(leak.body.points.length === 0, 'the empty user still sees nothing');

  await cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); await cleanup(); process.exit(1); });
