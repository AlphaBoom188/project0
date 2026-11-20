// Pure: services/tax/taxMath.js with the 2568 and 2569 rules
// (services/tax/rules). Worked examples are computed by hand from the RD
// 2568 booklets (docs/TAX_RESEARCH.md section 7); the first one matches iTAX.
const { BACKEND } = require('../lib');
const { computeTax, progressiveTax } = require(`${BACKEND}/services/tax/taxMath.js`);
const { getRules, YEARS } = require(`${BACKEND}/services/tax/rules/index.js`);

let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const R68 = getRules(2568);
const R69 = getRules(2569);
const tax = (input, rules = R68) => computeTax(rules, input);
const allow = (r, key) => (r.allowances.find((a) => a.key === key) || {}).allowed;
const salary = (amount, withheld = 0) => ({ kind: 'salary', amount, withheld });

// --- Rules registry ---
assert(YEARS.join() === '2568,2569' && getRules(2570) === null, 'years 2568 and 2569');
assert(R68.deductions.some((d) => d.key === 'easy_ereceipt') && !R69.deductions.some((d) => d.key === 'easy_ereceipt'), 'Easy E-Receipt is 2568 only');
assert(R69.deductions.some((d) => d.key === 'solar_rooftop') && R69.carriedOver, '2569 adds solar rooftop and is marked carried over');
let threw = false;
try { computeTax(null, {}); } catch { threw = true; }
assert(threw, 'unknown year throws');

// --- Progressive table ---
const S = (b) => b * 100;
assert(progressiveTax(R68.brackets, S(150000)).tax === 0, '150,000 -> 0');
assert(progressiveTax(R68.brackets, S(300000)).tax === S(7500), '300,000 -> 7,500');
assert(progressiveTax(R68.brackets, S(1000000)).tax === S(115000), '1,000,000 -> 115,000');
assert(progressiveTax(R68.brackets, S(6000000)).tax === S(1615000) && progressiveTax(R68.brackets, S(6000000)).marginal === 0.35, '6,000,000 -> 1,615,000 at 35%');

// --- iTAX worked example: salary 500k, 5k withheld, nothing claimed ---
let r = tax({ incomes: [salary(500000, 5000)], claims: { personal: false } });
assert(r.totals.expenses === 100000 && r.totals.netIncome === 400000 && r.taxDue === 17500 && r.balance === 12500 && r.result === 'pay', `iTAX example: pay 12,500 (got ${r.balance})`);
// ... with the personal allowance (claimed by default here)
r = tax({ incomes: [salary(500000, 5000)] });
assert(allow(r, 'personal') === 60000 && r.totals.netIncome === 340000 && r.taxDue === 11500 && r.balance === 6500, `with the personal allowance: pay 6,500 (got ${r.balance})`);
assert(r.marginalRate === 0.10 && r.effectiveRate === 0.023 && r.filing.form === 'PND91' && r.filing.mustFile, 'rates and PND 91');
assert(r.instalments === true && tax({ incomes: [salary(300000)] }).instalments === false, 'instalments from 3,000');

// --- Expenses ---
r = tax({ incomes: [salary(150000), { kind: 'freelance', amount: 100000 }] });
assert(r.totals.expenses === 100000 && r.filing.form === 'PND90', '40(1)+(2) share one 100,000 cap; mixed income -> PND 90');
r = tax({ incomes: [salary(100000), { kind: 'freelance', amount: 20000 }] });
assert(r.totals.expenses === 60000, '50% under the cap');
r = tax({ incomes: [{ kind: 'freelance', amount: 300000, expenseMethod: 'actual', actualExpenses: 200000 }] });
assert(r.incomes[0].expenseMethod === 'flat' && r.totals.expenses === 100000, '40(2) is flat-rate only');
r = tax({ incomes: [{ kind: 'rent_building', amount: 240000 }, { kind: 'rent_agri_land', amount: 100000 }, { kind: 'rent_land', amount: 100000 }, { kind: 'rent_other', amount: 100000 }] });
assert(r.incomes.map((l) => l.expense).join() === '72000,20000,15000,10000', '40(5) rates 30/20/15/10%');
r = tax({ incomes: [{ kind: 'medical', amount: 1000000 }, { kind: 'law', amount: 1000000 }, { kind: 'fine_arts', amount: 100000 }] });
assert(r.incomes.map((l) => l.expense).join() === '600000,300000,60000', '40(6): medical and fine arts 60%, law 30%');
r = tax({ incomes: [{ kind: 'biz_1', amount: 1000000 }, { kind: 'biz_1', amount: 2000000 }] });
assert(r.incomes.map((l) => l.expense).join() === '460000,600000', '40(8) performers: 60% of 300k + 40% above, capped 600k');
r = tax({ incomes: [{ kind: 'biz_27', amount: 500000 }, { kind: 'biz_17', amount: 200000, expenseMethod: 'actual', actualExpenses: 50000 }] });
assert(r.incomes.map((l) => l.expense).join() === '300000,50000', '40(8) 60% flat; actual when chosen (even if lower)');
r = tax({ incomes: [{ kind: 'biz_44', amount: 300000, actualExpenses: 400000 }] });
assert(r.incomes[0].expenseMethod === 'actual' && r.incomes[0].expense === 300000 && r.incomes[0].net === 0, 'unlisted business: actual only, never below zero');
r = tax({ incomes: [{ kind: 'royalty', amount: 300000 }, { kind: 'interest', amount: 50000 }] });
assert(r.incomes.map((l) => l.expense).join() === '100000,0', '40(3) copyright 50% capped 100k; interest none');
r = tax({ incomes: [{ kind: 'hire_purchase_breach', amount: 100000, expenseMethod: 'actual', actualExpenses: 90000 }] });
assert(r.incomes[0].expense === 20000, 'hire-purchase breach: 20% flat only');

