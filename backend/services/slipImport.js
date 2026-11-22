// Bulk e-slip import (docs/FEATURES.md, "Bulk slip import"). The phone sends
// one slip image per /read call; this reads it (dedupe first, then Vision),
// works out the direction against the user's own accounts, the category and
// a possible duplicate, and returns a row for the review list. /import records
// the approved rows through transactionCreate (balances move, like a manual
// entry); /undo removes them again. Never log slip contents.
const supabase = require('../config/supabase');
const { getBangkokYmd } = require('./bangkokDay');
const { slipKey, SLIP_KEY } = require('./slipQr');
const { createTransaction, DuplicateSlipError, InvalidCategoryError, InvalidAccountError } = require('./transactionCreate');
const { adjustAccountBalance } = require('./accountBalance');

const MAX_ROWS = 50;
const DAY = 86400000;
const TITLES = /^(MR\.?|MRS\.?|MS\.?|MISS|DR\.?|นาย|นางสาว|นาง|น\.ส\.)\s*/i;
const cleanName = (s) => String(s || '').replace(TITLES, '').replace(/\s+/g, ' ').trim().slice(0, 120);
const digits = (s) => String(s || '').replace(/\D/g, '');

// ---- Pure ----

// The user's account a slip side refers to, or null. Slips mask most digits
// ("xxx-x-x1234-x"); the visible run must appear in the account's number.
// Ambiguous (2+ accounts match) counts as no match.
function matchAccount(slipAccount, accounts) {
  const seen = digits(slipAccount);
  if (seen.length < 4) return null;
  const hits = accounts.filter((a) => {
    const own = digits(a.account_number_masked);
    if (own.length < 4) return false;
    return own.includes(seen) || seen.includes(own) || (own.length >= 4 && seen.endsWith(own.slice(-4)));
  });
  return hits.length === 1 ? hits[0] : null;
}

// -> ISO timestamp for the slip, or null when the date is unreadable.
// Time known: that Bangkok time. Date only: T12:00:00Z (19:00 Bangkok, same date).
function slipDate(ex) {
  if (!ex.date) return null;
  const iso = ex.time ? new Date(`${ex.date}T${ex.time}:00+07:00`) : new Date(`${ex.date}T12:00:00Z`);
  return Number.isNaN(iso.getTime()) ? null : iso.toISOString();
}

// ex: extractSlipFromImage() result; accounts: the user's accounts.
// -> { type, amount, transaction_date, description, from_account_id, to_account_id, needs_review, reason }
function buildRow(ex, accounts, now = new Date()) {
  const from = matchAccount(ex.from_account, accounts);
  const to = matchAccount(ex.to_account, accounts);
  const reasons = [];
  let type = 'expense';
  let description = cleanName(ex.to_name) || cleanName(ex.to_bank) || 'Bank transfer';
  let fromId = null;
  let toId = null;
  if (from && to && from.id !== to.id) {
    type = 'transfer';
    fromId = from.id;
    toId = to.id;
    description = `${from.account_name} → ${to.account_name}`;
  } else if (from) {
    fromId = from.id;
  } else if (to) {
    type = 'income';
    toId = to.id;
    description = cleanName(ex.from_name) || cleanName(ex.from_bank) || 'Bank transfer';
  } else {
    reasons.push("Couldn't tell if you paid or received this");
  }
  if (ex.amount == null) reasons.push("Couldn't read the amount");
  let date = slipDate(ex);
  if (!date) {
    reasons.push("Couldn't read the date");
    date = `${getBangkokYmd(now)}T12:00:00.000Z`;
  }
  return {
    type,
    amount: ex.amount,
    transaction_date: date,
    description,
    from_account_id: fromId,
    to_account_id: toId,
    needs_review: reasons.length > 0,
    reason: reasons.join('. ') || null,
  };
}

// Budget alerts from many inserts -> the latest per category / event, so a
// bulk import shows one in-app banner instead of one alert per slip.
function combineAlerts(results) {
  const budget = new Map();
  const events = new Map();
  for (const r of results) {
    if (r.budget_alert) budget.set(r.budget_alert.categoryName, r.budget_alert);
    for (const e of r.event_budget_alerts || []) events.set(e.title, e);
  }
  return { budget_alerts: [...budget.values()], event_budget_alerts: [...events.values()] };
}

// ---- DB ----

async function findByKey(lineUserId, keys) {
  const list = keys.filter(Boolean);
  if (!list.length) return null;
  const { data, error } = await supabase.from('transactions').select('id, transaction_date, amount, slip_hash').eq('line_user_id', lineUserId).in('slip_hash', list).limit(1);
  if (error) throw error;
  return data[0] || null;
}

