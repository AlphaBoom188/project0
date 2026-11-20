// Tax year 2569 (calendar 2026), the current year, for planning. No RD
// booklet for 2569 exists yet: the common rules are carried over from 2568
// (no change announced) and the 2569-only items are flagged unverified.
const c = require('./common');

const UNVERIFIED_2569 = { verified: false, source: 'Carried from 2568; no 2569 RD booklet yet' };

module.exports = {
  year: 2569,
  brackets: c.BRACKETS,
  minimumTax: c.MINIMUM_TAX,
  seniorExemption: c.SENIOR_EXEMPTION,
  incomeKinds: c.INCOME_KINDS,
  combinedCaps: c.COMBINED_CAPS,
  carriedOver: true, // the UI says "2569 rules follow 2568 until the RD publishes 2569"
  deductions: [
    ...c.COMMON_DEDUCTIONS,
    c.D('thai_esgx_ltf', 'investment', 'ThaiESGX: LTF switch carried over (50,000 a year, 2569-2572)', { cap: 50000, verified: false, source: 'iTAX 2569 list' }),
    c.D('solar_rooftop', 'measures', 'Solar rooftop (on-grid, e-Tax invoice, until 31 Dec 2571)', { cap: 200000, verified: false, source: 'RD press release 3/2569 (start date unverified)' }),
    c.D('social_enterprise', 'investment', 'Social enterprise investment', { cap: 100000, verified: false, source: 'Decree 812 (unverified)' }),
  ],
  extraCombinedCaps: {},
  filing: {
    form: { pnd91: 'PND 91 (salary only)', pnd90: 'PND 90' },
    paperDeadline: '2570-03-31',
    onlineDeadline: null, // not announced yet
    ...UNVERIFIED_2569,
  },
};
