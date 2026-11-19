// Own-account transfers across statements.
//
// A move between two of the user's banks shows up on both statements: as a
// withdrawal on one and a deposit on the other, usually the same day (at most
// a day apart). Statement rows the user imports as a Transfer are stored as a
// type 'transfer' transaction (never income or spending), described by the
// statement accounts on each side:
//     "Bangkok Bank •••1111 → another account"        (one side known)
//     "Bangkok Bank •••1111 → KBank •••2222"          (merged: both sides)
// When the other bank's statement is imported later, its side of the same
// move (same amount, opposite direction, within a day) is merged into that
// one transaction instead of being recorded twice. The description is what
// records which statements a transfer has already been seen on, so no extra
// table is needed.
const supabase = require('../config/supabase');
const { getBangkokYmd } = require('./bangkokDay');

const BANK_LABEL = { kbank: 'KBank', bbl: 'Bangkok Bank' };
const UNKNOWN = 'another account';
const ARROW = ' → ';
const DAY_MS = 24 * 60 * 60 * 1000;

const sideLabel = (bank, last4) => `${BANK_LABEL[bank] || 'Bank'} •••${last4 || '----'}`;
const directionOf = (type) => (type === 'expense' ? 'out' : 'in');

function describeTransfer(from, to) {
  return `${from || UNKNOWN}${ARROW}${to || UNKNOWN}`;
}

function parseTransfer(description) {
  const parts = String(description || '').split(ARROW);
  if (parts.length !== 2) return { from: null, to: null };
  const side = (s) => (s.trim() === UNKNOWN ? null : s.trim());
  return { from: side(parts[0]), to: side(parts[1]) };
}

const dayDiff = (a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS;

// Statement-imported transfers from a day before the first row to a day
// after the last.
async function fetchTransferPool(lineUserId, dates) {
  if (!dates.length) return [];
  const sorted = [...dates].sort();
  const from = new Date(Date.parse(`${sorted[0]}T00:00:00+07:00`) - DAY_MS).toISOString();
  const to = new Date(Date.parse(`${sorted[sorted.length - 1]}T23:59:59+07:00`) + DAY_MS).toISOString();
  const { data, error } = await supabase
    .from('transactions')
    .select('id, transaction_date, amount, description, slip_hash, from_account_id, to_account_id')
    .eq('line_user_id', lineUserId)
    .eq('type', 'transfer')
    .like('slip_hash', 'stmt:%')
    .gte('transaction_date', from)
    .lte('transaction_date', to)
    .limit(5000);
  if (error) throw error;
  return data.map((t) => ({ ...t, ymd: getBangkokYmd(new Date(t.transaction_date)), cents: Math.round(Number(t.amount) * 100), ...parseTransfer(t.description) }));
}

// row: { date, amount_cents, type }; myLabel: this statement's side label.
// -> { kind: 'recorded' | 'merge', transfer } or null. Matched transfers are
// marked used so one move pairs with one row.
function matchTransfer(pool, row, myLabel) {
  const dir = directionOf(row.type);
  const candidates = pool.filter((t) => !t.used && t.cents === row.amount_cents && dayDiff(t.ymd, row.date) <= 1);
  const mineSide = (t) => (dir === 'out' ? t.from : t.to);
  const otherSide = (t) => (dir === 'out' ? t.to : t.from);
  const recorded = candidates.find((t) => mineSide(t) === myLabel);
  if (recorded) { recorded.used = true; return { kind: 'recorded', transfer: recorded }; }
  // Our side still unknown, and the known side is a different account.
  const merge = candidates
    .filter((t) => mineSide(t) === null && otherSide(t) && otherSide(t) !== myLabel)
    .sort((a, b) => dayDiff(a.ymd, row.date) - dayDiff(b.ymd, row.date))[0];
  if (merge) { merge.used = true; return { kind: 'merge', transfer: merge }; }
  return null;
}

// Fills in our side of a matched transfer (and our account, when linked).
async function mergeTransfer(transfer, row, myLabel, accountId) {
  const dir = directionOf(row.type);
  const description = dir === 'out' ? describeTransfer(myLabel, transfer.to) : describeTransfer(transfer.from, myLabel);
  const update = { description };
  if (accountId) update[dir === 'out' ? 'from_account_id' : 'to_account_id'] = accountId;
  const { error } = await supabase.from('transactions').update(update).eq('id', transfer.id);
  if (error) throw error;
}

module.exports = { BANK_LABEL, sideLabel, directionOf, describeTransfer, parseTransfer, fetchTransferPool, matchTransfer, mergeTransfer, UNKNOWN };
