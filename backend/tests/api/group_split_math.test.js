// Pure: services/groupSplitMath.js -- group message parsing and equal splits.
const { BACKEND } = require('../lib');
const { parseGroupMessage, stripMentions, equalShares } = require(`${BACKEND}/services/groupSplitMath.js`);

let failures = 0;
function assert(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) failures += 1;
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- Ordinary chat is ignored ---
for (const text of ['see you at 7', 'ข้าว 600', 'lol 555', 'balance please', 'I will settle later maybe', '']) {
  assert(parseGroupMessage(text) === null, `ignored: "${text}"`);
}

// --- Expenses (each becomes a bill) ---
assert(eq(parseGroupMessage('+ข้าว 600'), { kind: 'expense', amount: 600, description: 'ข้าว' }), '"+ข้าว 600"');
assert(eq(parseGroupMessage('+600 taxi'), { kind: 'expense', amount: 600, description: 'taxi' }), '"+600 taxi" (amount first)');
assert(eq(parseGroupMessage('+ ค่าที่พัก 1,250.50 บาท'), { kind: 'expense', amount: 1250.5, description: 'ค่าที่พัก' }), 'thousands separator, decimals and "บาท"');
assert(eq(parseGroupMessage('+฿99'), { kind: 'expense', amount: 99, description: null }), 'amount only, with ฿');
const botMention = [{ index: 0, length: 4, type: 'user', isSelf: true }];
assert(eq(parseGroupMessage('@Bot dinner 900', botMention), { kind: 'expense', amount: 900, description: 'dinner' }), '@mentioning the bot works like "+"');
const people = [{ index: 10, length: 4, type: 'user', userId: 'Ua' }, { index: 15, length: 3, type: 'user', userId: 'Ub' }];
assert(eq(parseGroupMessage('+taxi 300 @Ann @Bo', people), { kind: 'expense', amount: 300, description: 'taxi' }), 'people @mentions are stripped from the description');
assert(eq(parseGroupMessage('+dinner'), { kind: 'invalid', reason: 'no_amount' }), '"+" without an amount -> invalid');
assert(eq(parseGroupMessage('+0'), { kind: 'invalid', reason: 'bad_amount' }), 'zero amount -> invalid');
assert(eq(parseGroupMessage('@Bot', botMention), { kind: 'command', command: 'help', rest: '' }), 'just @Bot -> help');

// --- Commands: exact words only ---
for (const w of ['bills', 'remind', 'ทวงเงิน', 'ยอด', 'สรุป', 'balance']) assert(parseGroupMessage(w).command === 'remind', `"${w}" -> reminder digest`);
for (const w of ['rank', 'leaderboard', 'อันดับ', 'ตารางคะแนน']) assert(parseGroupMessage(w).command === 'leaderboard', `"${w}" -> fastest payers`);
for (const w of ['paid', 'settle', 'จ่ายแล้ว']) assert(parseGroupMessage(w).command === 'paid', `"${w}" -> how to pay`);
assert(parseGroupMessage('UNDO').command === 'undo' && parseGroupMessage('ยกเลิก').command === 'undo' && parseGroupMessage('cancel').command === 'undo', 'undo / ยกเลิก / cancel');
assert(parseGroupMessage('members').command === 'members' && parseGroupMessage('join').command === 'join' && parseGroupMessage('help').command === 'help', 'members / join / help');
assert(parseGroupMessage('undo that please') === null && parseGroupMessage('settle @Ann 150', [{ index: 7, length: 4, type: 'user', userId: 'Ua' }]) === null, 'a command word followed by more words is ignored');
assert(stripMentions('hi @Ann there', [{ index: 3, length: 4 }]) === 'hi there', 'stripMentions');

// --- Equal shares ---
const s3 = equalShares(100, ['P', 'A', 'B'], 'P');
assert(s3.reduce((n, s) => n + Math.round(s.share * 100), 0) === 10000, '100 split 3 ways sums to exactly 100.00');
assert(s3.find((s) => s.line_user_id === 'P').share === 33.33 && s3.filter((s) => s.share === 33.34).length === 1, 'the spare cent goes to someone other than the payer');
assert(equalShares(600, ['P', 'A', 'A', 'P'], 'P').length === 2, 'duplicate member ids are merged');
assert(eq(equalShares(50, ['P'], 'P'), [{ line_user_id: 'P', share: 50 }]), 'one member -> the payer\'s whole share');

process.exit(failures ? 1 : 0);
