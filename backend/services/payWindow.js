// Pay windows on monthly recurring rules (pay_start_day..pay_end_day, both
// optional, 1-31). A pay period is a month; its window runs from the start day
// to the end day, wrapping into the next month when end < start (e.g. 28 -> 3).
// Days past a short month's end clamp to its last day (31 -> Feb 28/29).
// All dates are Bangkok calendar dates as 'YYYY-MM-DD' strings, which compare
// correctly as plain strings.
const { getBangkokYmd } = require('./bangkokDay');

const pad = (n) => String(n).padStart(2, '0');
const daysInMonth = (year, month) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate(); // month is 0-based
function ymd(year, month, day) {
  const d = new Date(Date.UTC(year, month, 1));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  return `${y}-${pad(m + 1)}-${pad(Math.min(day, daysInMonth(y, m)))}`;
}
const addDays = (ymdStr, n) => new Date(Date.parse(`${ymdStr}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

const hasPayWindow = (rule) => rule.frequency === 'monthly' && (rule.pay_start_day || rule.pay_end_day);

// The window for the period starting in (year, month). With only an end day,
// the window starts on the 1st; with only a start day, it ends that same day.
function periodFor(rule, year, month) {
  const startDay = rule.pay_start_day || 1;
  const endDay = rule.pay_end_day || startDay;
  const start = ymd(year, month, startDay);
  const end = endDay >= startDay ? ymd(year, month, endDay) : ymd(year, month + 1, endDay);
  return { period: ymd(year, month, 1), start, end, overdueFrom: addDays(end, 1) };
}

// The current period plus the previous one -- a wrapping window that began
// last month can still be open (or just overdue) today.
function recentPeriods(rule, today) {
  const [y, m] = today.split('-').map(Number);
  return [periodFor(rule, y, m - 1), periodFor(rule, y, m - 2)];
}

// For display: the latest period that has already started, and its state.
function payStatus(rule, now = new Date()) {
  if (!hasPayWindow(rule)) return null;
  const today = getBangkokYmd(now);
  const current = recentPeriods(rule, today).find((p) => p.start <= today) || recentPeriods(rule, today)[1];
  const paid = rule.paid_period === current.period;
  return { ...current, paid, overdue: !paid && today >= current.overdueFrom };
}

// For the daily job: reminders that fall exactly on today.
function remindersDueToday(rule, now = new Date()) {
  if (!hasPayWindow(rule) || !rule.is_active) return [];
  const today = getBangkokYmd(now);
  const reminders = [];
  for (const p of recentPeriods(rule, today)) {
    if (rule.paid_period === p.period) continue;
    if (rule.pay_start_day && today === p.start) reminders.push({ kind: 'due', ...p });
    if (today === p.overdueFrom) reminders.push({ kind: 'overdue', ...p });
  }
  return reminders;
}

module.exports = { hasPayWindow, periodFor, payStatus, remindersDueToday };
