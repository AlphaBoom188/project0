// Thai personal income tax: parts that are the same in tax years 2568 and
// 2569. Sources: Revenue Department instruction booklets Ins90/Ins91 for tax
// year 2568 (24 Dec 2568), Royal Decree 11 s.8 (as amended by Decree
// 629/2560 and 803/2569). See docs/TAX_RESEARCH.md section 7.
//
// `verified: true` means checked against an RD primary source; anything
// else is flagged in the calculator's warnings.

const RD_2568 = 'RD Ins90/Ins91 tax year 2568';

// Progressive rates on net income (Revenue Code s.48(1)).
const BRACKETS = [
  { upTo: 150000, rate: 0 },
  { upTo: 300000, rate: 0.05 },
  { upTo: 500000, rate: 0.10 },
  { upTo: 750000, rate: 0.15 },
  { upTo: 1000000, rate: 0.20 },
  { upTo: 2000000, rate: 0.25 },
  { upTo: 5000000, rate: 0.30 },
  { upTo: Infinity, rate: 0.35 },
];

// The second method (s.48(2)): 0.5% of assessable income other than 40(1),
// ignored when it comes to 5,000 or less; otherwise pay the higher of the two.
const MINIMUM_TAX = { rate: 0.005, ignoreAtOrBelow: 5000, verified: true, source: RD_2568 };

// 65+ or disabled (not both): up to 190,000 of assessable income is exempt,
// from whichever income types the filer chooses.
const SENIOR_EXEMPTION = { amount: 190000, verified: true, source: RD_2568 };

// Expense rules. kind:
//  'pool12'   40(1)+(2): 50% of the combined income, capped 100,000 combined
//  'pool3'    40(3) goodwill/copyright: 50% capped 100,000 (its own cap), or actual
//  'none'     no expense deduction
//  'rate'     a flat rate, or actual
//  'performer' 60% of the first 300,000 + 40% above, capped 600,000, or actual
//  'actual'   actual expenses only
const POOL12_CAP = 100000;
const POOL3_CAP = 100000;

// The 40(8) table: booklet items 2-43 are all 60% (Ins90 2568 table 2).
const BIZ_60 = {
  2: 'Instalment sales of land', 3: 'Gambling and contest fees', 4: 'Photo and film processing', 5: 'Boatyard',
  6: 'Footwear and leather goods', 7: 'Tailoring', 8: 'Furniture making', 9: 'Hotel, restaurant, food and drinks for sale',
  10: 'Hair and beauty salon', 11: 'Soap and cosmetics making', 12: 'Literary works', 13: 'Gold and gem trading',
  14: 'In-patient clinic', 15: 'Stone crushing', 16: 'Forestry, rubber and perennial crops', 17: 'Vehicle transport or hire (Grab, LINE MAN, Lalamove)',
  18: 'Printing', 19: 'Mining', 20: 'Excise beverages', 21: 'Ceramics and cement', 22: 'Electricity, including selling solar power',
  23: 'Ice making', 24: 'Glue and flour', 25: 'Plastic, glass and rubber goods', 26: 'Laundry',
  27: "Selling goods you didn't make (online and retail shops)", 28: 'Racehorse prizes', 29: 'Redemption of property sold with right of redemption (ขายฝาก)',
  30: 'Rubber sheets', 31: 'Tanning', 32: 'Sugar', 33: 'Fishing', 34: 'Sawmill', 35: 'Oil pressing', 36: 'Hire-purchase of movable property',
  37: 'Rice mill', 38: 'Annual crops', 39: 'Tobacco curing', 40: 'Animal raising', 41: 'Slaughtering', 42: 'Salt farming', 43: 'Selling ships of 6 tonnes or more',
};

