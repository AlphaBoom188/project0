// Tax suggestions over REST: GET /api/tax/:u/:year/suggestions and
// POST .../suggestions/:id/accept|dismiss|restore, on seeded transactions
// and fund lots (the engine itself is covered by api/tax_suggest).
const { BASE } = require('../lib');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const call = (method, p, body) => fetch(`${BASE}/api${p}`, {
  method, headers: { 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const U = `test_taxsg_${crypto.randomBytes(4).toString('hex')}`;
const at = (ymd) => `${ymd}T05:00:00Z`; // noon Bangkok

(async () => {
  await call('POST', '/users', { line_user_id: U, display_name: 'Tax Suggest Test' });
  try {
    const cats = (await call('GET', `/categories/${U}`)).body.categories || (await call('GET', `/categories/${U}`)).body;
    const income = cats.find((c) => c.type === 'income');
    const other = cats.find((c) => c.type === 'expense' && c.name === 'Others');
    const rows = [
      ...['2025-01-25', '2025-02-25', '2025-03-25'].map((d) => ({ amount: 40000, type: 'income', category_id: income.id, description: 'Salary ACME', transaction_date: at(d) })),
      { amount: 24000, type: 'expense', category_id: other.id, description: 'เบี้ยประกันชีวิต', transaction_date: at('2025-04-01') },
      { amount: 500, type: 'expense', category_id: other.id, description: 'coffee', transaction_date: at('2025-04-02') },
      { amount: 99999, type: 'income', category_id: income.id, description: 'Salary', transaction_date: at('2024-12-25') },
    ];
    const ins = await db.from('transactions').insert(rows.map((r) => ({ ...r, line_user_id: U })));
    assert(!ins.error, `seed transactions${ins.error ? ` (${ins.error.message})` : ''}`);
    const { data: h } = await db.from('asset_holdings').insert({ line_user_id: U, asset_type: 'mutual_fund', symbol: 'TESTRMF', quantity: 100, average_cost: 10, currency: 'THB' }).select().single();
    await db.from('asset_lots').insert({ line_user_id: U, holding_id: h.id, side: 'buy', quantity: 1000, price: 10, fee: 0, trade_date: '2025-05-01' });

    // --- List ---
    let r = await call('GET', `/tax/${U}/2568/suggestions`);
    assert(r.status === 200 && Array.isArray(r.body.suggestions), `GET suggestions (got ${r.status})`);
    const byKind = (k) => r.body.suggestions.find((s) => s.kind === k || s.key === k);
    const salary = byKind('salary');
    const life = byKind('life_insurance');
    const rmf = byKind('rmf');
    assert(salary && salary.amount === 120000 && salary.status === 'new' && salary.sources.length === 3, `salary from 3 deposits in 2025 (got ${salary && salary.amount})`);
    assert(life && life.amount === 24000 && rmf && rmf.amount === 10000 && rmf.confidence === 'high', 'life insurance from transactions; RMF from lots');
    assert(r.body.suggestions.length === 3, 'coffee and last year\'s salary suggest nothing');
    // impact = how the balance changes; adding income raises it, a deduction lowers it
    assert(salary.impact >= 0 && life.impact <= 0, `impact signs (salary ${salary.impact}, life ${life.impact})`);

    // --- Accept an income suggestion ---
    r = await call('POST', `/tax/${U}/2568/suggestions/${salary.id}/accept`);
    assert(r.status === 200 && r.body.incomes.length === 1 && r.body.incomes[0].kind === 'salary' && r.body.incomes[0].amount === 120000, 'accept salary -> an income line');
    assert(r.body.suggestions.find((s) => s.id === salary.id).status === 'added' && !('_suggestions' in r.body.profile), 'now "added"; bookkeeping hidden from the profile');
    // a new deposit changes the suggestion -> "changed", and accepting updates the same line
    await db.from('transactions').insert({ line_user_id: U, amount: 40000, type: 'income', category_id: income.id, description: 'Salary ACME', transaction_date: at('2025-04-25') });
    r = await call('GET', `/tax/${U}/2568/suggestions`);
    const changed = r.body.suggestions.find((s) => s.id === salary.id);
    assert(changed.status === 'changed' && changed.amount === 160000 && changed.impact === 0, 'a new deposit -> "changed" (impact 0: still inside the 150,000 tax-free band)');
    r = await call('POST', `/tax/${U}/2568/suggestions/${salary.id}/accept`);
    assert(r.body.incomes.length === 1 && r.body.incomes[0].amount === 160000, 'accepting again updates the same income line');

    // --- Claims: dismiss, restore, accept ---
    r = await call('POST', `/tax/${U}/2568/suggestions/${life.id}/dismiss`);
    assert(r.body.suggestions.find((s) => s.id === life.id).status === 'dismissed' && !('life_insurance' in r.body.claims), 'dismiss hides it, sets nothing');
    r = await call('POST', `/tax/${U}/2568/suggestions/${life.id}/restore`);
    assert(r.body.suggestions.find((s) => s.id === life.id).status === 'new', 'restore');
    r = await call('POST', `/tax/${U}/2568/suggestions/${rmf.id}/accept`);
    assert(r.body.claims.rmf === 10000 && r.body.suggestions.find((s) => s.id === rmf.id).status === 'added', 'accept RMF -> claim set');
    await call('PUT', `/tax/${U}/2568/claims`, { life_insurance: 30000 });
    r = await call('GET', `/tax/${U}/2568/suggestions`);
    const lifeNow = r.body.suggestions.find((s) => s.id === life.id);
    assert(lifeNow.status === 'entered' && lifeNow.entered === 30000, 'a claim typed by hand -> "entered" with the amount');

    // --- Errors ---
    assert((await call('POST', `/tax/${U}/2568/suggestions/0123456789ab/accept`)).status === 404, 'unknown suggestion -> 404');
    assert((await call('POST', `/tax/${U}/2568/suggestions/nothex/accept`)).status === 400, 'malformed id -> 400');
    assert((await call('POST', `/tax/${U}/2568/suggestions/${life.id}/explode`)).status === 404, 'unknown action -> 404');
    r = await call('GET', `/tax/${U}/2569/suggestions`);
    assert(r.status === 200 && r.body.suggestions.length === 0, '2569: nothing from 2025 data');
  } finally {
    await db.from('transactions').delete().eq('line_user_id', U);
    await db.from('categories').delete().eq('line_user_id', U);
    await db.from('users').delete().eq('line_user_id', U);
  }
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); console.log('FAIL: crashed'); process.exit(1); });
