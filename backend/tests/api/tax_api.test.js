// Tax section over REST (migration 021): GET /api/tax/:u/:year, PUT
// profile / claims, POST/PUT/DELETE incomes. The numbers themselves are
// covered by api/tax_math; this checks storage, validation and that each
// write returns a fresh result.
const { BASE } = require('../lib');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const call = (method, p, body) => fetch(`${BASE}/api${p}`, {
  method, headers: { 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const U = `test_tax_${crypto.randomBytes(4).toString('hex')}`;
const OTHER = `test_tax_other_${crypto.randomBytes(4).toString('hex')}`;

(async () => {
  for (const id of [U, OTHER]) await db.from('users').insert({ line_user_id: id, display_name: 'Tax Test' });
  try {
    // --- Empty year ---
    let r = await call('GET', `/tax/${U}/2568`);
    assert(r.status === 200 && r.body.year === 2568 && r.body.years.join() === '2568,2569', `GET an empty year (got ${r.status})`);
    assert(r.body.incomes.length === 0 && r.body.result.balance === 0 && r.body.result.filing.form === 'PND91', 'nothing entered: no tax');
    const rules = r.body.rules;
    assert(rules.incomeKinds.length > 60 && rules.incomeKinds.find((k) => k.key === 'biz_17').label.includes('Grab') && rules.shortcuts.includes('salary'), 'rules: income catalogue and shortcuts');
    assert(rules.deductions.find((d) => d.key === 'easy_ereceipt') && rules.deductions.find((d) => d.key === 'nsf').verified === false && rules.filing.onlineDeadline === '2569-04-08', 'rules: deductions with verified flags, filing');
    assert(!JSON.stringify(rules).includes('function'), 'rules are plain data');
    assert((await call('GET', `/tax/${U}/2570`)).status === 404 && (await call('GET', `/tax/${U}/abc`)).status === 404, 'unknown year -> 404');

    // --- Incomes ---
    r = await call('POST', `/tax/${U}/2568/incomes`, { kind: 'salary', amount: 500000, withheld: 5000, payer: '  Acme Co  ' });
    assert(r.status === 201 && r.body.income.payer === 'Acme Co' && r.body.result.balance === 6500, `add salary -> pay 6,500 with the personal allowance (got ${r.status} ${r.body.result && r.body.result.balance})`);
    const salaryId = r.body.income.id;
    r = await call('POST', `/tax/${U}/2568/incomes`, { kind: 'dividend_th', amount: 20000, withheld: 2000, creditRate: 0.2 });
    assert(r.status === 201 && r.body.result.dividendCredit === 5000 && r.body.result.filing.form === 'PND90', 'add Thai dividends with a 20% credit -> PND 90');
    const divId = r.body.income.id;
    for (const [body, label] of [
      [{ kind: 'nope', amount: 1 }, 'Choose an income type'], [{ kind: 'salary' }, 'Enter the income amount'], [{ kind: 'salary', amount: 0 }, 'above 0'],
      [{ kind: 'salary', amount: 100, withheld: 200 }, "can't be more"], [{ kind: 'dividend_th', amount: 100, creditRate: 0.5 }, 'credit rate'],
      [{ kind: 'biz_27', amount: 100, expenseMethod: 'guess' }, 'expenseMethod'],
    ]) {
      const res = await call('POST', `/tax/${U}/2568/incomes`, body);
      assert(res.status === 400 && res.body.error.includes(label), `400: ${label}`);
    }
    r = await call('PUT', `/tax/${U}/2568/incomes/${salaryId}`, { amount: 600000 });
    assert(r.status === 200 && r.body.incomes.find((i) => i.id === salaryId).amount === 600000, 'edit an income');
    assert((await call('PUT', `/tax/${U}/2568/incomes/${salaryId}`, { withheld: 700000 })).status === 400, 'edit: withheld above the saved amount -> 400');
    assert((await call('PUT', `/tax/${OTHER}/2568/incomes/${salaryId}`, { amount: 1 })).status === 404, "someone else's income -> 404");
    assert((await call('PUT', `/tax/${U}/2569/incomes/${salaryId}`, { amount: 1 })).status === 404, 'income from another year -> 404');
    assert((await call('PUT', `/tax/${U}/2568/incomes/not-a-uuid`, { amount: 1 })).status === 400, 'malformed id -> 400');
    r = await call('DELETE', `/tax/${U}/2568/incomes/${divId}`);
    assert(r.status === 200 && r.body.incomes.length === 1 && r.body.result.filing.form === 'PND91', 'delete an income');

    // --- Profile ---
    r = await call('PUT', `/tax/${U}/2568/profile`, { maritalStatus: 'married', spouseHasIncome: false, children: [{ birthYear: 2560 }, { birthYear: 2563 }] });
    const a = (key) => (r.body.result.allowances.find((x) => x.key === key) || {}).allowed;
    assert(r.status === 200 && a('spouse') === 60000 && a('children') === 90000, 'profile: spouse and children allowances');
    r = await call('PUT', `/tax/${U}/2568/profile`, { age65: true });
    assert(r.body.profile.maritalStatus === 'married' && r.body.profile.age65 === true && r.body.result.totals.exempt === 190000, 'profile updates merge');
    for (const [body, label] of [[{ maritalStatus: 'complicated' }, 'maritalStatus'], [{ age65: 'yes' }, 'true or false'], [{ children: [{ birthYear: 2600 }] }, 'birth year']]) {
      const res = await call('PUT', `/tax/${U}/2568/profile`, body);
      assert(res.status === 400 && res.body.error.includes(label), `profile 400: ${label}`);
    }
    await call('PUT', `/tax/${U}/2568/profile`, { age65: false });

    // --- Claims ---
    r = await call('PUT', `/tax/${U}/2568/claims`, { life_insurance: 30000, rmf: '50000', parents: 2, easy_ereceipt: 50000 });
    assert(r.status === 200 && r.body.claims.rmf === 50000 && r.body.claims.parents === 2, 'claims saved (numbers normalized)');
    const lim = r.body.result.limits;
    assert(lim.rmf === 180000 && lim.easy_ereceipt === 50000, 'limits come back with the result');
    r = await call('PUT', `/tax/${U}/2568/claims`, { rmf: null, personal: false });
    assert(!('rmf' in r.body.claims) && r.body.claims.life_insurance === 30000 && r.body.claims.personal === false, 'null removes one claim; others kept; personal can be turned off');
    r = await call('PUT', `/tax/${U}/2568/claims`, { personal: true });
    assert(!('personal' in r.body.claims), 'personal back on');
    for (const [body, label] of [[{ solar_rooftop: 1 }, "isn't a deduction in tax year 2568"], [{ parents: 2.5 }, 'whole number'], [{ parents: 9 }, 'whole number'], [{ rmf: -1 }, 'between 0'], [{ children: 2 }, 'comes from your profile'], [[1], 'object']]) {
      const res = await call('PUT', `/tax/${U}/2568/claims`, body);
      assert(res.status === 400 && res.body.error.includes(label), `claims 400: ${label}`);
    }

    // --- Years are separate; users are separate ---
    r = await call('GET', `/tax/${U}/2569`);
    assert(r.body.incomes.length === 0 && Object.keys(r.body.claims).length === 0 && r.body.rules.carriedOver === true, '2569 is its own year (carried-over rules)');
    r = await call('PUT', `/tax/${U}/2569/claims`, { solar_rooftop: 150000 });
    assert(r.status === 200 && r.body.claims.solar_rooftop === 150000, '2569-only deduction accepted in 2569');
    assert((await call('GET', `/tax/${OTHER}/2568`)).body.incomes.length === 0, "another user doesn't see it");

    // --- Account deletion ---
    assert((await call('DELETE', `/users/${U}`, { confirm: 'DELETE' })).status === 200, 'delete the account');
    const left = await db.from('tax_incomes').select('id').eq('line_user_id', U);
    const leftP = await db.from('tax_profiles').select('tax_year').eq('line_user_id', U);
    assert(left.data.length === 0 && leftP.data.length === 0, 'tax data went with it');
  } finally {
    for (const id of [U, OTHER]) await db.from('users').delete().eq('line_user_id', id);
  }
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); console.log('FAIL: crashed'); process.exit(1); });
