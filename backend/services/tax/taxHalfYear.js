// Tax Phase 6 (pure): the half-year return, PND 94 (RD Ins94, tax year
// 2568). For income under 40(5)-(8) received January-June:
//   * file 1 July - 30 September of the tax year, when that income is over
//     60,000 (single) / 120,000 (married);
//   * same expense rules; family allowances are halved (personal 30,000,
//     spouse 30,000, child 15,000 + 30,000 for the 2nd+ child born 2561 or
//     later as the booklet words it, parents 15,000, disabled 30,000); other
//     deductions are what was actually paid January-June (here: half of
//     social security; the rest the user adds when filing);
//   * tax = the higher of the progressive tax and 0.5% of the income if
//     that's over 5,000; what's paid is a credit on the annual PND 90.
// The Jan-Jun amount of each line defaults to half its yearly amount
// (an estimate) until the user enters it.

const { computeTax } = require('./taxMath');

const HALF_TYPES = ['40(5)', '40(6)', '40(7)', '40(8)'];
const round2 = (n) => Math.round(n * 100) / 100;

// The year's rules with PND 94's halved family allowances and only the
// deductions we can estimate for January-June.
function halfYearRules(rules) {
  const keep = new Set(['personal', 'spouse', 'children', 'parents', 'disabled_dependants', 'social_security', 'donation_double', 'donation']); // donations stay (the calculator expects them) but aren't claimed
  return {
    ...rules,
    carriedOver: false,
    deductions: rules.deductions.filter((d) => keep.has(d.key)).map((d) => {
      if (d.key === 'personal' || d.key === 'spouse') return { ...d, fixed: 30000 };
      if (d.key === 'children') return { ...d, childBase: 15000, childBonus: 30000 };
      if (d.key === 'parents') return { ...d, perUnit: 15000 };
      if (d.key === 'disabled_dependants') return { ...d, perUnit: 30000 };
      return d;
    }),
  };
}

// state: the saved tax state (profile, claims, incomes); memo: profile._pnd94
function buildHalfYear(rules, state, { today }) {
  const ce = rules.year - 543;
  const opens = `${ce}-07-01`;
  const deadline = `${ce}-09-30`;
  const memo = (state.profile && state.profile._pnd94) || {};
  const amounts = memo.amounts || {};
  const lines = state.incomes
    .filter((i) => HALF_TYPES.includes((rules.incomeKinds[i.kind] || {}).type))
    .map((i) => {
      const entered = amounts[i.id];
      return {
        incomeId: i.id,
        kind: i.kind,
        label: rules.incomeKinds[i.kind].label,
        type: rules.incomeKinds[i.kind].type,
        yearAmount: i.amount,
        halfAmount: entered != null ? entered : round2(i.amount / 2),
        estimated: entered == null,
        expense_method: i.expense_method,
        actual_expenses: i.actual_expenses,
      };
    });
  const status = !today ? null : today < opens ? 'not_open' : today > deadline ? 'closed' : 'open';
  const base = { opens, deadline, status, lines, prepaid: memo.prepaid || 0 };
  if (!lines.length) return { ...base, applicable: false, reason: 'Only for rent, professional, contracting or business income (40(5)-(8)).' };

  const married = state.profile.maritalStatus === 'married';
  const threshold = married ? 120000 : 60000;
  const total = round2(lines.reduce((s, l) => s + l.halfAmount, 0));
  const input = {
    profile: state.profile,
    claims: {
      ...(state.claims.personal === false ? { personal: false } : {}),
      ...(state.claims.parents ? { parents: state.claims.parents } : {}),
      ...(state.claims.disabled_dependants ? { disabled_dependants: state.claims.disabled_dependants } : {}),
      ...(state.claims.social_security ? { social_security: round2(state.claims.social_security / 2) } : {}),
    },
    incomes: lines.map((l) => ({
      kind: l.kind,
      amount: l.halfAmount,
      expenseMethod: l.expense_method,
      actualExpenses: l.yearAmount ? round2((l.actual_expenses || 0) * (l.halfAmount / l.yearAmount)) : 0,
    })),
  };
  const result = computeTax(halfYearRules(rules), input);
  return {
    ...base,
    applicable: true,
    mustFile: total > threshold,
    threshold,
    income: total,
    tax: result.taxDue,
    netIncome: result.totals.netIncome,
    minimumTaxApplies: result.minimumTax.applies,
    allowances: result.allowances.filter((a) => a.allowed > 0).map((a) => ({ key: a.key, label: a.label, amount: a.allowed })),
    estimated: lines.some((l) => l.estimated),
  };
}

module.exports = { buildHalfYear, halfYearRules, HALF_TYPES };
