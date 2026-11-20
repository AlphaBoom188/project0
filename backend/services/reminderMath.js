// Pure scheduling for reminders (migration 020). No DB, no clock: every
// function takes `now`. All calendar logic is Asia/Bangkok (fixed +7h).
//
// A reminder has a current occurrence (remind_at) and a next push time
// (next_fire_at). Normal reminders push once. Important and must-not-miss
// ones follow up at fixed minutes after the occurrence until the person taps
// Done or Stop. A repeating reminder then moves to its next occurrence,
// computed from anchor_at (its first occurrence).

const OFFSET_MS = 7 * 60 * 60 * 1000;
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

const IMPORTANCE = ['normal', 'important', 'must'];
// Follow-ups, in minutes after the occurrence (owner decision 2026-11-20:
// only for important reminders). Important: 09:00 -> 09:30 -> 10:30.
const FOLLOWUPS = { 0: [], 1: [30, 90], 2: [15, 45, 90, 180] };
const REPEATS = ['none', 'daily', 'weekdays', 'weekly', 'monthly'];
const CATEGORIES = ['work', 'finance', 'health', 'client', 'order', 'other'];
const SNOOZE_MIN = 15;

const toDate = (v) => (v instanceof Date ? v : v == null ? null : new Date(v));
// Bangkok wall-clock fields of an instant (UTC getters on a shifted Date).
const local = (d) => new Date(toDate(d).getTime() + OFFSET_MS);
// Instant of a Bangkok wall-clock time; out-of-range fields roll over like Date.UTC.
const fromLocal = (y, mo, d, h = 0, mi = 0) => new Date(Date.UTC(y, mo, d, h, mi) - OFFSET_MS);
const daysIn = (y, mo) => new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();

// 'YYYY-MM-DD' + 'HH:MM' (either may be null) -> the reminder time, or null
// for a to-do with no time. A date alone means 09:00 that day. A time alone
// means today, or tomorrow if that time has already passed.
function resolveRemindAt({ date = null, time = null } = {}, now) {
  const dm = date && /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = time && /^(\d{1,2}):(\d{2})$/.exec(time);
  if (date && !dm) return null;
  if (time && (!tm || Number(tm[1]) > 23 || Number(tm[2]) > 59)) return null;
  if (!dm && !tm) return null;
  const [h, mi] = tm ? [Number(tm[1]), Number(tm[2])] : [9, 0];
  if (dm) return fromLocal(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), h, mi);
  const n = local(now);
  const today = fromLocal(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), h, mi);
  return today > toDate(now) ? today : new Date(today.getTime() + DAY);
}

// The first occurrence of a repeating reminder strictly after `after`.
// The anchor gives the time of day (all), weekday (weekly) and day of month
// (monthly; clamped to short months without drifting: 31 Jan -> 28 Feb -> 31 Mar).
function nextOccurrence(anchorAt, repeat, after) {
  const anchor = toDate(anchorAt);
  const afterD = toDate(after);
  if (repeat === 'none' || !REPEATS.includes(repeat)) return null;
  if (anchor > afterD) return anchor;
  const a = local(anchor);
  const h = a.getUTCHours();
  const mi = a.getUTCMinutes();
  const s = local(afterD);
  if (repeat === 'monthly') {
    const day = a.getUTCDate();
    for (let k = 0; k < 3; k += 1) {
      const y = s.getUTCFullYear();
      const mo = s.getUTCMonth() + k;
      const yy = y + Math.floor(mo / 12);
      const mm = ((mo % 12) + 12) % 12;
      const t = fromLocal(yy, mm, Math.min(day, daysIn(yy, mm)), h, mi);
      if (t > afterD) return t;
    }
    return null;
  }
  for (let k = 0; k < 9; k += 1) {
    const t = fromLocal(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate() + k, h, mi);
    if (t <= afterD) continue;
    const wd = local(t).getUTCDay();
    if (repeat === 'weekdays' && (wd === 0 || wd === 6)) continue;
    if (repeat === 'weekly' && wd !== a.getUTCDay()) continue;
    return t;
  }
  return null;
}

// Every occurrence in [from, to): one-off -> its remind_at if inside;
// repeating -> expanded from the anchor (capped, for calendar views).
function occurrencesBetween(r, from, to, cap = 62) {
  const f = toDate(from);
  const t = toDate(to);
  if (!r.remind_at) return [];
  if (!r.repeat || r.repeat === 'none') {
    const at = toDate(r.remind_at);
    return at >= f && at < t ? [at] : [];
  }
  const out = [];
  let cur = nextOccurrence(r.anchor_at, r.repeat, new Date(f.getTime() - 1));
  while (cur && cur < t && out.length < cap) {
    out.push(cur);
    cur = nextOccurrence(r.anchor_at, r.repeat, cur);
  }
  return out;
}

const iso = (d) => (d ? toDate(d).toISOString() : null);

// The schedule fields for a new or edited reminder.
// -> { remind_at, anchor_at, next_fire_at, fire_count } or { error }.
function initialSchedule({ remindAt, repeat = 'none' }, now) {
  const at = toDate(remindAt);
  const nowD = toDate(now);
  if (!at) {
    if (repeat !== 'none') return { error: 'A repeating reminder needs a date and time' };
    return { remind_at: null, anchor_at: null, next_fire_at: null, fire_count: 0 };
  }
  if (repeat === 'none') {
    if (at.getTime() < nowD.getTime() - MIN) return { error: 'That time has already passed' };
    return { remind_at: iso(at), anchor_at: null, next_fire_at: iso(at), fire_count: 0 };
  }
  const first = at > nowD ? at : nextOccurrence(at, repeat, nowD);
  return { remind_at: iso(first), anchor_at: iso(at), next_fire_at: iso(first), fire_count: 0 };
}

