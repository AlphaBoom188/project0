// CSV import (services/csvImport.js): preview (writes nothing) and import.
// Rows become ordinary transactions (date at 12:00Z = 19:00 Bangkok, like the
// form), with slip_hash 'csv:<hash>' so re-importing a file adds nothing.
// Imports never adjust account balances or send budget alerts (history).
const supabase = require('../config/supabase');
const csv = require('../services/csvImport');
const { getBangkokYmd } = require('../services/bangkokDay');

const MAX_CSV = 5 * 1024 * 1024;
const MAX_ROWS = 10000;
const bad = (res, error) => res.status(400).json({ error });

function pipeline(body) {
  if (typeof body.csv !== 'string' || !body.csv.trim()) return { error: 'Choose a CSV file' };
  if (body.csv.length > MAX_CSV) return { error: 'The file is over 5 MB. Split it and import the parts.' };
  const parsed = csv.parseCsv(body.csv);
  if (!parsed.headers.length || !parsed.rows.length) return { error: 'The file has no rows under a header line' };
  if (parsed.rows.length > MAX_ROWS) return { error: `Up to ${MAX_ROWS.toLocaleString('en-US')} rows at a time` };
  const guessed = csv.guessMapping(parsed.headers, parsed.rows);
  const override = body.mapping && typeof body.mapping === 'object' ? body.mapping : {};
  const mapping = { ...guessed };
  for (const k of ['date', 'amount', 'income', 'expense', 'type', 'category', 'description']) {
    if (override[k] === null) mapping[k] = null;
    else if (Number.isInteger(override[k]) && override[k] >= 0 && override[k] < parsed.headers.length) mapping[k] = override[k];
  }
  if (['dmy', 'mdy', 'ymd'].includes(override.dateOrder)) mapping.dateOrder = override.dateOrder;
  mapping.signed = ['signed', 'positive-expense', 'positive-income'].includes(override.signed) ? override.signed : csv.guessSign(parsed.rows, mapping);
  if (mapping.date === null) return { error: 'Choose the date column', parsed, mapping };
  if (mapping.amount === null && mapping.income === null && mapping.expense === null) return { error: 'Choose the amount column', parsed, mapping };
  let rows = csv.normalizeRows(parsed.rows, mapping, { today: getBangkokYmd() });
  if (mapping.signed === 'positive-income') rows = rows.map((r) => (r.error || mapping.type !== null ? r : { ...r, type: 'income' }));
  return { parsed, mapping, rows };
}

async function existingHashes(hashes) {
  const found = new Set();
  for (let i = 0; i < hashes.length; i += 200) {
    const { data, error } = await supabase.from('transactions').select('slip_hash').in('slip_hash', hashes.slice(i, i + 200));
    if (error) throw error;
    data.forEach((t) => found.add(t.slip_hash));
  }
  return found;
}

async function categoryPlan(lineUserId, rows) {
  const { data: cats, error } = await supabase.from('categories').select('id, name, type').eq('line_user_id', lineUserId);
  if (error) throw error;
  const key = (type, name) => `${type}|${String(name || '').trim().toLowerCase()}`;
  const byKey = new Map(cats.map((c) => [key(c.type, c.name), c]));
  const fallback = { expense: cats.find((c) => c.type === 'expense' && c.name === 'Others') || cats.find((c) => c.type === 'expense'), income: cats.find((c) => c.type === 'income') };
  const groups = new Map();
  rows.filter((r) => !r.error && r.category).forEach((r) => {
    const k = key(r.type, r.category);
    const g = groups.get(k) || { name: r.category.trim(), type: r.type, count: 0, matched: byKey.get(k) || null };
    g.count += 1;
    groups.set(k, g);
  });
  return { byKey, key, fallback, groups: [...groups.values()] };
}

const handle = (name, fn) => async (req, res) => {
  try { await fn(req, res); } catch (error) {
    console.error(`Error in ${name}:`, error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  // POST /api/transactions/:u/import-csv/preview { csv, mapping? } -> what would be imported (writes nothing)
  preview: handle('csvPreview', async (req, res) => {
    const p = pipeline(req.body || {});
    if (p.error && !p.parsed) return bad(res, p.error);
    const base = { headers: p.parsed.headers, mapping: p.mapping, delimiter: p.parsed.delimiter, sample: p.parsed.rows.slice(0, 3) };
    if (p.error) return res.json({ ...base, problem: p.error });
    const valid = p.rows.filter((r) => !r.error);
    const hashes = csv.rowHashes(req.params.line_user_id, valid);
    const dup = await existingHashes(hashes);
    const plan = await categoryPlan(req.params.line_user_id, valid);
    const duplicates = hashes.filter((h) => dup.has(h)).length;
    res.json({
      ...base,
      total: p.rows.length,
      valid: valid.length,
      duplicates,
      toImport: valid.length - duplicates,
      income: valid.filter((r) => r.type === 'income').length,
      expense: valid.filter((r) => r.type === 'expense').length,
      errors: p.rows.filter((r) => r.error).slice(0, 10).map((r) => ({ line: r.line, error: r.error })),
      errorCount: p.rows.filter((r) => r.error).length,
      categories: plan.groups.map((g) => ({ name: g.name, type: g.type, count: g.count, matched: g.matched ? g.matched.name : null })),
      preview: p.rows.slice(0, 20),
    });
  }),

  // POST /api/transactions/:u/import-csv { csv, mapping?, createCategories? } -> { imported, duplicates, skipped, createdCategories }
  import: handle('csvImport', async (req, res) => {
    const u = req.params.line_user_id;
    const p = pipeline(req.body || {});
    if (p.error) return bad(res, p.error);
    const valid = p.rows.filter((r) => !r.error);
    const hashes = csv.rowHashes(u, valid);
    const dup = await existingHashes(hashes);
    const plan = await categoryPlan(u, valid);
    const created = [];
    if (req.body.createCategories) {
      for (const g of plan.groups.filter((x) => !x.matched)) {
        const { data, error } = await supabase.from('categories').insert({ line_user_id: u, name: g.name.slice(0, 50), type: g.type }).select('id, name, type').single();
        if (error) throw error;
        plan.byKey.set(plan.key(data.type, data.name), data);
        created.push(data.name);
      }
    }
    const inserts = [];
    valid.forEach((r, i) => {
      if (dup.has(hashes[i])) return;
      const cat = (r.category && plan.byKey.get(plan.key(r.type, r.category))) || plan.fallback[r.type];
      if (!cat) return;
      inserts.push({
        line_user_id: u, category_id: cat.id, amount: r.amount, type: r.type,
        description: r.description || (r.category && !plan.byKey.get(plan.key(r.type, r.category)) ? r.category : null),
        transaction_date: `${r.date}T12:00:00Z`, slip_hash: hashes[i],
      });
    });
    for (let i = 0; i < inserts.length; i += 500) {
      const { error } = await supabase.from('transactions').insert(inserts.slice(i, i + 500));
      if (error) throw error;
    }
    res.json({ success: true, imported: inserts.length, duplicates: valid.length - inserts.length, skipped: p.rows.length - valid.length, createdCategories: created });
  }),
};
