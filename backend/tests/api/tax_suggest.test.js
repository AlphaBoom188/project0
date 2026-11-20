// Pure: services/tax/taxSuggest.js (suggestions from transactions, lots
// and portfolio dividends), on synthetic data.
const { BACKEND } = require('../lib');
const { buildSuggestions, fifoMatches, fundType } = require(`${BACKEND}/services/tax/taxSuggest.js`);
const { getRules } = require(`${BACKEND}/services/tax/rules/index.js`);

let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const R68 = getRules(2568);
const R69 = getRules(2569);
let n = 0;
const tx = (date, type, amount, description, category_name = null) => ({ id: `t${n += 1}`, date, type, amount, description, category_name });
const find = (list, pred) => list.find(pred);

// --- Salary, projected for the current year ---
const salary = Array.from({ length: 10 }, (_, i) => tx(`2026-${String(i + 1).padStart(2, '0')}-25`, 'income', 50000, 'Salary ACME'));
let s = buildSuggestions({ year: 2569, rules: R69, transactions: salary, today: '2026-11-20' });
let sal = find(s, (x) => x.kind === 'salary');
assert(sal && sal.amount === 600000 && sal.reason.includes('Jan-Oct 2569') && sal.reason.includes('Projected to December'), `salary 500k so far -> 600k projected (got ${sal && sal.amount})`);
assert(sal.target === 'income' && sal.confidence === 'medium' && sal.note.includes('50 ทวิ') && sal.sources.length === 10, 'salary: medium confidence, the 50 ทวิ note, sources');
const past = salary.map((t) => ({ ...t, date: t.date.replace('2026', '2025') }));
sal = find(buildSuggestions({ year: 2568, rules: R68, transactions: past, today: '2026-11-20' }), (x) => x.kind === 'salary');
assert(sal.amount === 500000 && !sal.reason.includes('Projected'), 'a past year is not projected');
sal = find(buildSuggestions({ year: 2569, rules: R69, transactions: [tx('2026-11-01', 'income', 30000, 'เงินเดือน')], today: '2026-11-20' }), (x) => x.kind === 'salary');
assert(sal.amount === 30000, 'one month: no projection');
assert(buildSuggestions({ year: 2569, rules: R69, transactions: salary, today: '2026-11-20' })[0].id === s[0].id && /^[0-9a-f]{12}$/.test(s[0].id), 'ids are stable 12-hex');

// --- Other income kinds ---
const mixed = [
  tx('2026-06-30', 'income', 1200, 'ดอกเบี้ยเงินฝาก'),
  tx('2026-05-10', 'income', 9000, 'Dividend PTT'),
  tx('2026-03-01', 'income', 15000, 'ค่าเช่าคอนโด'),
  tx('2026-04-01', 'income', 8000, 'Design job'),
  tx('2026-04-02', 'income', 2000, null, 'Income'),
  tx('2026-04-03', 'transfer', 99999, 'Salary moved to savings'),
  tx('2025-12-31', 'income', 77777, 'Salary last year'),
];
s = buildSuggestions({ year: 2569, rules: R69, transactions: mixed, today: '2026-11-20' });
assert(find(s, (x) => x.kind === 'interest').amount === 1200 && find(s, (x) => x.kind === 'interest').note.includes('20,000'), 'interest, with the 20,000 tax-free note');
const div = find(s, (x) => x.kind === 'dividend_th');
assert(div.amount === 10000 && div.withheld === 1000 && div.creditRate === 0.2, 'dividend deposit grossed up from the net (9,000 -> 10,000, 1,000 withheld)');
assert(find(s, (x) => x.kind === 'rent_building').amount === 15000, 'rent');
const other = find(s, (x) => x.kind === 'freelance');
assert(other.amount === 10000 && other.confidence === 'low' && other.title === 'Other income you logged', 'everything else: other income, low confidence');
assert(!find(s, (x) => x.kind === 'salary'), 'transfers and other years never count');

// --- Expenses -> deductions ---
const spend = [
  tx('2026-02-01', 'expense', 24000, 'เบี้ยประกันชีวิต AIA'),
  tx('2026-02-02', 'expense', 12000, 'ประกันสุขภาพแม่'),
  tx('2026-02-03', 'expense', 18000, 'Health insurance Allianz'),
  tx('2026-02-04', 'expense', 750, 'ประกันสังคม'),
  tx('2026-02-05', 'expense', 500, 'ทำบุญวัด'),
  tx('2026-02-06', 'expense', 1000, 'Donation Red Cross'),
  tx('2026-02-07', 'expense', 6000, 'ดอกเบี้ยบ้าน'),
  tx('2026-02-08', 'expense', 120, 'coffee'),
];
s = buildSuggestions({ year: 2569, rules: R69, transactions: spend, today: '2026-11-20' });
const claim = (key) => find(s, (x) => x.target === 'claim' && x.key === key);
assert(claim('life_insurance').amount === 24000 && claim('parents_health_insurance').amount === 12000 && claim('health_insurance').amount === 18000, 'insurance: life, parents\' health (before own health), own health');
assert(claim('social_security').amount === 750 && claim('donation').amount === 1500 && claim('home_loan_interest').amount === 6000, 'social security, donations (both), home loan interest');
assert(claim('donation').confidence === 'low' && claim('home_loan_interest').note.includes('principal'), 'low confidence with a note where it\'s a guess');
assert(s.filter((x) => x.target === 'claim').length === 6, 'coffee suggests nothing');

