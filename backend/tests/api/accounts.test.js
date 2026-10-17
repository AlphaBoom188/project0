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
  const lineUserId = 'test_accounts_001';
  await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: lineUserId, display_name: 'Accounts Test' }) });

  // --- Accounts CRUD ---
  const createBank = await api(`/accounts/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({ account_name: 'Bangkok Bank', account_type: 'bank', balance: 1000 }),
  });
  assert(createBank.status === 201 && createBank.body.account.balance == 1000, `create bank account succeeds (got ${createBank.status})`);
  const bankId = createBank.body.account.id;

  const createWallet = await api(`/accounts/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({ account_name: 'TrueMoney', account_type: 'e_wallet', balance: 0 }),
  });
  assert(createWallet.status === 201, `create e_wallet account succeeds (got ${createWallet.status})`);
  const walletId = createWallet.body.account.id;

  const invalidType = await api(`/accounts/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({ account_name: 'Bad', account_type: 'bogus' }),
  });
  assert(invalidType.status === 400, `invalid account_type rejected (got ${invalidType.status})`);

  const listAccounts = await api(`/accounts/${lineUserId}`);
  assert(listAccounts.body.accounts.length === 2, 'list accounts returns both created accounts');

  // --- Transfer: bank -> wallet, should move 300 and update both balances ---
  const transfer = await api(`/transactions/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({
      amount: 300,
      type: 'transfer',
      from_account_id: bankId,
      to_account_id: walletId,
      transaction_date: new Date().toISOString(),
    }),
  });
  assert(transfer.status === 201 && transfer.body.transaction.category_id === null, `transfer created with null category_id (got ${transfer.status})`);

  const bankAfterTransfer = await api(`/accounts/${lineUserId}`);
  const bank = bankAfterTransfer.body.accounts.find((a) => a.id === bankId);
  const wallet = bankAfterTransfer.body.accounts.find((a) => a.id === walletId);
  assert(Number(bank.balance) === 700, `bank balance decremented correctly (got ${bank.balance})`);
  assert(Number(wallet.balance) === 300, `wallet balance incremented correctly (got ${wallet.balance})`);

  // --- Transfer with same from/to account: rejected ---
  const badTransfer = await api(`/transactions/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({ amount: 50, type: 'transfer', from_account_id: bankId, to_account_id: bankId, transaction_date: new Date().toISOString() }),
  });
  assert(badTransfer.status === 400, `transfer to the same account rejected (got ${badTransfer.status})`);

  // --- Expense attributed to an account: decrements balance ---
  const catRes = await api(`/categories/${lineUserId}`);
  const categoryId = catRes.body.categories[0].id;
  await api(`/transactions/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({
      category_id: categoryId,
      amount: 100,
      type: 'expense',
      from_account_id: bankId,
      transaction_date: new Date().toISOString(),
    }),
  });
  const afterExpense = await api(`/accounts/${lineUserId}`);
  const bankAfterExpense = afterExpense.body.accounts.find((a) => a.id === bankId);
  assert(Number(bankAfterExpense.balance) === 600, `expense attributed to an account decremented its balance (got ${bankAfterExpense.balance})`);

  // --- Income attributed to an account: increments balance ---
  await api(`/transactions/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({
      category_id: catRes.body.categories.find((c) => c.type === 'income')?.id,
      amount: 5000,
      type: 'income',
      to_account_id: bankId,
      transaction_date: new Date().toISOString(),
    }),
  });
  const afterIncome = await api(`/accounts/${lineUserId}`);
  const bankAfterIncome = afterIncome.body.accounts.find((a) => a.id === bankId);
  assert(Number(bankAfterIncome.balance) === 5600, `income attributed to an account incremented its balance (got ${bankAfterIncome.balance})`);

  // --- Account deletion blocked while it has transactions ---
  const deleteInUse = await api(`/accounts/${lineUserId}/${bankId}`, { method: 'DELETE' });
  assert(deleteInUse.status === 400, `deleting an account with transactions is blocked (got ${deleteInUse.status})`);

  // --- Recurring with pay window ---
  const createRecurring = await api(`/recurring/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({
      category_id: categoryId,
      amount: 8000,
      type: 'expense',
      description: 'Rent',
      frequency: 'monthly',
      pay_start_day: 1,
      pay_end_day: 5,
    }),
  });
  assert(
    createRecurring.status === 201 && createRecurring.body.recurring.pay_start_day === 1 && createRecurring.body.recurring.pay_end_day === 5,
    `recurring rule stores pay_start_day/pay_end_day (got ${JSON.stringify(createRecurring.body)})`
  );

  const badWindow = await api(`/recurring/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({ category_id: categoryId, amount: 100, type: 'expense', frequency: 'monthly', pay_start_day: 40 }),
  });
  assert(badWindow.status === 400, `pay_start_day out of range (40) is rejected (got ${badWindow.status})`);

  // --- Regression: a normal expense with no account still works exactly as before ---
  const plainExpense = await api(`/transactions/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({ category_id: categoryId, amount: 25, type: 'expense', transaction_date: new Date().toISOString() }),
  });
  assert(plainExpense.status === 201, `plain expense with no account still works (got ${plainExpense.status})`);

  // cleanup
  await serviceClient.from('transactions').delete().eq('line_user_id', lineUserId);
  await serviceClient.from('recurring_transactions').delete().eq('line_user_id', lineUserId);
  await serviceClient.from('accounts').delete().eq('line_user_id', lineUserId);
  await serviceClient.from('categories').delete().eq('line_user_id', lineUserId);
  await serviceClient.from('users').delete().eq('line_user_id', lineUserId);
  console.log('\nCleaned up.');
}

main().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
