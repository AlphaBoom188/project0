// LINE group bills (migrations 016 + 019), through the real webhook
// controller and DB with LINE stubbed. Free: every expense description hits a category keyword
// ("ข้าว", "taxi", "กาแฟ"), so autoCategorize never calls OpenAI.
const { BACKEND } = require('../lib');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const hex = () => crypto.randomBytes(16).toString('hex');
const A = `U${hex()}`;
const B = `U${hex()}`;
const C = `U${hex()}`;
const NAMES = { [A]: 'Ann', [B]: 'Bo', [C]: 'Cee' };
const G = `C${hex()}`;
const R = `R${hex()}`;
const R2 = `R${hex()}`;

function stub(rel, exports) {
  const p = require.resolve(`${BACKEND}/${rel}`);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
}
let replies = [];
let pushes = [];
// Replies are recorded as text; flex cards as "[flex] <altText>", mentions as "[mention] <text>".
const asText = (msg) => (msg.type === 'flex' ? `[flex] ${msg.altText}` : msg.type === 'textV2' ? `[mention] ${msg.text}` : msg.text);
let lastMessages = [];
stub('services/lineMessagingClient.js', {
  async replyText(token, text) { replies.push(text); },
  async replyMessages(token, messages) { lastMessages = messages; replies.push(...messages.map(asText)); },
  async pushMessages(to, messages) { pushes.push({ to, messages }); },
  async replyConfirmationCard() { replies.push('[card]'); },
  async getImageBuffer() { return Buffer.alloc(0); },
  async pushText() {},
  async getGroupMemberName(type, groupId, userId) { return NAMES[userId] || null; },
  async getGroupName() { return 'Test Trip'; },
});
let oneToOneParses = 0;
stub('services/textExpenseParser.js', { async parseExpenseText() { oneToOneParses += 1; return { isExpense: false }; } });

const controller = require(`${BACKEND}/controllers/lineWebhookController.js`);
const ledger = require(`${BACKEND}/services/groupLedger.js`);
const { upsertUser } = require(`${BACKEND}/services/userUpsert.js`);

let failures = 0;
function assert(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) failures += 1;
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const res = () => ({ status() { return this; }, end() {}, json() {} });
async function fire(event) {
  replies = [];
  await controller.webhook({ body: { events: [{ replyToken: 'r', timestamp: Date.now(), mode: 'active', ...event }] } }, res());
  return replies;
}
const src = (userId, groupId = G) => (groupId.startsWith('R') ? { type: 'room', roomId: groupId, userId } : { type: 'group', groupId, userId });
const say = (userId, text, mentionees, groupId) =>
  fire({ type: 'message', source: src(userId, groupId), message: { id: hex(), type: 'text', text, ...(mentionees ? { mention: { mentionees } } : {}) } });
// mention(text, '@Bo', 'U...') -> a LINE mentionee for that span
const mention = (text, label, userId, extra = {}) => ({ index: text.indexOf(label), length: label.length, type: 'user', ...(userId ? { userId } : {}), ...extra });
const personal = async (userId) => (await db.from('transactions').select('amount, description, category_id, categories ( name )').eq('line_user_id', userId).order('created_at')).data;

async function cleanup() {
  await db.from('line_groups').delete().in('group_id', [G, R, R2]);
  for (const u of [A, B, C]) {
    await db.from('transactions').delete().eq('line_user_id', u);
    await db.from('categories').delete().eq('line_user_id', u);
    await db.from('users').delete().eq('line_user_id', u);
  }
}

