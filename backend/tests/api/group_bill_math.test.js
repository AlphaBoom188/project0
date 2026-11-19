// Pure: services/groupBillMath.js (bill status, reminder digest, fastest
// payers), services/promptpay.js (Thai QR payload) and services/groupBillFlex.js
// (LINE message shapes).
const { BACKEND } = require('../lib');
const m = require(`${BACKEND}/services/groupBillMath.js`);
const pp = require(`${BACKEND}/services/promptpay.js`);
const flex = require(`${BACKEND}/services/groupBillFlex.js`);

let failures = 0;
function assert(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) failures += 1;
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const T = (min) => new Date(Date.UTC(2026, 10, 10, 12, min)).toISOString(); // Nov 10 2026, 19:xx Bangkok
const share = (id, amount, paidMin = null, slip = null) => ({ line_user_id: id, share: amount, paid_at: paidMin === null ? null : T(paidMin), slip_status: slip });
const bill = (id, owner, amount, shares, status = 'open', createdMin = 0) => ({ id, payer_line_user_id: owner, amount, description: id, status, created_at: T(createdMin), shares });

// --- Status ---
const rice = bill('rice', 'A', 600, [share('A', 200, 0), share('B', 200, 5), share('C', 200, null, 'pending')]);
assert(eq(m.owesOn(rice).map((s) => s.line_user_id), ['B', 'C']), 'the owner never owes on their own bill');
assert(eq(m.unpaidShares(rice).map((s) => s.line_user_id), ['C']) && !m.isFullyPaid(rice), 'C is unpaid (a pending slip is not paid)');
assert(m.unpaidTotal(rice) === 200, 'unpaid total');
assert(m.memberStatus(rice, 'A') === 'owner' && m.memberStatus(rice, 'B') === 'paid' && m.memberStatus(rice, 'C') === 'slip_pending' && m.memberStatus(rice, 'Z') === 'none', 'member statuses');
const solo = bill('solo', 'A', 50, [share('A', 50, 0)]);
assert(m.isFullyPaid(solo), 'a bill with only the owner is fully paid');
const order = bill('o', 'A', 400, [share('A', 100, 0), share('D', 100, 9), share('B', 100, 3), share('C', 100, 6)], 'paid');
assert(eq([...m.paidPositions(order)], [['B', 1], ['C', 2], ['D', 3]]), 'positions follow paid_at, owner excluded');

// --- Reminder digest ---
const taxi = bill('taxi', 'C', 90, [share('C', 45, 0), share('B', 45)]);
const cake = bill('cake', 'B', 300, [share('B', 100, 0), share('A', 100), share('C', 100)], 'cancelled');
const d = m.reminderDigest([rice, taxi, cake, order]);
assert(d.openBills === 2 && eq(d.rows, [{ line_user_id: 'C', owed: 200, bills: 1 }, { line_user_id: 'B', owed: 45, bills: 1 }]), `digest: open bills only, largest first (got ${JSON.stringify(d)})`);
const sum = m.reminderDigest([bill('x', 'A', 30, [share('A', 10, 0), share('B', 10.1), share('C', 9.9)]), bill('y', 'C', 20, [share('C', 10, 0), share('B', 10.2)])]);
assert(sum.rows[0].line_user_id === 'B' && sum.rows[0].owed === 20.3 && sum.rows[0].bills === 2, 'digest sums across bills in cents');
assert(eq(m.reminderDigest([]), { openBills: 0, rows: [] }), 'no bills -> nothing to remind');

// --- Fastest payers ---
const from = T(-60);
const to = T(600);
const b1 = bill('b1', 'A', 300, [share('A', 100, 0), share('B', 100, 2), share('C', 100, 4)], 'paid');
const b2 = bill('b2', 'B', 300, [share('B', 100, 10), share('C', 100, 11), share('A', 100, 15)], 'paid', 10);
const b3 = bill('b3', 'C', 200, [share('C', 100, 20), share('B', 100, 21)], 'open', 20);
const b4 = bill('b4', 'A', 200, [share('A', 100, 30), share('B', 100, 31)], 'cancelled', 30);
const lb = m.leaderboard([b1, b2, b3, b4], from, to);
assert(eq(lb.rows, [
  { line_user_id: 'B', first: 2, second: 0, third: 0 },
  { line_user_id: 'C', first: 1, second: 1, third: 0 },
  { line_user_id: 'A', first: 0, second: 1, third: 0 },
]), `leaderboard counts 1st/2nd/3rd, cancelled bills ignored (got ${JSON.stringify(lb.rows)})`);
assert(eq(lb.topHost, { line_user_id: 'A', bills: 1 }) || eq(lb.topHost, { line_user_id: 'B', bills: 1 }) || eq(lb.topHost, { line_user_id: 'C', bills: 1 }), 'top host: most bills created');
const lbOut = m.leaderboard([b1], T(100), T(200));
assert(lbOut.rows.length === 0 && lbOut.topHost === null, 'outside the window: nothing');

// --- PromptPay ---
assert(pp.crc16('123456789') === '29B1', 'CRC-16/CCITT-FALSE check value');
assert(pp.normalizePromptPayId('081-234-5678') === '0812345678' && pp.normalizePromptPayId('1 2345 67890 12 3') === '1234567890123'
  && pp.normalizePromptPayId('123456789012345') === '123456789012345' && pp.normalizePromptPayId('12345') === null && pp.normalizePromptPayId('8123456789') === null, 'ID normalization');
