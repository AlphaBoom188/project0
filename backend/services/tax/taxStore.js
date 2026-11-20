// Tax data the user entered (migration 021), and the validation of it
// against a tax year's rules. The calculation itself is taxMath (pure).
const supabase = require('../../config/supabase');
const { DIVIDEND_CREDIT_RATES } = require('./taxMath');

const MARITAL = ['single', 'married', 'divorced', 'widowed'];
const MAX_AMOUNT = 1e9;
const num = (v) => (v === '' || v == null ? NaN : Number(v));

// -> { value } | { error }
function validateProfile(body, year) {
  const p = body || {};
  const v = {};
  if (p.maritalStatus !== undefined) {
    if (!MARITAL.includes(p.maritalStatus)) return { error: `maritalStatus must be one of ${MARITAL.join(', ')}` };
    v.maritalStatus = p.maritalStatus;
  }
  for (const k of ['spouseHasIncome', 'age65', 'disabled']) {
    if (p[k] !== undefined) {
      if (typeof p[k] !== 'boolean') return { error: `${k} must be true or false` };
      v[k] = p[k];
    }
  }
  if (p.children !== undefined) {
    if (!Array.isArray(p.children) || p.children.length > 20) return { error: 'children must be a list (at most 20)' };
    const kids = [];
    for (const c of p.children) {
      const y = Number(c && c.birthYear);
      if (!Number.isInteger(y) || y < 2450 || y > year) return { error: `Each child needs a birth year (Buddhist era) between 2450 and ${year}` };
      kids.push({ birthYear: y });
    }
    v.children = kids;
  }
  return { value: v };
}

// Merges claim changes into the saved ones. null / 0 / '' removes a claim.
// -> { value } | { error }
function mergeClaims(rules, saved, changes) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return { error: 'claims must be an object' };
  const out = { ...saved };
  const byKey = Object.fromEntries(rules.deductions.map((d) => [d.key, d]));
  for (const [key, raw] of Object.entries(changes)) {
    const d = byKey[key];
    if (!d) return { error: `"${key}" isn't a deduction in tax year ${rules.year}` };
    if (key === 'personal') {
      if (raw === false) out.personal = false; else delete out.personal;
      continue;
    }
    if (d.input === 'auto') return { error: `${d.label} comes from your profile` };
    if (raw === null || raw === '' || Number(raw) === 0) { delete out[key]; continue; }
    const n = num(raw);
    if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) return { error: `${d.label}: enter an amount between 0 and 1,000,000,000` };
    if (d.input === 'count') {
      if (!Number.isInteger(n) || n > (d.maxUnits || 99)) return { error: `${d.label}: enter a whole number up to ${d.maxUnits}` };
      out[key] = n;
    } else out[key] = Math.round(n * 100) / 100;
  }
  return { value: out };
}

// -> { value } | { error }
function validateIncome(rules, body, { partial = false } = {}) {
  const b = body || {};
  const v = {};
  if (!partial || b.kind !== undefined) {
    if (!rules.incomeKinds[b.kind]) return { error: 'Choose an income type' };
    v.kind = b.kind;
  }
  for (const [k, col, required] of [['amount', 'amount', true], ['withheld', 'withheld', false], ['actualExpenses', 'actual_expenses', false]]) {
    if (b[k] === undefined) { if (required && !partial) return { error: 'Enter the income amount' }; continue; }
    const n = num(b[k]);
    if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT || (k === 'amount' && n <= 0)) return { error: k === 'amount' ? 'Enter an income amount above 0' : `${k === 'withheld' ? 'Tax withheld' : 'Actual expenses'} must be 0 or more` };
    v[col] = Math.round(n * 100) / 100;
  }
  if (b.payer !== undefined) {
    if (b.payer !== null && typeof b.payer !== 'string') return { error: 'Payer must be text' };
    const payer = (b.payer || '').trim();
    if (payer.length > 200) return { error: 'Payer is too long (200 characters max)' };
    v.payer = payer || null;
  }
  if (b.expenseMethod !== undefined) {
    if (!['flat', 'actual'].includes(b.expenseMethod)) return { error: 'expenseMethod must be flat or actual' };
    v.expense_method = b.expenseMethod;
  }
  if (b.creditRate !== undefined) {
    if (b.creditRate === null || b.creditRate === '') v.credit_rate = null;
    else if (!DIVIDEND_CREDIT_RATES.includes(Number(b.creditRate))) return { error: `Dividend credit rate must be one of ${DIVIDEND_CREDIT_RATES.map((r) => `${r * 100}%`).join(', ')}` };
    else v.credit_rate = Number(b.creditRate);
  }
  if (v.withheld != null && v.amount != null && v.withheld > v.amount) return { error: "Tax withheld can't be more than the income" };
  return { value: v };
}

