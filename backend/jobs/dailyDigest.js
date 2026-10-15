const cron = require('node-cron');
const supabase = require('../config/supabase');
const { pushText } = require('../services/lineMessagingClient');

function getTodayRangeISO() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

async function sendDailyDigest() {
  const { data: users, error } = await supabase.from('users').select('line_user_id').eq('notifications_enabled', true);
  if (error) {
    console.error('[daily-digest] failed to list users:', error.message);
    return;
  }

  const { startISO, endISO } = getTodayRangeISO();

  for (const user of users || []) {
    try {
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('amount, type')
        .eq('line_user_id', user.line_user_id)
        .gte('transaction_date', startISO)
        .lt('transaction_date', endISO);
      if (txError) throw txError;

      // Skip users with no activity today rather than pushing an all-zero summary daily.
      if (!transactions || transactions.length === 0) continue;

      const totals = transactions.reduce(
        (acc, t) => {
          acc[t.type] += parseFloat(t.amount);
          return acc;
        },
        { income: 0, expense: 0 }
      );
      const net = totals.income - totals.expense;

      await pushText(
        user.line_user_id,
        `Today's summary:\nIncome: ${totals.income.toFixed(2)}\nExpense: ${totals.expense.toFixed(2)}\nNet: ${net.toFixed(2)}`
      );
    } catch (err) {
      console.error('[daily-digest] failed for user', user.line_user_id, err.message);
    }
  }
}

function startDailyDigestJob() {
  cron.schedule(
    '0 21 * * *',
    () => {
      console.log('[daily-digest] running...');
      sendDailyDigest().then(() => console.log('[daily-digest] done'));
    },
    { timezone: 'Asia/Bangkok' }
  );
  console.log('[daily-digest] scheduled for 21:00 Asia/Bangkok');
}

module.exports = { startDailyDigestJob, sendDailyDigest };
