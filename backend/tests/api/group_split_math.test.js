// Pure: services/groupSplitMath.js -- group message parsing, equal splits,
// balances and debt simplification.
const { BACKEND } = require('../lib');
const { parseGroupMessage, parseSettleAmount, stripMentions, equalShares, netBalances, simplifyDebts } = require(`${BACKEND}/services/groupSplitMath.js`);

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

// --- Expenses ---
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
assert(parseGroupMessage('balance').command === 'balance' && parseGroupMessage('ยอด').command === 'balance' && parseGroupMessage('สรุป').command === 'balance', 'balance / ยอด / สรุป');
assert(parseGroupMessage('UNDO').command === 'undo' && parseGroupMessage('ยกเลิก').command === 'undo', 'undo (case-insensitive) / ยกเลิก');
assert(parseGroupMessage('members').command === 'members' && parseGroupMessage('join').command === 'join' && parseGroupMessage('help').command === 'help', 'members / join / help');
const settle = parseGroupMessage('settle @Ann 150', [{ index: 7, length: 4, type: 'user', userId: 'Ua' }]);
assert(settle.command === 'settle' && settle.rest === '150', 'settle keeps the rest of the message (mention stripped)');
assert(parseGroupMessage('undo that please') === null, 'a command word followed by chatter is ignored (except settle)');

assert(eq(parseSettleAmount('150'), { amount: 150 }) && eq(parseSettleAmount(''), { amount: null }) && eq(parseSettleAmount('1,000.5 บาท'), { amount: 1000.5 }), 'parseSettleAmount');
assert(stripMentions('hi @Ann there', [{ index: 3, length: 4 }]) === 'hi there', 'stripMentions');

// --- Equal shares ---
const s3 = equalShares(100, ['P', 'A', 'B'], 'P');
assert(s3.reduce((n, s) => n + Math.round(s.share * 100), 0) === 10000, '100 split 3 ways sums to exactly 100.00');
assert(s3.find((s) => s.line_user_id === 'P').share === 33.33 && s3.filter((s) => s.share === 33.34).length === 1, 'the spare cent goes to someone other than the payer');
assert(equalShares(600, ['P', 'A', 'A', 'P'], 'P').length === 2, 'duplicate member ids are merged');
assert(eq(equalShares(50, ['P'], 'P'), [{ line_user_id: 'P', share: 50 }]), 'one member -> the payer\'s whole share');

// --- Balances and simplification ---
const entries = [
  { kind: 'expense', payer_line_user_id: 'A', amount: 900, shares: [{ line_user_id: 'A', share: 300 }, { line_user_id: 'B', share: 300 }, { line_user_id: 'C', share: 300 }] },
  { kind: 'expense', payer_line_user_id: 'B', amount: 300, shares: [{ line_user_id: 'A', share: 100 }, { line_user_id: 'B', share: 100 }, { line_user_id: 'C', share: 100 }] },
];
const net = netBalances(entries);
assert(net.get('A') === 50000 && net.get('B') === -10000 && net.get('C') === -40000, 'net: A is owed 500, B owes 100, C owes 400');
const pay = simplifyDebts(net);
assert(eq(pay, [{ from: 'C', to: 'A', amount: 400 }, { from: 'B', to: 'A', amount: 100 }]), `who pays whom (got ${JSON.stringify(pay)})`);
const afterSettle = netBalances([...entries, { kind: 'settlement', payer_line_user_id: 'C', amount: 400, shares: [{ line_user_id: 'A', share: 400 }] }]);
assert(eq(simplifyDebts(afterSettle), [{ from: 'B', to: 'A', amount: 100 }]), 'a settlement clears that debt');
const all = netBalances([...entries,
  { kind: 'settlement', payer_line_user_id: 'C', amount: 400, shares: [{ line_user_id: 'A', share: 400 }] },
  { kind: 'settlement', payer_line_user_id: 'B', amount: 100, shares: [{ line_user_id: 'A', share: 100 }] }]);
assert(simplifyDebts(all).length === 0 && [...all.values()].every((v) => v === 0), 'everyone settled -> no payments');
const chain = netBalances([
  { kind: 'expense', payer_line_user_id: 'A', amount: 10, shares: [{ line_user_id: 'B', share: 10 }] },
  { kind: 'expense', payer_line_user_id: 'B', amount: 10, shares: [{ line_user_id: 'C', share: 10 }] },
]);
assert(eq(simplifyDebts(chain), [{ from: 'C', to: 'A', amount: 10 }]), 'a chain A<-B<-C collapses to one payment C->A');
const five = new Map([['A', 3333], ['B', 3334], ['C', -2222], ['D', -2222], ['E', -2223]]);
const p5 = simplifyDebts(five);
assert(p5.length <= 4 && p5.reduce((n, p) => n + Math.round(p.amount * 100), 0) === 6667, 'at most n-1 payments, cents conserved');

process.exit(failures ? 1 : 0);
