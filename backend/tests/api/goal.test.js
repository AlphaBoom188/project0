// Goal tracker endpoints (GET/PUT/DELETE /api/portfolio/:u/goal): no goal ->
// null, PUT creates then updates the one row per user, every validation rule
// -> 400 with nothing written, explicit vs projected target, progress against
// the user's real totals.total_value (a manual-price gold lot, so no network
// and a fixed value), DELETE, and isolation between two users.
const { BASE } = require('../lib');
const { createClient } = require('@supabase/supabase-js');
const { buildGoalProjection } = require('../../services/goalMath');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const U = 'test_goal_001';
const OTHER = 'test_goal_002';
const NOUSER = 'test_goal_nouser';
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures++; };
const near = (a, b, eps = 0.011) => typeof a === 'number' && Math.abs(a - b) <= eps;
const api = (p, o = {}) =>
  fetch(`${BASE}/api${p}`, { headers: { 'Content-Type': 'application/json' }, ...o }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const post = (p, body) => api(p, { method: 'POST', body: JSON.stringify(body) });
const put = (p, body) => api(p, { method: 'PUT', body: JSON.stringify(body) });
const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const goalRows = async (u) => ((await db.from('investment_goals').select('*').eq('line_user_id', u)).data || []);

async function cleanup() {
  for (const u of [U, OTHER, NOUSER]) {
    for (const t of ['investment_goals', 'asset_lots', 'asset_holdings', 'users']) await db.from(t).delete().eq('line_user_id', u);
  }
}

const VALID = { start_date: '2025-01-01', start_value: 40000, years: 10, expected_annual_return: 8, monthly_contribution: 1000, contribution_growth: 5 };

(async () => {
  await cleanup();
  for (const u of [U, OTHER]) await post('/users', { line_user_id: u, display_name: 'Goal Test' });
  // Gold at a manual price: totals.total_value = 2 x 21,000 = ฿42,000, no fetch.
  await post(`/portfolio/${U}`, { asset_type: 'gold', symbol: 'GOLD-BAHT', quantity: 2, average_cost: 20000, current_price: 21000, trade_date: '2025-01-02' });
  const totalValue = (await api(`/portfolio/${U}`)).body.totals.total_value;
  assert(totalValue === 42000, `test portfolio is worth ฿42,000 (got ${totalValue})`);

  // --- No goal ---
  const none = await api(`/portfolio/${U}/goal`);
  assert(none.status === 200 && none.body.goal === null && none.body.projection === null, `no goal -> { goal: null, projection: null } (got ${none.status} ${JSON.stringify(none.body)})`);

  // --- Validation: each -> 400, nothing written ---
  const bad = [
    [{ start_date: undefined }, /start_date must be a valid YYYY-MM-DD date/],
    [{ start_date: '2025-02-30' }, /start_date/],
    [{ start_date: '01/02/2025' }, /start_date/],
    [{ start_date: '2025-13-01' }, /start_date/],
    [{ start_value: undefined }, /start_value is required/],
    [{ start_value: -1 }, /start_value must be a number of at least 0/],
    [{ start_value: 'abc' }, /start_value/],
    [{ start_value: 1e15 }, /start_value/],
    [{ years: 0 }, /years must be a whole number from 1 to 60/],
    [{ years: 61 }, /years/],
    [{ years: 2.5 }, /years/],
    [{ years: undefined }, /years is required/],
    [{ expected_annual_return: -50.1 }, /expected_annual_return must be a percent from -50 to 100/],
    [{ expected_annual_return: 100.5 }, /expected_annual_return/],
    [{ expected_annual_return: true }, /expected_annual_return/],
    [{ monthly_contribution: -5 }, /monthly_contribution must be a number of at least 0/],
    [{ contribution_growth: -1 }, /contribution_growth must be a percent from 0 to 100/],
    [{ contribution_growth: 101 }, /contribution_growth/],
    [{ target_value: 0 }, /target_value must be a number above 0, or empty/],
    [{ target_value: -100 }, /target_value/],
  ];
  for (const [override, pattern] of bad) {
    const res = await put(`/portfolio/${U}/goal`, { ...VALID, ...override });
    assert(res.status === 400 && pattern.test(res.body.error || ''), `${JSON.stringify(override)} -> 400 "${res.body.error}"`);
  }
  assert((await goalRows(U)).length === 0, 'no row written by any invalid PUT');
  const boundary = await put(`/portfolio/${NOUSER}/goal`, VALID);
  assert(boundary.status === 404, `goal for a user that doesn't exist -> 404 (got ${boundary.status})`);

  // --- Create (projected target) ---
  const created = await put(`/portfolio/${U}/goal`, { ...VALID, target_value: null });
  const g = created.body.goal;
  const p = created.body.projection;
  assert(created.status === 200 && g && g.line_user_id === U && g.start_date === '2025-01-01' && g.start_value === 40000 && g.years === 10
    && g.expected_annual_return === 8 && g.monthly_contribution === 1000 && g.contribution_growth === 5 && g.target_value === null,
  `PUT creates the goal with numeric fields (got ${created.status} ${JSON.stringify(g)})`);
  const expected = buildGoalProjection({ ...VALID, target_value: null }, 42000, today);
  assert(p.target_is_projected && p.target_value === expected.target_value && p.end_date === '2035-01-01', `no target -> projected end value ฿${expected.target_value}, end 2035-01-01 (got ${p.target_value}, ${p.end_date})`);
  assert(p.current_value_thb === 42000 && near(p.progress_pct, Math.round((42000 / expected.target_value) * 1e4) / 100), `progress uses totals.total_value (got ${p.current_value_thb}, ${p.progress_pct}%)`);
  assert(p.status === expected.status && p.expected_now_thb === expected.expected_now_thb && near(p.difference_thb, 42000 - expected.expected_now_thb), `status ${p.status}, expected now ฿${p.expected_now_thb}, difference ฿${p.difference_thb}`);
  assert(['ahead', 'behind', 'on_track'].includes(p.status), 'a goal started in 2025 is ahead / behind / on track');
  assert(p.points.length === 120 && p.points[0].date === '2025-01' && p.points[119].date === '2035-01' && p.points[0].projected_value === 40000 && p.points[0].contributed === 40000,
    `points: <= 120, first = start month at start_value, last = end month (got ${p.points.length}, ${p.points[0].date}..${p.points[p.points.length - 1].date})`);
  assert(p.yearly.length === 10 && p.yearly[0].year_index === 1 && p.yearly[0].end_date === '2026-01-01' && p.yearly[0].contributed_total === 52000 && p.yearly[9].projected_value === p.target_value,
    `yearly: 10 rows, year 1 contributed ฿52,000, last = target (got ${JSON.stringify(p.yearly[0])})`);
  const updatedAt1 = (await goalRows(U))[0].updated_at;

  // --- GET returns the same ---
  const got = await api(`/portfolio/${U}/goal`);
  assert(got.status === 200 && JSON.stringify(got.body.goal) === JSON.stringify(g) && got.body.projection.target_value === p.target_value, 'GET returns the same goal and projection');

  // --- Update (explicit target), still one row ---
  await new Promise((r) => setTimeout(r, 20));
  const updated = await put(`/portfolio/${U}/goal`, { ...VALID, years: 20, target_value: 168000 });
  const rows = await goalRows(U);
  assert(updated.status === 200 && rows.length === 1 && rows[0].years === 20, `PUT again updates the one row (rows ${rows.length}, years ${rows[0] && rows[0].years})`);
  assert(new Date(rows[0].updated_at) > new Date(updatedAt1), 'updated_at moves forward on update');
  const up = updated.body.projection;
  assert(!up.target_is_projected && up.target_value === 168000 && up.progress_pct === 25 && up.end_date === '2045-01-01' && up.yearly.length === 20,
    `explicit target ฿168,000 -> progress 25% (got ${up.target_value}, ${up.progress_pct}%, ${up.yearly.length} years)`);
  const defaults = await put(`/portfolio/${U}/goal`, { start_date: today, start_value: '42000', years: '5', expected_annual_return: '0' });
  assert(defaults.status === 200 && defaults.body.goal.monthly_contribution === 0 && defaults.body.goal.contribution_growth === 0 && defaults.body.goal.target_value === null,
    'contribution fields default to 0, numeric strings are accepted');
  assert(defaults.body.projection.status === 'on_track' && defaults.body.projection.expected_now_thb === 42000, 'start today at the current value, 0% -> on track');
  const future = await put(`/portfolio/${U}/goal`, { ...VALID, start_date: `${Number(today.slice(0, 4)) + 1}-01-01` });
  assert(future.status === 200 && future.body.projection.status === 'not_started' && future.body.projection.difference_thb === null, 'a start date after today -> not_started');

  // --- Isolation ---
  const otherNone = await api(`/portfolio/${OTHER}/goal`);
  assert(otherNone.body.goal === null, "another user doesn't see this user's goal");
  await put(`/portfolio/${OTHER}/goal`, { ...VALID, start_value: 1, target_value: 999 });
  const mine = (await api(`/portfolio/${U}/goal`)).body;
  const theirs = (await api(`/portfolio/${OTHER}/goal`)).body;
  assert(mine.goal.start_value === 40000 && theirs.goal.start_value === 1 && theirs.projection.current_value_thb === 0 && theirs.projection.progress_pct === 0,
    "each user's PUT writes only their own row; the other user's progress uses their own (empty) portfolio");
  await api(`/portfolio/${OTHER}/goal`, { method: 'DELETE' });
  assert((await goalRows(U)).length === 1 && (await goalRows(OTHER)).length === 0, "deleting another user's goal leaves this one");

  // --- Delete ---
  const del = await api(`/portfolio/${U}/goal`, { method: 'DELETE' });
  assert(del.status === 200 && (await goalRows(U)).length === 0, 'DELETE removes the goal');
  const after = await api(`/portfolio/${U}/goal`);
  assert(after.status === 200 && after.body.goal === null && after.body.projection === null, 'GET after DELETE -> goal: null');
  const delAgain = await api(`/portfolio/${U}/goal`, { method: 'DELETE' });
  assert(delAgain.status === 200, 'DELETE with no goal is a harmless no-op');

  await cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e.message.split('\n')[0]); await cleanup(); process.exit(1); });