// --- Minimum tax (0.5% of non-salary income) ---
r = tax({ incomes: [{ kind: 'biz_44', amount: 2000000, actualExpenses: 1900000 }] });
assert(r.progressiveTax === 0 && r.minimumTax.tax === 10000 && r.minimumTax.applies && r.taxDue === 10000 && r.marginalRate === null, `0.5% method wins: 10,000 (got ${r.taxDue})`);
r = tax({ incomes: [{ kind: 'biz_44', amount: 900000, actualExpenses: 880000 }] });
assert(r.minimumTax.tax === 4500 && !r.minimumTax.applies && r.taxDue === 0, '4,500 or less is ignored');
r = tax({ incomes: [{ kind: 'biz_27', amount: 3000000 }] });
assert(r.totals.netIncome === 1140000 && r.progressiveTax === 150000 && !r.minimumTax.applies && r.taxDue === 150000, 'progressive wins when higher: 150,000');
r = tax({ incomes: [salary(5000000), { kind: 'interest', amount: 10000 }] });
assert(r.minimumTax.base === 10000, 'salary is not part of the 0.5% base');

// --- Dividends and the dividend credit ---
r = tax({ incomes: [{ kind: 'dividend_th', amount: 100000, withheld: 10000, creditRate: 0.20 }] });
assert(r.dividendCredit === 25000 && r.totals.assessable === 125000 && r.totals.netIncome === 65000 && r.taxDue === 0, 'credit 20/80 = 25,000 added to income');
assert(r.balance === -35000 && r.result === 'refund', `refund 35,000 = 10,000 withheld + 25,000 credit (got ${r.balance})`);
r = tax({ incomes: [{ kind: 'dividend_th', amount: 100000, creditRate: 0.15 }] });
assert(r.dividendCredit === 17647.06, 'credit 15/85 rounded to the satang');
r = tax({ incomes: [{ kind: 'dividend_th', amount: 100000, creditRate: 0.5 }] });
assert(r.dividendCredit === 0 && r.warnings.some((w) => w.includes('dividend credit')), 'unsupported credit rate -> no credit, warning');

// --- 65+ / disabled exemption ---
r = tax({ profile: { age65: true }, incomes: [salary(300000)] });
assert(r.totals.exempt === 190000 && r.incomes[0].expense === 55000 && r.totals.netIncome === 0, '65+: 190,000 exempt');
r = tax({ profile: { age65: true }, incomes: [salary(300000), { kind: 'interest', amount: 100000 }] });
assert(r.incomes[1].exempt === 100000 && r.incomes[0].exempt === 90000, 'exemption goes to income with no expense relief first');
r = tax({ profile: { age65: true, disabled: true }, incomes: [salary(1000000)] });
assert(r.totals.exempt === 190000, '65+ and disabled: still 190,000 (not both)');