async function pickCategory(lineUserId, type, description) {
  const { data: categories, error } = await supabase.from('categories').select('id, name, type').eq('line_user_id', lineUserId).eq('type', type);
  if (error) throw error;
  if (!categories.length) return null;
  // 1. learned: the user's own latest row with this description and type
  const { data: past } = await supabase.from('transactions').select('category_id').eq('line_user_id', lineUserId).eq('type', type).eq('description', description).not('category_id', 'is', null).order('created_at', { ascending: false }).limit(1);
  const learned = past && past[0] && categories.find((c) => c.id === past[0].category_id);
  if (learned) return { category: learned, via: 'learned' };
  // 2. keyword rules, 3. gpt-4o-mini (statement import's chain)
  const { ruleMatch, categorizeKeys } = require('./statementImport');
  const rule = ruleMatch(description, categories);
  if (rule.matched && rule.category) return { category: rule.category, via: 'rule' };
  if (!rule.matched) {
    const llm = await categorizeKeys([description], categories);
    if (llm.get(description)) return { category: llm.get(description), via: 'ai' };
  }
  const other = categories.find((c) => /^others?\b|other income/i.test(c.name)) || categories[0];
  return { category: other, via: 'fallback' };
}

async function possibleDuplicate(lineUserId, row) {
  if (row.amount == null) return null;
  const t = new Date(row.transaction_date).getTime();
  const ymd = getBangkokYmd(new Date(t));
  const start = new Date(Date.parse(`${ymd}T00:00:00+07:00`) - DAY).toISOString();
  const end = new Date(Date.parse(`${ymd}T00:00:00+07:00`) + 2 * DAY).toISOString();
  const { data, error } = await supabase.from('transactions').select('id, transaction_date, description, amount')
    .eq('line_user_id', lineUserId).eq('amount', row.amount).gte('transaction_date', start).lt('transaction_date', end).limit(1);
  if (error) throw error;
  const d = data[0];
  return d ? { id: d.id, date: getBangkokYmd(new Date(d.transaction_date)), description: d.description || '' } : null;
}

// body: { image_base64, image_sha256, qr: { bank, ref } | null }
// -> { status: 'duplicate', existing } | { status: 'not_slip' } | { status: 'new', row }
async function readSlip(lineUserId, { image_base64, image_sha256, qr }, { extract } = {}) {
  const key = slipKey(lineUserId, { qr, imageSha256: image_sha256 });
  if (!key) { const e = new Error('image_sha256 (64 hex) or a valid qr is required'); e.status = 400; throw e; }
  // The image key too, so a slip first read without its QR still matches, and
  // the raw image hash, for slips recorded before (bot photos, older scans).
  const imageKey = slipKey(lineUserId, { imageSha256: image_sha256 });
  const legacy = /^[0-9a-f]{64}$/.test(String(image_sha256 || '')) ? image_sha256 : null;
  const existing = await findByKey(lineUserId, [key, imageKey !== key ? imageKey : null, legacy]);
  if (existing) return { status: 'duplicate', slip_key: key, existing: { id: existing.id, date: getBangkokYmd(new Date(existing.transaction_date)), amount: Number(existing.amount) } };
  if (!image_base64) { const e = new Error('image_base64 is required'); e.status = 400; throw e; }

  const ex = await (extract || require('./receiptExtraction').extractSlipFromImage)(image_base64);
  if (!ex.is_slip) return { status: 'not_slip', slip_key: key };
  const { data: accounts, error } = await supabase.from('accounts').select('id, account_name, account_number_masked').eq('line_user_id', lineUserId);
  if (error) throw error;
  const row = buildRow(ex, accounts);
  let category = null;
  if (row.type !== 'transfer') {
    try {
      category = await pickCategory(lineUserId, row.type, row.description);
    } catch (err) {
      console.error(`[slips] category lookup failed: ${err.constructor.name}`);
    }
  }
  const dup = await possibleDuplicate(lineUserId, row);
  return {
    status: 'new',
    row: {
      slip_key: key,
      ...row,
      category_id: category ? category.category.id : null,
      category_via: category ? category.via : null,
      possible_duplicate: dup,
      image_key: imageKey !== key ? imageKey : null,
    },
  };
}

