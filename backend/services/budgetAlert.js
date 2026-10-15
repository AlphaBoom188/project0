const supabase = require('../config/supabase');
const { getUserPreferences } = require('./userPreferences');
const { pushText } = require('./lineMessagingClient');

function getPeriodStartISO(period) {
  const now = new Date();
  switch (period) {
    case 'daily':
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    case 'weekly': {
      const day = now.getUTCDay();
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day)).toISOString();
    }
    case 'monthly':
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    case 'yearly':
      return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
    default:
      return null;
  }
}

// Checks whether the just-created transaction is the one that pushed its category
// over budget for the current period, and if so pushes a one-time LINE alert (not
// re-sent on every subsequent transaction while still over budget). Called
// fire-and-forget after an insert -- never throws, so it can't affect the response.
async function checkBudgetAndAlert(lineUserId, categoryId, amount) {
  try {
    const { notificationsEnabled } = await getUserPreferences(lineUserId);
    if (!notificationsEnabled) return;

    const { data: category, error: catError } = await supabase
      .from('categories')
      .select('name, budget_amount, budget_period')
      .eq('id', categoryId)
      .single();
    if (catError || !category || !category.budget_amount || !category.budget_period) return;

    const startISO = getPeriodStartISO(category.budget_period);
    if (!startISO) return;

    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('amount')
      .eq('line_user_id', lineUserId)
      .eq('category_id', categoryId)
      .eq('type', 'expense')
      .gte('transaction_date', startISO);
    if (txError) return;

    const total = (transactions || []).reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const budget = parseFloat(category.budget_amount);
    const totalBeforeThisOne = total - parseFloat(amount);

    const justCrossedThreshold = total >= budget && totalBeforeThisOne < budget;
    if (!justCrossedThreshold) return;

    await pushText(
      lineUserId,
      `⚠️ Budget alert: your "${category.name}" ${category.budget_period} budget of ${budget.toFixed(2)} has been reached (${total.toFixed(2)} spent).`
    );
  } catch (error) {
    console.error('Error checking budget alert:', error.message);
  }
}

module.exports = { checkBudgetAndAlert };
