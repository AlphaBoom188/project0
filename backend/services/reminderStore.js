// Reminder and note storage (migration 020). Callers scope by line_user_id;
// group reminders are visible to their creator and the people they mention.
const supabase = require('../config/supabase');
const m = require('./reminderMath');

const COLUMNS = 'id, line_user_id, group_id, mention_ids, title, details, category, importance, repeat, remind_at, anchor_at, next_fire_at, fire_count, last_fired_at, status, done_at, created_at, updated_at';

// -> { reminder } | { error } (validation)
async function createReminder(lineUserId, body, { groupId = null, mentionIds = [], now = new Date() } = {}) {
  const { value, error } = m.normalizeInput(body);
  if (error) return { error };
  const repeat = value.repeat || 'none';
  const sched = m.initialSchedule({ remindAt: value.remind_at || null, repeat }, now);
  if (sched.error) return { error: sched.error };
  const { data, error: dbError } = await supabase.from('reminders').insert({
    line_user_id: lineUserId,
    group_id: groupId,
    mention_ids: mentionIds,
    title: value.title,
    details: value.details || null,
    category: value.category || null,
    importance: value.importance || 0,
    repeat,
    ...sched,
  }).select(COLUMNS).single();
  if (dbError) throw dbError;
  return { reminder: data };
}

async function getReminder(id) {
  const { data, error } = await supabase.from('reminders').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

// Who may act on it (Done/Snooze/Stop): the creator, or in a group the
// people it mentions (everyone, when it mentions nobody).
function canAct(r, userId) {
  if (r.line_user_id === userId) return true;
  if (!r.group_id) return false;
  return !r.mention_ids.length || r.mention_ids.includes(userId);
}

// Open reminders (all of them) plus ones done within the window, for the
// user's own and their group reminders.
async function listForUser(lineUserId, { fromISO, toISO }) {
  const who = `line_user_id.eq.${lineUserId},mention_ids.cs.{${lineUserId}}`;
  const open = await supabase.from('reminders').select(COLUMNS).or(who).eq('status', 'open')
    .order('remind_at', { ascending: true, nullsFirst: false }).limit(500);
  if (open.error) throw open.error;
  const done = await supabase.from('reminders').select(COLUMNS).or(who).eq('status', 'done')
    .gte('done_at', fromISO).lt('done_at', toISO).order('done_at', { ascending: false }).limit(200);
  if (done.error) throw done.error;
  return [...open.data, ...done.data];
}

async function listForGroup(groupId) {
  const { data, error } = await supabase.from('reminders').select(COLUMNS).eq('group_id', groupId).eq('status', 'open')
    .order('remind_at', { ascending: true, nullsFirst: false }).limit(20);
  if (error) throw error;
  return data;
}

async function saveFields(id, fields) {
  const { data, error } = await supabase.from('reminders').update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id).select(COLUMNS).maybeSingle();
  if (error) throw error;
  return data;
}

// Edit: re-validates and re-schedules when the time or repeat changes.
// -> { reminder } | { error }
async function updateReminder(r, body, now = new Date()) {
  const { value, error } = m.normalizeInput(body, { partial: true });
  if (error) return { error };
  const fields = { ...value };
  const timeChanged = value.remind_at !== undefined || value.repeat !== undefined;
  if (timeChanged) {
    const repeat = value.repeat || r.repeat;
    const remindAt = value.remind_at !== undefined ? value.remind_at : (r.anchor_at || r.remind_at);
    const sched = m.initialSchedule({ remindAt, repeat }, now);
    if (sched.error) return { error: sched.error };
    Object.assign(fields, sched, r.status === 'done' && repeat === 'none' ? { next_fire_at: null } : {});
  }
  if (value.importance !== undefined && !timeChanged && r.status === 'open' && r.fire_count > 0 && r.repeat === 'none') {
    // Already pushed: the remaining follow-ups follow the new level.
    const follow = m.nextFollowup({ ...r, importance: value.importance }, now);
    fields.next_fire_at = follow ? follow.toISOString() : null;
  }
  return { reminder: await saveFields(r.id, fields) };
}