// --- Family allowances ---
r = tax({ profile: { maritalStatus: 'married', spouseHasIncome: false }, incomes: [salary(1000000)], claims: { spouse_life_insurance: 20000 } });
assert(allow(r, 'spouse') === 60000 && allow(r, 'spouse_life_insurance') === 10000, 'spouse with no income 60k; spouse life capped 10k');
r = tax({ profile: { maritalStatus: 'married', spouseHasIncome: true }, incomes: [salary(1000000)], claims: { spouse_life_insurance: 10000 } });
assert(allow(r, 'spouse') === 0 && allow(r, 'spouse_life_insurance') === 0, 'spouse with income: neither');
r = tax({ profile: { children: [{ birthYear: 2558 }, { birthYear: 2562 }, { birthYear: 2564 }] }, incomes: [salary(1000000)] });
assert(allow(r, 'children') === 150000, 'children: 30k + 60k + 60k (2nd+ born 2561 or later)');
r = tax({ profile: { children: [{ birthYear: 2559 }, { birthYear: 2560 }] }, incomes: [salary(1000000)] });
assert(allow(r, 'children') === 60000, 'children born before 2561: 30k each');
r = tax({ profile: { children: [{ birthYear: 2563 }] }, incomes: [salary(1000000)] });
assert(allow(r, 'children') === 30000, 'a first child is always 30k');
r = tax({ incomes: [salary(1000000)], claims: { parents: 5, disabled_dependants: 1, maternity: 80000 } });
assert(allow(r, 'parents') === 120000 && allow(r, 'disabled_dependants') === 60000 && allow(r, 'maternity') === 60000, 'parents max 4 x 30k; disabled 60k; maternity capped 60k');

// --- Insurance and retirement caps ---
r = tax({ incomes: [salary(1000000)], claims: { life_insurance: 90000, health_insurance: 40000 } });
assert(allow(r, 'life_insurance') === 90000 && allow(r, 'health_insurance') === 10000, 'health capped 25k, life + health capped 100k together');
r = tax({ incomes: [salary(1000000)], claims: { life_insurance: 50000, pension_insurance: 300000 } });
assert(allow(r, 'pension_insurance') === 200000, 'pension: 50k fills the life cap, then 15% of income (150k)');
r = tax({ incomes: [salary(2000000)], claims: { pension_insurance: 500000 } });
assert(allow(r, 'pension_insurance') === 300000, 'pension: 100k in the life gap + 200k cap');
r = tax({ incomes: [salary(2000000)], claims: { provident_fund: 400000, rmf: 400000 } });
assert(allow(r, 'provident_fund') === 300000 && allow(r, 'rmf') === 200000, 'PVD 15% of wages; PVD + RMF trimmed to 500k together');
assert(r.allowances.find((a) => a.key === 'rmf').trimmedBy === 'retirement', 'trimmed row says why');
r = tax({ incomes: [salary(1000000)], claims: { rmf: 400000, thai_esg: 400000 } });
assert(allow(r, 'rmf') === 300000 && allow(r, 'thai_esg') === 300000, 'RMF 30% of income; ThaiESG 30% capped 300k, outside the 500k');
r = tax({ incomes: [{ kind: 'freelance', amount: 1000000 }], claims: { provident_fund: 50000 } });
assert(allow(r, 'provident_fund') === 0, 'PVD is a share of wages: none without 40(1)');
r = tax({ incomes: [salary(600000)], claims: { gpf: 400000, social_security: 9000, home_loan_interest: 150000, political_party: 20000, artwork: 150000 } });
assert(allow(r, 'gpf') === 400000 && allow(r, 'social_security') === 9000 && allow(r, 'home_loan_interest') === 100000 && allow(r, 'political_party') === 10000 && allow(r, 'artwork') === 100000, 'GPF no % cap; SSO actual; home loan, party, artwork caps');

// --- Year measures ---
r = tax({ incomes: [salary(1000000)], claims: { easy_ereceipt: 60000, new_home: 3500000, travel_main: 25000, travel_secondary: 10000 } });
assert(allow(r, 'easy_ereceipt') === 50000 && allow(r, 'new_home') === 30000, 'Easy E-Receipt 50k; new home 10k per full 1M');
assert(allow(r, 'travel_main') === 20000 && allow(r, 'travel_secondary') === 10000, 'travel: main 20k, secondary 1.5x within 30k together');
assert(r.warnings.some((w) => w.includes('Not yet checked') && w.includes('เที่ยวดีมีคืน')), 'unverified rules are flagged');
r = tax({ incomes: [salary(1000000)], claims: { easy_ereceipt: 50000, solar_rooftop: 250000 } }, R69);
assert(allow(r, 'easy_ereceipt') === undefined && r.warnings.some((w) => w.includes('"easy_ereceipt" isn\'t a deduction in tax year 2569')), '2568-only measure ignored in 2569 with a warning');
assert(allow(r, 'solar_rooftop') === 200000 && r.warnings.some((w) => w.includes('uses the 2568 rules')), '2569: solar 200k; carried-over warning');

