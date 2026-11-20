// Pure: services/tax/taxPlan.js (planner rooms and savings, filing guide).
const { BACKEND } = require('../lib');
const { buildPlan, buildGuide, roomFor } = require(`${BACKEND}/services/tax/taxPlan.js`);
const { computeTax } = require(`${BACKEND}/services/tax/taxMath.js`);
const { getRules } = require(`${BACKEND}/services/tax/rules/index.js`);

let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const R68 = getRules(2568);
const R69 = getRules(2569);
const TODAY = '2026-11-20';
const salary = (amount, withheld = 0) => ({ kind: 'salary', amount, withheld });
const item = (plan, key) => plan.items.find((i) => i.key === key);

// Salary 1,000,000: net 840,000 -> tax 83,000, top rate 20%.
const input = { incomes: [salary(1000000)] };
assert(computeTax(R69, input).taxDue === 83000, 'baseline tax 83,000');
let p = buildPlan(R69, input, { today: TODAY });
assert(p.applicable && p.daysLeft === 41 && p.deadline === '2026-12-31' && p.topRate === 0.2, `41 days left in 2569, top rate 20% (got ${p.daysLeft})`);
assert(item(p, 'thai_esg').room === 300000 && item(p, 'thai_esg').saves === 49500 && item(p, 'thai_esg').perThousand === 200, 'ThaiESG: room 300k (30%), saves 49,500, 200 per 1,000');
assert(item(p, 'rmf').room === 300000 && item(p, 'rmf').saves === 49500, 'RMF: room 300k');
assert(item(p, 'pension_insurance').room === 250000, 'pension: 100k life gap + 150k (15%)');
assert(item(p, 'life_insurance').room === 100000 && item(p, 'health_insurance').room === 25000, 'life 100k, health 25k');
assert(item(p, 'donation_double').room === 42000 && item(p, 'donation_double').saves === 16800 && item(p, 'donation_double').perThousand === 400, 'x2 donations: 42k paid = 84k deduction (10%), 400 per 1,000');
assert(p.items[0].key === 'donation_double', 'ranked by tax saved per baht: x2 donations first');
assert(item(p, 'nsf').verified === false && item(p, 'thai_esg').note.includes('31 December'), 'notes and verified flags');
assert(p.combined && p.combined.saves === 83000 && p.combined.parts[0].key === 'donation_double', `everything together wipes out the tax (got ${p.combined && p.combined.saves})`);
assert(p.combined.parts.find((x) => x.key === 'rmf').amount + (p.combined.parts.find((x) => x.key === 'pension_insurance') || { amount: 0 }).amount <= 500000 + 100000, 'together, the retirement cap is respected');

// Rooms shrink with what's already claimed and with shared caps
assert(roomFor(R69, { ...input, claims: { thai_esg: 250000 } }, 'thai_esg') === 50000, 'ThaiESG room after 250k claimed: 50k');
assert(roomFor(R69, { incomes: [salary(3000000)], claims: { provident_fund: 450000 } }, 'rmf') === 50000, 'RMF room limited by the 500k retirement cap');
assert(roomFor(R69, { ...input, claims: { life_insurance: 90000 } }, 'health_insurance') === 10000, 'health room limited by the 100k life + health cap');

// Not applicable
p = buildPlan(R69, { incomes: [salary(200000)] }, { today: TODAY });
assert(!p.applicable && p.reason.includes('no tax to pay'), 'no tax -> nothing to plan');
p = buildPlan(R69, { incomes: [{ kind: 'biz_44', amount: 2000000, actualExpenses: 1900000 }] }, { today: TODAY });
assert(!p.applicable && p.reason.includes('0.5%'), 'minimum tax applies -> deductions don\'t help');
p = buildPlan(R68, input, { today: TODAY });
assert(!p.applicable && p.reason.includes('has ended') && p.daysLeft === null, '2568 is over');
p = buildPlan(R69, {}, { today: TODAY });
assert(!p.applicable && p.reason.includes('Add your income'), 'no income yet');
p = buildPlan(R69, { incomes: [salary(400000)], claims: { thai_esg: 120000, donation_double: 20000, donation: 20000, life_insurance: 100000, health_insurance: 25000, rmf: 120000, pension_insurance: 60000, nsf: 30000 } }, { today: TODAY });
assert(!p.applicable && computeTax(R69, { incomes: [salary(400000)] }).taxDue > 0, 'everything used (tax already 0) -> nothing left');

// --- Filing guide ---
let r = computeTax(R68, { incomes: [salary(600000, 10000)], claims: { life_insurance: 20000, rmf: 50000 } });
let g = buildGuide(R68, { incomes: [salary(600000, 10000)], claims: { life_insurance: 20000, rmf: 50000 } }, r, { today: TODAY });
assert(g.form === 'PND91' && g.deadline === '2569-04-08' && g.deadlineCE === '2026-04-08' && g.status === 'late' && g.daysLeft < 0, '2568: PND 91, deadline 8 Apr 2569 (= 2026), late now');
assert(g.documents.map((d) => d.key).join() === 'salary,life_insurance,rmf' && g.documents[0].label.includes('50 ทวิ'), 'documents for what you entered');
assert(g.steps.length === 5 && g.steps[1].title === 'Choose PND 91' && g.steps[4].title === r.result.replace('pay', 'Pay').replace('refund', 'Get your refund').replace('none', 'Submit'), 'five steps, form named, last step matches the result');
assert(g.enter.incomes[0].amount === 600000 && g.enter.deductions.some((d) => d.key === 'personal' && d.amount === 60000) && g.enter.withheld === 10000, 'what to enter');
r = computeTax(R69, { incomes: [salary(600000), { kind: 'freelance', amount: 10000 }] });
g = buildGuide(R69, { incomes: [salary(600000), { kind: 'freelance', amount: 10000 }] }, r, { today: TODAY });
assert(g.form === 'PND90' && g.deadline === '2570-03-31' && !g.onlineAnnounced && g.status === 'not_open' && g.opens === '2027-01-01', '2569: PND 90, paper deadline, opens 1 Jan 2027');
assert(g.steps[1].body.includes('other than salary'), 'PND 90 explained');

process.exit(failures ? 1 : 0);
