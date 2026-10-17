const { BASE, BACKEND, FIXTURES, OUTPUT } = require('../lib');
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
function assert(c, l) { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) process.exitCode = 1; }
async function api(path, o = {}) {
  const r = await fetch(`${BASE}/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...o });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b };
}
const U = 'test_budget_events_001', OTHER = 'test_budget_events_002';
const now = new Date();
const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
const prevMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)).toISOString();
const midMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 2, 12)).toISOString();

async function main() {
  for (const id of [U, OTHER]) await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: id, display_name: id }) });
  const cats = await api(`/categories/${U}?type=expense`);
  const [catA, catB] = cats.body.categories;
  const otherCats = await api(`/categories/${OTHER}?type=expense`);

  const tx = (category_id, amount, date) => api(`/transactions/${U}`, { method: 'POST', body: JSON.stringify({ category_id, amount, type: 'expense', description: 't', transaction_date: date, channel: 'liff' }) });
  await tx(catA.id, 300, midMonth);
  await tx(catA.id, 200, midMonth);
  await tx(catA.id, 999, prevMonthDate); // previous month: must not count
  await tx(catB.id, 777, midMonth);      // other category: must not count

  const created = await api(`/budget-events/${U}`, { method: 'POST', body: JSON.stringify({ category_id: catA.id, title: 'Clinic visit', amount: 1000, period_month: month }) });
  assert(created.status === 201, `create event (got ${created.status}: ${JSON.stringify(created.body)})`);
  const ev = created.body.budget_event;
  assert(ev.spent === 500, `spent counts only this month + this category (got ${ev.spent})`);
  assert(ev.remaining === 500 && ev.percent === 50, `remaining/percent (got ${ev.remaining}/${ev.percent})`);
  assert(ev.categories?.name === catA.name, `category joined (got ${JSON.stringify(ev.categories)})`);

  const over = await api(`/budget-events/${U}`, { method: 'POST', body: JSON.stringify({ category_id: catA.id, title: 'Small', amount: 100, period_month: month }) });
  assert(over.body.budget_event.percent === 100 && over.body.budget_event.remaining === -400, `over budget caps percent at 100, remaining negative (got ${over.body.budget_event.percent}/${over.body.budget_event.remaining})`);

  assert((await api(`/budget-events/${U}`, { method: 'POST', body: JSON.stringify({ category_id: catA.id, title: 'x', period_month: month }) })).status === 400, 'missing amount -> 400');
  assert((await api(`/budget-events/${U}`, { method: 'POST', body: JSON.stringify({ category_id: catA.id, title: 'x', amount: -5, period_month: month }) })).status === 400, 'negative amount -> 400');
  assert((await api(`/budget-events/${U}`, { method: 'POST', body: JSON.stringify({ category_id: otherCats.body.categories[0].id, title: 'x', amount: 5, period_month: month }) })).status === 400, "someone else's category -> 400");

  const list = await api(`/budget-events/${U}?month=${month}`);
  assert(list.status === 200 && list.body.budget_events.length === 2, `list by month (got ${list.body.budget_events?.length})`);
  const otherMonth = await api(`/budget-events/${U}?month=2000-01-01`);
  assert(otherMonth.body.budget_events.length === 0, 'month filter excludes');

  const upd = await api(`/budget-events/${U}/${ev.id}`, { method: 'PUT', body: JSON.stringify({ amount: 2000 }) });
  assert(upd.status === 200 && upd.body.budget_event.percent === 25, `update recomputes percent (got ${upd.body.budget_event?.percent})`);
  assert((await api(`/budget-events/${U}/${ev.id}`, { method: 'PUT', body: JSON.stringify({ amount: 0 }) })).status === 400, 'update amount 0 -> 400');

  const wrongUserUpd = await api(`/budget-events/${OTHER}/${ev.id}`, { method: 'PUT', body: JSON.stringify({ title: 'hijack' }) });
  assert(wrongUserUpd.status !== 200, `update with wrong line_user_id does not succeed (got ${wrongUserUpd.status})`);
  await api(`/budget-events/${OTHER}/${ev.id}`, { method: 'DELETE' });
  assert((await api(`/budget-events/${U}`)).body.budget_events.length === 2, "delete with wrong line_user_id no-ops");

  assert((await api(`/budget-events/${U}/${ev.id}`, { method: 'DELETE' })).status === 200, 'delete');
  assert((await api(`/budget-events/${U}`)).body.budget_events.length === 1, 'actually deleted');

  // --- Google columns (migration 013) + callback guard ---
  await db.from('users').update({ google_email: 'verified@example.com', google_linked_at: new Date().toISOString() }).eq('line_user_id', U);
  const user = await api(`/users/${U}`);
  assert(user.body.user.google_email === 'verified@example.com', `GET user returns google_email (got ${user.body.user?.google_email})`);
  const cb = await api('/google/callback');
  assert(cb.status === 400 && String(cb.body).includes('Missing code'), `callback without code -> 400 HTML (got ${cb.status})`);
  const noEmail = await api(`/transactions/${OTHER}/export/email`, { method: 'POST', body: '{}' });
  assert(noEmail.status === 400, `export email with no email/google_email -> 400 (got ${noEmail.status}: ${JSON.stringify(noEmail.body)})`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => {
  for (const id of [U, OTHER]) {
    await db.from('budget_events').delete().eq('line_user_id', id);
    await db.from('transactions').delete().eq('line_user_id', id);
    await db.from('categories').delete().eq('line_user_id', id);
    await db.from('users').delete().eq('line_user_id', id);
  }
});