// --- Donations ---
// salary 560k - 100k expenses - 60k personal = 400k after allowances
r = tax({ incomes: [salary(560000)], claims: { donation_double: 30000, donation: 50000 } });
assert(r.totals.afterAllowances === 400000, 'donation base 400,000');
assert(r.donations[0].allowed === 40000 && r.donations[1].allowed === 36000 && r.totals.netIncome === 324000, 'x2 donations capped 10% (40k), then general capped 10% of the rest (36k)');
r = tax({ incomes: [salary(560000)], claims: { donation_double: 10000, donation: 5000 } });
assert(r.donations[0].allowed === 20000 && r.donations[1].allowed === 5000, 'under the caps: 2x and 1x');

// --- Filing thresholds ---
assert(!tax({ incomes: [salary(120000)] }).filing.mustFile && tax({ incomes: [salary(120001)] }).filing.mustFile, 'PND 91 single: above 120,000');
assert(!tax({ profile: { maritalStatus: 'married' }, incomes: [salary(220000)] }).filing.mustFile, 'PND 91 married: 220,000');
assert(tax({ incomes: [{ kind: 'freelance', amount: 70000 }] }).filing.mustFile && tax({ incomes: [{ kind: 'freelance', amount: 70000 }] }).filing.form === 'PND90', 'PND 90 single: above 60,000');
assert(tax({}).filing.form === 'PND91' && !tax({}).filing.mustFile && tax({}).balance === 0 && tax({}).result === 'none', 'no income: nothing to file');
r = tax({ incomes: [salary(100000)] });
assert(r.filing.paperDeadline === '2569-03-31' && r.filing.onlineDeadline === '2569-04-08' && tax({}, R69).filing.onlineDeadline === null, 'deadlines (2569 online not announced)');

// --- Withholding, refunds, input hygiene ---
r = tax({ incomes: [salary(300000, 20000)] });
assert(r.taxDue === 0 && r.balance === -20000 && r.result === 'refund', 'withheld more than due -> refund');
r = tax({ incomes: [{ kind: 'nope', amount: 1 }, salary(-5), salary('abc'), salary('250000.555')] });
assert(r.incomes.length === 1 && r.incomes[0].amount === 250000.56 && r.warnings.some((w) => w.includes('unknown kind')), 'unknown kinds and non-positive amounts dropped; satang rounding');
r = tax({ incomes: [salary(1000000)], claims: { bitcoin: 5 } });
assert(r.warnings.some((w) => w.includes('"bitcoin"')), 'unknown deduction warned');
// A full case end to end: salary 1.2M (60k withheld), freelance 200k, spouse no income,
// 2 kids (2560, 2563), life 30k, SSO 9k, RMF 100k, ThaiESG 100k, donation 10k.
r = tax({
  profile: { maritalStatus: 'married', spouseHasIncome: false, children: [{ birthYear: 2560 }, { birthYear: 2563 }] },
  incomes: [salary(1200000, 60000), { kind: 'freelance', amount: 200000, withheld: 6000 }],
  claims: { life_insurance: 30000, social_security: 9000, rmf: 100000, thai_esg: 100000, donation: 10000 },
});
// 1,400,000 - 100,000 = 1,300,000; allowances 60+60+90+30+9+100+100 = 449,000 -> 851,000; donation 10,000 -> 841,000
// tax: 0-150k 0; 150-300k 7,500; 300-500k 20,000; 500-750k 37,500; 750-841k 18,200 -> 83,200
assert(r.totals.afterExpenses === 1300000 && r.totals.allowances === 449000 && r.totals.netIncome === 841000, `full case net 841,000 (got ${r.totals.netIncome})`);
assert(r.taxDue === 83200 && r.withheld === 66000 && r.balance === 17200 && r.marginalRate === 0.20, `full case: pay 17,200 (got ${r.balance})`);
assert(r.brackets.length === 5 && r.brackets[4].taxable === 91000 && r.brackets[4].tax === 18200, 'bracket breakdown');

// --- Limits for the checklist ---
r = tax({ incomes: [salary(1000000)] });
assert(r.limits.personal === 60000 && r.limits.rmf === 300000 && r.limits.thai_esg === 300000 && r.limits.provident_fund === 150000 && r.limits.health_insurance === 25000, 'limits: fixed, % of income, % of wages, caps');
assert(r.limits.social_security === null && r.limits.gpf === null && r.limits.spouse === 0 && r.limits.parents === 120000, 'limits: none of their own; not for this profile; counts');
assert(r.limits.donation_double === 42000 && r.limits.donation === 84000, 'donation limits in baht paid (2x halves it)');
assert(r.sharedCaps.find((c) => c.key === 'retirement').members.join() === 'pension_insurance,provident_fund,gpf,teachers_fund,rmf,nsf', 'shared caps list their members');

process.exit(failures ? 1 : 0);
