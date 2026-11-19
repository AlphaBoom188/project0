// Pure helpers for per-bill group collection (migration 019). No DB, no LINE.
//
// A bill: { id, payer_line_user_id (the owner), amount, description, status,
//           created_at, shares: [{ line_user_id, share, paid_at, slip_status }] }
// The owner's own share is paid at creation; every other share is paid once
// the owner confirms the payer's slip (or marks it paid).
const { toCents, fromCents } = require('./billSplit');

const owesOn = (bill) => bill.shares.filter((s) => s.line_user_id !== bill.payer_line_user_id && Number(s.share) > 0);
const unpaidShares = (bill) => owesOn(bill).filter((s) => !s.paid_at);
const isFullyPaid = (bill) => unpaidShares(bill).length === 0;

// Order members paid in (owner excluded): 1 = paid first. -> Map(id -> position)
function paidPositions(bill) {
  const paid = owesOn(bill).filter((s) => s.paid_at)
    .sort((a, b) => String(a.paid_at).localeCompare(String(b.paid_at)) || (a.line_user_id < b.line_user_id ? -1 : 1));
  return new Map(paid.map((s, i) => [s.line_user_id, i + 1]));
}

// "Don't forget to pay": what each member still owes across open bills.
// -> { openBills, rows: [{ line_user_id, owed, bills }] } (largest first)
function reminderDigest(bills) {
  const open = bills.filter((b) => b.status === 'open' && unpaidShares(b).length);
  const byMember = new Map();
  for (const bill of open) {
    for (const s of unpaidShares(bill)) {
      const row = byMember.get(s.line_user_id) || { line_user_id: s.line_user_id, cents: 0, bills: 0 };
      row.cents += toCents(s.share);
      row.bills += 1;
      byMember.set(s.line_user_id, row);
    }
  }
  const rows = [...byMember.values()]
    .sort((a, b) => b.cents - a.cents || (a.line_user_id < b.line_user_id ? -1 : 1))
    .map((r) => ({ line_user_id: r.line_user_id, owed: fromCents(r.cents), bills: r.bills }));
  return { openBills: open.length, rows };
}

// Fastest payers: per bill, who paid 1st / 2nd / 3rd (by paid_at), counted
// over bills whose payments fall in [from, to). Plus the "top host": who
// created the most bills (not cancelled) in the window.
// -> { rows: [{ line_user_id, first, second, third }], topHost: { line_user_id, bills } | null }
function leaderboard(bills, from, to) {
  const inWindow = (iso) => iso && iso >= from && iso < to;
  const counts = new Map();
  for (const bill of bills) {
    if (bill.status === 'cancelled') continue;
    for (const [id, pos] of paidPositions(bill)) {
      if (pos > 3) continue;
      const share = bill.shares.find((s) => s.line_user_id === id);
      if (!inWindow(new Date(share.paid_at).toISOString())) continue;
      const row = counts.get(id) || { line_user_id: id, first: 0, second: 0, third: 0 };
      row[['first', 'second', 'third'][pos - 1]] += 1;
      counts.set(id, row);
    }
  }
  const rows = [...counts.values()].sort((a, b) =>
    b.first - a.first || b.second - a.second || b.third - a.third || (a.line_user_id < b.line_user_id ? -1 : 1));

  const hosts = new Map();
  for (const bill of bills) {
    if (bill.status === 'cancelled' || !inWindow(new Date(bill.created_at).toISOString())) continue;
    hosts.set(bill.payer_line_user_id, (hosts.get(bill.payer_line_user_id) || 0) + 1);
  }
  const top = [...hosts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
  return { rows, topHost: top ? { line_user_id: top[0], bills: top[1] } : null };
}

// What one member's view of a bill is. -> 'owner' | 'paid' | 'slip_pending' | 'unpaid' | 'none'
function memberStatus(bill, id) {
  if (bill.payer_line_user_id === id) return 'owner';
  const s = bill.shares.find((x) => x.line_user_id === id);
  if (!s || Number(s.share) <= 0) return 'none';
  if (s.paid_at) return 'paid';
  return s.slip_status === 'pending' ? 'slip_pending' : 'unpaid';
}

const unpaidTotal = (bill) => fromCents(unpaidShares(bill).reduce((sum, s) => sum + toCents(s.share), 0));

module.exports = { owesOn, unpaidShares, isFullyPaid, paidPositions, reminderDigest, leaderboard, memberStatus, unpaidTotal };