// Income catalogue: key -> { type, label, expense }. UI labels are English;
// the Thai legal names live in the help text (Phase 2).
const INCOME_KINDS = {
  salary: { type: '40(1)', label: 'Salary, wages, bonus', expense: { kind: 'pool12' } },
  freelance: { type: '40(2)', label: 'Freelance, commission, fees, meeting allowances', expense: { kind: 'pool12' } },
  royalty: { type: '40(3)', label: 'Copyright and goodwill', expense: { kind: 'pool3' } },
  annuity: { type: '40(3)', label: 'Annuities and other 40(3) income', expense: { kind: 'none' } },
  interest: { type: '40(4)', label: 'Interest (deposits, bonds)', expense: { kind: 'none' } },
  dividend_th: { type: '40(4)', label: 'Dividends from Thai companies', expense: { kind: 'none' }, dividendCredit: true },
  dividend_foreign: { type: '40(4)', label: 'Dividends from foreign companies', expense: { kind: 'none' } },
  fund_distribution: { type: '40(4)', label: 'Mutual fund distributions', expense: { kind: 'none' } },
  fund_gain_breach: { type: '40(4)', label: 'Gains on RMF/SSF/ThaiESG sold without meeting the conditions', expense: { kind: 'none' } },
  crypto: { type: '40(4)', label: 'Crypto and digital token gains', expense: { kind: 'none' } },
  investment_other: { type: '40(4)', label: 'Other investment income', expense: { kind: 'none' } },
  rent_building: { type: '40(5)', label: 'Rent: houses, buildings, rafts', expense: { kind: 'rate', rate: 0.30 } },
  rent_agri_land: { type: '40(5)', label: 'Rent: agricultural land', expense: { kind: 'rate', rate: 0.20 } },
  rent_land: { type: '40(5)', label: 'Rent: other land', expense: { kind: 'rate', rate: 0.15 } },
  rent_vehicle: { type: '40(5)', label: 'Rent: vehicles', expense: { kind: 'rate', rate: 0.30 } },
  rent_other: { type: '40(5)', label: 'Rent: other property', expense: { kind: 'rate', rate: 0.10 } },
  hire_purchase_breach: { type: '40(5)', label: 'Breach of hire-purchase or sale contract', expense: { kind: 'rate', rate: 0.20, flatOnly: true } },
  medical: { type: '40(6)', label: 'Medical profession', expense: { kind: 'rate', rate: 0.60 } },
  fine_arts: { type: '40(6)', label: 'Fine arts', expense: { kind: 'rate', rate: 0.60 } }, // Decree 803 (2569), from tax year 2568
  law: { type: '40(6)', label: 'Law', expense: { kind: 'rate', rate: 0.30 } },
  engineering: { type: '40(6)', label: 'Engineering', expense: { kind: 'rate', rate: 0.30 } },
  architecture: { type: '40(6)', label: 'Architecture', expense: { kind: 'rate', rate: 0.30 } },
  accounting: { type: '40(6)', label: 'Accounting', expense: { kind: 'rate', rate: 0.30 } },
  contracting: { type: '40(7)', label: 'Contract work (supplying labour and materials)', expense: { kind: 'rate', rate: 0.60 } },
  biz_1: { type: '40(8)', label: 'Performers and professional athletes', expense: { kind: 'performer' } },
  ...Object.fromEntries(Object.entries(BIZ_60).map(([n, label]) => [`biz_${n}`, { type: '40(8)', label, expense: { kind: 'rate', rate: 0.60 } }])),
  biz_44: { type: '40(8)', label: 'Other business (not in the list)', expense: { kind: 'actual' } },
};

const INCOME_TYPES = ['40(1)', '40(2)', '40(3)', '40(4)', '40(5)', '40(6)', '40(7)', '40(8)'];

// Allowances and deductions. Fields:
//  input: 'amount' (baht paid) | 'count' (people) | 'cost' (an amount the rule converts) | 'auto' (from the profile)
//  cap, rateOf ('assessable' | 'wages') + rate, perUnit, combined (shared caps)
//  when: profile condition ('married_spouse_no_income')
const D = (key, group, label, extra) => ({ key, group, label, input: 'amount', verified: true, source: RD_2568, ...extra });

