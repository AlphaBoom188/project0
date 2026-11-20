// Pure: services/recurringDetect.js (repeat payments) and
// services/monthlyReport.js (buildReport, cycleRange, cycleBudget).
const { BACKEND } = require('../lib');
const { detectRecurring, addMonthsYmd } = require(`${BACKEND}/services/recurringDetect.js`);
const { buildReport, cycleRange, cycleBudget, reportText } = require(`${BACKEND}/services/monthlyReport.js`);

let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
let n = 0;
const tx = (date, amount, description, type = 'expense', category_id = 'c-ent', category_name = 'Entertainment') => ({ id: `t${n += 1}`, date, type, amount, description, category_id, category_name });
const TODAY = '2026-11-20';
const find = (list, desc) => list.find((c) => c.description.toLowerCase().includes(desc));

// --- Detection ---
const rows = [
  ...['2026-06-05', '2026-07-05', '2026-08-06', '2026-09-05', '2026-10-05', '2026-11-05'].map((d) => tx(d, 419, 'NETFLIX.COM 8812345 REF#7788')),
  ...['2026-08-20', '2026-09-21', '2026-10-19'].map((d, i) => tx(d, [1450, 1620, 1380][i], 'ค่าไฟ MEA', 'expense', 'c-util', 'Utilities')),
  ...['2026-07-25', '2026-08-25', '2026-09-25', '2026-10-25'].map((d) => tx(d, 50000, 'Salary ACME', 'income', 'c-inc', 'Income')),
  ...['2026-06-01', '2026-07-01', '2026-08-01'].map((d) => tx(d, 299, 'Spotify')), // stopped in August
  ...['2026-07-02', '2026-09-03', '2026-11-02'].map((d) => tx(d, 990, 'Gym membership')), // every other month: too many gaps
  ...['2026-08-01', '2026-09-15', '2026-10-28'].map((d) => tx(d, 500, 'Grab ride')), // days all over the month
  ...['2026-08-10', '2026-09-10', '2026-10-10'].map((d, i) => tx(d, [300, 900, 450][i], 'Lazada')), // amounts all over
  ...['2026-08-03', '2026-09-03', '2026-10-03', '2026-11-03'].map((d) => tx(d, 8000, 'Condo rent', 'expense', 'c-home', 'Accommodation')),
  tx('2026-10-04', 999, 'Netflix extra member'), // different payee text
];
let out = detectRecurring({ transactions: rows, today: TODAY });
const nf = find(out, 'netflix');
assert(nf && nf.amount === 419 && nf.dayOfMonth === 5 && nf.months === 6 && !nf.variable && nf.confidence === 'high', `Netflix: ฿419 on the 5th, 6 months, fixed, high (got ${JSON.stringify(nf && { a: nf.amount, d: nf.dayOfMonth, m: nf.months })})`);
assert(nf.nextDate === '2026-12-05' && nf.lastDate === '2026-11-05' && nf.sources.length === 6, 'next date and sources');
const elec = find(out, 'ค่าไฟ');
assert(elec && elec.variable && elec.confidence === 'medium' && elec.amount === 1450 && elec.nextDate === '2026-11-20' === false, 'electricity: varying amount -> medium');
assert(elec.nextDate === '2026-12-20', `electricity next: 20 Dec (got ${elec.nextDate})`);
const sal = out.find((c) => c.type === 'income');
assert(sal && sal.amount === 50000 && sal.nextDate === '2026-11-25', 'salary detected as repeat income');
assert(find(out, 'condo') && !find(out, 'spotify') && !find(out, 'gym') && !find(out, 'grab') && !find(out, 'lazada'), 'rent yes; stopped, gappy, scattered-day and scattered-amount payments no');
assert(out[0].confidence === 'high', 'high confidence first');
// Existing rules and dismissals
out = detectRecurring({ transactions: rows, rules: [{ type: 'expense', description: 'Netflix.com', amount: 419, is_active: true }, { type: 'expense', description: 'Rent', amount: 8100, category_id: 'c-home', is_active: true }], today: TODAY });
assert(!find(out, 'netflix') && !find(out, 'condo'), 'already a rule (same name, or same category and amount) -> not suggested');
out = detectRecurring({ transactions: rows, rules: [{ type: 'expense', description: 'Netflix.com', amount: 419, is_active: false }], today: TODAY });
assert(find(out, 'netflix'), 'a paused rule doesn\'t count');
const key = nf.key;
assert(!find(detectRecurring({ transactions: rows, dismissed: [key], today: TODAY }), 'netflix') && /^[0-9a-f]{12}$/.test(key), 'dismissed -> not suggested; stable key');
assert(addMonthsYmd('2026-01-31', 1, 31) === '2026-02-28' && addMonthsYmd('2026-12-15', 1, 15) === '2027-01-15', 'month arithmetic clamps and rolls the year');
assert(detectRecurring({ transactions: [], today: TODAY }).length === 0, 'no data');

