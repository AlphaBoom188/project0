// Pure: services/reminderMath.js (times, repeats, follow-ups, actions).
const { BACKEND } = require('../lib');
const m = require(`${BACKEND}/services/reminderMath.js`);

let failures = 0;
function assert(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) failures += 1;
}
// Bangkok wall clock -> ISO
const bkk = (y, mo, d, h = 0, mi = 0) => m.fromLocal(y, mo - 1, d, h, mi).toISOString();
const NOW = new Date(bkk(2026, 11, 20, 11, 41)); // Fri 20 Nov 2026 11:41 Bangkok

// --- resolveRemindAt ---
assert(m.resolveRemindAt({ date: '2026-11-21', time: '09:00' }, NOW).toISOString() === bkk(2026, 11, 21, 9), 'date + time');
assert(m.resolveRemindAt({ date: '2026-11-25' }, NOW).toISOString() === bkk(2026, 11, 25, 9), 'date alone -> 09:00');
assert(m.resolveRemindAt({ time: '18:00' }, NOW).toISOString() === bkk(2026, 11, 20, 18), 'time later today -> today');
assert(m.resolveRemindAt({ time: '9:00' }, NOW).toISOString() === bkk(2026, 11, 21, 9), 'time already passed -> tomorrow');
assert(m.resolveRemindAt({}, NOW) === null && m.resolveRemindAt({ time: '25:00' }, NOW) === null && m.resolveRemindAt({ date: '21/11' }, NOW) === null, 'nothing or junk -> null (no-time to-do)');
// Bangkok vs UTC: 06:30 Bangkok on the 21st is the 20th in UTC
assert(m.resolveRemindAt({ date: '2026-11-21', time: '06:30' }, NOW).toISOString() === '2026-11-20T23:30:00.000Z', 'Bangkok wall clock, not UTC');

// --- nextOccurrence ---
const anchor = bkk(2026, 11, 20, 9); // Fri 09:00
assert(m.nextOccurrence(anchor, 'daily', NOW).toISOString() === bkk(2026, 11, 21, 9), 'daily: tomorrow 09:00');
assert(m.nextOccurrence(anchor, 'daily', new Date(bkk(2026, 11, 20, 8))).toISOString() === anchor, 'before the anchor -> the anchor');
assert(m.nextOccurrence(anchor, 'weekdays', NOW).toISOString() === bkk(2026, 11, 23, 9), 'weekdays: Friday -> Monday');
assert(m.nextOccurrence(anchor, 'weekly', NOW).toISOString() === bkk(2026, 11, 27, 9), 'weekly: next Friday');
assert(m.nextOccurrence(anchor, 'monthly', NOW).toISOString() === bkk(2026, 12, 20, 9), 'monthly: same day next month');
const jan31 = bkk(2027, 1, 31, 8);
const feb = m.nextOccurrence(jan31, 'monthly', new Date(jan31));
assert(feb.toISOString() === bkk(2027, 2, 28, 8), 'monthly 31st -> 28 Feb');
assert(m.nextOccurrence(jan31, 'monthly', feb).toISOString() === bkk(2027, 3, 31, 8), '... then back to 31 Mar (no drift)');
assert(m.nextOccurrence(bkk(2026, 12, 15, 9), 'monthly', new Date(bkk(2026, 12, 20))).toISOString() === bkk(2027, 1, 15, 9), 'monthly across the year end');
assert(m.nextOccurrence(anchor, 'none', NOW) === null, 'one-off has no next occurrence');

// --- occurrencesBetween ---
const daily = { remind_at: bkk(2026, 11, 21, 9), anchor_at: anchor, repeat: 'daily' };
const occ = m.occurrencesBetween(daily, bkk(2026, 11, 16), bkk(2026, 11, 23));
assert(occ.length === 3 && occ[0].toISOString() === anchor, `daily from Fri: Fri, Sat, Sun in that week (got ${occ.length})`);
assert(m.occurrencesBetween({ remind_at: anchor, repeat: 'none' }, bkk(2026, 11, 20), bkk(2026, 11, 21)).length === 1
  && m.occurrencesBetween({ remind_at: anchor, repeat: 'none' }, bkk(2026, 11, 21), bkk(2026, 11, 22)).length === 0
  && m.occurrencesBetween({ remind_at: null, repeat: 'none' }, bkk(2026, 11, 1), bkk(2026, 12, 1)).length === 0, 'one-off: only its own day; no-time: none');

// --- initialSchedule ---
const s1 = m.initialSchedule({ remindAt: bkk(2026, 11, 21, 9) }, NOW);
assert(s1.next_fire_at === bkk(2026, 11, 21, 9) && s1.anchor_at === null && s1.fire_count === 0, 'one-off schedules its own time');
assert(m.initialSchedule({ remindAt: bkk(2026, 11, 20, 9) }, NOW).error === 'That time has already passed', 'one-off in the past -> error');
const s2 = m.initialSchedule({ remindAt: anchor, repeat: 'daily' }, NOW);
assert(s2.anchor_at === anchor && s2.remind_at === bkk(2026, 11, 21, 9), 'repeating from a past anchor -> next occurrence');
assert(m.initialSchedule({ remindAt: null }, NOW).next_fire_at === null && m.initialSchedule({ remindAt: null, repeat: 'daily' }, NOW).error, 'to-do: no push; repeating needs a time');