const COMMON_DEDUCTIONS = [
  D('personal', 'family', 'Personal allowance', { input: 'auto', fixed: 60000 }),
  D('spouse', 'family', 'Spouse with no income', { input: 'auto', fixed: 60000, when: 'married_spouse_no_income' }),
  D('children', 'family', 'Children', { input: 'auto', note: '30,000 each; 60,000 for the 2nd and later child born 2561 or later' }),
  D('parents', 'family', 'Parents aged 60+ (own and spouse\'s)', { input: 'count', perUnit: 30000, maxUnits: 4, note: 'Each parent with income of 30,000 or less; one child claims each parent' }),
  D('disabled_dependants', 'family', 'Disabled dependants', { input: 'count', perUnit: 60000, maxUnits: 10 }),
  D('maternity', 'family', 'Pregnancy and childbirth', { cap: 60000 }),
  D('life_insurance', 'insurance', 'Life insurance (10+ years)', { cap: 100000, combined: ['life_health'] }),
  D('health_insurance', 'insurance', 'Health insurance (own)', { cap: 25000, combined: ['life_health'] }),
  D('parents_health_insurance', 'insurance', "Parents' health insurance", { cap: 15000 }),
  D('spouse_life_insurance', 'insurance', 'Spouse life insurance (spouse with no income)', { cap: 10000, when: 'married_spouse_no_income' }),
  D('pension_insurance', 'retirement', 'Pension insurance', { rateOf: 'assessable', rate: 0.15, cap: 200000, combined: ['retirement'], fillsLifeGap: true }),
  D('provident_fund', 'retirement', 'Provident fund', { rateOf: 'wages', rate: 0.15, combined: ['retirement'] }),
  D('gpf', 'retirement', 'Government Pension Fund (GPF)', { combined: ['retirement'] }),
  D('teachers_fund', 'retirement', 'Private school teachers\' welfare fund', { rateOf: 'wages', rate: 0.15, combined: ['retirement'] }),
  D('rmf', 'retirement', 'RMF', { rateOf: 'assessable', rate: 0.30, combined: ['retirement'] }),
  D('nsf', 'retirement', 'National Savings Fund (NSF)', { cap: 30000, combined: ['retirement'], verified: false, source: 'iTAX 2569 list (contribution limit unverified)' }),
  D('thai_esg', 'investment', 'ThaiESG fund', { rateOf: 'assessable', rate: 0.30, cap: 300000, note: 'Hold 5 years (purchases 2567-2569)' }),
  D('social_security', 'other', 'Social security contributions', { note: 'Actual amount paid' }),
  D('home_loan_interest', 'other', 'Home loan interest', { cap: 100000 }),
  D('political_party', 'other', 'Political party donation', { cap: 10000 }),
  D('artwork', 'other', 'Artwork purchases (2568-2570)', { cap: 100000 }),
  D('donation_double', 'donation', 'Donations counted twice (education, sports, state hospitals, e-Donation funds)', { input: 'amount', multiplier: 2, capPct: 0.10 }),
  D('donation', 'donation', 'Other donations', { input: 'amount', capPct: 0.10 }),
];

// Shared caps, applied in member order (later members are trimmed first).
const COMBINED_CAPS = {
  life_health: { cap: 100000, label: 'Life and health insurance together' },
  retirement: { cap: 500000, label: 'Retirement savings together (PVD/GPF, RMF, pension insurance, NSF)' },
};

module.exports = { RD_2568, BRACKETS, MINIMUM_TAX, SENIOR_EXEMPTION, POOL12_CAP, POOL3_CAP, INCOME_KINDS, INCOME_TYPES, COMMON_DEDUCTIONS, COMBINED_CAPS, D };
