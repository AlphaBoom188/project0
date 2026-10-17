// Event/occasion budget alerts: 80% heads-up + used-up, once per crossing,
// routed like category budget alerts (LIFF -> in response, others -> LINE push).
// In-process with LINE pushes captured, so nothing is actually sent.
const { BACKEND, BASE } = require('../lib');
const { createClient } = require('@supabase/supabase-js');

const pushed = [];
const clientPath = require.resolve(`${BACKEND}/services/lineMessagingClient.js`);
require.cache[clientPath] = {
  id: clientPath, filename: clientPath, loaded: true,
  exports: { async replyText() {}, async replyConfirmationCard() {}, async getImageBuffer() {}, async pushText(to, text) { pushed.push({ to, text }); } },
};
const { createTransaction } = require(`${BACKEND}/services/transactionCreate.js`);

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const U = 'test_event_alerts';
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures++; };
const api = (p, o = {}) =>
  fetch(`${BASE}/api${p}`, { headers: { 'Content-Type': 'application/json' }, ...o }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const settle = () => new Promise((r) => setTimeout(r, 600)); // pushes are fire-and-forget

const now = new Date();
const monthStart = (offset) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)).toISOString().slice(0, 10);
const midMonth = (offset) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 15, 5)).toISOString();

async function cleanup() {
  for (const t of ['budget_events', 'transactions', 'categories', 'users']) await db.from(t).delete().eq('line_user_id', U);
}

(async () => {
  await cleanup();
  await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: U, display_name: 'Event Alerts Test' }) });
  const [catA, catB, catC] = (await api(`/categories/${U}?type=expense`)).body.categories;
  const bucket = (category_id, title, amount, period_month) =>
    api(`/budget-events/${U}`, { method: 'POST', body: JSON.stringify({ category_id, title, amount, period_month }) });
  await bucket(catA.id, 'Songkran Trip', 1000, monthStart(0));
  await bucket(catA.id, 'Next Month Thing', 100, monthStart(1)); // different month: must never fire from this month's spending
  await bucket(catB.id, 'Clinic Visit', 500, monthStart(0));
  await bucket(catC.id, 'Last Month Gift', 200, monthStart(-1));

  const seenTitles = [];
  const spend = async (categoryId, amount, { channel = 'liff', date = midMonth(0) } = {}) => {
    const tx = await createTransaction({ lineUserId: U, categoryId, amount, type: 'expense', transactionDate: date, description: 'event alert test', channel });
    await settle();
    seenTitles.push(...tx.event_budget_alerts.map((a) => a.title));
    return tx.event_budget_alerts;
  };

  pushed.length = 0;
  let alerts = await spend(catA.id, 700);
  assert(alerts.length === 0, `70% of a bucket: no alert (got ${JSON.stringify(alerts)})`);
  alerts = await spend(catA.id, 150);
  assert(alerts.length === 1 && alerts[0].level === 'warning' && alerts[0].title === 'Songkran Trip', `crossing 80% -> one heads-up (got ${JSON.stringify(alerts)})`);
  assert(/85% of event budget "Songkran Trip" \(850\.00 of 1000\.00\)/.test(alerts[0].message), `heads-up message (got "${alerts[0].message}")`);
  alerts = await spend(catA.id, 50);
  assert(alerts.length === 0, 'still between 80% and 100%: no repeat heads-up');
  alerts = await spend(catA.id, 100);
  assert(alerts.length === 1 && alerts[0].level === 'over', `reaching exactly 100% -> used up (got ${JSON.stringify(alerts)})`);
  assert(alerts[0].message === 'Event budget "Songkran Trip" is used up: 1000.00 of 1000.00 spent.', `used-up message (got "${alerts[0].message}")`);
  alerts = await spend(catA.id, 10);
  assert(alerts.length === 0, 'already over: no repeat alert');
  assert(!seenTitles.includes('Next Month Thing'), `next month's bucket never fired from this month's spending (saw ${JSON.stringify(seenTitles)})`);
  assert(pushed.length === 0, `LIFF channel never pushes to LINE (got ${pushed.length})`);

  alerts = await spend(catB.id, 600);
  assert(alerts.length === 1 && alerts[0].level === 'over', `one expense jumping 0% -> 120%: only the used-up alert, not both (got ${JSON.stringify(alerts.map((a) => a.level))})`);

  alerts = await spend(catC.id, 250, { date: midMonth(-1) });
  assert(alerts.length === 1 && alerts[0].title === 'Last Month Gift', `a back-dated expense alerts on its own month's bucket (got ${JSON.stringify(alerts)})`);

  // --- non-LIFF channels push to LINE instead ---
  await db.from('budget_events').delete().eq('line_user_id', U);
  await db.from('transactions').delete().eq('line_user_id', U);
  await bucket(catA.id, 'Bot Bucket', 100, monthStart(0));
  pushed.length = 0;
  alerts = await spend(catA.id, 120, { channel: 'line_chat' });
  assert(alerts.length === 1, 'bot channel still returns the alert');
  assert(pushed.length === 1 && pushed[0].to === U && pushed[0].text === '⚠️ Event budget "Bot Bucket" is used up: 120.00 of 100.00 spent.', `bot channel pushes it to LINE (got ${JSON.stringify(pushed)})`);

  await db.from('transactions').delete().eq('line_user_id', U);
  await db.from('users').update({ notifications_enabled: false }).eq('line_user_id', U);
  pushed.length = 0;
  alerts = await spend(catA.id, 90, { channel: 'system' });
  assert(alerts.length === 1 && alerts[0].level === 'warning', 'recurring/system channel computes the heads-up');
  assert(pushed.length === 0, `notifications_enabled=false suppresses the push (got ${pushed.length})`);

  // --- the REST endpoint surfaces it for the LIFF app ---
  await db.from('transactions').delete().eq('line_user_id', U);
  const res = await api(`/transactions/${U}`, { method: 'POST', body: JSON.stringify({ category_id: catA.id, amount: 85, type: 'expense', transaction_date: midMonth(0), channel: 'liff' }) });
  assert(res.status === 201 && Array.isArray(res.body.event_budget_alerts) && res.body.event_budget_alerts[0]?.level === 'warning', `POST /transactions returns event_budget_alerts (got ${JSON.stringify(res.body.event_budget_alerts)})`);
  assert(res.body.transaction && !('event_budget_alerts' in res.body.transaction), 'alerts are a top-level field, not nested in the transaction');

  await cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); await cleanup(); process.exit(1); });