function validateRow(r) {
  if (!r || typeof r !== 'object') return 'row must be an object';
  if (!SLIP_KEY.test(String(r.slip_key || ''))) return 'slip_key is invalid';
  if (!['expense', 'income', 'transfer'].includes(r.type)) return 'type must be expense, income or transfer';
  const amount = Number(r.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) return 'amount must be positive';
  if (!r.transaction_date || Number.isNaN(new Date(r.transaction_date).getTime())) return 'transaction_date is invalid';
  if (r.type !== 'transfer' && !r.category_id) return 'category_id is required';
  if (r.description != null && String(r.description).length > 200) return 'description is too long';
  return null;
}

// rows: [{ slip_key, type, amount, transaction_date, description, category_id, from_account_id, to_account_id }]
// -> { imported: [{ id, amount, type, from_account_id, to_account_id }], skipped, errors, budget_alerts, event_budget_alerts }
async function importSlips(lineUserId, rows) {
  if (!Array.isArray(rows) || !rows.length) { const e = new Error('rows is required'); e.status = 400; throw e; }
  if (rows.length > MAX_ROWS) { const e = new Error(`At most ${MAX_ROWS} slips at a time`); e.status = 400; throw e; }
  for (const [i, r] of rows.entries()) {
    const err = validateRow(r);
    if (err) { const e = new Error(`Row ${i + 1}: ${err}`); e.status = 400; throw e; }
  }
  const imported = [];
  const results = [];
  const errors = [];
  let skipped = 0;
  for (const r of rows) { // in order: balances are read-modify-write
    try {
      const t = await createTransaction({
        lineUserId,
        type: r.type,
        amount: Number(r.amount),
        categoryId: r.type === 'transfer' ? null : r.category_id,
        description: r.description ? String(r.description).trim() : null,
        slipHash: r.slip_key,
        transactionDate: new Date(r.transaction_date).toISOString(),
        fromAccountId: r.type === 'income' ? null : r.from_account_id || null,
        toAccountId: r.type === 'expense' ? null : r.to_account_id || null,
        channel: 'liff', // alerts come back here, combined below: never one push per slip
      });
      imported.push({ id: t.id, amount: Number(t.amount), type: t.type, from_account_id: t.from_account_id, to_account_id: t.to_account_id });
      results.push(t);
    } catch (error) {
      if (error instanceof DuplicateSlipError) skipped += 1;
      else if (error instanceof InvalidCategoryError || error instanceof InvalidAccountError) errors.push(error.message);
      else throw error;
    }
  }
  return { imported, skipped, errors, ...combineAlerts(results) };
}

// rows: the `imported` list from importSlips. Deletes only this user's slip
// rows that still match it (an edited amount, type or account stays), and
// reverses their balance changes.
async function undoSlips(lineUserId, rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > MAX_ROWS) { const e = new Error('rows is required (at most 50)'); e.status = 400; throw e; }
  const want = new Map(rows.filter((r) => r && typeof r.id === 'string').map((r) => [r.id, r]));
  const { data, error } = await supabase.from('transactions').select('id, amount, type, slip_hash, from_account_id, to_account_id')
    .eq('line_user_id', lineUserId).in('id', [...want.keys()]);
  if (error) throw error;
  const same = (a, b) => (a || null) === (b || null);
  const doomed = data.filter((t) => {
    const w = want.get(t.id);
    return /^slip(qr)?:/.test(t.slip_hash || '') && Number(t.amount) === Number(w.amount) && t.type === w.type && same(t.from_account_id, w.from_account_id) && same(t.to_account_id, w.to_account_id);
  });
  if (!doomed.length) return { removed: 0, kept: want.size };
  const { error: delError } = await supabase.from('transactions').delete().eq('line_user_id', lineUserId).in('id', doomed.map((t) => t.id));
  if (delError) throw delError;
  for (const t of doomed) {
    const amount = Number(t.amount);
    try {
      if (t.type === 'transfer') {
        await adjustAccountBalance(t.from_account_id, amount);
        await adjustAccountBalance(t.to_account_id, -amount);
      } else if (t.type === 'expense' && t.from_account_id) await adjustAccountBalance(t.from_account_id, amount);
      else if (t.type === 'income' && t.to_account_id) await adjustAccountBalance(t.to_account_id, -amount);
    } catch (err) {
      console.error(`[slips] undo balance failed for ${t.id}: ${err.message}`);
    }
  }
  return { removed: doomed.length, kept: want.size - doomed.length };
}

module.exports = { readSlip, importSlips, undoSlips, buildRow, matchAccount, slipDate, combineAlerts, validateRow, MAX_ROWS };
