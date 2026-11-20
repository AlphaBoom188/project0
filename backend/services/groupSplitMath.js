// Pure helpers for LINE group bills: message parsing and equal splits.
// No DB, no LINE. Bill status math is in services/groupBillMath.js.
const { toCents, fromCents, distributeCents } = require('./billSplit');

// ---- Message parsing ----
//
// A group chat is mostly normal conversation, so the bot only acts on:
// - exact command words (below), or
// - an expense: a message starting with "+" ("+ข้าว 600", "+600 taxi"), or
//   one that @mentions the bot ("@Bot ข้าว 600").
// Anything else is ignored silently: "see you at 7" never becomes an expense.
const COMMANDS = {
  remind: ['remind', 'bills', 'balance', 'balances', 'summary', 'ทวง', 'ทวงเงิน', 'บิล', 'ยอด', 'ยอดค้าง', 'สรุป'],
  reminders: ['reminders', 'รายการเตือน', 'เตือนอะไรบ้าง'],
  leaderboard: ['rank', 'ranking', 'leaderboard', 'อันดับ', 'ตารางคะแนน'],
  paid: ['paid', 'settle', 'จ่ายแล้ว', 'เคลียร์', 'คืนเงิน'],
  undo: ['undo', 'cancel', 'ยกเลิก'],
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
    if (words.includes(first) && plain.split(' ').length === 1) {
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

module.exports = { parseGroupMessage, stripMentions, equalShares, COMMANDS };
