const supabase = require('../config/supabase');
const { getUserPreferences } = require('./userPreferences');
const { pushText } = require('./lineMessagingClient');

// Event/occasion budgets (migration 012) alert twice: a heads-up at 80% and
// again once the bucket is exceeded. Like category budget alerts
// (budgetAlert.js) this is stateless -- an alert fires when THIS expense moves
// the bucket's total across a threshold, so there's nothing to store and no
// re-alerting on later expenses while still above it.
const WARN_RATIO = 0.8;

// UTC month bounds, matching how budgetEventController.withSpent() computes
// the "spent" shown on the progress bar, so alerts and the bar always agree.
function monthOf(transactionDateISO) {
  const d = new Date(transactionDateISO);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return { periodMonth: start.toISOString().slice(0, 10), startISO: start.toISOString(), endISO: end.toISOString() };
}

// Pure check, no delivery (same split as evaluateBudgetAlert). Returns one
// alert per bucket that this expense pushed across a line -- only the highest
// line crossed, so a single expense jumping from 50% to 120% says "over", not
// both "80%" and "over".
async function evaluateEventBudgetAlerts(lineUserId, categoryId, amount, transactionDateISO) {
  const { periodMonth, startISO, endISO } = monthOf(transactionDateISO);

  const { data: events, error: eventsError } = await supabase
    .from('budget_events')
    .select('id, title, amount')
    .eq('line_user_id', lineUserId)
    .eq('category_id', categoryId)
    .eq('period_month', periodMonth);
  if (eventsError || !events || events.length === 0) return [];

  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('amount')
    .eq('line_user_id', lineUserId)
    .eq('category_id', categoryId)
    .eq('type', 'expense')
    .gte('transaction_date', startISO)
    .lt('transaction_date', endISO);
  if (txError) return [];

  const spent = (transactions || []).reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const before = spent - parseFloat(amount);

  const alerts = [];
  for (const event of events) {
    const limit = parseFloat(event.amount);
    const crossed = (line) => before < line && spent >= line;
    // Reaching exactly 100% counts as used up, matching the bar turning red at >= 100%.
    if (crossed(limit)) alerts.push({ level: 'over', title: event.title, budgetAmount: limit, totalSpent: spent });
    else if (crossed(limit * WARN_RATIO)) alerts.push({ level: 'warning', title: event.title, budgetAmount: limit, totalSpent: spent });
  }
  // `message` is the one source of the wording -- the LIFF banner shows it as-is.
  return alerts.map((alert) => ({ ...alert, message: eventAlertText(alert) }));
}

function eventAlertText(alert) {
  return alert.level === 'over'
    ? `Event budget "${alert.title}" is used up: ${alert.totalSpent.toFixed(2)} of ${alert.budgetAmount.toFixed(2)} spent.`
    : `Heads-up: you've used ${Math.round((alert.totalSpent / alert.budgetAmount) * 100)}% of event budget "${alert.title}" (${alert.totalSpent.toFixed(2)} of ${alert.budgetAmount.toFixed(2)}).`;
}

// Delivery for every non-LIFF channel -- fire-and-forget, never throws, and
// respects notifications_enabled, same as pushBudgetAlertIfEnabled.
async function pushEventBudgetAlertsIfEnabled(lineUserId, alerts) {
  try {
    const { notificationsEnabled } = await getUserPreferences(lineUserId);
    if (!notificationsEnabled) return;
    for (const alert of alerts) {
      await pushText(lineUserId, `${alert.level === 'over' ? '⚠️ ' : ''}${alert.message}`);
    }
  } catch (error) {
    console.error('Error pushing event budget alert:', error.message);
  }
}

module.exports = { evaluateEventBudgetAlerts, pushEventBudgetAlertsIfEnabled };
