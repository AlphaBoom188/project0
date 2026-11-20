// Tax section REST (migration 021). Every route is /api/tax/:u/:year; the
// year must be one we have rules for. Each write returns the whole state
// with a fresh result, so the app re-renders from one response.
const { getRules, YEARS } = require('../services/tax/rules');
const { computeTax } = require('../services/tax/taxMath');
const store = require('../services/tax/taxStore');

const bad = (res, error) => res.status(400).json({ error });

// Income catalogue and deduction list for the app (no functions, no internals).
function rulesForApp(rules) {
  const kinds = Object.entries(rules.incomeKinds).map(([key, k]) => ({
    key, type: k.type, label: k.label, expense: k.expense.kind, rate: k.expense.rate || null,
    actualAllowed: !(k.expense.flatOnly || ['pool12', 'none'].includes(k.expense.kind)), dividendCredit: !!k.dividendCredit,
  }));
  return {
    year: rules.year,
    carriedOver: !!rules.carriedOver,
    incomeKinds: kinds,
    shortcuts: ['salary', 'freelance', 'biz_27', 'biz_9', 'interest', 'dividend_th'],
    deductions: rules.deductions.map((d) => ({
      key: d.key, group: d.group, label: d.label, input: d.input, cap: d.cap ?? null, rate: d.rate ?? null, rateOf: d.rateOf ?? null,
      perUnit: d.perUnit ?? null, maxUnits: d.maxUnits ?? null, multiplier: d.multiplier ?? null, note: d.note || null, when: d.when || null, verified: d.verified !== false,
    })),
    filing: rules.filing,
  };
}

async function stateResponse(lineUserId, rules, { withRules = false } = {}) {
  const state = await store.loadState(lineUserId, rules.year);
  return {
    year: rules.year,
    years: YEARS,
    ...(withRules ? { rules: rulesForApp(rules) } : {}),
    profile: state.profile,
    claims: state.claims,
    incomes: state.incomes,
    result: computeTax(rules, store.toCalcInput(state)),
  };
}

const handle = (name, fn) => async (req, res) => {
  try {
    await fn(req, res, getRules(req.params.year));
  } catch (error) {
    console.error(`Error in tax ${name}:`, error);
    res.status(500).json({ error: error.message });
  }
};

const taxController = {
  // GET /api/tax/:u/:year -> rules for the app, profile, claims, incomes, result
  get: handle('get', async (req, res, rules) => {
    res.json(await stateResponse(req.params.line_user_id, rules, { withRules: true }));
  }),

  // PUT /api/tax/:u/:year/profile { maritalStatus?, spouseHasIncome?, age65?, disabled?, children? } (merged)
  updateProfile: handle('updateProfile', async (req, res, rules) => {
    const { value, error } = store.validateProfile(req.body, rules.year);
    if (error) return bad(res, error);
    const state = await store.loadState(req.params.line_user_id, rules.year);
    await store.saveProfileRow(req.params.line_user_id, rules.year, { profile: { ...state.profile, ...value }, claims: state.claims });
    res.json(await stateResponse(req.params.line_user_id, rules));
  }),

  // PUT /api/tax/:u/:year/claims { <deduction key>: amount | count | null } (merged)
  updateClaims: handle('updateClaims', async (req, res, rules) => {
    const state = await store.loadState(req.params.line_user_id, rules.year);
    const { value, error } = store.mergeClaims(rules, state.claims, req.body);
    if (error) return bad(res, error);
    await store.saveProfileRow(req.params.line_user_id, rules.year, { profile: state.profile, claims: value });
    res.json(await stateResponse(req.params.line_user_id, rules));
  }),

  // POST /api/tax/:u/:year/incomes { kind, amount, withheld?, payer?, expenseMethod?, actualExpenses?, creditRate? }
  addIncome: handle('addIncome', async (req, res, rules) => {
    const { value, error } = store.validateIncome(rules, req.body);
    if (error) return bad(res, error);
    const added = await store.insertIncome(req.params.line_user_id, rules.year, value);
    if (added.error) return bad(res, added.error);
    res.status(201).json({ ...(await stateResponse(req.params.line_user_id, rules)), income: added.income });
  }),

  // PUT /api/tax/:u/:year/incomes/:income_id
  updateIncome: handle('updateIncome', async (req, res, rules) => {
    const { value, error } = store.validateIncome(rules, req.body, { partial: true });
    if (error) return bad(res, error);
    const { line_user_id: u, income_id: id } = req.params;
    const existing = await store.getIncome(u, rules.year, id);
    if (!existing) return res.status(404).json({ error: 'Income not found' });
    const amount = value.amount ?? Number(existing.amount);
    const withheld = value.withheld ?? Number(existing.withheld);
    if (withheld > amount) return bad(res, "Tax withheld can't be more than the income");
    await store.updateIncome(u, rules.year, id, value);
    res.json(await stateResponse(u, rules));
  }),

  // DELETE /api/tax/:u/:year/incomes/:income_id
  deleteIncome: handle('deleteIncome', async (req, res, rules) => {
    await store.deleteIncome(req.params.line_user_id, rules.year, req.params.income_id);
    res.json(await stateResponse(req.params.line_user_id, rules));
  }),
};

module.exports = taxController;
