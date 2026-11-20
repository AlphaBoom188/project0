// Reminders, to-dos and notes in LINE chat (migration 020).
//
// 1:1 chat: "พรุ่งนี้ 9 โมง เตือนประชุม" (typed or spoken) -> a Confirm/Cancel
// card -> saved. "note ..." / "จด ..." saves a note straight away.
// "reminders" lists what's coming up.
// Groups: "เตือน ..." / "remind ..." sets a group reminder at once (with a
// Cancel button), @mentioning whoever the message mentions.
// Pushes carry Done / Snooze / Stop quick replies; their postbacks land here
// from both 1:1 and group chats.
const { replyText, replyMessages, replyConfirmationCard } = require('../services/lineMessagingClient');
const store = require('../services/reminderStore');
const notify = require('../services/reminderNotify');
const pending = require('../services/pendingConfirmations');
const { parseReminderText, looksLikeReminder } = require('../services/reminderParser');
const { formatWhen, REPEAT_LABEL } = require('../services/reminderMath');
const { getBangkokYmd } = require('../services/bangkokDay');
const { isUuid } = require('../services/uuid');

const LIST_COMMANDS = new Set(['reminders', 'reminder', 'todo', 'to-do', 'todos', 'เตือน', 'รายการเตือน', 'เตือนอะไรบ้าง']);
const NOTE_RE = /^(?:note|notes|จด|จดไว้|โน้ต|บันทึก)\s*[:：]?\s+([\s\S]+)$/i;
const IMPORTANCE_LABEL = ['Normal', 'Important', 'Must not miss'];

function log(...args) {
  console.log('[reminders]', ...args);
}

// Upcoming list for a chat reply: overdue, then the next 10, then to-dos.
function listText(reminders, now = new Date(), { heading = 'Coming up' } = {}) {
  const open = reminders.filter((r) => r.status === 'open');
  if (!open.length) return 'Nothing to remind you about. Try "พรุ่งนี้ 9 โมง เตือนประชุม".';
  const timed = open.filter((r) => r.remind_at).sort((a, b) => new Date(a.remind_at) - new Date(b.remind_at)).slice(0, 10);
  const todos = open.filter((r) => !r.remind_at).slice(0, 10);
  const lines = [];
  if (timed.length) lines.push(`${heading}:`, ...timed.map((r) => `- ${formatWhen(r.remind_at, now)}  ${r.title}${new Date(r.remind_at) < now ? ' (overdue)' : ''}`));
  if (todos.length) lines.push(...(lines.length ? [''] : []), 'To-do:', ...todos.map((r) => `- ${r.title}`));
  return lines.join('\n');
}

// 1:1 text (typed, or a voice transcript). -> true when handled here.
async function handlePersonalText(event, lineUserId, text, { heard = null, overLimit = () => false } = {}) {
  const trimmed = text.trim();
  if (LIST_COMMANDS.has(trimmed.toLowerCase())) {
    const now = new Date();
    const all = await store.listForUser(lineUserId, { fromISO: now.toISOString(), toISO: now.toISOString() });
    await replyText(event.replyToken, listText(all.filter((r) => !r.group_id), now));
    return true;
  }
  const note = NOTE_RE.exec(trimmed);
  if (note) {
    const { note: saved, error } = await store.createNote(lineUserId, { body: note[1] }, getBangkokYmd());
    await replyText(event.replyToken, error ? error : 'Noted. You can find it under Tasks in the app.');
    if (saved) log('note saved', lineUserId);
    return true;
  }
  if (!looksLikeReminder(trimmed)) return false;
  if (overLimit()) return false; // the caller replies with the rate-limit message
  const now = new Date();
  const parsed = await parseReminderText(trimmed, now);
  if (!parsed.isReminder) return false; // e.g. "นัดกินข้าว 300" is an expense after all
  const token = pending.create({
    kind: 'reminder',
    lineUserId,
    title: parsed.title,
    remindAt: parsed.remindAt ? parsed.remindAt.toISOString() : null,
    repeat: parsed.repeat,
    importance: parsed.importance,
    category: parsed.category,
  });
  log('reminder parsed', lineUserId, parsed.remindAt ? 'timed' : 'to-do');
  await replyConfirmationCard(event.replyToken, {
    title: parsed.remindAt ? 'Set this reminder?' : 'Add this to your to-do list?',
    rows: [
      ...(heard ? [{ label: 'Heard', value: heard }] : []),
      { label: 'Remind', value: parsed.title },
      { label: 'When', value: parsed.remindAt ? formatWhen(parsed.remindAt, now) : 'No time' },
      ...(parsed.repeat !== 'none' ? [{ label: 'Repeat', value: REPEAT_LABEL[parsed.repeat] }] : []),
      ...(parsed.importance ? [{ label: 'Level', value: IMPORTANCE_LABEL[parsed.importance] }] : []),
    ],
    confirmData: `action=confirm&token=${token}`,
    cancelData: `action=cancel&token=${token}`,
  });
  return true;
}

