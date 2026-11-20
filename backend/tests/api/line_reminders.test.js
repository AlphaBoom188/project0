// Reminders, to-dos and notes in LINE chat, through the real webhook
// controller and DB with LINE and the OpenAI parsers stubbed (free).
const { BACKEND } = require('../lib');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const hex = () => crypto.randomBytes(16).toString('hex');
const A = `U${hex()}`;
const B = `U${hex()}`;
const C = `U${hex()}`;
const G = `C${hex()}`;
const NAMES = { [A]: 'Ann', [B]: 'Bo', [C]: 'Cee' };

function stub(rel, exports) {
  const p = require.resolve(`${BACKEND}/${rel}`);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
}
let replies = [];
let lastMessages = [];
let cards = [];
const pushes = [];
stub('services/lineMessagingClient.js', {
  async replyText(token, text) { replies.push(text); },
  async replyMessages(token, messages) { lastMessages = messages; replies.push(...messages.map((m) => m.text || m.altText)); },
  async pushMessages(to, messages) { pushes.push({ to, messages }); },
  async replyConfirmationCard(token, card) { cards.push(card); replies.push('[card]'); },
  async getImageBuffer() { return Buffer.alloc(0); },
  async pushText() {},
  async getGroupMemberName(type, groupId, userId) { return NAMES[userId] || null; },
  async getGroupName() { return 'Team'; },
});
let expenseParses = 0;
stub('services/textExpenseParser.js', { async parseExpenseText() { expenseParses += 1; return { isExpense: false }; } });

// Canned model output per message; reminderParser.interpret does the rest.
const realParser = require(`${BACKEND}/services/reminderParser.js`);
const { getBangkokYmd } = require(`${BACKEND}/services/bangkokDay.js`);
const tomorrow = getBangkokYmd(new Date(Date.now() + 86400000));
const CANNED = {
  'พรุ่งนี้ 9 โมง เตือนประชุม': { is_reminder: true, title: 'ประชุม', date: tomorrow, time: '09:00', repeat: 'none', importance: 1 },
  'อย่าลืมจ่ายค่าเน็ตทุกเดือน': { is_reminder: true, title: 'จ่ายค่าเน็ต', repeat: 'monthly', category: 'finance' },
  'todo ซื้อนม': { is_reminder: true, title: 'ซื้อนม' },
  'นัดกินข้าว 300': { is_reminder: false },
  'เตือน พรุ่งนี้ 9 โมง ส่งงาน': { is_reminder: true, title: 'ส่งงาน', date: tomorrow, time: '09:00' },
  'เตือน ส่งงาน': { is_reminder: true, title: 'ส่งงาน' },
};
let reminderParses = 0;
stub('services/reminderParser.js', {
  ...realParser,
  async parseReminderText(text, now = new Date()) { reminderParses += 1; return realParser.interpret(CANNED[text] || { is_reminder: false }, now); },
});

const controller = require(`${BACKEND}/controllers/lineWebhookController.js`);
const { dispatchDueReminders } = require(`${BACKEND}/jobs/reminderDispatch.js`);
const { upsertUser } = require(`${BACKEND}/services/userUpsert.js`);

let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const res = () => ({ status() { return this; }, end() {}, json() {} });
async function fire(event) {
  replies = [];
  cards = [];
  await controller.webhook({ body: { events: [{ replyToken: 'r', timestamp: Date.now(), mode: 'active', ...event }] } }, res());
  return replies;
}
const dm = (userId, text) => fire({ type: 'message', source: { type: 'user', userId }, message: { id: hex(), type: 'text', text } });
const tap = (userId, data, source) => fire({ type: 'postback', source: source || { type: 'user', userId }, postback: { data } });
const gsay = (userId, text, mentionees) => fire({ type: 'message', source: { type: 'group', groupId: G, userId }, message: { id: hex(), type: 'text', text, ...(mentionees ? { mention: { mentionees } } : {}) } });
const rows = async (userId) => (await db.from('reminders').select('*').eq('line_user_id', userId).order('created_at')).data;

