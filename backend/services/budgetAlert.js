const supabase = require('../config/supabase');
const { getUserPreferences } = require('./userPreferences');
const { pushText } = require('./lineMessagingClient');
const { bangkokParts, bangkokMidnight } = require('./bangkokDay');

// Budget periods start at Bangkok midnight (weeks on Sunday), not UTC midnight --
// otherwise a "daily" budget would reset at 07:00 and spending between midnight
// and 7am would count toward the previous day/month.
function getPeriodStartISO(period, now = new Date()) {
  const { year, month, day, weekday } = bangkokParts(now);
  switch (period) {
    case 'daily':
      return bangkokMidnight(year, month, day).toISOString();
    case 'weekly':
      return bangkokMidnight(year, month, day - weekday).toISOString();
    case 'monthly':
      return bangkokMidnight(year, month, 1).toISOString();
    case 'yearly':
      return bangkokMidnight(year, 0, 1).toISOString();
    default:
      return null;
  }
}

// Pure check, no delivery: does the just-created transaction push its category
// over budget for the current period, for the first time (not re-flagged on
// every subsequent transaction while still over budget)? Split out from
// delivery so the caller can decide HOW to surface it -- a LINE push for the
// bot/webhook channel (the only way to reach someone who isn't looking at a
// screen), or an immediate in-app banner for the LIFF channel, built from this
// same result, with no server push at all (see transactionCreate.js).
async function evaluateBudgetAlert(lineUserId, categoryId, amount) {
  const { data: category, error: catError } = await supabase
    .from('categories')
    .select('name, budget_amount, budget_period')
    .eq('id', categoryId)
    .single();
  if (catError || !category || !category.budget_amount || !category.budget_period) return null;

  const startISO = getPeriodStartISO(category.budget_period);
  if (!startISO) return null;

  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('amount')
    .eq('line_user_id', lineUserId)
    .eq('category_id', categoryId)
    .eq('type', 'expense')
    .gte('transaction_date', startISO);
  if (txError) return null;

  const totalSpent = (transactions || []).reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const budgetAmount = parseFloat(category.budget_amount);
  const totalBeforeThisOne = totalSpent - parseFloat(amount);

  const justCrossedThreshold = totalSpent >= budgetAmount && totalBeforeThisOne < budgetAmount;
  if (!justCrossedThreshold) return null;

  return { categoryName: category.name, budgetPeriod: category.budget_period, budgetAmount, totalSpent };
}

// Delivery for the bot/webhook channel -- fire-and-forget, never throws, and
// respects notifications_enabled (a LINE push is an interruption; the LIFF
// in-app banner this skips for is not, so that path never checks this).
async function pushBudgetAlertIfEnabled(lineUserId, alert) {
  try {
    const { notificationsEnabled } = await getUserPreferences(lineUserId);
    if (!notificationsEnabled) return;

    await pushText(
      lineUserId,
      `⚠️ Budget alert: your "${alert.categoryName}" ${alert.budgetPeriod} budget of ${alert.budgetAmount.toFixed(2)} has been reached (${alert.totalSpent.toFixed(2)} spent).`
    );
  } catch (error) {
    console.error('Error pushing budget alert:', error.message);
  }
}

module.exports = { evaluateBudgetAlert, pushBudgetAlertIfEnabled, getPeriodStartISO };