// Confirm tapped on a pending reminder card.
async function confirmPending(event, token, data) {
  const { reminder, error } = await store.createReminder(data.lineUserId, {
    title: data.title, remind_at: data.remindAt, repeat: data.repeat, importance: data.importance, category: data.category,
  });
  pending.remove(token);
  if (error) return replyText(event.replyToken, `${error}. Please send it again with a new time.`);
  return replyText(event.replyToken, notify.setReply(reminder));
}

// Done / Snooze / Stop / Cancel buttons (data "rem=<action>&id=<uuid>").
async function handlePostback(event, params) {
  const action = params.get('rem');
  const id = params.get('id');
  const userId = event.source && event.source.userId;
  if (!isUuid(id) || !userId) return;
  const r = await store.getReminder(id);
  if (!r) return replyText(event.replyToken, 'That reminder was deleted.');
  if (!store.canAct(r, userId)) return replyText(event.replyToken, 'Only the people this reminder is for can do that.');
  if (action === 'cancel') {
    if (r.line_user_id !== userId) return replyText(event.replyToken, 'Only the person who set this reminder can cancel it.');
    await store.deleteReminder(r.id);
    return replyText(event.replyToken, `Cancelled: ${r.title}.`);
  }
  if (!['done', 'snooze', 'stop'].includes(action)) return;
  if (r.status === 'done') return replyText(event.replyToken, `"${r.title}" is already done.`);
  const { reminder, error } = await store.act(r, action);
  if (error) return replyText(event.replyToken, error);
  return replyText(event.replyToken, notify.actionReply(action, reminder));
}

// Group: "เตือน ..." / "remind ..." (or the bot @mentioned with เตือน).
const GROUP_PREFIX = /^(?:เตือน|remind(?:\s+us|\s+me)?)(?=\s|$)\s*/i; // no \b: Thai letters are not \w
const isGroupReminder = (plain) => GROUP_PREFIX.test(plain) && plain.replace(GROUP_PREFIX, '').trim().length > 0;

async function handleGroupReminder(event, { groupId, userId, plain, mentionIds, overLimit = () => false }) {
  if (overLimit()) return replyText(event.replyToken, "You're sending a lot right now. Please wait a few minutes and try again.");
  const now = new Date();
  const parsed = await parseReminderText(plain, now);
  if (!parsed.isReminder || !parsed.remindAt) {
    return replyText(event.replyToken, 'Tell me when, e.g. "เตือน พรุ่งนี้ 9 โมง ประชุม @Ann".');
  }
  const { reminder, error } = await store.createReminder(userId, {
    title: parsed.title, remind_at: parsed.remindAt.toISOString(), repeat: parsed.repeat, importance: parsed.importance, category: parsed.category,
  }, { groupId, mentionIds });
  if (error) return replyText(event.replyToken, `${error}. Try again with a new time.`);
  log('group reminder set', groupId);
  return replyMessages(event.replyToken, [{
    type: 'text',
    text: `${notify.setReply(reminder, now)}${mentionIds.length ? `\nFor ${mentionIds.length} ${mentionIds.length === 1 ? 'person' : 'people'} mentioned` : ''}`,
    quickReply: { items: [{ type: 'action', action: { type: 'postback', label: 'Cancel', data: `rem=cancel&id=${reminder.id}`, displayText: 'Cancel reminder' } }] },
  }]);
}

async function handleGroupList(event, groupId) {
  const list = await store.listForGroup(groupId);
  return replyText(event.replyToken, list.length ? listText(list, new Date(), { heading: 'Reminders in this group' }) : 'No reminders set in this group. Try "เตือน พรุ่งนี้ 9 โมง ประชุม".');
}

module.exports = { handlePersonalText, confirmPending, handlePostback, handleGroupReminder, handleGroupList, isGroupReminder, listText, NOTE_RE };
