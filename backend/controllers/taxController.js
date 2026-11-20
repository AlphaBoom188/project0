// Tax section REST (migration 021). Every route is /api/tax/:u/:year; the
// year must be one we have rules for. Each write returns the whole state
// with a fresh result, so the app re-renders from one response.
const { getRules, YEARS } = require('../services/tax/rules');
const { computeTax } = require('../services/tax/taxMath');
const store = require('../services/tax/taxStore');
const { buildSuggestions } = require('../services/tax/taxSuggest');
const { buildPlan, buildGuide } = require('../services/tax/taxPlan');
const reminderStore = require('../services/reminderStore');
const supabase = require('../config/supabase');
const { bangkokMidnight, getBangkokYmd } = require('../services/bangkokDay');

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

// `_suggestions` (accepted / dismissed suggestion ids) lives in the profile
// JSON but isn't part of the profile the app edits.
const publicProfile = (p) => { const { _suggestions, _reminders, ...rest } = p || {}; return rest; };
const suggestionMemo = (p) => ({ accepted: {}, dismissed: [], ...((p && p._suggestions) || {}) });

// Everything the suggestion engine reads for one tax year.
async function loadSuggestionInputs(lineUserId, rules) {
  const ce = rules.year - 543;
  const from = bangkokMidnight(ce, 0, 1).toISOString();
  const to = bangkokMidnight(ce + 1, 0, 1).toISOString();
  const [tx, holdings, lots] = await Promise.all([
    supabase.from('transactions').select('id, amount, type, description, transaction_date, categories ( name )')
      .eq('line_user_id', lineUserId).gte('transaction_date', from).lt('transaction_date', to).in('type', ['income', 'expense']).limit(10000),
    supabase.from('asset_holdings').select('id, asset_type, symbol, name, currency').eq('line_user_id', lineUserId),
    supabase.from('asset_lots').select('id, holding_id, side, quantity, price, fee, trade_date').eq('line_user_id', lineUserId),
  ]);
  for (const r of [tx, holdings, lots]) if (r.error) throw r.error;
  const lotsByHolding = {};
  lots.data.forEach((l) => { (lotsByHolding[l.holding_id] ||= []).push(l); });
  let dividends = null;
  let dividendsError = null;
  try {
    dividends = await require('./portfolioController').dividendsReceivedInYear(lineUserId, ce);
  } catch (error) {
    dividendsError = "Couldn't load dividends from your portfolio right now.";
    console.warn(`[tax] dividends for suggestions failed (${error.message})`);
  }
  return {
    transactions: tx.data.map((t) => ({ id: t.id, amount: Number(t.amount), type: t.type, description: t.description, category_name: t.categories ? t.categories.name : null, date: getBangkokYmd(new Date(t.transaction_date)) })),
    holdings: holdings.data,
    lotsByHolding,
    dividends,
    dividendsError,
  };
}

// Applies one suggestion to the saved state (for the "changes your tax by" figure).
function withSuggestion(state, sg, memo) {
  if (sg.target === 'claim') return { ...state, claims: { ...state.claims, [sg.key]: sg.amount } };
  const line = { kind: sg.kind, amount: sg.amount, withheld: sg.withheld || 0, expense_method: 'flat', actual_expenses: 0, credit_rate: sg.creditRate ?? null };
  const prev = memo.accepted[sg.id] && memo.accepted[sg.id].incomeId;
  const incomes = state.incomes.filter((i) => i.id !== prev);
  return { ...state, incomes: [...incomes, line] };
}