const INCOME_COLUMNS = 'id, kind, payer, amount, withheld, expense_method, actual_expenses, credit_rate, created_at';

async function loadState(lineUserId, year) {
  const [p, inc] = await Promise.all([
    supabase.from('tax_profiles').select('profile, claims, updated_at').eq('line_user_id', lineUserId).eq('tax_year', year).maybeSingle(),
    supabase.from('tax_incomes').select(INCOME_COLUMNS).eq('line_user_id', lineUserId).eq('tax_year', year).order('created_at'),
  ]);
  if (p.error) throw p.error;
  if (inc.error) throw inc.error;
  return {
    profile: (p.data && p.data.profile) || {},
    claims: (p.data && p.data.claims) || {},
    incomes: inc.data.map((r) => ({ ...r, amount: Number(r.amount), withheld: Number(r.withheld), actual_expenses: Number(r.actual_expenses), credit_rate: r.credit_rate == null ? null : Number(r.credit_rate) })),
  };
}

async function saveProfileRow(lineUserId, year, fields) {
  const { error } = await supabase.from('tax_profiles').upsert({ line_user_id: lineUserId, tax_year: year, ...fields, updated_at: new Date().toISOString() }, { onConflict: 'line_user_id,tax_year' });
  if (error) throw error;
}

async function insertIncome(lineUserId, year, value) {
  const { count, error: countError } = await supabase.from('tax_incomes').select('id', { count: 'exact', head: true }).eq('line_user_id', lineUserId).eq('tax_year', year);
  if (countError) throw countError;
  if (count >= 100) return { error: 'Up to 100 income lines per tax year' };
  const { data, error } = await supabase.from('tax_incomes').insert({ line_user_id: lineUserId, tax_year: year, ...value }).select(INCOME_COLUMNS).single();
  if (error) throw error;
  return { income: data };
}

async function updateIncome(lineUserId, year, id, value) {
  const { data, error } = await supabase.from('tax_incomes').update({ ...value, updated_at: new Date().toISOString() })
    .eq('id', id).eq('line_user_id', lineUserId).eq('tax_year', year).select(INCOME_COLUMNS).maybeSingle();
  if (error) throw error;
  return data;
}

async function getIncome(lineUserId, year, id) {
  const { data, error } = await supabase.from('tax_incomes').select(INCOME_COLUMNS).eq('id', id).eq('line_user_id', lineUserId).eq('tax_year', year).maybeSingle();
  if (error) throw error;
  return data;
}

async function deleteIncome(lineUserId, year, id) {
  const { error } = await supabase.from('tax_incomes').delete().eq('id', id).eq('line_user_id', lineUserId).eq('tax_year', year);
  if (error) throw error;
}

// Saved rows -> taxMath input.
const toCalcInput = (state) => ({
  profile: state.profile,
  claims: state.claims,
  incomes: state.incomes.map((r) => ({ kind: r.kind, amount: r.amount, withheld: r.withheld, expenseMethod: r.expense_method, actualExpenses: r.actual_expenses, creditRate: r.credit_rate })),
});

module.exports = { validateProfile, mergeClaims, validateIncome, loadState, saveProfileRow, insertIncome, updateIncome, getIncome, deleteIncome, toCalcInput, MARITAL };
