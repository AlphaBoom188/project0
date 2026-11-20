// Pure: services/tax/taxHalfYear.js (PND 94) and the PND 94 credit in taxMath.
const { BACKEND } = require('../lib');
const { buildHalfYear, halfYearRules } = require(`${BACKEND}/services/tax/taxHalfYear.js`);
const { computeTax } = require(`${BACKEND}/services/tax/taxMath.js`);
const { getRules } = require(`${BACKEND}/services/tax/rules/index.js`);

let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const R69 = getRules(2569);
const line = (id, kind, amount, extra = {}) => ({ id, kind, amount, withheld: 0, expense_method: 'flat', actual_expenses: 0, credit_rate: null, ...extra });
const state = (incomes, profile = {}, claims = {}) => ({ profile, claims, incomes });
const half = (st, today = '2026-11-20') => buildHalfYear(R69, st, { today });

// --- Halved allowances ---
const hr = halfYearRules(R69);
const d = (k) => hr.deductions.find((x) => x.key === k);
assert(d('personal').fixed === 30000 && d('spouse').fixed === 30000 && d('parents').perUnit === 15000 && d('disabled_dependants').perUnit === 30000, 'family allowances halved');
assert(d('children').childBase === 15000 && d('children').childBonus === 30000 && !d('rmf') && !d('life_insurance') && d('social_security'), 'children per the Ins94 wording; funds and insurance left for the user');

// --- Online seller: 1,000,000 a year -> 500,000 Jan-Jun ---
let h = half(state([line('a', 'biz_27', 1000000)]));
assert(h.applicable && h.income === 500000 && h.estimated && h.lines[0].halfAmount === 500000, 'Jan-Jun defaults to half the year (estimate)');
assert(h.netIncome === 170000 && h.tax === 1000 && !h.minimumTaxApplies, `500k - 60% - 30k personal = 170k -> 1,000 (0.5% = 2,500 ignored) (got ${h.tax})`);
assert(h.mustFile && h.threshold === 60000 && h.opens === '2026-07-01' && h.deadline === '2026-09-30' && h.status === 'closed', 'must file, window 1 Jul - 30 Sep, closed in November');
assert(half(state([line('a', 'biz_27', 1000000)]), '2026-08-01').status === 'open' && half(state([line('a', 'biz_27', 1000000)]), '2026-03-01').status === 'not_open', 'open in August, not yet in March');

// --- Family ---
h = half(state([line('a', 'biz_27', 1000000)], { maritalStatus: 'married', spouseHasIncome: false, children: [{ birthYear: 2560 }, { birthYear: 2563 }] }));
assert(h.allowances.map((a) => `${a.key}:${a.amount}`).join() === 'personal:30000,spouse:30000,children:60000' && h.netIncome === 80000 && h.tax === 0 && h.threshold === 120000, 'married, spouse no income, 2 kids: 30k + 30k + 15k + (15k + 30k)');
h = half(state([line('a', 'biz_27', 1000000)], {}, { parents: 2, social_security: 9000, rmf: 100000 }));
assert(h.allowances.find((a) => a.key === 'parents').amount === 30000 && h.allowances.find((a) => a.key === 'social_security').amount === 4500 && !h.allowances.find((a) => a.key === 'rmf'), 'parents 15k each, half the social security, no RMF');

// --- Rent, the 0.5% check, entered amounts, actual expenses ---
h = half(state([line('r', 'rent_building', 2000000)]));
assert(h.tax === 53000 && !h.minimumTaxApplies, `rent 1M Jan-Jun: 700k - 30k -> 53,000 (0.5% = 5,000, not over 5,000) (got ${h.tax})`);
h = half(state([line('a', 'biz_44', 1200000, { expense_method: 'actual', actual_expenses: 1100000 })], { _pnd94: { amounts: { a: 1200000 } } }));
assert(!h.estimated && h.income === 1200000 && h.minimumTaxApplies && h.tax === 6000, `entered amount; actual expenses scale with it; 0.5% wins (6,000) (got ${h.tax})`);
h = half(state([line('a', 'biz_27', 1000000), line('s', 'salary', 500000)]));
assert(h.lines.length === 1 && h.income === 500000, 'salary stays out of PND 94');
h = half(state([line('s', 'salary', 500000)]));
assert(!h.applicable && h.reason.includes('40(5)-(8)'), 'salary only: no PND 94');
h = half(state([line('a', 'biz_27', 100000)]));
assert(h.applicable && !h.mustFile && h.income === 50000, 'under 60,000 Jan-Jun: no need to file');

// --- PND 94 credit on the annual return ---
const annual = computeTax(R69, { incomes: [{ kind: 'biz_27', amount: 1000000 }] });
const credited = computeTax(R69, { incomes: [{ kind: 'biz_27', amount: 1000000 }], prepaid: 1000 });
assert(credited.prepaid === 1000 && credited.balance === annual.balance - 1000 && credited.taxDue === annual.taxDue, 'tax paid with PND 94 is credited on PND 90');
assert(computeTax(R69, { incomes: [{ kind: 'salary', amount: 1000000 }], profile: { children: [{ birthYear: 2560 }, { birthYear: 2563 }] } }).allowances.find((a) => a.key === 'children').allowed === 90000, 'annual children unchanged: 30k + 60k');

process.exit(failures ? 1 : 0);
