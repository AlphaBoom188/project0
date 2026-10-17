const cron = require('node-cron');
const supabase = require('../config/supabase');
const { createTransaction } = require('../services/transactionCreate');
const { getUserPreferences } = require('../services/userPreferences');
const { pushText } = require('../services/lineMessagingClient');

function computeNextRunDate(fromISO, frequency) {
  const date = new Date(fromISO);
  switch (frequency) {
    case 'daily':
      date.setUTCDate(date.getUTCDate() + 1);
      break;
    case 'weekly':
      date.setUTCDate(date.getUTCDate() + 7);
      break;
    case 'monthly':
      date.setUTCMonth(date.getUTCMonth() + 1);
      break;
    case 'yearly':
      date.setUTCFullYear(date.getUTCFullYear() + 1);
      break;
  }
  return date.toISOString();
}

// `lineUserId` scopes a run to one user -- used by tests so a test run can never
// fire real users' due rules early. The cron calls it with no argument (all users).
async function processDueRecurringTransactions({ lineUserId } = {}) {
  const nowISO = new Date().toISOString();

  let query = supabase
    .from('recurring_transactions')
    .select('*')
    .eq('is_active', true)
    .lte('next_run_date', nowISO);
  if (lineUserId) query = query.eq('line_user_id', lineUserId);

  const { data: dueRules, error } = await query;

  if (error) {
    console.error('[recurring] failed to list due rules:', error.message);
    return;
  }

  for (const rule of dueRules || []) {
    try {
      await createTransaction({
        lineUserId: rule.line_user_id,
        categoryId: rule.category_id,
        amount: rule.amount,
        type: rule.type,
        description: rule.description,
        transactionDate: rule.next_run_date,
        channel: 'system',
      });

      await supabase
        .from('recurring_transactions')
        .update({ next_run_date: computeNextRunDate(rule.next_run_date, rule.frequency) })
        .eq('id', rule.id);

      const { notificationsEnabled } = await getUserPreferences(rule.line_user_id);
      if (notificationsEnabled) {
        const kind = rule.type === 'expense' ? 'expense' : 'income';
        await pushText(
          rule.line_user_id,
          `🔁 Recurring ${kind} logged: ${rule.amount} — ${rule.description || '(no description)'}.`
        );
      }
    } catch (err) {
      // One rule failing (e.g. a transient DB error) shouldn't block the rest --
      // it stays due and gets retried on the next tick since next_run_date was
      // never advanced.
      console.error('[recurring] failed to process rule', rule.id, err.message);
    }
  }
}

function startRecurringTransactionsJob() {
  cron.schedule(
    '5 0 * * *',
    () => {
      console.log('[recurring] running...');
      processDueRecurringTransactions().then(() => console.log('[recurring] done'));
    },
    { timezone: 'Asia/Bangkok' }
  );
  console.log('[recurring] scheduled for 00:05 Asia/Bangkok');
}

module.exports = { startRecurringTransactionsJob, processDueRecurringTransactions };