// --- Report ---
const cr = cycleRange(25, -1, new Date('2026-11-20T05:00:00Z'));
assert(cr.start.toISOString() === '2026-09-24T17:00:00.000Z' && cr.end.toISOString() === '2026-10-24T17:00:00.000Z', 'cycle from the 25th: 25 Sep - 25 Oct (Bangkok midnights)');
const cr1 = cycleRange(1, -1, new Date('2026-11-20T05:00:00Z'));
assert(cr1.start.toISOString() === '2026-09-30T17:00:00.000Z', 'calendar month: October');
assert(cycleBudget({ budget_amount: 100, budget_period: 'daily' }, 31) === 3100 && cycleBudget({ budget_amount: 700, budget_period: 'weekly' }, 28) === 2800 && cycleBudget({ budget_amount: 12000, budget_period: 'yearly' }, 30) === 1000 && cycleBudget({ budget_amount: null }, 30) === null, 'budgets in cycle terms');
const cats = [
  { id: 'food', name: 'Food', type: 'expense', budget_amount: 6000, budget_period: 'monthly' },
  { id: 'fun', name: 'Fun', type: 'expense', budget_amount: 1000, budget_period: 'monthly' },
  { id: 'travel', name: 'Travel', type: 'expense', budget_amount: null, budget_period: null },
  { id: 'inc', name: 'Income', type: 'income' },
];
const at = (d) => `${d}T05:00:00Z`;
const t2 = (d, type, amount, cat, description) => ({ id: `r${n += 1}`, transaction_date: at(d), type, amount, category_id: cat, description });
const txns = [t2('2026-10-02', 'income', 50000, 'inc', 'Salary'), t2('2026-10-03', 'expense', 4000, 'food'), t2('2026-10-10', 'expense', 1500, 'fun', 'Concert'), t2('2026-10-12', 'expense', 9000, 'travel', 'Flight'), t2('2026-10-20', 'expense', 500, 'food')];
const prev = [t2('2026-09-02', 'income', 50000, 'inc'), t2('2026-09-05', 'expense', 3000, 'food'), t2('2026-09-06', 'expense', 1200, 'fun')];
const r = buildReport({ start: cr1.start, end: cr1.end, txns, prevTxns: prev, categories: cats });
assert(r.label === 'Oct 2026' && r.income === 50000 && r.expense === 15000 && r.net === 35000 && r.savingsRate === 70, `totals and savings rate (got ${r.label} ${r.expense} ${r.savingsRate})`);
assert(r.expenseChangePct === 257, `spending vs the cycle before: +257% (got ${r.expenseChangePct})`);
const food = r.categories.find((c) => c.name === 'Food');
assert(r.categories[0].name === 'Travel' && food.spent === 4500 && food.budget === 6000 && food.pct === 75 && r.overBudget.join() === 'Fun', 'categories by spend, budget %, over budget');
assert(r.changes[0].name === 'Travel' && r.changes[0].change === 9000 && r.biggest[0].description === 'Flight' && r.biggest.length === 3, 'biggest changes and expenses');
const text = reportText(r);
assert(text.startsWith('Oct 2026\nIncome ฿50,000 · Spent ฿15,000 · Saved ฿35,000 (70%)') && text.includes('- Fun ฿1,500 (150% of budget)') && text.includes('Over budget: Fun'), 'chat text');
const cr25 = cycleRange(25, -1, new Date('2026-11-20T05:00:00Z'));
assert(buildReport({ start: cr25.start, end: cr25.end }).label === '25 Sep - 24 Oct 2026' && reportText(buildReport({ start: cr25.start, end: cr25.end })).includes('nothing was logged'), 'a mid-month cycle label; empty report');

process.exit(failures ? 1 : 0);