// Done / Snooze / Stop / Reopen. -> { reminder } | { error }
async function act(r, action, now = new Date(), opts = {}) {
  const patch = m.applyAction(r, action, now, opts);
  if (patch.error) return { error: patch.error };
  if (!Object.keys(patch).length) return { reminder: r };
  return { reminder: await saveFields(r.id, patch) };
}

async function deleteReminder(id) {
  const { error } = await supabase.from('reminders').delete().eq('id', id);
  if (error) throw error;
}

// Due pushes. `scope` narrows a run (tests): { lineUserId } or { ids }.
async function dueReminders(now, { lineUserId, ids, limit = 200 } = {}) {
  let q = supabase.from('reminders').select(COLUMNS).eq('status', 'open').not('next_fire_at', 'is', null)
    .lte('next_fire_at', now.toISOString()).order('next_fire_at').limit(limit);
  if (lineUserId) q = q.eq('line_user_id', lineUserId);
  if (ids) q = q.in('id', ids);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// Optimistic claim: only one process wins a given (id, next_fire_at), so a
// second server instance can't push the same reminder twice.
async function claim(r, patch) {
  const { data, error } = await supabase.from('reminders').update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', r.id).eq('status', 'open').eq('next_fire_at', r.next_fire_at).select(COLUMNS);
  if (error) throw error;
  return data[0] || null;
}

// ---- Notes ----
const NOTE_COLUMNS = 'id, body, note_date, pinned, created_at, updated_at';
const YMD = /^\d{4}-\d{2}-\d{2}$/;

function normalizeNote(body, { partial = false } = {}) {
  const v = {};
  if (!partial || body.body !== undefined) {
    const text = typeof body.body === 'string' ? body.body.trim() : '';
    if (!text) return { error: 'Note text is required' };
    if (text.length > 5000) return { error: 'Note is too long (5000 characters max)' };
    v.body = text;
  }
  if (body.note_date !== undefined) {
    if (!YMD.test(String(body.note_date)) || Number.isNaN(new Date(`${body.note_date}T00:00:00Z`).getTime())) return { error: 'note_date must be YYYY-MM-DD' };
    v.note_date = body.note_date;
  }
  if (body.pinned !== undefined) v.pinned = body.pinned === true;
  return { value: v };
}

async function listNotes(lineUserId, { from, to }) {
  let q = supabase.from('notes').select(NOTE_COLUMNS).eq('line_user_id', lineUserId);
  if (from) q = q.gte('note_date', from);
  if (to) q = q.lte('note_date', to);
  const { data, error } = await q.order('pinned', { ascending: false }).order('note_date', { ascending: false }).order('created_at', { ascending: false }).limit(300);
  if (error) throw error;
  return data;
}

async function createNote(lineUserId, body, todayYmd) {
  const { value, error } = normalizeNote(body);
  if (error) return { error };
  const { data, error: dbError } = await supabase.from('notes').insert({ line_user_id: lineUserId, note_date: todayYmd, ...value })
    .select(NOTE_COLUMNS).single();
  if (dbError) throw dbError;
  return { note: data };
}

async function updateNote(lineUserId, id, body) {
  const { value, error } = normalizeNote(body, { partial: true });
  if (error) return { error };
  const { data, error: dbError } = await supabase.from('notes').update({ ...value, updated_at: new Date().toISOString() })
    .eq('id', id).eq('line_user_id', lineUserId).select(NOTE_COLUMNS).maybeSingle();
  if (dbError) throw dbError;
  return { note: data };
}

async function deleteNote(lineUserId, id) {
  const { error } = await supabase.from('notes').delete().eq('id', id).eq('line_user_id', lineUserId);
  if (error) throw error;
}

module.exports = {
  createReminder, getReminder, canAct, listForUser, listForGroup, updateReminder, act, deleteReminder, dueReminders, claim,
  listNotes, createNote, updateNote, deleteNote, normalizeNote,
};