(async () => {
  // Ann and Bo use the app themselves (LIFF login / 1:1 chat path); Cee only
  // ever speaks in the group, so Cee gets no personal-ledger copies (migration 018).
  await upsertUser({ lineUserId: A, displayName: 'Ann', pictureUrl: null });
  await upsertUser({ lineUserId: B, displayName: 'Bo', pictureUrl: null });

  // --- Bot added ---
  let out = await fire({ type: 'join', source: { type: 'group', groupId: G } });
  assert(out.length === 1 && out[0].startsWith('Hi! I collect shared bills'), 'join -> the help intro');
  const { data: group } = await db.from('line_groups').select('*').eq('group_id', G).single();
  assert(group.name === 'Test Trip' && group.source_type === 'group' && group.is_active, 'group row with its LINE name');

  // --- Chatter: silent, but members join ---
  for (const [u, t] of [[A, 'hello everyone'], [B, 'ข้าว 600 ไหม'], [C, 'see you at 7']]) {
    out = await say(u, t);
    assert(out.length === 0, `no reply to chatter: "${t}"`);
  }
  const members = await ledger.listMembers(G);
  assert(members.length === 3 && members.map((m) => m.display_name).sort().join() === 'Ann,Bo,Cee', 'everyone who spoke is a member, with their LINE name');
  assert((await db.from('users').select('line_user_id').in('line_user_id', [A, B, C])).data.length === 3, 'members get a users row (for their personal ledger)');
  assert(oneToOneParses === 0, 'group messages never reach the 1:1 expense parser');
  assert((await db.from('group_expenses').select('id').eq('group_id', G)).data.length === 0, '"ข้าว 600 ไหม" without "+" records nothing');

  // --- A bill for everyone ---
  out = await say(A, '+ข้าว 600');
  assert(out[0] === '[flex] ข้าว ฿600 requested by Ann', `a bill card (got ${JSON.stringify(out)})`);
  assert(out[1] === '[mention] {m0} {m1} please pay Ann your share. Tap Pay on the card.', 'then a mention line for those who owe');
  const ids = Object.values(lastMessages[1].substitution).map((x) => x.mentionee.userId).sort();
  assert(eq(ids, [B, C].sort()), 'the mentions are Bo and Cee (not Ann)');
  const cardJson = JSON.stringify(lastMessages[0]);
  assert(cardJson.includes('?groupbill=') && cardJson.includes('"text":"Host"'), 'the card links to the bill and marks Ann as host');
  const { data: e1 } = await db.from('group_expenses').select('*, group_expense_shares(*)').eq('group_id', G).single();
  assert(Number(e1.amount) === 600 && e1.payer_line_user_id === A && e1.status === 'open' && e1.group_expense_shares.length === 3, 'one open bill, three shares');
  const ownerShare = e1.group_expense_shares.find((x) => x.line_user_id === A);
  assert(ownerShare.paid_at && ownerShare.paid_method === 'owner' && e1.group_expense_shares.filter((x) => !x.paid_at).length === 2, "Ann's own share is paid at creation; Bo and Cee owe");
  assert(e1.group_expense_shares.filter((x) => x.transaction_id).length === 2, 'the two app users\' shares are linked to personal transactions');
  for (const u of [A, B]) {
    const t = await personal(u);
    assert(t.length === 1 && Number(t[0].amount) === 200 && t[0].description === 'ข้าว · Test Trip' && t[0].categories.name === 'Food', `${NAMES[u]} (uses the app): ฿200 "ข้าว · Test Trip" in Food`);
  }
  assert((await personal(C)).length === 0 && e1.group_expense_shares.find((x) => x.line_user_id === C && !x.transaction_id), 'Cee (group chat only) gets no personal-ledger copy, but still owes the share');
  const { data: consent } = await db.from('users').select('line_user_id, group_ledger_copies').in('line_user_id', [A, C]);
  assert(consent.find((x) => x.line_user_id === A).group_ledger_copies === true && consent.find((x) => x.line_user_id === C).group_ledger_copies === null, 'app users are TRUE, group-only members undecided (NULL)');

  // --- @mention narrows the bill ---
  let text = '+taxi 90 @Bo';
  out = await say(C, text, [mention(text, '@Bo', B)]);
  assert(out[0] === '[flex] taxi ฿90 requested by Cee' && out[1].startsWith('[mention] {m0} please pay Cee'), 'mentioning Bo: a bill between Cee and Bo only');
  text = '+กาแฟ 30 @Ann';
  out = await say(B, text, [mention(text, '@Ann', null)]);
  assert(out[0] === '[flex] กาแฟ ฿30 requested by Bo', `a mention without userId matched by name (got ${JSON.stringify(out[0])})`);

  // --- Reminder digest ---
  out = await say(C, 'bills');
  assert(out[0] === "[flex] Don't forget to pay: 3 open bills", `bills -> the reminder card (got ${JSON.stringify(out)})`);
  const remindJson = JSON.stringify(lastMessages[0]);
  assert(remindJson.includes('฿245') && remindJson.includes('฿200') && remindJson.includes('฿15'), 'Bo owes 245 (200 + 45), Cee 200, Ann 15');
  assert(out[1] && out[1].startsWith('[mention]') && Object.keys(lastMessages[1].substitution).length === 3, 'with a mention for everyone who owes');

  // --- Undo cancels your last open bill ---
  out = await say(B, 'undo');
  assert(out[0] === '[flex] Collection cancelled: กาแฟ', `undo -> a cancelled card (got ${JSON.stringify(out)})`);
  assert(JSON.stringify(lastMessages[0]).includes('Cancelled by Bo'), 'cancelled by Bo');
  assert((await personal(A)).length === 1 && (await personal(B)).length === 2, 'cancelling also removes the personal-ledger copies');
  assert((await db.from('group_expenses').select('status').eq('group_id', G).eq('description', 'กาแฟ').single()).data.status === 'cancelled', 'the bill is kept as cancelled');
  out = await say(B, 'undo');
  assert(out[0] === 'You have no open bill from the last 7 days to cancel.', 'nothing left to cancel');
  text = '+ข้าว 50 @Zed';
  out = await say(A, text, [mention(text, '@Zed', null)]);
  assert(out[0] && out[0].startsWith("I don't know @zed yet"), 'an unknown @mention is refused, nothing recorded');
  // Mentioning the bot works like "+".
  text = '@ExpenseBot กาแฟ 60';
  out = await say(A, text, [mention(text, '@ExpenseBot', null, { isSelf: true })]);
  assert(out[0] === '[flex] กาแฟ ฿60 requested by Ann', '@mentioning the bot starts a bill');
  await say(A, 'undo');
  out = await say(A, '+dinner');
  assert(out[0] && out[0].startsWith('Add an amount'), '"+" without an amount gets a hint');

  // --- Paid in the app, then the board ---
  const ledgerBill = await ledger.getBill(e1.id);
  let res1 = await ledger.markSharePaid(ledgerBill, B, 'marked');
  assert(res1.ok && res1.position === 1 && !res1.fullyPaid, 'Bo marked paid: 1st, bill still open');
  res1 = await ledger.markSharePaid(res1.bill, C, 'marked');
  assert(res1.ok && res1.position === 2 && res1.fullyPaid && res1.bill.status === 'paid', 'Cee paid 2nd: bill fully paid');
  assert(!(await ledger.markSharePaid(res1.bill, C, 'marked')).ok, 'paying twice is a no-op');
  out = await say(B, 'rank');
  const boardJson = JSON.stringify(lastMessages[0]);
  assert(out[0].startsWith('[flex] Fastest payers, ') && (boardJson.includes('Ann (1 bill)') || boardJson.includes('Cee (1 bill)')) && boardJson.includes('"text":"Bo"'), `rank -> the fastest-payers card (got ${JSON.stringify(out)})`);
  out = await say(C, 'จ่ายแล้ว');
  assert(out[0].startsWith('To pay a bill, tap Pay'), '"จ่ายแล้ว" explains how to pay in the app');

  // --- Consent: Settings opt-out, and a group-only member who starts using the app ---
  await db.from('users').update({ group_ledger_copies: false }).eq('line_user_id', B); // Bo turns it off in Settings
  await upsertUser({ lineUserId: B, displayName: 'Bo', pictureUrl: null }); // ...and logs in again later
  assert((await db.from('users').select('group_ledger_copies').eq('line_user_id', B).single()).data.group_ledger_copies === false, 'logging in again never re-enables copies someone turned off');
  await upsertUser({ lineUserId: C, displayName: 'Cee', pictureUrl: null }); // Cee opens the app for the first time
  const bBefore = (await personal(B)).length;
  const cBefore = (await personal(C)).length;
  text = '+ข้าว 40 @Bo @Cee';
  await say(A, text, [mention(text, '@Bo', B), mention(text, '@Cee', C)]);
  assert((await personal(B)).length === bBefore, 'after opting out, Bo gets no new personal copies');
  assert((await personal(C)).length === cBefore + 1, 'once Cee uses the app, Cee gets personal copies from then on');
  await say(A, 'undo');
  await db.from('users').update({ group_ledger_copies: true }).eq('line_user_id', B);

  // --- Members, join, leaving ---
  out = await say(A, 'members');
  assert(out[0] === 'Members (3): Ann, Bo, Cee', 'members lists joined names');
  await fire({ type: 'memberLeft', source: { type: 'group', groupId: G }, left: { members: [{ type: 'user', userId: B }] } });
  out = await say(A, '+ข้าว 20');
  const ids2 = Object.values(lastMessages[1].substitution).map((x) => x.mentionee.userId);
  assert(out[0] === '[flex] ข้าว ฿20 requested by Ann' && eq(ids2, [C]), 'a member who left is not on new bills');
  out = await say(B, 'join');
  assert(out[0] === 'Bo joined. New bills here will include you.' && (await ledger.listMembers(G)).length === 3, 'join brings a member back');

  // --- A multi-person room works the same ---
  ledger._seen.clear();
  await fire({ type: 'join', source: { type: 'room', roomId: R } });
  await say(A, 'hi', null, R);
  await say(C, 'hi', null, R);
  out = await say(C, '+taxi 100', null, R);
  assert(out[0] === '[flex] taxi ฿100 requested by Cee' && (await db.from('line_groups').select('source_type').eq('group_id', R).single()).data.source_type === 'room', 'rooms work like groups');
  // --- 19:00 reminder job (scoped to this room) ---
  const { sendGroupBillReminders } = require(`${BACKEND}/jobs/groupBillReminders.js`);
  pushes = [];
  let job = await sendGroupBillReminders({ groupId: R });
  assert(job.groups === 0 && pushes.length === 0, 'a bill posted just now is not nagged about tonight');
  job = await sendGroupBillReminders({ groupId: R, now: new Date(Date.now() + 21 * 3600 * 1000) });
  assert(job.groups === 1 && pushes.length === 1 && pushes[0].to === R && pushes[0].messages[0].altText === "Don't forget to pay: 1 open bill" && pushes[0].messages[1].type === 'textV2', `20h later: one digest pushed to the room (got ${JSON.stringify(pushes.map((p) => p.to))})`);
  out = await say(A, '+solo 10', null, R2);
  assert(out[0] && out[0].includes('only you have joined so far'), 'a bill with nobody else: recorded, nobody owes');

  // --- Bot removed ---
  await fire({ type: 'leave', source: { type: 'group', groupId: G } });
  assert((await db.from('line_groups').select('is_active').eq('group_id', G).single()).data.is_active === false, 'leave marks the group inactive');

  // --- 1:1 chats unchanged ---
  out = await fire({ type: 'message', source: { type: 'user', userId: A }, message: { id: hex(), type: 'text', text: 'hello' } });
  assert(oneToOneParses === 1 && out.length === 1, '1:1 messages still go to the personal expense parser');

  await cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); await cleanup(); process.exit(1); });
