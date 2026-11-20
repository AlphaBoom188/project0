// CSV import of transactions exported from other apps (Money Lover, Wallet
// by BudgetBakers, Spendee, bank exports, spreadsheets). Pure: parse the
// text, guess which columns hold what, and turn rows into transactions the
// user reviews before importing (csvImportController).
//
// Handles: comma / semicolon / tab delimiters, quoted fields, a UTF-8 BOM,
// amounts like "1,234.50", "-120", "(120)", "฿1,200", dates as YYYY-MM-DD,
// DD/MM/YYYY (or MM/DD/YYYY when the file says so), and Buddhist-era years.

const crypto = require('crypto');

function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/)[0] || '';
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let q = false;
  for (const ch of firstLine) { if (ch === '"') q = !q; else if (!q && ch in counts) counts[ch] += 1; }
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const delimiter = n > 0 ? best : ',';
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i += 1; } else if (ch === '"') quoted = false; else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(field); field = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  const headers = (rows.shift() || []).map((h) => h.trim());
  return { delimiter, headers, rows: rows.map((r) => r.map((c) => c.trim())) };
}

const H = {
  date: /^(date|day|วันที่|transaction date|txn date|time|datetime)$/i,
  amount: /^(amount|value|จำนวน|จำนวนเงิน|ยอด|ยอดเงิน|sum|price|thb)$/i,
  income: /^(income|in|credit|deposit|รายรับ|ฝาก|เงินเข้า)$/i,
  expense: /^(expense|expenses|out|debit|withdrawal|รายจ่าย|ถอน|เงินออก|spent)$/i,
  type: /^(type|kind|ประเภท|transaction type|in\/out)$/i,
  category: /^(category|categories|หมวด|หมวดหมู่|category name)$/i,
  description: /^(note|notes|description|memo|details|รายละเอียด|บันทึก|หมายเหตุ|payee|merchant|title|name)$/i,
};

// -> { date, amount, income, expense, type, category, description: column index | null, dateOrder: 'dmy'|'mdy'|'ymd' }
function guessMapping(headers, rows) {
  const find = (re) => { const i = headers.findIndex((h) => re.test(h)); return i >= 0 ? i : null; };
  const m = { date: find(H.date), amount: find(H.amount), income: find(H.income), expense: find(H.expense), type: find(H.type), category: find(H.category), description: find(H.description) };
  if (m.amount === null && m.income === null && m.expense === null) {
    // No named amount column: the first mostly-numeric column.
    const i = headers.findIndex((_, c) => rows.slice(0, 20).filter((r) => parseAmount(r[c]) !== null).length >= Math.min(3, rows.length));
    if (i >= 0 && i !== m.date) m.amount = i;
  }
  m.dateOrder = guessDateOrder(rows.slice(0, 50).map((r) => (m.date !== null ? r[m.date] : '')));
  return m;
}

function guessDateOrder(samples) {
  let dmy = false;
  let mdy = false;
  for (const s of samples) {
    const p = /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(String(s || '').trim());
    if (!p || p[1].length === 4) continue;
    if (Number(p[1]) > 12) dmy = true;
    if (Number(p[2]) > 12) mdy = true;
  }
  if (samples.some((s) => /^\d{4}[/.-]/.test(String(s || '').trim()))) return 'ymd';
  return mdy && !dmy ? 'mdy' : 'dmy'; // Thailand writes day first
}

function parseAmount(v) {
  if (v === undefined || v === null) return null;
  let s = String(v).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[฿$€£\s]|thb|baht|บาท/gi, '');
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); } else if (s.startsWith('+')) s = s.slice(1);
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,50
  else s = s.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return neg ? -n : n;
}

function parseDate(v, order) {
  const s = String(v || '').trim();
  let y; let m; let d;
  let p = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/.exec(s);
  if (p) [, y, m, d] = p.map(Number);
  else {
    p = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s);
    if (!p) return null;
    const [a, b, c] = [Number(p[1]), Number(p[2]), Number(p[3])];
    [d, m] = order === 'mdy' ? [b, a] : [a, b];
    y = c < 100 ? 2000 + c : c;
  }
  if (y > 2400) y -= 543; // Buddhist era
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return dt.toISOString().slice(0, 10);
}

const INCOME_WORDS = /^(income|in|credit|deposit|รายรับ|รับ|เงินเข้า|incomes)$/i;
const EXPENSE_WORDS = /^(expense|expenses|out|debit|withdrawal|รายจ่าย|จ่าย|เงินออก)$/i;
const TRANSFER_WORDS = /^(transfer|โอน|โอนเงิน)$/i;

// -> [{ line, date, amount, type, category, description, error? }]
function normalizeRows(rows, m, { today } = {}) {
  return rows.map((r, i) => {
    const out = { line: i + 2, date: null, amount: null, type: null, category: m.category !== null ? r[m.category] || null : null, description: m.description !== null ? (r[m.description] || '').slice(0, 200) || null : null };
    out.date = m.date !== null ? parseDate(r[m.date], m.dateOrder) : null;
    if (!out.date) return { ...out, error: 'Unreadable date' };
    if (today && out.date > today) return { ...out, error: 'Date is in the future' };
    let amount = null;
    let type = null;
    if (m.income !== null || m.expense !== null) {
      const inc = m.income !== null ? parseAmount(r[m.income]) : null;
      const exp = m.expense !== null ? parseAmount(r[m.expense]) : null;
      if (inc) { amount = Math.abs(inc); type = 'income'; } else if (exp) { amount = Math.abs(exp); type = 'expense'; }
    } else if (m.amount !== null) {
      const a = parseAmount(r[m.amount]);
      if (a !== null) { amount = Math.abs(a); type = a < 0 ? 'expense' : null; }
    }
    if (m.type !== null) {
      const t = String(r[m.type] || '').trim();
      if (TRANSFER_WORDS.test(t)) return { ...out, error: 'Transfers are skipped' };
      if (INCOME_WORDS.test(t)) type = 'income';
      else if (EXPENSE_WORDS.test(t)) type = 'expense';
    }
    if (type === null && amount !== null) type = m.type === null && m.amount !== null && m.signed === 'positive-expense' ? 'expense' : 'income';
    if (!(amount > 0)) return { ...out, error: 'No amount' };
    if (amount >= 1e9) return { ...out, error: 'Amount too large' };
    return { ...out, amount: Math.round(amount * 100) / 100, type };
  });
}

// Files where every amount is positive and there's no type column: those are
// almost always expense lists. -> 'positive-expense' | 'signed'
function guessSign(rows, m) {
  if (m.amount === null || m.type !== null || m.income !== null || m.expense !== null) return 'signed';
  const vals = rows.slice(0, 200).map((r) => parseAmount(r[m.amount])).filter((v) => v !== null);
  return vals.length && vals.every((v) => v >= 0) ? 'positive-expense' : 'signed';
}

// Stable per user and row; repeats of the same row in one file are numbered,
// so two identical coffees on one day both import, and re-importing the same
// file adds nothing (transactions.slip_hash is UNIQUE).
function rowHashes(lineUserId, rows) {
  const seen = new Map();
  return rows.map((r) => {
    const base = `${lineUserId}|${r.date}|${r.amount}|${r.type}|${(r.description || '').toLowerCase()}|${(r.category || '').toLowerCase()}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return `csv:${crypto.createHash('sha1').update(`${base}|${n}`).digest('hex').slice(0, 24)}`;
  });
}

module.exports = { parseCsv, guessMapping, guessSign, normalizeRows, parseAmount, parseDate, rowHashes };