// --- Firing: normal, important, must ---
const at9 = bkk(2026, 11, 20, 9);
const T = (h, mi) => new Date(bkk(2026, 11, 20, h, mi));
const normal = { remind_at: at9, importance: 0, repeat: 'none', fire_count: 0 };
assert(m.pushKind(normal, T(9, 0)) === 'first', 'first push');
const n1 = m.afterFire(normal, T(9, 0));
assert(n1.next_fire_at === null && n1.fire_count === 1, 'normal: one push, then quiet');
const imp = { remind_at: at9, importance: 1, repeat: 'none', fire_count: 0 };
const i1 = m.afterFire(imp, T(9, 0));
assert(i1.next_fire_at === bkk(2026, 11, 20, 9, 30), 'important: follow-up at 09:30');
const i2 = m.afterFire({ ...imp, ...i1 }, T(9, 30));
assert(i2.next_fire_at === bkk(2026, 11, 20, 10, 30), '... then 10:30');
assert(m.pushKind({ ...imp, ...i1 }, T(9, 30)) === 'followup' && m.pushKind({ ...imp, ...i2 }, T(10, 30)) === 'last', 'kinds: followup, then last');
assert(m.afterFire({ ...imp, ...i2 }, T(10, 30)).next_fire_at === null, '... then quiet (3 pushes in all)');
const must = { remind_at: at9, importance: 2, repeat: 'none', fire_count: 0 };
let r = { ...must };
const times = [];
for (let k = 0; k < 6 && (k === 0 || r.next_fire_at); k += 1) {
  const at = k === 0 ? new Date(at9) : new Date(r.next_fire_at);
  times.push(at.toISOString().slice(11, 16));
  r = { ...r, ...m.afterFire(r, at) };
}
assert(times.join(',') === '02:00,02:15,02:45,03:30,05:00', `must-not-miss: 5 pushes 09:00..12:00 (got ${times})`);
// A late job run skips follow-ups already in the past
assert(m.afterFire(imp, T(10, 0)).next_fire_at === bkk(2026, 11, 20, 10, 30), 'late run: skips the 09:30 follow-up');
// Repeating + normal: moves straight to tomorrow
const rep = { remind_at: at9, anchor_at: at9, importance: 0, repeat: 'daily', fire_count: 0 };
const rp = m.afterFire(rep, T(9, 0));
assert(rp.remind_at === bkk(2026, 11, 21, 9) && rp.next_fire_at === rp.remind_at && rp.fire_count === 0, 'repeating: next occurrence after the push');

// --- Actions ---
const fired = { ...imp, ...i1, status: 'open' };
const done = m.applyAction(fired, 'done', T(9, 10));
assert(done.status === 'done' && done.next_fire_at === null && done.done_at, 'done: closes a one-off');
const snz = m.applyAction(fired, 'snooze', T(9, 10));
assert(snz.next_fire_at === bkk(2026, 11, 20, 9, 25), 'snooze: 15 minutes from now');
assert(m.afterFire({ ...fired, ...snz }, T(9, 25)).next_fire_at === bkk(2026, 11, 20, 9, 30), 'after a snooze the follow-ups continue');
assert(m.applyAction(fired, 'snooze', T(9, 10), { minutes: 2 }).error, 'snooze bounds');
assert(m.applyAction(fired, 'stop', T(9, 10)).next_fire_at === null && m.applyAction(fired, 'stop', T(9, 10)).status === undefined, 'stop: quiet but still open');
const repDone = m.applyAction({ ...rep, status: 'open' }, 'done', T(8, 0));
assert(repDone.remind_at === bkk(2026, 11, 21, 9) && repDone.status === undefined, 'done early on a repeating reminder skips this occurrence');
const reopened = m.applyAction({ remind_at: bkk(2026, 11, 21, 9), status: 'done' }, 'reopen', NOW);
assert(reopened.status === 'open' && reopened.next_fire_at === bkk(2026, 11, 21, 9), 'reopen re-arms a future time');
assert(m.applyAction({ status: 'open' }, 'nope', NOW).error === 'Unknown action', 'unknown action');

// --- Formatting + input ---
assert(m.formatWhen(bkk(2026, 11, 20, 18), NOW) === 'Today 18:00' && m.formatWhen(bkk(2026, 11, 21, 9, 5), NOW) === 'Tomorrow 09:05'
  && m.formatWhen(bkk(2026, 11, 27, 9), NOW) === 'Fri 27 Nov 09:00' && m.formatWhen(bkk(2027, 1, 4, 9), NOW) === 'Mon 4 Jan 2027 09:00'
  && m.formatWhen(null, NOW) === 'No time', 'formatWhen');
assert(m.normalizeInput({ title: '  ' }).error === 'Title is required' && m.normalizeInput({ title: 'x', importance: 3 }).error
  && m.normalizeInput({ title: 'x', category: 'fun' }).error && m.normalizeInput({ title: 'x', repeat: 'yearly' }).error
  && m.normalizeInput({ title: 'x', remind_at: 'soon' }).error, 'input validation');
const ok = m.normalizeInput({ title: ' Pay rent ', importance: '1', category: 'finance', remind_at: bkk(2026, 12, 1, 9), details: ' ' });
assert(ok.value.title === 'Pay rent' && ok.value.importance === 1 && ok.value.details === null, 'input normalized');
assert(Object.keys(m.normalizeInput({ importance: 2 }, { partial: true }).value).join() === 'importance', 'partial update');

process.exit(failures ? 1 : 0);