const staticQr = pp.promptPayPayload('0812345678');
assert(staticQr.startsWith('000201010211') && staticQr.includes('29370016A000000677010111011300668123456785802TH5303764') && !staticQr.includes('5406'), `static phone QR (got ${staticQr})`);
assert(staticQr.slice(-8, -4) === '6304' && staticQr.slice(-4) === pp.crc16(staticQr.slice(0, -4)), 'ends with tag 63 and its own CRC');
const withAmount = pp.promptPayPayload('0812345678', 162);
assert(withAmount.startsWith('000201010212') && withAmount.includes('5406162.00'), 'dynamic QR with the amount');
assert(pp.promptPayPayload('1234567890123', 1).includes('02131234567890123') && pp.promptPayPayload('123456789012345').includes('0315123456789012345'), 'national ID and e-wallet targets');
let threw = false;
try { pp.promptPayPayload('nope'); } catch { threw = true; }
assert(threw, 'an invalid ID throws');
assert(pp.formatPromptPayId('0812345678') === '081-234-5678' && pp.formatPromptPayId('1234567890123') === '1-2345-67890-12-3', 'display formatting');

// --- Flex shapes ---
process.env.LIFF_ID = '1234567890-abcdefgh';
const card = flex.billCard({ bill: { id: 'b-1', description: 'Swensen', amount: 300 }, ownerName: 'Ann', members: [{ name: 'Ann', share: 100, isOwner: true }, { name: 'Bo', share: 100, paid: true }, { name: 'Cee', share: 100 }] });
const json = JSON.stringify(card);
assert(card.type === 'flex' && card.contents.type === 'bubble' && card.altText.includes('Swensen'), 'bill card is a flex bubble');
assert(json.includes('https://liff.line.me/1234567890-abcdefgh?groupbill=b-1') && json.includes('"label":"Pay"') && json.includes('"label":"See who paid"'), 'Pay and See who paid open the bill in the LIFF app');
assert(json.includes('"text":"Host"') && json.includes('"text":"Paid"') && json.includes('#15803d'), 'host and paid tags, accent colour');
assert(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(json), 'no emoji in the card');
const many = flex.billCard({ bill: { id: 'b', description: null, amount: 1 }, ownerName: 'A', members: Array.from({ length: 25 }, (_, i) => ({ name: `M${i}`, share: 1 })) });
assert(JSON.stringify(many).includes('and 5 more') && JSON.stringify(many).includes('Shared bill'), 'long lists are capped; untitled bills get a name');
const paid = flex.paidText({ payerName: 'Bo', ownerName: 'Ann', amount: 162, billTitle: 'gift', position: 2, method: 'slip', remaining: 3 });
assert(paid.text === 'Bo paid ฿162.00 to Ann (slip confirmed)\nBill "gift": paid 2nd. 3 still to pay.', `paid text (got ${JSON.stringify(paid.text)})`);
assert(flex.paidText({ payerName: 'Bo', ownerName: 'Ann', amount: 5, billTitle: 'x', position: 1, method: 'marked', remaining: 0 }).text.endsWith('(marked paid by Ann)\nBill "x": paid 1st. Everyone has paid.'), 'marked paid, last one');
const mention = flex.mentionMessage(['U1', 'U2', 'U1'], 'please pay');
assert(mention.type === 'textV2' && mention.text === '{m0} {m1} please pay' && mention.substitution.m1.mentionee.userId === 'U2', 'textV2 mention, de-duplicated');
assert(flex.mentionMessage([], 'x') === null, 'nobody to mention -> null');
const board = JSON.stringify(flex.leaderboardCard({ groupId: 'Cabc', period: 'November 2026', rows: [{ name: 'Benz', first: 3, second: 1, third: 0 }], topHostName: 'tty (5 bills)' }));
assert(board.includes('Fastest payers') && board.includes('"text":"1st"') && board.includes('tty (5 bills)') && board.includes('?group=Cabc'), 'leaderboard card');
assert(JSON.stringify(flex.leaderboardCard({ groupId: 'C', period: 'p', rows: [], topHostName: null })).includes('No payments yet this month.'), 'empty leaderboard');
const remind = JSON.stringify(flex.reminderCard({ groupId: 'Cabc', openBills: 3, rows: [{ name: 'Mos', owed: 262 }] }));
assert(remind.includes("Don't forget to pay") && remind.includes('3 open bills') && remind.includes('฿262'), 'reminder card');
const cancelled = JSON.stringify(flex.cancelledCard({ bill: { id: 'b', description: 'gift', amount: 3402 }, byName: 'Benz', unpaid: 1296 }));
assert(cancelled.includes('Collection cancelled') && cancelled.includes('Cancelled by Benz') && cancelled.includes('฿3,402') && cancelled.includes('฿1,296'), 'cancelled card');
const full = JSON.stringify(flex.fullyPaidCard({ bill: { id: 'b', description: 'กระเพรา', amount: 128 }, payers: [{ name: 'gene', share: 64, position: 1 }] }));
assert(full.includes('Fully paid') && full.includes('"text":"1st"') && full.includes('View details'), 'fully-paid card');

process.exit(failures ? 1 : 0);
