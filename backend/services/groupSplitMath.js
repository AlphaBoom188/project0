// Pure helpers for the LINE group split tracker: message parsing, equal
// splits, balances and "who pays whom". No DB, no LINE.
const { toCents, fromCents, distributeCents } = require('./billSplit');

// ---- Message parsing ----
//
// A group chat is mostly normal conversation, so the bot only acts on:
// - exact command words (below), or
// - an expense: a message starting with "+" ("+ข้าว 600", "+600 taxi"), or
//   one that @mentions the bot ("@Bot ข้าว 600").
// Anything else is ignored silently: "see you at 7" never becomes an expense.
const COMMANDS = {
  balance: ['balance', 'balances', 'ยอด', 'ยอดค้าง', 'สรุป', 'summary'],
  settle: ['settle', 'เคลียร์', 'จ่ายแล้ว', 'คืนเงิน'],
  undo: ['undo', 'ยกเลิก'],
  members: ['members', 'สมาชิก'],
  join: ['join', 'เข้าร่วม'],
  help: ['help', 'ช่วยด้วย', 'วิธีใช้'],
};

const RE_AMOUNT = /(?:฿\s*)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(?:บาท|฿|thb|baht)?/i;

// Removes the @mention spans LINE reports (index/length into the text).
function stripMentions(text, mentionees = []) {
  let out = text;
  [...mentionees].sort((a, b) => b.index - a.index).forEach((m) => {
    out = out.slice(0, m.index) + ' ' + out.slice(m.index + m.length);
  });
  return out.replace(/\s+/g, ' ').trim();
}

// -> { kind: 'command', command, rest } | { kind: 'expense', amount, description }
//    | { kind: 'invalid', reason } | null (ignore)
function parseGroupMessage(text, mentionees = []) {
  const raw = String(text || '').trim();
  const mentionsBot = mentionees.some((m) => m.isSelf);
  const plain = stripMentions(raw, mentionees);
  const first = plain.split(' ')[0].toLowerCase();

  for (const [command, words] of Object.entries(COMMANDS)) {
    if (words.includes(first) && (command === 'settle' || plain.split(' ').length === 1)) {
      return { kind: 'command', command, rest: plain.slice(first.length).trim() };
    }
  }

  const plus = plain.startsWith('+');
  if (!plus && !mentionsBot) return null;
  const body = plus ? plain.slice(1).trim() : plain;
  if (!body) return mentionsBot ? { kind: 'command', command: 'help', rest: '' } : null;

  const m = body.match(RE_AMOUNT);
  if (!m) return { kind: 'invalid', reason: 'no_amount' };
  const amount = Number(`${m[1].replace(/,/g, '')}.${m[2] || '0'}`);
  if (!(amount > 0) || amount >= 1e9) return { kind: 'invalid', reason: 'bad_amount' };
  const description = (body.slice(0, m.index) + ' ' + body.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
  return { kind: 'expense', amount: Math.round(amount * 100) / 100, description: description || null };
}

// "settle @Ann 150" -> { amount: 150 } ; "settle @Ann" -> { amount: null }
function parseSettleAmount(rest) {
  const m = String(rest || '').match(RE_AMOUNT);
  if (!m) return { amount: null };
  return { amount: Math.round(Number(`${m[1].replace(/,/g, '')}.${m[2] || '0'}`) * 100) / 100 };
}

// ---- Splitting ----

// Equal split in cents; the remainder goes one cent at a time to members
// other than the payer first, so the payer never ends up "owed" an extra cent
// they didn't pay for. -> [{ line_user_id, share }]
function equalShares(amount, memberIds, payerId) {
  const ids = [...new Set(memberIds)];
  const ordered = [...ids.filter((id) => id !== payerId), ...ids.filter((id) => id === payerId)];
  const parts = distributeCents(toCents(amount), ordered.length);
  return ordered.map((id, i) => ({ line_user_id: id, share: fromCents(parts[i]) }));
}

// ---- Balances ----

// entries: [{ kind, payer_line_user_id, amount, shares: [{ line_user_id, share }] }]
// -> Map(line_user_id -> net cents): positive = is owed, negative = owes.
function netBalances(entries) {
  const net = new Map();
  const add = (id, cents) => net.set(id, (net.get(id) || 0) + cents);
  for (const e of entries) {
    add(e.payer_line_user_id, toCents(e.amount));
    for (const s of e.shares) add(s.line_user_id, -toCents(s.share));
  }
  return net;
}

// Greedy "who pays whom": largest debtor pays largest creditor until even.
// At most n-1 payments. -> [{ from, to, amount }]
function simplifyDebts(net) {
  const debtors = [];
  const creditors = [];
  for (const [id, cents] of net) {
    if (cents < 0) debtors.push({ id, cents: -cents });
    else if (cents > 0) creditors.push({ id, cents });
  }
  const byAmount = (a, b) => b.cents - a.cents || (a.id < b.id ? -1 : 1);
  const payments = [];
  while (debtors.length && creditors.length) {
    debtors.sort(byAmount);
    creditors.sort(byAmount);
    const d = debtors[0];
    const c = creditors[0];
    const pay = Math.min(d.cents, c.cents);
    payments.push({ from: d.id, to: c.id, amount: fromCents(pay) });
    d.cents -= pay;
    c.cents -= pay;
    if (!d.cents) debtors.shift();
    if (!c.cents) creditors.shift();
  }
  return payments;
}

module.exports = { parseGroupMessage, parseSettleAmount, stripMentions, equalShares, netBalances, simplifyDebts, COMMANDS };
