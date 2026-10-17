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
  const lineUserId = 'test_phase5_001';

  await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: lineUserId, display_name: 'Phase5 Test' }) });

  // --- Categories CRUD ---
  const createCat = await api(`/categories/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Test Budget Cat', type: 'expense', budget_amount: 500, budget_period: 'monthly' }),
  });
  assert(createCat.status === 201 && createCat.body.category.budget_amount == 500, 'create category with budget succeeds');
  const categoryId = createCat.body.category.id;

  const updateCat = await api(`/categories/${lineUserId}/${categoryId}`, {
    method: 'PUT',
    body: JSON.stringify({ budget_amount: 750 }),
  });
  assert(updateCat.status === 200 && updateCat.body.category.budget_amount == 750, 'update category budget succeeds');

  // --- Recurring expenses: create a rule due in the past, then run the engine ---
  const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const createRecurring = await api(`/recurring/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({
      category_id: categoryId,
      amount: 42,
      type: 'expense',
      description: 'Recurring Test Rule',
      frequency: 'monthly',
      start_date: pastDate,
    }),
  });
  assert(createRecurring.status === 201, `create recurring rule succeeds (got ${createRecurring.status}: ${JSON.stringify(createRecurring.body)})`);
  const recurringId = createRecurring.body.recurring?.id;

  const listRecurring = await api(`/recurring/${lineUserId}`);
  assert(listRecurring.status === 200 && listRecurring.body.recurring.length === 1, 'list recurring rules returns the one created');

  // Stub the LINE push so the engine's notification call doesn't need a real token.
  const clientPath = require.resolve(`${BACKEND}/services/lineMessagingClient.js`);
  const pushed = [];
  require.cache[clientPath] = {
    id: clientPath,
    filename: clientPath,
    loaded: true,
    exports: {
      async replyText() {},
      async replyConfirmationCard() {},
      async getImageBuffer() {},
      async pushText(to, text) {
        pushed.push({ to, text });
      },
    },
  };
  const { processDueRecurringTransactions } = require(`${BACKEND}/jobs/recurringTransactions.js`);
  await processDueRecurringTransactions({ lineUserId }); // scoped: never fire real users' rules

  const { data: generatedTx } = await serviceClient
    .from('transactions')
    .select('*')
    .eq('line_user_id', lineUserId)
    .eq('description', 'Recurring Test Rule');
  assert((generatedTx || []).length === 1, 'engine generated exactly one transaction for the due rule');
  assert(pushed.some((p) => p.to === lineUserId && /Recurring/i.test(p.text)), 'engine pushed a LINE notification for the generated transaction');

  const { data: ruleAfter } = await serviceClient.from('recurring_transactions').select('next_run_date').eq('id', recurringId).single();
  const nextRun = new Date(ruleAfter.next_run_date);
  const expectedNext = new Date(pastDate);
  expectedNext.setUTCMonth(expectedNext.getUTCMonth() + 1);
  assert(Math.abs(nextRun - expectedNext) < 1000, `next_run_date advanced by one month correctly (got ${ruleAfter.next_run_date})`);

  // Running the engine again right away should NOT regenerate (next_run_date is now in the future).
  await processDueRecurringTransactions({ lineUserId }); // scoped: never fire real users' rules
  const { data: txAfterSecondRun } = await serviceClient
    .from('transactions')
    .select('id')
    .eq('line_user_id', lineUserId)
    .eq('description', 'Recurring Test Rule');
  assert((txAfterSecondRun || []).length === 1, 'running the engine again does not duplicate-generate');

  // Pause via is_active=false, confirm it's excluded even if somehow still due
  await api(`/recurring/${lineUserId}/${recurringId}`, { method: 'PUT', body: JSON.stringify({ is_active: false }) });
  await serviceClient.from('recurring_transactions').update({ next_run_date: pastDate }).eq('id', recurringId);
  await processDueRecurringTransactions({ lineUserId }); // scoped: never fire real users' rules
  const { data: txAfterPause } = await serviceClient
    .from('transactions')
    .select('id')
    .eq('line_user_id', lineUserId)
    .eq('description', 'Recurring Test Rule');
  assert((txAfterPause || []).length === 1, 'a paused (is_active=false) rule is not processed even when due');

  // --- CSV export with filters ---
  const exportRes = await fetch(`${BASE}/api/transactions/${lineUserId}/export?type=expense`);
  // fetch().text() silently strips a leading BOM per the WHATWG decoding spec
  // (TextDecoder's default ignoreBOM: false) -- check the raw bytes instead,
  // same as the earlier curl/xxd verification that confirmed ef bb bf on the wire.
  const exportBuffer = Buffer.from(await exportRes.arrayBuffer());
  const csvText = exportBuffer.toString('utf8');
  assert(exportRes.status === 200 && csvText.includes('Recurring Test Rule'), 'filtered CSV export includes the generated transaction');
  assert(exportBuffer[0] === 0xef && exportBuffer[1] === 0xbb && exportBuffer[2] === 0xbf, 'CSV export starts with real BOM bytes on the wire');

  // --- Email export with no address saved -> clean 400 (never actually sends mail) ---
  const emailExportRes = await api(`/transactions/${lineUserId}/export/email`, { method: 'POST' });
  assert(emailExportRes.status === 400 && /No email address/.test(emailExportRes.body.error), `email export without an address -> 400 (got ${emailExportRes.status})`);

  // --- Delete recurring rule, delete category (should succeed once the transaction is gone) ---
  await api(`/recurring/${lineUserId}/${recurringId}`, { method: 'DELETE' });
  const listAfterDelete = await api(`/recurring/${lineUserId}`);
  assert(listAfterDelete.body.recurring.length === 0, 'recurring rule deleted successfully');

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
