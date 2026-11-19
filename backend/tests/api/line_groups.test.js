// LINE group split tracker, through the real webhook controller and DB with
// LINE stubbed. Free: every expense description hits a category keyword
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

function stub(rel, exports) {
  const p = require.resolve(`${BACKEND}/${rel}`);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
}
let replies = [];
stub('services/lineMessagingClient.js', {
  async replyText(token, text) { replies.push(text); },
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

let failures = 0;
function assert(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) failures += 1;
}
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
  await db.from('line_groups').delete().in('group_id', [G, R]);
  for (const u of [A, B, C]) {
    await db.from('transactions').delete().eq('line_user_id', u);
    await db.from('categories').delete().eq('line_user_id', u);
    await db.from('users').delete().eq('line_user_id', u);
  }
}

(async () => {
  // --- Bot added ---
  let out = await fire({ type: 'join', source: { type: 'group', groupId: G } });
  assert(out.length === 1 && out[0].startsWith('Hi! I split shared costs'), 'join -> the help intro');
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

  // --- Expense split among everyone ---
  out = await say(A, '+ข้าว 600');
  assert(out[0] && out[0].includes('ข้าว ฿600.00 paid by Ann') && out[0].includes('Split 3 ways: Bo ฿200.00, Cee ฿200.00, Ann ฿200.00'), `expense reply (got ${JSON.stringify(out)})`);
  const { data: e1 } = await db.from('group_expenses').select('*, group_expense_shares(*)').eq('group_id', G).single();
  assert(Number(e1.amount) === 600 && e1.payer_line_user_id === A && e1.group_expense_shares.length === 3, 'one expense, three shares');
  assert(e1.group_expense_shares.every((s) => s.transaction_id), 'every share is linked to a personal transaction');
  for (const u of [A, B, C]) {
    const t = await personal(u);
    assert(t.length === 1 && Number(t[0].amount) === 200 && t[0].description === 'ข้าว · Test Trip' && t[0].categories.name === 'Food', `${NAMES[u]}'s ledger: ฿200 "ข้าว · Test Trip" in Food`);
  }

  out = await say(B, 'balance');
  const lines = out[0].split('\n');
  assert(lines[0] === 'Balances in Test Trip:' && lines.slice(1, 3).sort().join('|') === 'Bo pays Ann ฿200.00|Cee pays Ann ฿200.00' && lines[3] === 'Once paid, send "settle @name".',
    `balance (got ${JSON.stringify(out[0])})`); // equal debts: order follows user ids

  // --- @mention narrows the split ---
  let text = '+taxi 90 @Bo';
  out = await say(C, text, [mention(text, '@Bo', B)]);
  assert(out[0] && out[0].includes('taxi ฿90.00 paid by Cee') && out[0].includes('Split 2 ways'), 'mentioning Bo splits between Cee and Bo only');
  // A mention without a userId is matched by display name.
  text = '+กาแฟ 30 @Ann';
  out = await say(B, text, [mention(text, '@Ann', null)]);
  assert(out[0] && out[0].includes('Split 2 ways: Ann ฿15.00, Bo ฿15.00'), `a mention without userId matched by name (got ${JSON.stringify(out[0])})`);
  out = await say(B, 'undo');
  assert(out[0] === 'Removed your last entry: กาแฟ ฿30.00.', 'undo removes the sender\'s last entry');
  assert((await personal(A)).length === 1 && (await personal(B)).length === 2, 'undo also removes the personal-ledger copies');
  text = '+ข้าว 50 @Zed';
  out = await say(A, text, [mention(text, '@Zed', null)]);
  assert(out[0] && out[0].startsWith("I don't know @zed yet"), 'an unknown @mention is refused, nothing recorded');
  // Mentioning the bot works like "+".
  text = '@ExpenseBot กาแฟ 60';
  out = await say(A, text, [mention(text, '@ExpenseBot', null, { isSelf: true })]);
  assert(out[0] && out[0].includes('กาแฟ ฿60.00 paid by Ann') && out[0].includes('Split 3 ways'), '@mentioning the bot logs an expense');
  await say(A, 'undo');
  out = await say(A, '+dinner');
  assert(out[0] && out[0].startsWith('Add an amount'), '"+" without an amount gets a hint');

  // Net now: Ann +400, Bo -245, Cee -155.
  out = await say(A, 'balance');
  assert(out[0].includes('Bo pays Ann ฿245.00') && out[0].includes('Cee pays Ann ฿155.00'), `balances after the taxi (got ${JSON.stringify(out[0])})`);

  // --- Settle up ---
  text = 'settle @Ann';
  out = await say(B, text, [mention(text, '@Ann', A)]);
  assert(out[0] === 'Recorded: Bo paid Ann ฿245.00. Wrong? Send "undo".', `settle with no amount pays what's owed (got ${JSON.stringify(out[0])})`);
  out = await say(B, 'settle');
  assert(out[0] === "You don't owe anyone here right now.", 'settle with no mention, nothing owed');
  out = await say(C, 'settle');
  assert(out[0].startsWith('You owe: Ann ฿155.00'), 'settle with no mention lists what you owe');
  text = 'settle @Ann 100';
  out = await say(C, text, [mention(text, '@Ann', A)]);
  assert(out[0].startsWith('Recorded: Cee paid Ann ฿100.00'), 'settle with an amount records part of it');
  out = await say(A, 'balance');
  assert(out[0].includes('Cee pays Ann ฿55.00') && !out[0].includes('Bo pays'), 'balance after settling');
  out = await say(C, 'undo');
  assert(out[0] === 'Removed your payment of ฿100.00 to Ann.', 'undo a settlement');
  assert((await personal(B)).length === 2, 'settlements never touch personal ledgers');

  // --- Members, join, leaving ---
  out = await say(A, 'members');
  assert(out[0] === 'Members (3): Ann, Bo, Cee', 'members lists joined names');
  await fire({ type: 'memberLeft', source: { type: 'group', groupId: G }, left: { members: [{ type: 'user', userId: B }] } });
  out = await say(A, '+ข้าว 20');
  assert(out[0].includes('Split 2 ways') && !out[0].includes('Bo'), 'a member who left is excluded from new splits');
  out = await say(A, 'balance');
  assert(out[0].includes('Cee pays Ann'), 'balances still include past entries');
  out = await say(B, 'join');
  assert(out[0] === 'Bo joined. New expenses here will be split with you.' && (await ledger.listMembers(G)).length === 3, 'join brings a member back');

  // --- A multi-person room works the same ---
  ledger._seen.clear();
  await fire({ type: 'join', source: { type: 'room', roomId: R } });
  await say(A, 'hi', null, R);
  await say(C, 'hi', null, R);
  out = await say(C, '+taxi 100', null, R);
  assert(out[0] && out[0].includes('Split 2 ways') && (await db.from('line_groups').select('source_type').eq('group_id', R).single()).data.source_type === 'room', 'rooms work like groups');

  // --- Bot removed ---
  await fire({ type: 'leave', source: { type: 'group', groupId: G } });
  assert((await db.from('line_groups').select('is_active').eq('group_id', G).single()).data.is_active === false, 'leave marks the group inactive');

  // --- 1:1 chats unchanged ---
  out = await fire({ type: 'message', source: { type: 'user', userId: A }, message: { id: hex(), type: 'text', text: 'hello' } });
  assert(oneToOneParses === 1 && out.length === 1, '1:1 messages still go to the personal expense parser');

  await cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); await cleanup(); process.exit(1); });
