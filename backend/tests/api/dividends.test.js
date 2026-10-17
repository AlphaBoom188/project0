// Dividends endpoint (GET /api/portfolio/:u/dividends): real Yahoo dividend
// events, so amounts vary -- this checks structure, invariants and
// relationships (received ex-dates on/before today, projected after it and
// within a year, shares held before each ex-date, series sums = summary and
// per-holding figures, yields against the portfolio totals), the cached
// per-holding fields on GET /portfolio/:u, a crypto/gold-only user,
// validation, the empty user, cross-user isolation and `missing`.
const { BASE } = require('../lib');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const U = 'test_div_001';
const NOSRC = 'test_div_002';
const EMPTY = 'test_div_003';
const OTHER = 'test_div_004';
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures++; };
const near = (a, b, eps = 0.02) => typeof a === 'number' && Math.abs(a - b) <= eps;
const api = (p, o = {}) =>
  fetch(`${BASE}/api${p}`, { headers: { 'Content-Type': 'application/json' }, ...o }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const post = (p, body) => api(p, { method: 'POST', body: JSON.stringify(body) });
const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const inAYear = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;
const sum = (rows, key) => rows.reduce((acc, r) => acc + r[key], 0);

async function cleanup() {
  for (const u of [U, NOSRC, EMPTY, OTHER]) {
    await db.from('asset_lots').delete().eq('line_user_id', u);
    await db.from('asset_holdings').delete().eq('line_user_id', u);
    await db.from('users').delete().eq('line_user_id', u);
  }
}

(async () => {
  await cleanup();
  for (const u of [U, NOSRC, EMPTY, OTHER]) await post('/users', { line_user_id: u, display_name: 'Dividend Test' });

  // U: AAPL bought 2023-01-03 (a steady quarterly payer), partly sold in
  // 2025; PTT.BK (THB payer); a bogus symbol; and a gold holding.
  const aapl = await post(`/portfolio/${U}`, { asset_type: 'stock', symbol: 'AAPL', quantity: 10, average_cost: 125, trade_date: '2023-01-03' });
  const A = aapl.body.holding.id;
  await post(`/portfolio/${U}/${A}/lots`, { side: 'sell', quantity: 2, price: 240, trade_date: '2025-01-02' });
  const ptt = await post(`/portfolio/${U}`, { asset_type: 'stock', symbol: 'PTT.BK', quantity: 100, average_cost: 32, trade_date: '2024-01-03' });
  await post(`/portfolio/${U}`, { asset_type: 'stock', symbol: 'ZZZNOTREAL1', quantity: 1, average_cost: 50, trade_date: '2025-06-02' });
  await post(`/portfolio/${U}`, { asset_type: 'gold', symbol: 'GOLD-BAHT', quantity: 1, average_cost: 40000, current_price: 42000, trade_date: '2025-06-02' });
  await db.from('asset_holdings').update({ current_price: 250, previous_close: 248, priced_at: new Date().toISOString() }).eq('id', A);
  await db.from('asset_holdings').update({ current_price: 34, priced_at: new Date().toISOString() }).eq('id', ptt.body.holding.id);

  // NOSRC: crypto + gold only -- no dividend source for either.
  await post(`/portfolio/${NOSRC}`, { asset_type: 'crypto', symbol: 'bitcoin', quantity: 0.1, average_cost: 60000, current_price: 65000, trade_date: '2025-01-02' });
  await post(`/portfolio/${NOSRC}`, { asset_type: 'gold', symbol: 'GOLD-BAHT', quantity: 1, average_cost: 40000, current_price: 42000, trade_date: '2025-01-02' });
  // OTHER: its own payer, must never show up in U's response.
  const otherHolding = await post(`/portfolio/${OTHER}`, { asset_type: 'stock', symbol: 'PTT.BK', quantity: 50, average_cost: 30, trade_date: '2024-01-03' });

  // --- Validation + empty user ---
  const bad = await api(`/portfolio/${U}/dividends?mode=weekly`);
  assert(bad.status === 400 && /mode must be one of/.test(bad.body.error), `invalid mode -> 400 (got ${bad.status})`);
  const empty = await api(`/portfolio/${EMPTY}/dividends`);
  assert(empty.status === 200 && empty.body.mode === 'monthly', `no-lots user -> 200, mode defaults to monthly (got ${empty.status})`);
  const es = empty.body.summary || {};
  assert(es.trailing_12m_thb === 0 && es.projected_12m_thb === 0 && es.yoy_pct === null && es.portfolio_yield_pct === null && es.avg_monthly_thb === 0,
    `empty summary is zeros/nulls (got ${JSON.stringify(es)})`);
  assert(empty.body.holdings.length === 0 && empty.body.missing.length === 0 && empty.body.unsupported_holdings.length === 0, 'empty: no holdings, missing or unsupported');
  assert(empty.body.series.length === 24 && empty.body.series.every((b) => b.received_thb === 0 && b.projected_thb === 0), 'empty: 24 zero monthly bars');

  // --- Crypto/gold-only user ---
  const nosrc = (await api(`/portfolio/${NOSRC}/dividends?mode=annual`)).body;
  assert(nosrc.summary.trailing_12m_thb === 0 && nosrc.summary.projected_12m_thb === 0 && nosrc.holdings.length === 0, 'crypto/gold-only -> zero dividends');
  assert(nosrc.unsupported_holdings.slice().sort().join() === 'GOLD-BAHT,bitcoin' && nosrc.missing.length === 0, `unsupported_holdings lists both (got ${JSON.stringify(nosrc.unsupported_holdings)})`);
  assert(nosrc.summary.portfolio_yield_pct === 0 && nosrc.summary.yield_on_cost_pct === 0, 'yields are 0% (value exists, no projected income)');

  // --- Real portfolio ---
  const started = Date.now();
  const res = await api(`/portfolio/${U}/dividends?mode=monthly`);
  const secs = (Date.now() - started) / 1000;
  const d = res.body;
  assert(res.status === 200, `monthly dividends -> 200 (got ${res.status} ${JSON.stringify(d).slice(0, 200)})`);
  assert(secs < 20, `answers in reasonable time (took ${secs.toFixed(1)}s)`);
  assert(d.missing.length === 1 && d.missing[0].symbol === 'ZZZNOTREAL1' && d.missing[0].error, `bogus symbol listed in missing (got ${JSON.stringify(d.missing)})`);
  assert(d.unsupported_holdings.join() === 'GOLD-BAHT', 'gold listed as unsupported');
  assert(d.holdings.map((h) => h.symbol).sort().join() === 'AAPL,PTT.BK', `holdings: the two real payers (got ${d.holdings.map((h) => h.symbol)})`);

  const a = d.holdings.find((h) => h.symbol === 'AAPL');
  const p = d.holdings.find((h) => h.symbol === 'PTT.BK');
  const aReceived = a.events.filter((e) => e.kind === 'received');
  const aProjected = a.events.filter((e) => e.kind === 'projected');
  assert(a.received_thb > 0 && a.received > 0 && aReceived.length >= 10, `AAPL received > 0 since 2023 (got ${a.received} USD / ${a.received_thb} THB over ${aReceived.length} events)`);
  assert(a.currency === 'USD' && p.currency === 'THB' && p.received_thb > 0, 'currencies carried; PTT.BK received too');
  assert(aReceived.every((e) => e.ex_date > '2023-01-03' && e.ex_date <= today), 'received ex-dates after the first buy and on/before today');
  assert(aReceived.every((e) => e.shares === (e.ex_date > '2025-01-02' ? 8 : 10)), 'shares at each ex-date: 10 before the 2025 sell, 8 after');
  assert(a.events.every((e) => near(e.amount, e.shares * e.amount_per_share, 1e-5)), 'amount = shares x amount per share');
  const rates = aReceived.map((e) => e.amount_thb / e.amount);
  assert(rates.every((r) => r > 25 && r < 45) && new Set(rates.map((r) => r.toFixed(3))).size > 1, 'USD events converted at plausible, per-date USD->THB rates');
  assert(p.events.every((e) => e.amount_thb === e.amount), 'THB holding: amount_thb = amount');
  assert(aProjected.length >= 3 && aProjected.every((e) => e.ex_date > today && e.ex_date <= inAYear && e.shares === 8), `AAPL projected: 3+ events after today, within a year, at 8 shares (got ${aProjected.map((e) => e.ex_date)})`);
  assert(near(a.received_thb, sum(aReceived, 'amount_thb')) && near(a.projected_12m_thb, sum(aProjected, 'amount_thb')), 'per-holding totals = sum of its events');

  const s = d.summary;
  const all = d.holdings.flatMap((h) => h.events);
  const yearAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 365 * 86400000).toISOString().slice(0, 10);
  assert(near(s.trailing_12m_thb, sum(all.filter((e) => e.kind === 'received' && e.ex_date > yearAgo), 'amount_thb')) && s.trailing_12m_thb > 0, `trailing 12m = received in the last 365 days (got ${s.trailing_12m_thb})`);
  assert(near(s.projected_12m_thb, sum(d.holdings, 'projected_12m_thb')), 'projected 12m = sum of per-holding projections');
  assert(typeof s.yoy_pct === 'number', `YoY is a number with two years of history (got ${s.yoy_pct})`);
  assert(near(s.avg_monthly_thb, s.trailing_12m_thb / 12) && near(s.avg_daily_thb, s.trailing_12m_thb / 365), 'averages from trailing 12m');

  const portfolio = (await api(`/portfolio/${U}`)).body;
  assert(near(s.portfolio_yield_pct, (s.projected_12m_thb / portfolio.totals.total_value) * 100, 0.01), `portfolio yield = projected / total value (got ${s.portfolio_yield_pct})`);
  assert(near(s.yield_on_cost_pct, (s.projected_12m_thb / portfolio.totals.total_cost_basis) * 100, 0.01), `yield on cost = projected / open cost basis (got ${s.yield_on_cost_pct})`);

  // Series: bars line up with the summary in every mode.
  assert(d.series.length === 24 && d.series[11].period_start === `${today.slice(0, 7)}-01`, 'monthly: 24 bars, this month 12th');
  assert(near(sum(d.series, 'projected_thb'), s.projected_12m_thb, 0.15), 'monthly projected bars sum to projected 12m');
  assert(d.series.slice(0, 11).every((b) => b.projected_thb === 0) && d.series.slice(12).every((b) => b.received_thb === 0), 'past months received only, future months projected only');
  assert(sum(d.series, 'received_thb') <= s.trailing_12m_thb + 0.15, 'monthly received bars (whole months) never exceed trailing 12m');
  const quarterly = (await api(`/portfolio/${U}/dividends?mode=quarterly`)).body;
  assert(quarterly.mode === 'quarterly' && quarterly.series.length === 8 && /^Q\d \d{4}$/.test(quarterly.series[0].label), 'quarterly: 8 bars labelled "Qn YYYY"');
  assert(near(sum(quarterly.series, 'projected_thb'), s.projected_12m_thb, 0.1), 'quarterly projected bars sum to projected 12m');
  const annual = (await api(`/portfolio/${U}/dividends?mode=annual`)).body;
  const thisYear = Number(today.slice(0, 4));
  assert(annual.series.map((b) => b.label).join() === Array.from({ length: thisYear + 2 - 2023 }, (_, i) => String(2023 + i)).join(), `annual: 2023 through next year (got ${annual.series.map((b) => b.label)})`);
  assert(near(sum(annual.series, 'received_thb'), sum(d.holdings, 'received_thb'), 0.1), 'annual received bars sum to all-time received');
  assert(near(sum(annual.series, 'projected_thb'), s.projected_12m_thb, 0.05) && annual.series[annual.series.length - 1].received_thb === 0, 'annual projected sums to projected 12m; next year projected only');
  assert(JSON.stringify(annual.summary) === JSON.stringify(s), 'summary is the same in every mode');

  // --- Cached per-holding fields on GET /portfolio/:u (now warm) ---
  const ph = (symbol) => portfolio.holdings.find((h) => h.symbol === symbol);
  assert(near(ph('AAPL').dividends_received_thb, a.received_thb) && near(ph('AAPL').dividends_received, a.received, 1e-4), `GET /portfolio: AAPL dividends from the warm cache (got ${ph('AAPL').dividends_received_thb})`);
  assert(near(ph('PTT.BK').dividends_received_thb, p.received_thb), 'GET /portfolio: PTT.BK dividends');
  assert(ph('GOLD-BAHT').dividends_received === null && ph('ZZZNOTREAL1').dividends_received === null, 'GET /portfolio: null for gold and for a symbol with no dividend history');
  assert(portfolio.totals.total_gain !== undefined && !('dividends' in portfolio.totals), 'totals unchanged (no dividend field mixed in)');

  // --- Isolation ---
  const otherRes = (await api(`/portfolio/${OTHER}/dividends`)).body;
  assert(!d.holdings.some((h) => h.holding_id === otherHolding.body.holding.id), 'OTHER\'s holding never in U\'s response');
  assert(otherRes.holdings.length === 1 && otherRes.holdings[0].holding_id === otherHolding.body.holding.id && otherRes.missing.length === 0 && otherRes.unsupported_holdings.length === 0,
    'OTHER sees only its own holding');
  assert(near(otherRes.holdings[0].received_thb, p.received_thb / 2, 0.02), 'same symbol, half the shares -> half the dividends (same events, separate lots)');

  await cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); await cleanup(); process.exit(1); });
