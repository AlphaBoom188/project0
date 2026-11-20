// Monthly money report. buildReport is pure; loadReport gathers one billing
// cycle (the user's budget period, Bangkok midnights) and the cycle before
// it. Used by GET /api/reports/:u/monthly, the cycle-start push
// (jobs/monthlyReport.js) and the "report" chat command.
const supabase = require('../config/supabase');
const { bangkokParts, bangkokMidnight, getBangkokYmd } = require('./bangkokDay');

const DAY = 86400000;
const round2 = (n) => Math.round(n * 100) / 100;
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The billing cycle `offset` cycles from the current one (-1 = the last
// complete cycle). -> { start, end } (Date, [start, end))
function cycleRange(startDay, offset = 0, now = new Date()) {
  const day = startDay || 1;
  const { year } = bangkokParts(now);
  let { month } = bangkokParts(now);
  if (bangkokMidnight(year, month, day) > now) month -= 1;
  month += offset;
  return { start: bangkokMidnight(year, month, day), end: bangkokMidnight(year, month + 1, day) };
}

function cycleLabel(start, end) {
  const a = bangkokParts(start);
  const b = bangkokParts(new Date(end.getTime() - DAY));
  if (a.day === 1) return `${MO[a.month]} ${a.year}`;
  return `${a.day} ${MO[a.month]} - ${b.day} ${MO[b.month]} ${b.year}`;
}

// A category budget in this cycle's terms (monthly as-is; daily/weekly by days; yearly / 12).
function cycleBudget(category, days) {
  const amt = Number(category.budget_amount);
  if (!(amt > 0) || !category.budget_period) return null;
  return round2({ daily: amt * days, weekly: (amt * days) / 7, monthly: amt, yearly: amt / 12 }[category.budget_period] ?? amt);
}

// txns / prevTxns: [{ id, type, amount, description, category_id, transaction_date }]
// categories: [{ id, name, type, budget_amount, budget_period }]
function buildReport({ start, end, txns = [], prevTxns = [], categories = [] }) {
  const days = Math.round((end - start) / DAY);
  const sum = (rows, type) => round2(rows.filter((t) => t.type === type).reduce((s, t) => s + Number(t.amount), 0));
  const income = sum(txns, 'income');
  const expense = sum(txns, 'expense');
  const prevIncome = sum(prevTxns, 'income');
  const prevExpense = sum(prevTxns, 'expense');
  const byCat = (rows) => {
    const m = new Map();
    rows.filter((t) => t.type === 'expense').forEach((t) => m.set(t.category_id || null, (m.get(t.category_id || null) || 0) + Number(t.amount)));
    return m;
  };
  const now = byCat(txns);
  const before = byCat(prevTxns);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const ids = new Set([...now.keys(), ...categories.filter((c) => c.type === 'expense' && cycleBudget(c, days) != null).map((c) => c.id)]);
  const rows = [...ids].map((id) => {
    const spent = round2(now.get(id) || 0);
    const prev = round2(before.get(id) || 0);
    const budget = catById.has(id) ? cycleBudget(catById.get(id), days) : null;
    return { categoryId: id, name: catName.get(id) || 'Uncategorized', spent, prev, change: round2(spent - prev), budget, pct: budget ? Math.round((spent / budget) * 100) : null };
  }).filter((r) => r.spent > 0 || r.budget != null).sort((a, b) => b.spent - a.spent);
  const changes = rows.filter((r) => r.prev > 0 || r.spent > 0).filter((r) => Math.abs(r.change) >= Math.max(200, r.prev * 0.2))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 3);
  const biggest = txns.filter((t) => t.type === 'expense').sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 3)
    .map((t) => ({ id: t.id, description: t.description || catName.get(t.category_id) || 'Expense', amount: round2(Number(t.amount)), date: getBangkokYmd(new Date(t.transaction_date)), category: catName.get(t.category_id) || null }));
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    label: cycleLabel(start, end),
    days,
    count: txns.length,
    income,
    expense,
    net: round2(income - expense),
    savingsRate: income > 0 ? Math.round(((income - expense) / income) * 100) : null,
    prev: { income: prevIncome, expense: prevExpense, count: prevTxns.length },
    expenseChangePct: prevExpense > 0 ? Math.round(((expense - prevExpense) / prevExpense) * 100) : null,
    categories: rows,
    overBudget: rows.filter((r) => r.pct != null && r.pct > 100).map((r) => r.name),
    changes,
    biggest,
  };
}

async function loadReport(lineUserId, { offset = -1, now = new Date() } = {}) {
  const { data: user, error } = await supabase.from('users').select('billing_cycle_start_day').eq('line_user_id', lineUserId).maybeSingle();
  if (error) throw error;
  const cur = cycleRange(user && user.billing_cycle_start_day, offset, now);
  const prev = cycleRange(user && user.billing_cycle_start_day, offset - 1, now);
  const cols = 'id, type, amount, description, category_id, transaction_date';
  const [a, b, c] = await Promise.all([
    supabase.from('transactions').select(cols).eq('line_user_id', lineUserId).in('type', ['income', 'expense']).gte('transaction_date', cur.start.toISOString()).lt('transaction_date', cur.end.toISOString()).limit(10000),
    supabase.from('transactions').select(cols).eq('line_user_id', lineUserId).in('type', ['income', 'expense']).gte('transaction_date', prev.start.toISOString()).lt('transaction_date', prev.end.toISOString()).limit(10000),
    supabase.from('categories').select('id, name, type, budget_amount, budget_period').eq('line_user_id', lineUserId),
  ]);
  for (const r of [a, b, c]) if (r.error) throw r.error;
  return buildReport({ start: cur.start, end: cur.end, txns: a.data, prevTxns: b.data, categories: c.data });
}

const baht = (n) => `฿${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

// Plain-text version for chat.
function reportText(r) {
  if (!r.count) return `${r.label}: nothing was logged in that period.`;
  const lines = [`${r.label}`, `Income ${baht(r.income)} · Spent ${baht(r.expense)} · ${r.net >= 0 ? 'Saved' : 'Over by'} ${baht(Math.abs(r.net))}${r.savingsRate != null ? ` (${r.savingsRate}%)` : ''}`];
  if (r.expenseChangePct != null) lines.push(`Spending ${r.expenseChangePct >= 0 ? 'up' : 'down'} ${Math.abs(r.expenseChangePct)}% on the period before.`);
  const top = r.categories.filter((c) => c.spent > 0).slice(0, 5);
  if (top.length) lines.push('', 'Where it went', ...top.map((c) => `- ${c.name} ${baht(c.spent)}${c.pct != null ? ` (${c.pct}% of budget)` : ''}`));
  if (r.overBudget.length) lines.push('', `Over budget: ${r.overBudget.join(', ')}`);
  return lines.join('\n');
}

module.exports = { buildReport, loadReport, reportText, cycleRange, cycleBudget };
