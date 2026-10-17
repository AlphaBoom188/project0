const { BASE, BACKEND, FIXTURES, OUTPUT } = require('../lib');
const { createClient } = require('@supabase/supabase-js');

const serviceClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function assert(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) process.exitCode = 1;
}

async function api(path, options = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  const lineUserId = 'test_alerts_001';
  await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: lineUserId, display_name: 'Alerts Test' }) });

  const catRes = await api(`/categories/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({ name: 'TestBudgetCat', type: 'expense', budget_amount: 100, budget_period: 'daily' }),
  });
  const categoryId = catRes.body.category.id;
  assert(catRes.status === 201, `budget category created (got ${catRes.status})`);

  // --- First expense (60) stays under budget: no alert, regardless of channel ---
  const under = await api(`/transactions/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({ category_id: categoryId, amount: 60, type: 'expense', transaction_date: new Date().toISOString(), channel: 'liff' }),
  });
  assert(under.status === 201 && under.body.budget_alert === null, `under-budget expense returns budget_alert: null (got ${JSON.stringify(under.body.budget_alert)})`);

  // --- Second expense (50) crosses the 100 threshold, channel: liff -> alert comes back in the response ---
  const crossLiff = await api(`/transactions/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({ category_id: categoryId, amount: 50, type: 'expense', transaction_date: new Date().toISOString(), channel: 'liff' }),
  });
  assert(crossLiff.status === 201 && crossLiff.body.budget_alert !== null, `budget-crossing LIFF expense returns a budget_alert (got ${JSON.stringify(crossLiff.body.budget_alert)})`);
  assert(
    crossLiff.body.budget_alert?.categoryName === 'TestBudgetCat' && crossLiff.body.budget_alert?.totalSpent === 110,
    `budget_alert has correct category/total (got ${JSON.stringify(crossLiff.body.budget_alert)})`
  );

  // --- Third expense: already over budget, should NOT re-fire (one-time crossing alert) ---
  const alreadyOver = await api(`/transactions/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({ category_id: categoryId, amount: 10, type: 'expense', transaction_date: new Date().toISOString(), channel: 'liff' }),
  });
  assert(alreadyOver.status === 201 && alreadyOver.body.budget_alert === null, `already-over-budget expense does not re-fire the alert (got ${JSON.stringify(alreadyOver.body.budget_alert)})`);

  // --- A fresh category + a non-liff channel (default/bot path): alert is still computed into the response, AND a LINE push is attempted (will fail/log for this fake test user, which is expected and fine -- we're checking it doesn't crash the request) ---
  const catRes2 = await api(`/categories/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({ name: 'TestBudgetCat2', type: 'expense', budget_amount: 20, budget_period: 'daily' }),
  });
  const categoryId2 = catRes2.body.category.id;

  const crossBot = await api(`/transactions/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({ category_id: categoryId2, amount: 25, type: 'expense', transaction_date: new Date().toISOString(), channel: 'line_chat' }),
  });
  assert(crossBot.status === 201 && crossBot.body.budget_alert !== null, `budget-crossing bot-channel expense still returns a budget_alert in the response (got ${JSON.stringify(crossBot.body.budget_alert)})`);

  // cleanup
  await serviceClient.from('transactions').delete().eq('line_user_id', lineUserId);
  await serviceClient.from('categories').delete().eq('line_user_id', lineUserId);
  await serviceClient.from('users').delete().eq('line_user_id', lineUserId);
  console.log('\nCleaned up.');
}

main().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
