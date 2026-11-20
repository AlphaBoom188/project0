// LINE messages for reminders: the push itself (with Done / Snooze / Stop
// quick replies) and the replies to those buttons. Pushes count against the
// Official Account's message quota (a group push: once per member).
const { pushMessages } = require('./lineMessagingClient');
const m = require('./reminderMath');

const postback = (label, action, id) => ({
  type: 'action',
  action: { type: 'postback', label, data: `rem=${action}&id=${id}`, displayText: label },
});

function quickReply(r) {
  const items = [postback('Done', 'done', r.id), postback(`Snooze ${m.SNOOZE_MIN} min`, 'snooze', r.id)];
  if (r.importance > 0 || r.repeat !== 'none') items.push(postback('Stop reminding', 'stop', r.id));
  return { items };
}

// Text of a push. kind: 'first' | 'followup' | 'last' (reminderMath.pushKind).
function pushText(r, kind) {
  if (kind === 'followup') return `"${r.title}" isn't marked done yet. Tap Done when it's finished.`;
  if (kind === 'last') return `Last reminder: "${r.title}". I'll stop after this one.`;
  const lines = [`Reminder: ${r.title}`];
  if (r.details) lines.push(r.details);
  if (m.REPEAT_LABEL[r.repeat]) lines.push(m.REPEAT_LABEL[r.repeat]);
  return lines.join('\n');
}

// -> { to, messages }. Group reminders @mention the people they're for (or
// whoever set them).
function buildPush(r, kind) {
  const text = pushText(r, kind);
  if (!r.group_id) return { to: r.line_user_id, messages: [{ type: 'text', text, quickReply: quickReply(r) }] };
  const ids = [...new Set(r.mention_ids.length ? r.mention_ids : [r.line_user_id])].slice(0, 20);
  const substitution = {};
  ids.forEach((id, i) => { substitution[`m${i}`] = { type: 'mention', mentionee: { type: 'user', userId: id } }; });
  const prefix = ids.map((_, i) => `{m${i}}`).join(' ');
  return { to: r.group_id, messages: [{ type: 'textV2', text: `${prefix} ${text.replace(/[{}]/g, '')}`, substitution, quickReply: quickReply(r) }] };
}

async function push(r, kind) {
  const { to, messages } = buildPush(r, kind);
  await pushMessages(to, messages);
}

// Reply after a button tap or an app action.
function actionReply(action, r, now = new Date()) {
  const next = r.repeat !== 'none' && r.remind_at ? ` Next: ${m.formatWhen(r.remind_at, now)}.` : '';
  switch (action) {
    case 'done': return `Done: ${r.title}.${next}`;
    case 'stop': return `Okay, no more reminders for "${r.title}" this time.${next}`;
    case 'snooze': return `Okay, I'll remind you again at ${m.formatWhen(r.next_fire_at, now).replace(/^Today /, '')}.`;
    default: return 'Okay.';
  }
}

// "Reminder set" confirmation line.
function setReply(r, now = new Date()) {
  const when = r.remind_at ? m.formatWhen(r.remind_at, now) : 'no time (on your to-do list)';
  const extra = [m.REPEAT_LABEL[r.repeat], r.importance === 2 ? 'Must not miss' : r.importance === 1 ? 'Important' : null].filter(Boolean);
  return `Reminder set: ${r.title}\n${when}${extra.length ? ` · ${extra.join(' · ')}` : ''}`;
}

module.exports = { buildPush, push, pushText, actionReply, setReply, quickReply };