// Finished with the current occurrence: a repeating reminder moves on to its
// next one; a one-off stops pushing (it stays open until ticked).
function finishOccurrence(r, now) {
  if (r.repeat && r.repeat !== 'none') {
    const base = Math.max(toDate(now).getTime(), toDate(r.remind_at).getTime());
    const next = nextOccurrence(r.anchor_at, r.repeat, new Date(base));
    return { remind_at: iso(next), next_fire_at: iso(next), fire_count: 0 };
  }
  return { next_fire_at: null };
}

// The next follow-up after `now` for the current occurrence, or null.
function nextFollowup(r, now) {
  if (!r.remind_at) return null;
  const at = toDate(r.remind_at).getTime();
  const n = toDate(now).getTime();
  const t = (FOLLOWUPS[r.importance] || []).map((m) => at + m * MIN).find((x) => x > n);
  return t ? new Date(t) : null;
}

// Which message a push is: the reminder itself, a follow-up, or the last one.
function pushKind(r, now) {
  if (!r.fire_count) return 'first';
  if ((FOLLOWUPS[r.importance] || []).length && !nextFollowup(r, now)) return 'last';
  return 'followup';
}

// The update after the job pushes a reminder.
function afterFire(r, now) {
  const base = { fire_count: (r.fire_count || 0) + 1, last_fired_at: iso(now) };
  const follow = nextFollowup(r, now);
  if (follow) return { ...base, next_fire_at: iso(follow) };
  return { ...base, ...finishOccurrence(r, now) };
}

// Done / Snooze / Stop / Reopen, from a chat button or the app.
// -> the fields to update, or { error }.
function applyAction(r, action, now, { minutes = SNOOZE_MIN } = {}) {
  const nowD = toDate(now);
  switch (action) {
    case 'done':
      if (r.status === 'done') return {};
      if (r.repeat && r.repeat !== 'none') return finishOccurrence(r, now);
      return { status: 'done', done_at: iso(nowD), next_fire_at: null };
    case 'stop':
      if (r.status === 'done') return {};
      return finishOccurrence(r, now);
    case 'snooze':
      if (r.status === 'done') return { error: 'This reminder is already done' };
      if (!(minutes >= 5 && minutes <= 24 * 60)) return { error: 'Snooze between 5 minutes and 24 hours' };
      return { next_fire_at: iso(new Date(nowD.getTime() + minutes * MIN)) };
    case 'reopen': {
      if (r.status !== 'done') return {};
      const at = toDate(r.remind_at);
      return { status: 'open', done_at: null, next_fire_at: at && at > nowD ? iso(at) : null };
    }
    default:
      return { error: 'Unknown action' };
  }
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

// "Today 09:00", "Tomorrow 18:30", "Fri 21 Nov 09:00", "Mon 4 Jan 2027 09:00".
function formatWhen(at, now) {
  if (!at) return 'No time';
  const l = local(at);
  const n = local(now);
  const time = `${pad(l.getUTCHours())}:${pad(l.getUTCMinutes())}`;
  const dayNum = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY;
  const diff = dayNum(l) - dayNum(n);
  if (diff === 0) return `Today ${time}`;
  if (diff === 1) return `Tomorrow ${time}`;
  const year = l.getUTCFullYear() !== n.getUTCFullYear() ? ` ${l.getUTCFullYear()}` : '';
  return `${WD[l.getUTCDay()]} ${l.getUTCDate()} ${MO[l.getUTCMonth()]}${year} ${time}`;
}

const REPEAT_LABEL = { none: null, daily: 'Every day', weekdays: 'Every weekday', weekly: 'Every week', monthly: 'Every month' };

// Validates and normalizes reminder input from the API or the chat parser.
// -> { value } or { error }.
function normalizeInput(body, { partial = false } = {}) {
  const v = {};
  if (!partial || body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return { error: 'Title is required' };
    if (title.length > 200) return { error: 'Title is too long (200 characters max)' };
    v.title = title;
  }
  if (body.details !== undefined) {
    if (body.details !== null && typeof body.details !== 'string') return { error: 'Details must be text' };
    const d = (body.details || '').trim();
    if (d.length > 2000) return { error: 'Details are too long (2000 characters max)' };
    v.details = d || null;
  }
  if (body.category !== undefined) {
    if (body.category !== null && !CATEGORIES.includes(body.category)) return { error: `Category must be one of ${CATEGORIES.join(', ')}` };
    v.category = body.category;
  }
  if (body.importance !== undefined) {
    const i = Number(body.importance);
    if (![0, 1, 2].includes(i)) return { error: 'Importance must be 0 (normal), 1 (important) or 2 (must not miss)' };
    v.importance = i;
  }
  if (body.repeat !== undefined) {
    if (!REPEATS.includes(body.repeat)) return { error: `Repeat must be one of ${REPEATS.join(', ')}` };
    v.repeat = body.repeat;
  }
  if (body.remind_at !== undefined) {
    if (body.remind_at === null || body.remind_at === '') v.remind_at = null;
    else {
      const d = new Date(body.remind_at);
      if (Number.isNaN(d.getTime())) return { error: 'remind_at must be a date-time' };
      v.remind_at = d.toISOString();
    }
  }
  return { value: v };
}

module.exports = {
  FOLLOWUPS, REPEATS, CATEGORIES, IMPORTANCE, SNOOZE_MIN, REPEAT_LABEL,
  resolveRemindAt, nextOccurrence, occurrencesBetween, initialSchedule, finishOccurrence,
  nextFollowup, pushKind, afterFire, applyAction, formatWhen, normalizeInput, fromLocal,
};