async function cleanup() {
  await db.from('line_groups').delete().eq('group_id', G);
  for (const u of [A, B, C]) {
    await db.from('categories').delete().eq('line_user_id', u);
    await db.from('users').delete().eq('line_user_id', u);
  }
}

(async () => {
  try {
    for (const u of [A, B, C]) await upsertUser({ lineUserId: u, displayName: NAMES[u], pictureUrl: null });

    // --- 1:1: set a reminder ---
    let out = await dm(A, 'พรุ่งนี้ 9 โมง เตือนประชุม');
    assert(out[0] === '[card]' && cards[0].title === 'Set this reminder?', 'reminder text -> confirm card');
    const cardRows = Object.fromEntries(cards[0].rows.map((r) => [r.label, r.value]));
    assert(cardRows.Remind === 'ประชุม' && cardRows.When === 'Tomorrow 09:00' && cardRows.Level === 'Important', `card rows (got ${JSON.stringify(cardRows)})`);
    assert(expenseParses === 0, 'not sent to the expense parser');
    out = await tap(A, cards.length ? cards[0].confirmData : '');
    assert(/^Reminder set: ประชุม\nTomorrow 09:00 · Important$/.test(out[0]), `confirm -> saved (got ${JSON.stringify(out)})`);
    let mine = await rows(A);
    assert(mine.length === 1 && mine[0].importance === 1 && mine[0].group_id === null, 'row saved');
    const meeting = mine[0];

    await dm(A, 'อย่าลืมจ่ายค่าเน็ตทุกเดือน');
    assert(cards[0].rows.some((r) => r.label === 'Repeat' && r.value === 'Every month'), 'repeating reminder card');
    out = await tap(A, cards[0].cancelData);
    assert(out[0] === 'Okay, discarded.' && (await rows(A)).length === 1, 'cancel -> nothing saved');

    await dm(A, 'todo ซื้อนม');
    assert(cards[0].title === 'Add this to your to-do list?' && cards[0].rows.find((r) => r.label === 'When').value === 'No time', 'to-do card');
    await tap(A, cards[0].confirmData);
    assert((await rows(A)).some((r) => r.title === 'ซื้อนม' && r.remind_at === null), 'to-do saved without a time');

    // --- Expenses still work ---
    const before = expenseParses;
    await dm(A, 'กาแฟ 120');
    assert(expenseParses === before + 1, 'an expense skips the reminder parser');
    const rp = reminderParses;
    await dm(A, 'นัดกินข้าว 300');
    assert(reminderParses === rp + 1 && expenseParses === before + 2, 'looks like a reminder but is not -> falls through to the expense parser');

    // --- Notes + list ---
    out = await dm(A, 'จด รหัส wifi ออฟฟิศ 1234');
    const notes = (await db.from('notes').select('body, note_date').eq('line_user_id', A)).data;
    assert(out[0].startsWith('Noted.') && notes.length === 1 && notes[0].body === 'รหัส wifi ออฟฟิศ 1234' && notes[0].note_date === getBangkokYmd(), 'note saved for today');
    out = await dm(A, 'reminders');
    assert(out[0].includes('Coming up:') && out[0].includes('Tomorrow 09:00  ประชุม') && out[0].includes('To-do:\n- ซื้อนม'), `list (got ${JSON.stringify(out[0])})`);
    out = await dm(B, 'เตือน');
    assert(out[0].startsWith('Nothing to remind you about'), 'empty list');

    // --- Push + buttons ---
    await db.from('reminders').update({ remind_at: new Date(Date.now() - 60000).toISOString(), next_fire_at: new Date(Date.now() - 60000).toISOString() }).eq('id', meeting.id);
    await dispatchDueReminders({ ids: [meeting.id] });
    const push = pushes[pushes.length - 1];
    assert(push.to === A && push.messages[0].text === 'Reminder: ประชุม', 'pushed to the person');
    const doneData = push.messages[0].quickReply.items[0].action.data;
    out = await tap(B, doneData);
    assert(out[0] === 'Only the people this reminder is for can do that.', "someone else can't tick it");
    out = await tap(A, push.messages[0].quickReply.items[1].action.data);
    assert(/^Okay, I'll remind you again (at|tomorrow at) \d{2}:\d{2}\.$/.test(out[0]), `snooze (got ${out[0]})`);
    out = await tap(A, doneData);
    assert(out[0] === 'Done: ประชุม.' && (await db.from('reminders').select('status').eq('id', meeting.id).single()).data.status === 'done', 'done');
    out = await tap(A, doneData);
    assert(out[0] === '"ประชุม" is already done.', 'done twice');
    out = await tap(A, 'rem=done&id=nope');
    assert(out.length === 0, 'malformed id ignored');

    // --- Group reminders ---
    await gsay(B, 'hi'); // members join by talking
    await gsay(C, 'hi');
    const text = 'เตือน พรุ่งนี้ 9 โมง ส่งงาน @Bo';
    out = await gsay(A, text, [{ index: text.indexOf('@Bo'), length: 3, type: 'user', userId: B }]);
    const grp = (await db.from('reminders').select('*').eq('group_id', G)).data;
    assert(grp.length === 1 && grp[0].line_user_id === A && grp[0].mention_ids.join() === B && grp[0].title === 'ส่งงาน', 'group reminder saved for the mentioned person');
    assert(out[0].startsWith('Reminder set: ส่งงาน\nTomorrow 09:00') && out[0].endsWith('For 1 person mentioned') && lastMessages[0].quickReply.items[0].action.label === 'Cancel', 'group reply with a Cancel button');
    out = await gsay(A, 'เตือน ส่งงาน');
    assert(out[0].startsWith('Tell me when'), 'group reminder needs a time');
    out = await gsay(C, 'reminders');
    assert(out[0].startsWith('Reminders in this group:') && out[0].includes('ส่งงาน'), 'group list');
    out = await gsay(C, 'remind');
    assert(out[0] === 'No unpaid bills here. Everyone is square.', '"remind" alone is still the bills digest');

    await db.from('reminders').update({ next_fire_at: new Date(Date.now() - 1000).toISOString() }).eq('id', grp[0].id);
    await dispatchDueReminders({ ids: [grp[0].id] });
    const gp = pushes[pushes.length - 1];
    assert(gp.to === G && gp.messages[0].type === 'textV2' && gp.messages[0].text === '{m0} Reminder: ส่งงาน' && gp.messages[0].substitution.m0.mentionee.userId === B, 'group push @mentions Bo');
    const gsrc = (u) => ({ type: 'group', groupId: G, userId: u });
    out = await tap(C, gp.messages[0].quickReply.items[0].action.data, gsrc(C));
    assert(out[0] === 'Only the people this reminder is for can do that.', "Cee (not mentioned) can't tick it");
    out = await tap(B, `rem=cancel&id=${grp[0].id}`, gsrc(B));
    assert(out[0] === 'Only the person who set this reminder can cancel it.', 'only the creator cancels');
    out = await tap(B, gp.messages[0].quickReply.items[0].action.data, gsrc(B));
    assert(out[0] === 'Done: ส่งงาน.', 'Bo ticks it in the group');
    out = await tap(A, `rem=cancel&id=${grp[0].id}`, gsrc(A));
    assert(out[0] === 'Cancelled: ส่งงาน.' && (await db.from('reminders').select('id').eq('group_id', G)).data.length === 0, 'creator cancels -> deleted');
  } finally {
    await cleanup();
  }
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); console.log('FAIL: crashed'); await cleanup(); process.exit(1); });