async function suggestionsResponse(lineUserId, rules) {
  const [state, inputs] = await Promise.all([store.loadState(lineUserId, rules.year), loadSuggestionInputs(lineUserId, rules)]);
  const memo = suggestionMemo(state.profile);
  const list = buildSuggestions({ year: rules.year, rules, ...inputs, today: getBangkokYmd() });
  const base = computeTax(rules, store.toCalcInput(state)).balance;
  const suggestions = list.map((sg) => {
    const accepted = memo.accepted[sg.id];
    let status = 'new';
    if (memo.dismissed.includes(sg.id)) status = 'dismissed';
    else if (accepted) status = Math.abs(accepted.amount - sg.amount) < 0.01 ? 'added' : 'changed';
    else if (sg.target === 'claim' && state.claims[sg.key] != null) status = 'entered';
    const impact = status === 'new' || status === 'changed' || status === 'entered'
      ? Math.round((computeTax(rules, store.toCalcInput(withSuggestion(state, sg, memo))).balance - base) * 100) / 100
      : null;
    return { ...sg, status, impact, entered: sg.target === 'claim' ? state.claims[sg.key] ?? null : null };
  });
  return { year: rules.year, suggestions, dividendsError: inputs.dividendsError };
}

// LINE reminders this tax year created (ids kept in profile._reminders).
async function filingReminders(lineUserId, profile) {
  const ids = (profile && profile._reminders) || [];
  if (!ids.length) return [];
  const rows = await Promise.all(ids.map((id) => reminderStore.getReminder(id)));
  return rows.filter((r) => r && r.line_user_id === lineUserId).map((r) => ({ id: r.id, title: r.title, remind_at: r.remind_at, status: r.status }));
}

