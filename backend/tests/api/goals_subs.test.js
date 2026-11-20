// Savings goals (migration 025) and the subscriptions overview: pure math,
// then REST (CRUD, add money, account-linked progress, monthly reminder).
const { BASE, BACKEND } = require('../lib');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { goalStatus, monthsLeft, validateGoal } = require(`${BACKEND}/services/savingsGoals.js`);
const { overview } = require(`${BACKEND}/services/subscriptions.js`);

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };

// --- Pure ---
assert(monthsLeft('2026-11-20', '2027-06-30') === 8 && monthsLeft('2026-11-20', '2026-12-10') === 1 && monthsLeft('2026-11-20', '2026-11-01') === 0 && monthsLeft('2026-11-20', null) === null, 'saving months left');
let st = goalStatus({ target_amount: 50000, saved_amount: 10000, target_date: '2027-06-30' }, { today: '2026-11-20' });
assert(st.saved === 10000 && st.remaining === 40000 && st.pct === 20 && st.perMonth === 5000 && !st.achieved && st.source === 'manual', 'manual goal: 40k over 8 months = 5,000 a month');
st = goalStatus({ target_amount: 50000, saved_amount: 0, account_id: 'a', target_date: null }, { today: '2026-11-20', accountBalance: 60000 });
assert(st.saved === 60000 && st.achieved && st.pct === 100 && st.perMonth === 0 && st.source === 'account', 'account-linked: balance counts, reached');
st = goalStatus({ target_amount: 1000, saved_amount: 200, target_date: '2026-10-01' }, { today: '2026-11-20' });
assert(st.overdue && st.monthsLeft === 0, 'date passed: overdue');
assert(validateGoal({}).error && validateGoal({ name: 'x', target_amount: 0 }).error && validateGoal({ name: 'x', target_amount: 5, target_date: '31/12' }).error && validateGoal({ name: 'x', target_amount: 5, saved_amount: -1 }).error, 'validation');
const o = overview([
  { id: 'a', description: 'Netflix.com', amount: 419, frequency: 'monthly', type: 'expense', categories: { name: 'Fun' } },
  { id: 'b', description: 'Domain', amount: 1200, frequency: 'yearly', type: 'expense' },
  { id: 'c', description: 'Gym', amount: 250, frequency: 'weekly', type: 'expense' },
  { id: 'd', description: 'Paused', amount: 999, frequency: 'monthly', type: 'expense', is_active: false },
  { id: 'e', description: 'Salary', amount: 50000, frequency: 'monthly', type: 'income' },
], [{ description: 'NETFLIX.COM REF#1', amount: 459, date: '2026-11-05' }, { description: 'Netflix.com', amount: 419, date: '2026-10-05' }]);
assert(o.items.length === 3 && o.items[0].description === 'Gym' && o.items[0].monthly === 1083.33 && o.items.find((i) => i.id === 'b').monthly === 100, 'monthly equivalents (weekly x 52/12, yearly / 12), active expenses only');
assert(o.monthlyTotal === 1602.33 && o.yearlyTotal === 19227.96, `totals (got ${o.monthlyTotal} / ${o.yearlyTotal})`);
const nf = o.items.find((i) => i.id === 'a');
assert(nf.increase && nf.increase.from === 419 && nf.increase.to === 459 && o.increases === 1, 'price rise spotted from the latest payment');

// --- REST ---
const U = `test_goals_${crypto.randomBytes(4).toString('hex')}`;
const call = (method, p, body) => fetch(`${BASE}/api${p}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
(async () => {
  await call('POST', '/users', { line_user_id: U, display_name: 'Goals' });
  try {
    const { data: acc } = await db.from('accounts').insert({ line_user_id: U, account_name: 'Savings', account_type: 'bank', balance: 12000 }).select().single();
    let r = await call('POST', `/goals/${U}`, { name: 'Japan trip', target_amount: 50000, target_date: '2027-06-30', saved_amount: 5000, remind_day: 25 });
    const trip = r.body.goals && r.body.goals[0];
    assert(r.status === 201 && trip.name === 'Japan trip' && trip.status.saved === 5000 && trip.status.perMonth > 0 && trip.reminder_id, `create a manual goal with a reminder (got ${r.status} ${r.body.error || ''})`);
    const rem = (await db.from('reminders').select('title, repeat, remind_at').eq('id', trip.reminder_id).single()).data;
    assert(rem.title.startsWith('Put aside ฿') && rem.title.endsWith('for Japan trip') && rem.repeat === 'monthly' && new Date(new Date(rem.remind_at).getTime() + 7 * 3600000).getUTCDate() === 25, 'monthly "put aside" reminder on the 25th (Bangkok)');
    r = await call('POST', `/goals/${U}`, { name: 'Emergency', target_amount: 10000, account_id: acc.id });
    const em = r.body.goals.find((g) => g.name === 'Emergency');
    assert(em.status.saved === 12000 && em.status.achieved && em.account_name === 'Savings', 'account-linked goal follows the balance');
    r = await call('POST', `/goals/${U}/${trip.id}/add`, { amount: 2500 });
    assert(r.body.goals.find((g) => g.id === trip.id).status.saved === 7500, 'add money');
    r = await call('POST', `/goals/${U}/${trip.id}/add`, { amount: -10000 });
    assert(r.body.goals.find((g) => g.id === trip.id).saved_amount === 0, 'taking out more than saved stops at 0');
    assert((await call('POST', `/goals/${U}/${em.id}/add`, { amount: 100 })).status === 400, "can't add by hand to an account-linked goal");
    r = await call('PUT', `/goals/${U}/${trip.id}`, { remind_day: null, target_amount: 60000 });
    assert(r.body.goals.find((g) => g.id === trip.id).reminder_id === null && (await db.from('reminders').select('id').eq('line_user_id', U)).data.length === 0, 'edit: reminder removed');
    for (const [body, label] of [[{ name: '', target_amount: 5 }, 'name'], [{ name: 'x', target_amount: -5 }, 'target'], [{ name: 'x', target_amount: 5, account_id: '00000000-0000-0000-0000-000000000000' }, 'Account not found']]) {
      const res = await call('POST', `/goals/${U}`, body);
      assert(res.status === 400 && res.body.error.includes(label), `400: ${label}`);
    }
    assert((await call('PUT', `/goals/${U}/nope`, {})).status === 400 && (await call('PUT', `/goals/${U}/00000000-0000-0000-0000-000000000000`, { name: 'x' })).status === 404, 'bad and unknown ids');
    r = await call('DELETE', `/goals/${U}/${trip.id}`);
    assert(r.body.goals.length === 1, 'delete');
    // overview endpoint
    const { data: cat } = await db.from('categories').select('id').eq('line_user_id', U).eq('name', 'Others').single();
    await db.from('recurring_transactions').insert({ line_user_id: U, category_id: cat.id, amount: 419, type: 'expense', description: 'Netflix', frequency: 'monthly', next_run_date: new Date().toISOString() });
    r = await call('GET', `/recurring/${U}/overview`);
    assert(r.status === 200 && r.body.monthlyTotal === 419 && r.body.items[0].description === 'Netflix', 'overview endpoint');
  } finally {
    await db.from('reminders').delete().eq('line_user_id', U);
    await db.from('recurring_transactions').delete().eq('line_user_id', U);
    await db.from('categories').delete().eq('line_user_id', U);
    await db.from('users').delete().eq('line_user_id', U);
  }
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); console.log('FAIL: crashed'); process.exit(1); });
