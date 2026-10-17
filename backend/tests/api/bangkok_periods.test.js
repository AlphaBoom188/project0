// Budget periods, event-budget months and billing cycles follow the
// Asia/Bangkok calendar (midnight in Bangkok), not UTC midnight -- which would
// make daily budgets reset at 07:00 and push midnight-7am spending into the
// previous day/month. Every case below was wrong under the old UTC math.
const { BACKEND, BASE } = require('../lib');
const { createClient } = require('@supabase/supabase-js');

const pushed = [];
const clientPath = require.resolve(`${BACKEND}/services/lineMessagingClient.js`);
require.cache[clientPath] = {
  id: clientPath, filename: clientPath, loaded: true,
  exports: { async replyText() {}, async replyConfirmationCard() {}, async getImageBuffer() {}, async pushText(to, text) { pushed.push({ to, text }); } },
};
const { getPeriodStartISO } = require(`${BACKEND}/services/budgetAlert.js`);
const { createTransaction } = require(`${BACKEND}/services/transactionCreate.js`);

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const U = 'test_bangkok_periods';
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures++; };
const api = (p, o = {}) =>
  fetch(`${BASE}/api${p}`, { headers: { 'Content-Type': 'application/json' }, ...o }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const bkk = (ymdHm) => new Date(`${ymdHm}:00+07:00`);

async function cleanup() {
  for (const t of ['budget_events', 'transactions', 'categories', 'users']) await db.from(t).delete().eq('line_user_id', U);
}

(async () => {
  // ---- period starts at fixed instants: 01:30 on Saturday 2026-10-17, Bangkok ----
  const t = bkk('2026-10-17T01:30');
  assert(getPeriodStartISO('daily', t) === bkk('2026-10-17T00:00').toISOString(), 'daily period starts at Bangkok midnight of the same day (UTC math said Oct 16)');
  assert(getPeriodStartISO('weekly', t) === bkk('2026-10-11T00:00').toISOString(), 'weekly period starts Sunday Oct 11, Bangkok');
  assert(getPeriodStartISO('monthly', bkk('2026-11-01T03:00')) === bkk('2026-11-01T00:00').toISOString(), '03:00 on Nov 1 is already in November (UTC math said October)');
  assert(getPeriodStartISO('yearly', bkk('2027-01-01T02:00')) === bkk('2027-01-01T00:00').toISOString(), '02:00 on Jan 1 is already the new year');

  // ---- daily category budget: early-morning spending counts toward today ----
  await cleanup();
  await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: U, display_name: 'Bangkok Periods Test' }) });
  const [cat, cat2] = (await api(`/categories/${U}?type=expense`)).body.categories;
  await api(`/categories/${U}/${cat.id}`, { method: 'PUT', body: JSON.stringify({ budget_amount: 100, budget_period: 'daily' }) });
  const todayBkk = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
  await createTransaction({ lineUserId: U, categoryId: cat.id, amount: 80, type: 'expense', transactionDate: bkk(`${todayBkk}T00:30`).toISOString(), channel: 'liff' });
  const second = await createTransaction({ lineUserId: U, categoryId: cat.id, amount: 30, type: 'expense', transactionDate: new Date().toISOString(), channel: 'liff' });
  assert(second.budget_alert && second.budget_alert.totalSpent === 110, `00:30 spending counts toward today's daily budget -> alert at 110 (got ${JSON.stringify(second.budget_alert)})`);

  // ---- event budget month: 03:00 on Nov 1 belongs to November's bucket ----
  await api(`/budget-events/${U}`, { method: 'POST', body: JSON.stringify({ category_id: cat2.id, title: 'November Bucket', amount: 100, period_month: '2026-11-01' }) });
  await api(`/budget-events/${U}`, { method: 'POST', body: JSON.stringify({ category_id: cat2.id, title: 'October Bucket', amount: 100, period_month: '2026-10-01' }) });
  const early = await createTransaction({ lineUserId: U, categoryId: cat2.id, amount: 150, type: 'expense', transactionDate: bkk('2026-11-01T03:00').toISOString(), channel: 'liff' });
  assert(early.event_budget_alerts.length === 1 && early.event_budget_alerts[0].title === 'November Bucket', `alert goes to November's bucket (got ${JSON.stringify(early.event_budget_alerts.map((a) => a.title))})`);
  const late = await createTransaction({ lineUserId: U, categoryId: cat2.id, amount: 120, type: 'expense', transactionDate: bkk('2026-10-31T23:30').toISOString(), channel: 'liff' });
  assert(late.event_budget_alerts.length === 1 && late.event_budget_alerts[0].title === 'October Bucket', `23:30 on Oct 31 is still October (got ${JSON.stringify(late.event_budget_alerts.map((a) => a.title))})`);
  const nov = (await api(`/budget-events/${U}?month=2026-11-01`)).body.budget_events[0];
  const oct = (await api(`/budget-events/${U}?month=2026-10-01`)).body.budget_events[0];
  assert(nov.spent === 150 && oct.spent === 120, `progress bars agree with the alerts: Nov 150, Oct 120 (got Nov ${nov.spent}, Oct ${oct.spent})`);
  assert(pushed.length === 0, 'LIFF channel: nothing pushed');

  await cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); await cleanup(); process.exit(1); });
