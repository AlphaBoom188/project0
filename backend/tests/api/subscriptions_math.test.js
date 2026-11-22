// Subscriptions & bills "what's due next" (pure): next dates per frequency,
// pay windows paid vs unpaid, overdue, the billing-cycle boundary, Bangkok
// midnight, price rises, header totals and the sort.
const { BACKEND } = require('../lib');
const { overview, step, nextDue, due7Line, dueToday } = require(`${BACKEND}/services/subscriptions.js`);

let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const rule = (o) => ({ id: o.id || o.description, type: 'expense', amount: 100, frequency: 'monthly', ...o });
const T = '2026-11-24'; // a Tuesday
const opts = { today: T, cycleEnd: '2026-12-01' };

// step(): month-end clamping keeps the anchor day
assert(step('2026-01-31', 'monthly', 1) === '2026-02-28' && step('2026-01-31', 'monthly', 2) === '2026-03-31' && step('2024-02-29', 'yearly', 1) === '2025-02-28', 'monthly/yearly steps clamp to short months and keep the anchor day');

// next dates
assert(nextDue(rule({ next_run_date: '2026-11-27T05:00:00Z' }), T) === '2026-11-27', 'monthly: next_run_date in the future is the next due');
assert(nextDue(rule({ next_run_date: '2026-08-10T05:00:00Z', track_only: true }), T) === '2026-12-10', 'track-only: a stale next_run_date rolls forward to the next occurrence');
assert(nextDue(rule({ frequency: 'weekly', next_run_date: '2026-10-01T05:00:00Z' }), T) === '2026-11-26', 'weekly: rolls forward in 7-day steps (Thu 1 Oct -> Thu 26 Nov)');
assert(nextDue(rule({ frequency: 'yearly', next_run_date: '2025-03-15T05:00:00Z' }), T) === '2027-03-15', 'yearly: rolls forward a year at a time');
assert(nextDue(rule({ next_run_date: '2026-11-24T05:00:00Z' }), T) === T, 'due today counts as today, not next month');
assert(nextDue(rule({ next_run_date: '2026-11-26T23:30:00Z' }), T) === '2026-11-27', 'Bangkok midnight: 23:30 UTC is the next Bangkok day');

// pay windows (Nov period: 20th-25th)
const pw = { pay_start_day: 20, pay_end_day: 25, next_run_date: '2026-12-20T05:00:00Z' };
let o = overview([rule({ description: 'Rent', amount: 8000, ...pw })], [], opts);
let it = o.items[0];
assert(it.next_due === '2026-11-25' && it.days_until === 1 && it.status === 'due_soon' && it.pay_window, 'pay window unpaid: due at the window end');
o = overview([rule({ description: 'Rent', amount: 8000, ...pw, paid_period: '2026-11-01' })], [], opts);
it = o.items[0];
assert(it.status === 'paid' && it.next_due === '2026-12-25' && o.next === null && o.left_this_cycle.count === 0, 'pay window paid: status paid, next is the following window, nothing left this cycle');
o = overview([rule({ description: 'Water', amount: 300, pay_start_day: 1, pay_end_day: 10 })], [], opts);
it = o.items[0];
assert(it.status === 'overdue' && it.days_until === -14 && it.next_due === '2026-11-10', 'pay window passed unpaid: overdue by 14 days');

// cycle boundary: due on the cycle start belongs to the next cycle
o = overview([rule({ description: 'Gym', next_run_date: '2026-12-01T05:00:00Z' })], [], opts);
assert(o.left_this_cycle.count === 0 && o.due_7d.count === 1, 'due on the next cycle start: not left this cycle, but within 7 days');
o = overview([rule({ description: 'Gym', next_run_date: '2026-11-30T05:00:00Z' })], [], { today: T, cycleEnd: '2026-12-25' });
assert(o.left_this_cycle.count === 1 && o.left_this_cycle.total === 100, 'the billing cycle, not the calendar month, decides "left this cycle"');

// price rise -> next_amount; account from the latest payment
o = overview([rule({ description: 'Netflix', amount: 419, next_run_date: '2026-11-27T05:00:00Z' })], [
  { description: 'NETFLIX', amount: 459, date: '2026-10-27', account: { id: 'a1', name: 'KBank', masked: '1234' } },
  { description: 'Netflix', amount: 419, date: '2026-09-27' },
], opts);
it = o.items[0];
assert(it.next_amount === 459 && it.increase && it.account && it.account.masked === '1234' && it.auto === true, 'price rise changes next_amount; account comes from the latest payment');

// header totals, weekly counted per occurrence, sort by next due, inactive and income left out
o = overview([
  rule({ description: 'Netflix', amount: 419, next_run_date: '2026-11-27T05:00:00Z' }),
  rule({ description: 'Coffee club', amount: 50, frequency: 'weekly', next_run_date: '2026-11-25T05:00:00Z' }),
  rule({ description: 'Insurance', amount: 12000, frequency: 'yearly', next_run_date: '2027-02-01T05:00:00Z' }),
  rule({ description: 'Water', amount: 300, pay_start_day: 1, pay_end_day: 10 }),
  rule({ description: 'Paused', amount: 999, is_active: false, next_run_date: '2026-11-25T05:00:00Z' }),
  rule({ description: 'Salary', type: 'income', amount: 50000, next_run_date: '2026-11-25T05:00:00Z' }),
], [], opts);
assert(o.items.map((i) => i.description).join(',') === 'Water,Coffee club,Netflix,Insurance', `sorted by next due, overdue first (got ${o.items.map((i) => i.description)})`);
assert(o.next.description === 'Water' && o.next.status === 'overdue', 'next is the first unpaid item');
// 7 days = 24 Nov to 1 Dec: Water 300 (overdue) + Coffee 50 (25 Nov; 2 Dec is outside) + Netflix 419
assert(o.due_7d.count === 3 && o.due_7d.total === 769, `due in 7 days (got ${JSON.stringify(o.due_7d)})`);
assert(o.left_this_cycle.count === 3 && o.left_this_cycle.total === 769, `left this cycle (got ${JSON.stringify(o.left_this_cycle)})`);
o = overview([rule({ description: 'Coffee club', amount: 50, frequency: 'weekly', next_run_date: '2026-11-25T05:00:00Z' })], [], { today: T, cycleEnd: '2026-12-20' });
assert(o.left_this_cycle.count === 4 && o.left_this_cycle.total === 200, 'a weekly rule counts every occurrence left in the cycle');
assert(o.monthlyTotal === 216.67, 'monthly totals unchanged');

// chat one-liners (bot summary, morning briefing)
o = overview([
  rule({ description: 'Netflix', amount: 419, next_run_date: '2026-11-24T05:00:00Z' }),
  rule({ description: 'Rent', amount: 8000, ...pw, paid_period: '2026-11-01' }),
  rule({ description: 'Gym', amount: 1250.5, next_run_date: '2026-11-28T05:00:00Z' }),
], [], opts);
assert(due7Line(o) === 'Due in 7 days: ฿1,669.5 (2 bills)' && due7Line(overview([], [], opts)) === null, `summary line (got ${due7Line(o)})`);
assert(dueToday(o).join('|') === 'Netflix ฿419', 'briefing: unpaid bills due today only');

process.exit(failures ? 1 : 0);
