// Savings goals (migration 025). goalStatus is pure: progress against the
// target, and how much to put aside each month to reach it by target_date.
const round2 = (n) => Math.round(n * 100) / 100;

// Saving months left: this month through the target month, where this month
// counts only if the target day hasn't passed it (Nov 20 -> Jun 30 = 8,
// Nov 20 -> Dec 10 = 1). 0 once the date has passed.
function monthsLeft(today, targetDate) {
  if (!targetDate) return null;
  if (targetDate < today) return 0;
  const [ty, tm, td] = today.split('-').map(Number);
  const [gy, gm, gd] = targetDate.split('-').map(Number);
  return Math.max(1, (gy - ty) * 12 + (gm - tm) + (gd >= td ? 1 : 0));
}

function goalStatus(goal, { today, accountBalance = null }) {
  const target = Number(goal.target_amount);
  const saved = round2(goal.account_id && accountBalance != null ? Math.max(0, Number(accountBalance)) : Number(goal.saved_amount || 0));
  const remaining = round2(Math.max(0, target - saved));
  const months = monthsLeft(today, goal.target_date);
  const perMonth = months ? round2(remaining / months) : null;
  return {
    saved,
    remaining,
    pct: target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0,
    achieved: saved >= target,
    monthsLeft: months,
    perMonth: remaining > 0 ? perMonth : 0,
    overdue: !!goal.target_date && goal.target_date < today && saved < target,
    source: goal.account_id && accountBalance != null ? 'account' : 'manual',
  };
}

function validateGoal(body, { partial = false } = {}) {
  const v = {};
  if (!partial || body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return { error: 'Give the goal a name' };
    if (name.length > 100) return { error: 'Name is too long (100 characters max)' };
    v.name = name;
  }
  if (!partial || body.target_amount !== undefined) {
    const n = Number(body.target_amount);
    if (!(n > 0) || n > 1e9) return { error: 'Enter a target amount above 0' };
    v.target_amount = round2(n);
  }
  if (body.target_date !== undefined) {
    if (body.target_date === null || body.target_date === '') v.target_date = null;
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(body.target_date) || Number.isNaN(Date.parse(body.target_date))) return { error: 'target_date must be YYYY-MM-DD' };
    else v.target_date = body.target_date;
  }
  if (body.account_id !== undefined) v.account_id = body.account_id || null;
  if (body.saved_amount !== undefined) {
    const n = Number(body.saved_amount);
    if (!(n >= 0) || n > 1e9) return { error: 'Saved amount must be 0 or more' };
    v.saved_amount = round2(n);
  }
  return { value: v };
}

module.exports = { goalStatus, validateGoal, monthsLeft };
