// Recurring pay windows: start-day reminder, overdue reminder the day after the
// end day, per-month paid tracking. Needs migration 014 (paid_period).
const { BACKEND, BASE } = require('../lib');
const { createClient } = require('@supabase/supabase-js');

const pushed = [];
const clientPath = require.resolve(`${BACKEND}/services/lineMessagingClient.js`);
require.cache[clientPath] = {
  id: clientPath, filename: clientPath, loaded: true,
  exports: { async replyText() {}, async replyConfirmationCard() {}, async getImageBuffer() {}, async pushText(to, text) { pushed.push({ to, text }); } },
};
const { payStatus, remindersDueToday, periodFor } = require(`${BACKEND}/services/payWindow.js`);
const { sendPayWindowReminders } = require(`${BACKEND}/jobs/payWindowReminders.js`);

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const U = 'test_pay_window';
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures++; };
const api = (p, o = {}) =>
  fetch(`${BASE}/api${p}`, { headers: { 'Content-Type': 'application/json' }, ...o }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const at = (ymd) => new Date(`${ymd}T09:00:00+07:00`); // 09:00 Bangkok, when the job runs
const rule = (start, end, extra = {}) => ({ frequency: 'monthly', is_active: true, pay_start_day: start, pay_end_day: end, paid_period: null, ...extra });
const kinds = (r) => r.map((x) => `${x.kind}:${x.period}`).join(',');

async function cleanup() {
  for (const t of ['recurring_transactions', 'transactions', 'categories', 'users']) await db.from(t).delete().eq('line_user_id', U);
}

(async () => {
  // ---- date logic ----
  assert(kinds(remindersDueToday(rule(1, 5), at('2026-11-01'))) === 'due:2026-11-01', 'window 1-5: due reminder on the 1st');
  assert(kinds(remindersDueToday(rule(1, 5), at('2026-11-03'))) === '', 'no reminder mid-window');
  assert(kinds(remindersDueToday(rule(1, 5), at('2026-11-06'))) === 'overdue:2026-11-01', 'overdue reminder the day after the end day');
  assert(kinds(remindersDueToday(rule(1, 5), at('2026-11-07'))) === '', 'overdue reminder only once');
  assert(kinds(remindersDueToday(rule(1, 5, { paid_period: '2026-11-01' }), at('2026-11-06'))) === '', 'marked paid for the month -> no overdue');
  assert(kinds(remindersDueToday(rule(1, 5, { paid_period: '2026-10-01' }), at('2026-11-01'))) === 'due:2026-11-01', "last month's payment doesn't cover this month");
  assert(kinds(remindersDueToday(rule(28, 3), at('2026-11-28'))) === 'due:2026-11-01', 'wrapping window 28-3: due on the 28th');
  assert(kinds(remindersDueToday(rule(28, 3), at('2026-12-04'))) === 'overdue:2026-11-01', "wrapping window: overdue on the 4th of next month, for last month's period");
  const feb = periodFor(rule(25, 31), 2027, 1);
  assert(feb.end === '2027-02-28' && feb.overdueFrom === '2027-03-01', `day 31 clamps to Feb 28 (got ${JSON.stringify(feb)})`);
  assert(kinds(remindersDueToday(rule(null, 5), at('2026-11-06'))) === 'overdue:2026-11-01', 'end day only: overdue reminder, no due reminder');
  assert(kinds(remindersDueToday(rule(1, 5, { frequency: 'weekly' }), at('2026-11-01'))) === '', 'non-monthly rules never remind');
  assert(kinds(remindersDueToday(rule(1, 5, { is_active: false }), at('2026-11-01'))) === '', 'paused rules never remind');
  const st = payStatus(rule(1, 5), at('2026-11-07'));
  assert(st.period === '2026-11-01' && !st.paid && st.overdue, `status after the window: overdue (got ${JSON.stringify(st)})`);
  assert(payStatus(rule(1, 5, { frequency: 'yearly' })) === null, 'no pay_status for non-monthly rules');

  // ---- the job, against the DB ----
  await cleanup();
  await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: U, display_name: 'Pay Window Test' }) });
  const [cat] = (await api(`/categories/${U}?type=expense`)).body.categories;
  const mk = (body) => api(`/recurring/${U}`, { method: 'POST', body: JSON.stringify({ category_id: cat.id, amount: 15000, type: 'expense', frequency: 'monthly', start_date: '2030-01-01', ...body }) });
  const rent = (await mk({ description: 'Rent', pay_start_day: 1, pay_end_day: 5 })).body.recurring;
  const weekly = (await mk({ description: 'Gym', frequency: 'weekly', pay_start_day: 1, pay_end_day: 5 })).body.recurring;
  assert(rent && rent.pay_status && 'paid' in rent.pay_status, `created rule comes back with pay_status (got ${JSON.stringify(rent?.pay_status)})`);

  pushed.length = 0;
  await sendPayWindowReminders({ lineUserId: U, now: at('2026-11-01') });
  assert(pushed.length === 1 && pushed[0].text === 'Reminder: "Rent" (15000.00) is due between Nov 1 and Nov 5. Mark it paid in the app once it\'s done.', `job sends the due reminder (got ${JSON.stringify(pushed)})`);
  pushed.length = 0;
  await sendPayWindowReminders({ lineUserId: U, now: at('2026-11-06') });
  assert(pushed.length === 1 && pushed[0].text === 'Overdue: "Rent" (15000.00) was due by Nov 5 and isn\'t marked paid yet.', `job sends the overdue reminder (got ${JSON.stringify(pushed)})`);
  await db.from('recurring_transactions').update({ paid_period: '2026-11-01' }).eq('id', rent.id);
  pushed.length = 0;
  await sendPayWindowReminders({ lineUserId: U, now: at('2026-11-06') });
  assert(pushed.length === 0, `paid for the month -> job stays quiet (got ${pushed.length})`);
  await db.from('recurring_transactions').update({ paid_period: null }).eq('id', rent.id);
  await db.from('users').update({ notifications_enabled: false }).eq('line_user_id', U);
  pushed.length = 0;
  await sendPayWindowReminders({ lineUserId: U, now: at('2026-11-06') });
  assert(pushed.length === 0, 'notifications_enabled=false -> no reminder');
  await db.from('users').update({ notifications_enabled: true }).eq('line_user_id', U);

  // ---- mark paid API (current period) ----
  const list = (await api(`/recurring/${U}`)).body.recurring;
  const listed = list.find((r) => r.id === rent.id);
  assert(listed.pay_status && listed.pay_status.paid === false, 'GET lists pay_status, unpaid');
  assert(list.find((r) => r.id === weekly.id).pay_status === null, 'weekly rule: pay_status null');
  const paid = await api(`/recurring/${U}/${rent.id}/paid`, { method: 'PATCH', body: JSON.stringify({ paid: true }) });
  assert(paid.status === 200 && paid.body.recurring.pay_status.paid === true && paid.body.recurring.paid_period === listed.pay_status.period,
    `mark paid stores the current period (got ${paid.status} ${JSON.stringify(paid.body.recurring?.pay_status)})`);
  const undo = await api(`/recurring/${U}/${rent.id}/paid`, { method: 'PATCH', body: JSON.stringify({ paid: false }) });
  assert(undo.body.recurring.pay_status.paid === false && undo.body.recurring.paid_period === null, 'undo clears it');
  assert((await api(`/recurring/${U}/${weekly.id}/paid`, { method: 'PATCH', body: JSON.stringify({ paid: true }) })).status === 400, 'weekly rule cannot be marked paid -> 400');
  assert((await api(`/recurring/${U}/${rent.id}/paid`, { method: 'PATCH', body: JSON.stringify({ paid: 'yes' }) })).status === 400, 'non-boolean paid -> 400');
  assert((await api(`/recurring/${U}/00000000-0000-4000-8000-000000000000/paid`, { method: 'PATCH', body: JSON.stringify({ paid: true }) })).status === 404, 'unknown rule -> 404');
  assert((await api(`/recurring/someone_else/${rent.id}/paid`, { method: 'PATCH', body: JSON.stringify({ paid: true }) })).status === 404, "another user's rule -> 404");

  await cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); await cleanup(); process.exit(1); });