async function stateResponse(lineUserId, rules, { withRules = false } = {}) {
  const state = await store.loadState(lineUserId, rules.year);
  const input = store.toCalcInput(state);
  const result = computeTax(rules, input);
  const today = getBangkokYmd();
  return {
    year: rules.year,
    years: YEARS,
    ...(withRules ? { rules: rulesForApp(rules) } : {}),
    profile: publicProfile(state.profile),
    claims: state.claims,
    incomes: state.incomes,
    result,
    plan: buildPlan(rules, input, { today }),
    guide: buildGuide(rules, input, result, { today }),
    reminders: await filingReminders(lineUserId, state.profile),
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

// GET /api/tax/:u/:year/suggestions -> suggestions from transactions and the portfolio
taxController.suggestions = handle('suggestions', async (req, res, rules) => {
  res.json(await suggestionsResponse(req.params.line_user_id, rules));
});

// POST /api/tax/:u/:year/suggestions/:suggestion_id/accept|dismiss|restore
// Accept adds the income line (or updates the one it added before) or sets
// the claim; dismiss hides it. Returns the tax state and the suggestions.
taxController.suggestionAction = handle('suggestionAction', async (req, res, rules) => {
  const { line_user_id: u, suggestion_id: id, action } = req.params;
  if (!['accept', 'dismiss', 'restore'].includes(action)) return res.status(404).json({ error: 'Unknown action' });
  const state = await store.loadState(u, rules.year);
  const memo = suggestionMemo(state.profile);
  let claims = state.claims;
  if (action === 'accept') {
    const inputs = await loadSuggestionInputs(u, rules);
    const sg = buildSuggestions({ year: rules.year, rules, ...inputs, today: getBangkokYmd() }).find((x) => x.id === id);
    if (!sg) return res.status(404).json({ error: 'That suggestion is no longer available' });
    if (sg.target === 'claim') {
      const merged = store.mergeClaims(rules, claims, { [sg.key]: sg.amount });
      if (merged.error) return bad(res, merged.error);
      claims = merged.value;
      memo.accepted[id] = { amount: sg.amount };
    } else {
      const line = { kind: sg.kind, amount: sg.amount, withheld: Math.min(sg.withheld || 0, sg.amount), payer: sg.title.slice(0, 200), credit_rate: sg.creditRate ?? null, expense_method: 'flat', actual_expenses: 0 };
      const prevId = memo.accepted[id] && memo.accepted[id].incomeId;
      const updated = prevId ? await store.updateIncome(u, rules.year, prevId, line) : null;
      let incomeId = updated && updated.id;
      if (!incomeId) {
        const added = await store.insertIncome(u, rules.year, line);
        if (added.error) return bad(res, added.error);
        incomeId = added.income.id;
      }
      memo.accepted[id] = { amount: sg.amount, incomeId };
    }
    memo.dismissed = memo.dismissed.filter((x) => x !== id);
  } else if (action === 'dismiss') {
    if (!memo.dismissed.includes(id)) memo.dismissed = [...memo.dismissed, id].slice(-200);
  } else {
    memo.dismissed = memo.dismissed.filter((x) => x !== id);
  }
  await store.saveProfileRow(u, rules.year, { profile: { ...state.profile, _suggestions: memo }, claims });
  const [st, sgs] = await Promise.all([stateResponse(u, rules), suggestionsResponse(u, rules)]);
  res.json({ ...st, suggestions: sgs.suggestions, dividendsError: sgs.dividendsError });
});

// POST /api/tax/:u/:year/reminders -> LINE reminders for the filing deadline
// (14 days before and on the day) and, for the current year, buying
// deduction funds before 31 December. Replaces any set before.
// DELETE removes them.
const at9 = (ymdCE) => new Date(`${ymdCE}T09:00:00+07:00`);
taxController.setReminders = handle('setReminders', async (req, res, rules) => {
  const u = req.params.line_user_id;
  const state = await store.loadState(u, rules.year);
  const input = store.toCalcInput(state);
  const result = computeTax(rules, input);
  const today = getBangkokYmd();
  const guide = buildGuide(rules, input, result, { today });
  const plan = buildPlan(rules, input, { today });
  const form = guide.form === 'PND91' ? 'PND 91' : 'PND 90';
  const wanted = [];
  if (guide.deadlineCE) {
    const due = at9(guide.deadlineCE);
    wanted.push({ title: `File your ${form} for tax year ${rules.year}`, details: `Due ${guide.deadline}${guide.onlineAnnounced ? ' (online)' : ' (paper; the online date is usually a week later)'}. Your figures are under Tax in the app.`, remind_at: new Date(due.getTime() - 14 * 86400000), importance: 1 });
    wanted.push({ title: `Last day to file your ${form} (tax year ${rules.year})`, details: 'File at efiling.rd.go.th today.', remind_at: due, importance: 2 });
  }
  if (plan.applicable) {
    const funds = plan.items.filter((i) => ['thai_esg', 'rmf'].includes(i.key)).map((i) => (i.key === 'rmf' ? 'RMF' : 'ThaiESG'));
    wanted.push({ title: `Last chance to lower your ${rules.year} tax`, details: `${funds.length ? `Buy ${funds.join(' or ')} by 31 December. ` : ''}See the planner under Tax.`, remind_at: at9(`${rules.year - 543}-12-15`), importance: 1 });
  }
  const future = wanted.filter((w) => w.remind_at > new Date());
  if (!future.length) return bad(res, guide.status === 'late' ? 'The filing deadline for this year has passed.' : 'Nothing to remind you about for this year.');
  for (const id of (state.profile._reminders || [])) {
    const r = await reminderStore.getReminder(id);
    if (r && r.line_user_id === u) await reminderStore.deleteReminder(id);
  }
  const ids = [];
  for (const w of future) {
    const { reminder, error } = await reminderStore.createReminder(u, { ...w, remind_at: w.remind_at.toISOString(), category: 'finance' });
    if (error) return bad(res, error);
    ids.push(reminder.id);
  }
  await store.saveProfileRow(u, rules.year, { profile: { ...state.profile, _reminders: ids }, claims: state.claims });
  res.json(await stateResponse(u, rules));
});

taxController.clearReminders = handle('clearReminders', async (req, res, rules) => {
  const u = req.params.line_user_id;
  const state = await store.loadState(u, rules.year);
  for (const id of (state.profile._reminders || [])) {
    const r = await reminderStore.getReminder(id);
    if (r && r.line_user_id === u) await reminderStore.deleteReminder(id);
  }
  await store.saveProfileRow(u, rules.year, { profile: { ...state.profile, _reminders: [] }, claims: state.claims });
  res.json(await stateResponse(u, rules));
});

module.exports = taxController;
