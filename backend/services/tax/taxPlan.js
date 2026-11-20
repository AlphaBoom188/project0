// Tax Phase 4 (pure): the planner ("put ฿X more into ThaiESG to save ฿Y")
// and the filing guide (form, deadlines, documents, what to enter). Both are
// built from the same calculator (taxMath), so they can't disagree with it.

const { computeTax } = require('./taxMath');

// Deductions a person can still choose to pay into before the year ends.
const PLANNABLE = ['thai_esg', 'rmf', 'pension_insurance', 'life_insurance', 'health_insurance', 'nsf', 'donation_double', 'donation', 'social_enterprise'];
const PLAN_NOTES = {
  thai_esg: 'Buy by 31 December and hold 5 years from each purchase.',
  rmf: 'Buy by 31 December; hold at least 5 years and until age 55.',
  pension_insurance: 'A pension policy paying from age 55 to 85, at least 10 years of premiums.',
  life_insurance: 'Only policies of 10 years or more count.',
  health_insurance: 'Your own health insurance; counts inside the 100,000 life insurance limit.',
  nsf: 'National Savings Fund: for people without a provident fund or pension.',
  donation_double: 'Through e-Donation to education, sports, state hospitals or listed funds: counts twice.',
  donation: 'Through e-Donation or with a receipt.',
  social_enterprise: 'Investment in a registered social enterprise.',
};
const round2 = (n) => Math.round(n * 100) / 100;

const withClaim = (input, key, extra) => {
  const prev = Number((input.claims || {})[key]) || 0;
  return { ...input, claims: { ...(input.claims || {}), [key]: round2(prev + extra) } };
};
const allowedOf = (res, key) => {
  const row = res.allowances.find((a) => a.key === key) || res.donations.find((a) => a.key === key);
  return row ? row.allowed : 0;
};

// The extra amount (baht paid) after which paying more into `key` stops
// increasing its deduction: binary search on the calculator itself, so
// percentage limits, caps and shared caps all count.
function roomFor(rules, input, key) {
  const base = allowedOf(computeTax(rules, input), key);
  const hi0 = 10000000; // 10M: above every cap
  const top = allowedOf(computeTax(rules, withClaim(input, key, hi0)), key);
  if (top - base < 1) return 0;
  let lo = 0;
  let hi = hi0;
  while (hi - lo > 1) { // to the baht
    const mid = Math.floor((lo + hi) / 2);
    if (top - allowedOf(computeTax(rules, withClaim(input, key, mid)), key) < 0.005) hi = mid; else lo = mid;
  }
  return hi;
}

