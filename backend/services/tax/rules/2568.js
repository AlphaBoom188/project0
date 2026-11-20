// Tax year 2568 (calendar 2025), filed Jan-Apr 2569. Verified against the
// RD 2568 booklets except where `verified: false`.
const c = require('./common');

module.exports = {
  year: 2568,
  brackets: c.BRACKETS,
  minimumTax: c.MINIMUM_TAX,
  seniorExemption: c.SENIOR_EXEMPTION,
  incomeKinds: c.INCOME_KINDS,
  combinedCaps: c.COMBINED_CAPS,
  deductions: [
    ...c.COMMON_DEDUCTIONS,
    c.D('thai_esgx_new', 'investment', 'ThaiESGX: new money (bought by 30 Jun 2568)', { rateOf: 'assessable', rate: 0.30, cap: 300000 }),
    c.D('thai_esgx_ltf', 'investment', 'ThaiESGX: switched from LTF (2568 portion)', { cap: 300000, verified: false, source: 'iTAX/press: 300k in 2568, the rest 50k a year 2569-2572' }),
    c.D('easy_ereceipt', 'measures', 'Easy E-Receipt 2.0 (16 Jan-28 Feb 2568)', { cap: 50000, note: 'Up to 30,000 from VAT-registered sellers plus 20,000 from OTOP / community enterprises', window: ['2025-01-16', '2025-02-28'] }),
    c.D('travel_main', 'measures', 'เที่ยวดีมีคืน: main cities (29 Oct-15 Dec 2568)', { cap: 20000, combined: ['travel'], verified: false, source: 'Ins90 2568 (10k + 10k e-Tax invoice split not modelled)', window: ['2025-10-29', '2025-12-15'] }),
    c.D('travel_secondary', 'measures', 'เที่ยวดีมีคืน: secondary cities (counts 1.5x)', { multiplier: 1.5, cap: 30000, combined: ['travel'], verified: false, source: 'Ins90 2568' }),
    c.D('new_home', 'measures', 'New-home construction (finished in 2568)', { input: 'cost', perMillion: 10000, cap: 100000, note: '10,000 per 1,000,000 baht of construction cost' }),
  ],
  extraCombinedCaps: { travel: { cap: 30000, label: 'เที่ยวดีมีคืน together' } },
  filing: {
    form: { pnd91: 'PND 91 (salary only)', pnd90: 'PND 90' },
    paperDeadline: '2569-03-31',
    onlineDeadline: '2569-04-08',
    verified: true,
    source: 'RD Ins90/Ins91 2568; MOF e-filing announcement',
  },
};
