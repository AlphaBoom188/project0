// Subscriptions and bills overview (pure): the user's active expense
// recurring rules as monthly and yearly totals, with price rises spotted in
// the latest matching transactions.
const { normalizeDescription } = require('./recurringDetect');

const round2 = (n) => Math.round(n * 100) / 100;
const PER_MONTH = { daily: 30.44, weekly: 52 / 12, monthly: 1, yearly: 1 / 12 };

// rules: [{ id, description, amount, frequency, type, is_active, categories: { name } }]
// transactions: [{ description, amount, date }] (expenses, newest first or any order)
function overview(rules, transactions = []) {
  const items = rules.filter((r) => r.type === 'expense' && r.is_active !== false).map((r) => {
    const amount = Number(r.amount);
    const monthly = round2(amount * (PER_MONTH[r.frequency] || 1));
    const key = normalizeDescription(r.description);
    const matches = key ? transactions.filter((t) => normalizeDescription(t.description) === key).sort((a, b) => (a.date < b.date ? 1 : -1)) : [];
    const latest = matches[0];
    const increase = latest && Number(latest.amount) > amount * 1.03 ? { from: amount, to: round2(Number(latest.amount)), date: latest.date } : null;
    return { id: r.id, description: r.description || (r.categories && r.categories.name) || 'Recurring', category: r.categories ? r.categories.name : null, amount, frequency: r.frequency, monthly, yearly: round2(monthly * 12), increase };
  }).sort((a, b) => b.monthly - a.monthly);
  const monthlyTotal = round2(items.reduce((s, i) => s + i.monthly, 0));
  return { items, monthlyTotal, yearlyTotal: round2(monthlyTotal * 12), increases: items.filter((i) => i.increase).length };
}

module.exports = { overview };