// -> { applicable, reason?, deadline, daysLeft, topRate, items: [...], combined }
function buildPlan(rules, input, { today }) {
  const ce = rules.year - 543;
  const deadline = `${ce}-12-31`;
  const now = computeTax(rules, input);
  const base = { deadline, daysLeft: null, topRate: now.marginalRate, items: [], combined: null };
  if (!today || today > deadline) return { ...base, applicable: false, reason: `Tax year ${rules.year} has ended, so it's too late to lower it with new payments.` };
  const daysLeft = Math.round((Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  if (!now.totals.gross) return { ...base, daysLeft, applicable: false, reason: 'Add your income first to see what you could save.' };
  if (now.minimumTax.applies) return { ...base, daysLeft, applicable: false, reason: 'Your tax comes from the 0.5% method on your income, which deductions don\'t lower.' };
  if (now.taxDue <= 0) return { ...base, daysLeft, applicable: false, reason: 'You have no tax to pay this year, so more deductions won\'t save anything.' };

  const keys = PLANNABLE.filter((k) => rules.deductions.some((d) => d.key === k));
  const items = [];
  for (const key of keys) {
    const room = roomFor(rules, input, key);
    if (room <= 0) continue;
    const after = computeTax(rules, withClaim(input, key, room));
    const saves = round2(now.taxDue - after.taxDue);
    if (saves <= 0) continue;
    const step = Math.min(1000, room);
    const perThousand = round2(((now.taxDue - computeTax(rules, withClaim(input, key, step)).taxDue) / step) * 1000);
    const def = rules.deductions.find((d) => d.key === key);
    items.push({ key, label: def.label, room, saves, perThousand, verified: def.verified !== false, note: PLAN_NOTES[key] });
  }
  items.sort((a, b) => b.perThousand - a.perThousand || b.saves - a.saves);

  // Everything together, best first (shared caps mean the rooms shrink).
  let all = input;
  const used = [];
  for (const it of items) {
    const room = roomFor(rules, all, it.key);
    if (room <= 0) continue;
    all = withClaim(all, it.key, room);
    used.push({ key: it.key, amount: room });
  }
  const afterAll = computeTax(rules, all);
  const combined = used.length ? { pay: round2(used.reduce((s, u) => s + u.amount, 0)), saves: round2(now.taxDue - afterAll.taxDue), parts: used } : null;
  return { ...base, daysLeft, applicable: items.length > 0, reason: items.length ? null : 'You\'ve used every deduction that could still lower your tax this year.', items, combined };
}

// ---- Filing guide ----
const DOCS = {
  salary: '50 ทวิ (withholding certificate) from each employer',
  freelance: '50 ทวิ from each client who withheld tax',
  dividend_th: 'Dividend notices (they show the tax credit rate)',
  fund_distribution: 'Fund distribution notices',
  interest: 'Interest certificates from your bank (if tax was withheld)',
  life_insurance: 'Life insurance tax certificate from the insurer',
  health_insurance: 'Health insurance tax certificate from the insurer',
  parents_health_insurance: "Parents' health insurance certificate",
  pension_insurance: 'Pension insurance tax certificate',
  rmf: 'RMF purchase certificate from each fund company',
  thai_esg: 'ThaiESG purchase certificate from each fund company',
  thai_esgx_new: 'ThaiESGX purchase certificate',
  thai_esgx_ltf: 'ThaiESGX (LTF switch) certificate',
  provident_fund: 'Provident fund statement (usually on your 50 ทวิ)',
  social_security: 'Social security total (on your 50 ทวิ)',
  home_loan_interest: "The bank's yearly home loan interest certificate",
  donation_double: 'e-Donation records (checked automatically) or receipts',
  donation: 'Donation receipts or e-Donation records',
  political_party: 'Political party donation receipt',
  parents: 'ล.ย.03 form if siblings share the parent allowance',
  maternity: 'Hospital receipts for pregnancy and childbirth',
  easy_ereceipt: 'e-Tax invoices / e-Receipts (checked automatically)',
  solar_rooftop: 'e-Tax invoice for the solar system',
  new_home: 'Construction contract and e-Tax invoices',
  artwork: 'Receipts for the artwork',
};

function buildGuide(rules, input, result, { today }) {
  const f = result.filing;
  const toCE = (be) => (be ? `${Number(be.slice(0, 4)) - 543}${be.slice(4)}` : null);
  const last = f.onlineDeadline || f.paperDeadline;
  const lastCE = toCE(last);
  const daysLeft = today && lastCE ? Math.round((Date.parse(`${lastCE}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000) : null;
  const opens = `${rules.year - 543 + 1}-01-01`; // filing opens 1 January after the year
  const kinds = new Set((input.incomes || []).map((i) => i.kind));
  const claimed = Object.keys(input.claims || {}).filter((k) => (input.claims || {})[k] && k !== 'personal');
  const docs = [...kinds, ...claimed].filter((k, i, a) => DOCS[k] && a.indexOf(k) === i).map((k) => ({ key: k, label: DOCS[k] }));
  const steps = [
    { title: 'Sign in', body: 'Go to efiling.rd.go.th (or the RD Smart Tax app) and sign in with your ID card number.' },
    { title: `Choose ${f.form === 'PND91' ? 'PND 91' : 'PND 90'}`, body: f.form === 'PND91' ? 'For salary only.' : 'Because you have income other than salary.' },
    { title: 'Enter your income', body: 'Each income type and the tax withheld, as below. Pre-filled figures from your employer may already be there: check them against your 50 ทวิ.' },
    { title: 'Enter your deductions', body: 'Family, insurance, funds and donations, as below. e-Donation and e-Receipt amounts usually fill in by themselves.' },
    { title: result.result === 'refund' ? 'Get your refund' : result.result === 'pay' ? 'Pay' : 'Submit', body: result.result === 'refund' ? 'Refunds go to the PromptPay account linked to your ID card number.' : result.result === 'pay' ? `Pay by card, bank transfer or QR.${result.instalments ? ' You can split it into 3 monthly instalments.' : ''}` : 'Submit the return.' },
  ];
  const enter = {
    incomes: result.incomes.map((l) => ({ type: l.type, label: l.label, amount: l.amount, withheld: l.withheld })),
    deductions: [...result.allowances, ...result.donations].filter((a) => a.allowed > 0).map((a) => ({ key: a.key, label: a.label, amount: a.allowed })),
    withheld: result.withheld,
    taxDue: result.taxDue,
    balance: result.balance,
  };
  return {
    form: f.form,
    mustFile: f.mustFile,
    opens,
    deadline: last,
    deadlineCE: lastCE,
    onlineAnnounced: !!f.onlineDeadline,
    daysLeft,
    status: !today ? null : today < opens ? 'not_open' : daysLeft != null && daysLeft < 0 ? 'late' : 'open',
    steps,
    documents: docs,
    enter,
  };
}

module.exports = { buildPlan, buildGuide, roomFor, PLANNABLE };
