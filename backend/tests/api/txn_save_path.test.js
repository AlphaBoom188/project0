// services/transactionCreate.js save path, in-process against the real DB:
// error order kept, one categories read per save (the budget check reuses it),
// balances right under concurrent saves (atomic once migration 027 is applied;
// before that the read-modify-write fallback runs, checked sequentially).
const { BACKEND } = require('../lib');
const supabase = require(`${BACKEND}/config/supabase.js`);
const { createTransaction, InvalidCategoryError } = require(`${BACKEND}/services/transactionCreate.js`);

let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const U = `test_save_${Date.now().toString(36)}`;
const requests = [];
const realFetch = global.fetch;
global.fetch = (url, opts = {}) => { requests.push(`${opts.method || 'GET'} ${String(url).split('?')[0].replace(process.env.SUPABASE_URL, '')}`); return realFetch(url, opts); };

(async () => {
  try {
    await supabase.from('users').insert({ line_user_id: U, display_name: 'Save path' });
    const { data: cat } = await supabase.from('categories').insert({ line_user_id: U, name: 'Food', type: 'expense', budget_amount: 100, budget_period: 'monthly' }).select('id').single();
    const { data: acc } = await supabase.from('accounts').insert({ line_user_id: U, account_name: 'Bank', account_type: 'bank', balance: 1000 }).select('id').single();
    const save = (extra = {}) => createTransaction({ lineUserId: U, categoryId: cat.id, amount: 10, type: 'expense', description: 'x', transactionDate: new Date().toISOString(), fromAccountId: acc.id, channel: 'liff', ...extra });

    // Bad category and bad account: the category error still wins.
    let err = null;
    try { await save({ categoryId: '00000000-0000-0000-0000-000000000000', fromAccountId: '00000000-0000-0000-0000-000000000001' }); } catch (e) { err = e; }
    assert(err instanceof InvalidCategoryError, `bad category + bad account -> InvalidCategoryError (got ${err && err.constructor.name})`);

    requests.length = 0;
    const first = await save();
    assert(requests.filter((r) => r.endsWith('/rest/v1/categories')).length === 1, `one categories read per save (got ${JSON.stringify(requests)})`);
    assert(first.budget_alert === null && Array.isArray(first.event_budget_alerts), 'alert fields still returned');

    // Crossing the 100 budget still alerts (9 more saves of 10 -> 100).
    let crossed = null;
    for (let i = 0; i < 9; i += 1) crossed = (await save()).budget_alert || crossed;
    assert(crossed && crossed.totalSpent === 100 && crossed.budgetAmount === 100, `budget crossing alert from the prefetched category (got ${JSON.stringify(crossed)})`);

    const { error: rpcError } = await supabase.rpc('adjust_account_balance', { p_account_id: acc.id, p_delta: 0 });
    if (!rpcError) {
      await Promise.all(Array.from({ length: 8 }, () => save()));
      const { data } = await supabase.from('accounts').select('balance').eq('id', acc.id).single();
      assert(Number(data.balance) === 1000 - 18 * 10, `8 concurrent saves: balance exact with the atomic update (got ${data.balance})`);
    } else {
      const { data } = await supabase.from('accounts').select('balance').eq('id', acc.id).single();
      assert(Number(data.balance) === 1000 - 10 * 10, `migration 027 not applied (${rpcError.code}): fallback keeps balances right (got ${data.balance})`);
    }
  } catch (e) {
    console.error(e);
    failures += 1;
  } finally {
    global.fetch = realFetch;
    await supabase.from('transactions').delete().eq('line_user_id', U);
    await supabase.from('accounts').delete().eq('line_user_id', U);
    await supabase.from('categories').delete().eq('line_user_id', U);
    await supabase.from('users').delete().eq('line_user_id', U);
  }
  process.exit(failures ? 1 : 0);
})();