// --- Fund lots ---
assert(fundType({ symbol: 'KFLTFRMF' }) === 'rmf' && fundType({ symbol: 'K-TNZ-ThaiESG' }) === 'thai_esg' && fundType({ symbol: 'SCBTESG' }) === 'thai_esg' && fundType({ symbol: 'KKP ESGX' }) === 'esgx' && fundType({ symbol: 'SET50' }) === null, 'fund types from symbols');
const holdings = [
  { id: 'h1', asset_type: 'mutual_fund', symbol: 'SCBRMF', currency: 'THB' },
  { id: 'h2', asset_type: 'mutual_fund', symbol: 'K-ESG', name: 'K ThaiESG Fund', currency: 'THB' },
  { id: 'h3', asset_type: 'mutual_fund', symbol: 'TESGX', name: 'Thai ESGX', currency: 'THB' },
  { id: 'h4', asset_type: 'stock', symbol: 'PTT.BK', currency: 'THB' },
];
const lots = {
  h1: [{ id: 'l1', side: 'buy', quantity: 1000, price: 10, fee: 0, trade_date: '2026-03-01' }, { id: 'l2', side: 'buy', quantity: 500, price: 12, fee: 50, trade_date: '2026-12-01' }, { id: 'l3', side: 'buy', quantity: 999, price: 10, fee: 0, trade_date: '2025-06-01' }],
  h2: [{ id: 'l4', side: 'buy', quantity: 1000, price: 10, fee: 0, trade_date: '2023-03-01' }, { id: 'l5', side: 'buy', quantity: 1000, price: 10, fee: 0, trade_date: '2020-01-10' }, { id: 'l6', side: 'sell', quantity: 1500, price: 12, fee: 0, trade_date: '2026-06-01' }],
  h3: [{ id: 'l7', side: 'buy', quantity: 100, price: 10, fee: 0, trade_date: '2026-02-01' }],
  h4: [{ id: 'l8', side: 'buy', quantity: 100, price: 30, fee: 0, trade_date: '2026-02-01' }],
};
s = buildSuggestions({ year: 2569, rules: R69, holdings, lotsByHolding: lots, today: '2026-11-20' });
assert(claim('rmf').amount === 16050 && claim('rmf').confidence === 'high' && claim('rmf').sources.length === 2, 'RMF: 2569 buys incl. fees (10,000 + 6,050)');
assert(!claim('thai_esg') && !claim('thai_esgx_new'), 'no ThaiESG buys in 2569; ESGX new money has no 2569 deduction');
s = buildSuggestions({ year: 2568, rules: R68, holdings, lotsByHolding: { h3: [{ id: 'x', side: 'buy', quantity: 100, price: 10, fee: 0, trade_date: '2025-02-01' }] }, today: '2026-11-20' });
assert(claim('thai_esgx_new').amount === 1000, '2568: ESGX buys -> ThaiESGX new money');

// --- Sold within 5 years (FIFO) ---
const m = fifoMatches(lots.h2);
assert(m.length === 2 && m[0].buyDate === '2020-01-10' && m[0].qty === 1000 && m[1].buyDate === '2023-03-01' && m[1].qty === 500, 'FIFO: oldest units sold first');
s = buildSuggestions({ year: 2569, rules: R69, holdings, lotsByHolding: lots, today: '2026-11-20' });
const breach = find(s, (x) => x.kind === 'fund_gain_breach');
assert(breach && breach.amount === 1000 && breach.warning && breach.sources.length === 1 && breach.sources[0].description.includes('bought 2023-03-01'), `only the units held under 5 years: 500 x 2 = 1,000 gain (got ${breach && breach.amount})`);
assert(breach.note.includes('paid back'), 'breach note: the tax saved must be paid back');
const loss = buildSuggestions({ year: 2569, rules: R69, holdings: [holdings[0]], lotsByHolding: { h1: [{ id: 'a', side: 'buy', quantity: 10, price: 10, fee: 0, trade_date: '2025-01-01' }, { id: 'b', side: 'sell', quantity: 10, price: 8, fee: 0, trade_date: '2026-01-01' }] }, today: '2026-11-20' });
assert(find(loss, (x) => x.kind === 'fund_gain_breach').amount === 0 && find(loss, (x) => x.kind === 'fund_gain_breach').reason.includes('at a loss'), 'a loss is still flagged (the tax saved comes back), with 0 income');

// --- Portfolio dividends ---
const dividends = [
  { symbol: 'PTT.BK', thai: true, fund: false, received_thb: 5000 },
  { symbol: 'TDEX.BK', thai: true, fund: true, received_thb: 800 },
  { symbol: 'VOO', thai: false, fund: true, received_thb: 3000 },
];
s = buildSuggestions({ year: 2569, rules: R69, transactions: mixed, dividends, today: '2026-11-20' });
const thDiv = find(s, (x) => x.kind === 'dividend_th');
assert(thDiv.amount === 5000 && thDiv.withheld === 500 && thDiv.confidence === 'high' && thDiv.reason.includes('PTT.BK'), 'Thai shares: 10% withheld, 20% credit');
assert(find(s, (x) => x.kind === 'fund_distribution').amount === 800 && find(s, (x) => x.kind === 'dividend_foreign').amount === 3000, 'Thai ETF distributions and foreign dividends kept apart');
assert(s.filter((x) => x.kind === 'dividend_th').length === 1, 'dividend deposits are skipped when the portfolio has dividends');
assert(buildSuggestions({ year: 2569, rules: R69, today: '2026-11-20' }).length === 0, 'no data: no suggestions');

process.exit(failures ? 1 : 0);
