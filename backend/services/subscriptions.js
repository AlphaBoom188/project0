// Subscriptions and bills overview (pure): the user's active expense
// recurring rules as monthly and yearly totals, price rises spotted in the
// latest matching transactions, and what's due next (Bangkok calendar dates,
// 'YYYY-MM-DD' strings, which compare correctly as plain strings).
const { normalizeDescription } = require('./recurringDetect');
const { getBangkokYmd } = require('./bangkokDay');
const { hasPayWindow, periodFor, payStatus } = require('./payWindow');

const round2 = (n) => Math.round(n * 100) / 100;
const PER_MONTH = { daily: 30.44, weekly: 52 / 12, monthly: 1, yearly: 1 / 12 };
const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const toMs = (ymd) => Date.parse(`${ymd}T00:00:00Z`);
const addDays = (ymd, n) => new Date(toMs(ymd) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY);
const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); // m 0-based

// The n-th occurrence after `anchor` (n >= 0). Monthly/yearly keep the anchor's
// day, clamped to short months (31 Jan -> 28 Feb -> 31 Mar).
function step(anchor, frequency, n) {
  if (frequency === 'daily') return addDays(anchor, n);
  if (frequency === 'weekly') return addDays(anchor, 7 * n);
  const [y, m, d] = anchor.split('-').map(Number);
  const months = frequency === 'yearly' ? 12 * n : n;
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  const ty = t.getUTCFullYear();
  const tm = t.getUTCMonth();
  return `${ty}-${pad(tm + 1)}-${pad(Math.min(d, daysInMonth(ty, tm)))}`;
}

// Dates in [from, until) on which the rule is due, at most `max`.
// Pay-window rules: each unpaid period's window end. Others: next_run_date
// rolled forward to today or later (track-only rules never advance it).
function dueDates(rule, today, until, max = 400) {
  const out = [];
  if (hasPayWindow(rule)) {
    const cur = payStatus(rule, new Date(`${today}T05:00:00Z`)); // 12:00 Bangkok on `today`
    const [y, m] = cur.period.split('-').map(Number);
    for (let i = cur.paid ? 1 : 0; out.length < max; i += 1) {
      const p = periodFor(rule, y, m - 1 + i);
      if (p.end >= until) break;
      out.push(p.end);
    }
    return out;
  }
  const anchor = getBangkokYmd(new Date(rule.next_run_date || `${today}T05:00:00Z`));
  let n = 0;
  if (anchor < today) {
    // jump close to today, then walk
    const per = { daily: 1, weekly: 7, monthly: 31, yearly: 366 }[rule.frequency] || 31; // never overshoots
    n = Math.floor(daysBetween(anchor, today) / per);
    while (step(anchor, rule.frequency, n) < today) n += 1;
  }
  for (let d = step(anchor, rule.frequency, n); d < until && out.length < max; d = step(anchor, rule.frequency, ++n)) out.push(d);
  return out;
}

// The next due date: an unpaid pay-window end (possibly past = overdue), or
// the next occurrence on or after today.
function nextDue(rule, today) {
  return dueDates(rule, today, '9999-12-31', 1)[0] || null;
}

const statusFor = (paid, days) => (paid ? 'paid' : days < 0 ? 'overdue' : days <= 3 ? 'due_soon' : 'upcoming');

