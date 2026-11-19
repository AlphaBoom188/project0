// DELETE /api/users/:u ("Delete my account", PDPA): needs { confirm: "DELETE" },
// removes every kind of data and the receipt thumbnails, leaves others alone.
const { BASE, BACKEND } = require('../lib');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { BUCKET } = require(`${BACKEND}/services/receiptThumbnail.js`);
const U = `test_acct_del_${Date.now()}`;
const KEEP = `test_acct_keep_${Date.now()}`;
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const api = (p, o = {}) => fetch(`${BASE}/api${p}`, { headers: { 'Content-Type': 'application/json' }, ...o }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const TABLES = ['transactions', 'recurring_transactions', 'accounts', 'budget_events', 'asset_lots', 'asset_holdings', 'investment_goals', 'shared_bills', 'categories', 'line_group_members'];
const counts = async (u) => Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, (await db.from(t).select('*', { count: 'exact', head: true }).eq('line_user_id', u)).count])));
const cleanup = async () => {
  for (const u of [U, KEEP]) {
    await db.from('transactions').delete().eq('line_user_id', u);
    await db.from('recurring_transactions').delete().eq('line_user_id', u);
    await db.from('users').delete().eq('line_user_id', u);
  }
  await db.from('line_groups').delete().like('group_id', 'Ctestdel%');
  await db.storage.from(BUCKET).remove([`${U}/1700000000000-abcdef12.jpg`]);
};

(async () => {
  for (const u of [U, KEEP]) await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: u, display_name: u }) });
  const { body: cats } = await api(`/categories/${U}?type=expense`);
  const cat = cats.categories[0].id;
  const { body: acct } = await api(`/accounts/${U}`, { method: 'POST', body: JSON.stringify({ account_name: 'Bank', account_type: 'bank', balance: 100 }) });
  await api(`/transactions/${U}`, { method: 'POST', body: JSON.stringify({ type: 'expense', amount: 50, category_id: cat, description: 'x', transaction_date: '2026-11-01T12:00:00Z', from_account_id: acct.account.id }) });
  await api(`/recurring/${U}`, { method: 'POST', body: JSON.stringify({ category_id: cat, amount: 10, type: 'expense', frequency: 'monthly', description: 'rent', next_run_date: '2026-12-01' }) });
  await api(`/budget-events/${U}`, { method: 'POST', body: JSON.stringify({ category_id: cat, title: 'Trip', amount: 1000, period_month: '2026-11-01' }) });
  await api(`/portfolio/${U}`, { method: 'POST', body: JSON.stringify({ asset_type: 'gold', symbol: 'GOLD', quantity: 1, average_cost: 100, current_price: 110 }) });
  await api(`/portfolio/${U}/goal`, { method: 'PUT', body: JSON.stringify({ start_date: '2026-11-01', start_value: 100, years: 5, expected_annual_return: 5 }) });
  await api(`/bills/${U}`, { method: 'POST', body: JSON.stringify({ title: 'Dinner', total_amount: 300, split_type: 'equal', participants: [{ display_name: 'Ann' }] }) });
  const G = `Ctestdel${Date.now()}`.padEnd(33, '0');
  await db.from('line_groups').insert({ group_id: G, source_type: 'group', name: 'Del test' });
  await db.from('line_group_members').insert({ group_id: G, line_user_id: U, display_name: 'U' });
  await db.storage.from(BUCKET).upload(`${U}/1700000000000-abcdef12.jpg`, Buffer.from('fake-jpeg'), { contentType: 'image/jpeg', upsert: true });
  await api(`/categories/${KEEP}?type=expense`);
  const before = await counts(U);
  assert(TABLES.every((t) => before[t] > 0), `the user has data in every table (${JSON.stringify(before)})`);

  let r = await api(`/users/${U}`, { method: 'DELETE' });
  assert(r.status === 400 && /confirm/.test(r.body.error), 'without { confirm: "DELETE" } -> 400, nothing deleted');
  assert((await counts(U)).transactions === 1, 'still there after the refused request');

  r = await api(`/users/${U}`, { method: 'DELETE', body: JSON.stringify({ confirm: 'DELETE' }) });
  assert(r.status === 200 && r.body.deleted.user === 1 && r.body.deleted.transactions === 1 && r.body.deleted.thumbnails === 1, `deleted (got ${r.status} ${JSON.stringify(r.body)})`);
  const after = await counts(U);
  assert(TABLES.every((t) => after[t] === 0), `every table is empty for the user (${JSON.stringify(after)})`);
  assert(!(await db.from('users').select('line_user_id').eq('line_user_id', U).maybeSingle()).data, 'the users row is gone');
  const { data: files } = await db.storage.from(BUCKET).list(U);
  assert(!files || files.length === 0, 'receipt thumbnails are removed from storage');
  assert((await counts(KEEP)).categories > 0 && (await db.from('users').select('line_user_id').eq('line_user_id', KEEP).maybeSingle()).data, "another user's data is untouched");

  await cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); await cleanup(); process.exit(1); });
