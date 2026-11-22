// Morning briefing (migration 023): today's reminders, calendar events,
// overdue items and open to-dos in one LINE message. buildBriefing is pure;
// loadBriefing gathers the rows for one user. Used by the 07:30 job
// (jobs/morningBriefing.js, opt-in) and the "today" chat command (a free reply).
const store = require('./reminderStore');
const { occurrencesBetween } = require('./reminderMath');
const { bangkokParts, bangkokMidnight } = require('./bangkokDay');

const OFFSET = 7 * 3600 * 1000;
const hm = (iso) => new Date(new Date(iso).getTime() + OFFSET).toISOString().slice(11, 16);
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// items: { timed: [{ at, title, importance, kind: 'reminder'|'event' }], allDay: [title],
//          overdue: [{ title, at }], todos: [title], bills: ['Netflix ฿419'] } -> text, or null when nothing's on.
function buildBriefing({ now, timed = [], allDay = [], overdue = [], todos = [], bills = [] }) {
  if (!timed.length && !allDay.length && !overdue.length && !todos.length && !bills.length) return null;
  const { weekday, day, month } = bangkokParts(now);
  const lines = [`Good morning. ${WD[weekday]} ${day} ${MO[month]}:`];
  if (timed.length || allDay.length) {
    lines.push('', 'Today');
    allDay.slice(0, 5).forEach((t) => lines.push(`- All day  ${t}`));
    [...timed].sort((a, b) => new Date(a.at) - new Date(b.at)).slice(0, 10)
      .forEach((t) => lines.push(`- ${hm(t.at)}  ${t.title}${t.importance === 2 ? ' (must not miss)' : t.importance === 1 ? ' (important)' : ''}${t.kind === 'event' ? ' · calendar' : ''}`));
  }
  if (bills.length) {
    lines.push('', 'Bills due today');
    bills.slice(0, 5).forEach((b) => lines.push(`- ${b}`));
    if (bills.length > 5) lines.push(`- and ${bills.length - 5} more`);
  }
  if (overdue.length) {
    lines.push('', 'Still open');
    overdue.slice(0, 5).forEach((o) => lines.push(`- ${o.title}`));
    if (overdue.length > 5) lines.push(`- and ${overdue.length - 5} more`);
  }
  if (todos.length) {
    lines.push('', `To-do (${todos.length})`);
    todos.slice(0, 5).forEach((t) => lines.push(`- ${t}`));
    if (todos.length > 5) lines.push(`- and ${todos.length - 5} more`);
  }
  return lines.join('\n');
}

// -> { text, counts } for one user today (Bangkok). Calendar events only when
// connected; a calendar failure just leaves them out.
async function loadBriefing(lineUserId, now = new Date(), { withCalendar = true } = {}) {
  const { year, month, day } = bangkokParts(now);
  const from = bangkokMidnight(year, month, day);
  const to = bangkokMidnight(year, month, day + 1);
  const all = await store.listForUser(lineUserId, { fromISO: from.toISOString(), toISO: from.toISOString() });
  const open = all.filter((r) => r.status === 'open');
  const timed = open.flatMap((r) => occurrencesBetween(r, from, to).map((at) => ({ at: at.toISOString(), title: r.title, importance: r.importance, kind: 'reminder' })));
  const overdue = open.filter((r) => r.repeat === 'none' && r.remind_at && new Date(r.remind_at) < from).map((r) => ({ title: r.title, at: r.remind_at }));
  const todos = open.filter((r) => !r.remind_at).map((r) => r.title);
  const allDay = [];
  if (withCalendar) {
    try {
      const gcal = require('./googleCalendar');
      if (await gcal.loadLink(lineUserId)) {
        const events = await gcal.listEvents(lineUserId, from.toISOString(), to.toISOString());
        events.forEach((e) => (e.all_day ? allDay.push(e.title) : timed.push({ at: e.start, title: e.title, kind: 'event' })));
      }
    } catch (error) {
      console.warn(`[briefing] calendar skipped (${error.message})`);
    }
  }
  let bills = [];
  try {
    const subs = require('./subscriptions');
    bills = subs.dueToday(await subs.loadOverview(lineUserId, now));
  } catch (error) {
    console.warn(`[briefing] bills skipped (${error.message})`);
  }
  return { text: buildBriefing({ now, timed, allDay, overdue, todos, bills }), counts: { timed: timed.length, allDay: allDay.length, overdue: overdue.length, todos: todos.length, bills: bills.length } };
}

module.exports = { buildBriefing, loadBriefing };