// rules: [{ id, description, amount, frequency, type, is_active, track_only, next_run_date,
//           pay_start_day, pay_end_day, paid_period, categories: { name } }]
// transactions: [{ description, amount, date, account?: { id, name, masked } }]
// opts: { today: 'YYYY-MM-DD' (Bangkok), cycleEnd: 'YYYY-MM-DD' (next billing-cycle start) }
function overview(rules, transactions = [], opts = {}) {
  const today = opts.today || getBangkokYmd(new Date());
  const cycleEnd = opts.cycleEnd || step(`${today.slice(0, 7)}-01`, 'monthly', 1);
  const week = addDays(today, 8); // today + the next 7 days
  const due7 = { count: 0, total: 0 };
  const left = { count: 0, total: 0 };

  const items = rules.filter((r) => r.type === 'expense' && r.is_active !== false).map((r) => {
    const amount = Number(r.amount);
    const monthly = round2(amount * (PER_MONTH[r.frequency] || 1));
    const key = normalizeDescription(r.description);
    const matches = key ? transactions.filter((t) => normalizeDescription(t.description) === key).sort((a, b) => (a.date < b.date ? 1 : -1)) : [];
    const latest = matches[0];
    const increase = latest && Number(latest.amount) > amount * 1.03 ? { from: amount, to: round2(Number(latest.amount)), date: latest.date } : null;
    const nextAmount = increase ? increase.to : amount;
    const withAccount = matches.find((t) => t.account);

    const ps = hasPayWindow(r) ? payStatus(r, new Date(`${today}T05:00:00Z`)) : null;
    const paid = !!(ps && ps.paid);
    const next = nextDue(r, today);
    const days = next ? daysBetween(today, next) : null;
    // Unpaid occurrences counted in the header (overdue ones included: still owed).
    const upTo = (until) => dueDates(r, today, until).filter((d) => d < until).length;
    const n7 = upTo(week);
    const nCycle = upTo(cycleEnd);
    due7.count += n7; due7.total += n7 * nextAmount;
    left.count += nCycle; left.total += nCycle * nextAmount;

    return {
      id: r.id,
      tracked: r.track_only === true,
      auto: r.track_only !== true,
      description: r.description || (r.categories && r.categories.name) || 'Recurring',
      category: r.categories ? r.categories.name : null,
      amount, frequency: r.frequency, monthly, yearly: round2(monthly * 12), increase,
      next_amount: nextAmount,
      next_due: next,
      days_until: days,
      status: statusFor(paid, days),
      pay_window: !!ps,
      account: withAccount ? withAccount.account : null,
    };
  }).sort((a, b) => (a.next_due || '9999').localeCompare(b.next_due || '9999') || b.monthly - a.monthly);

  const monthlyTotal = round2(items.reduce((s, i) => s + i.monthly, 0));
  const nextItem = items.find((i) => i.status !== 'paid' && i.next_due) || null;
  return {
    items, monthlyTotal, yearlyTotal: round2(monthlyTotal * 12), increases: items.filter((i) => i.increase).length,
    today, cycleEnd,
    next: nextItem && { id: nextItem.id, description: nextItem.description, amount: nextItem.next_amount, next_due: nextItem.next_due, days_until: nextItem.days_until, status: nextItem.status },
    due_7d: { count: due7.count, total: round2(due7.total) },
    left_this_cycle: { count: left.count, total: round2(left.total) },
  };
}

// Loads one user's rules, recent expenses, accounts and billing cycle, and
// returns overview(). Used by GET /api/recurring/:u/overview, the bot
// "summary" reply and the morning briefing. (DB required lazily so the math
// above stays usable without it.)
async function loadOverview(lineUserId, now = new Date()) {
  const supabase = require('../config/supabase');
  const { cycleRange } = require('./monthlyReport');
  const since = new Date(now.getTime() - 100 * DAY).toISOString();
  const [rules, tx, accounts, user] = await Promise.all([
    supabase.from('recurring_transactions').select('*, categories ( name )').eq('line_user_id', lineUserId), // '*': track_only exists only after migration 026
    supabase.from('transactions').select('description, amount, transaction_date, from_account_id').eq('line_user_id', lineUserId).eq('type', 'expense').gte('transaction_date', since).limit(5000),
    supabase.from('accounts').select('id, account_name, account_number_masked').eq('line_user_id', lineUserId),
    supabase.from('users').select('billing_cycle_start_day').eq('line_user_id', lineUserId).maybeSingle(),
  ]);
  for (const r of [rules, tx, accounts, user]) if (r.error) throw r.error;
  const byId = new Map(accounts.data.map((a) => [a.id, { id: a.id, name: a.account_name, masked: a.account_number_masked || null }]));
  const cycleEnd = getBangkokYmd(cycleRange(user.data && user.data.billing_cycle_start_day, 0, now).end);
  const txns = tx.data.map((t) => ({ description: t.description, amount: Number(t.amount), date: getBangkokYmd(new Date(t.transaction_date)), account: byId.get(t.from_account_id) || null }));
  return overview(rules.data, txns, { today: getBangkokYmd(now), cycleEnd });
}

// One-liners for chat: "Due in 7 days: ฿1,250 (3 bills)" / bills due today.
const baht = (n) => `฿${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
function due7Line(o) {
  if (!o || !o.due_7d.count) return null;
  return `Due in 7 days: ${baht(o.due_7d.total)} (${o.due_7d.count} ${o.due_7d.count === 1 ? 'bill' : 'bills'})`;
}
function dueToday(o) {
  return o ? o.items.filter((i) => i.days_until === 0 && i.status !== 'paid').map((i) => `${i.description} ${baht(i.next_amount)}`) : [];
}

module.exports = { overview, dueDates, nextDue, step, loadOverview, due7Line, dueToday };
