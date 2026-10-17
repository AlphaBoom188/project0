const cron = require('node-cron');
const supabase = require('../config/supabase');
const { pushText } = require('../services/lineMessagingClient');
const { getBangkokDayRangeISO } = require('../services/bangkokDay');

// "Today" is the Bangkok calendar day. It used to be the UTC day, which at the
// 21:00 Bangkok run spans 07:00 today -> 07:00 tomorrow, so anything logged
// between midnight and 7am Bangkok time was missing from that evening's digest.
// `lineUserId` scopes a run to one user (tests); the cron passes nothing.
async function sendDailyDigest({ lineUserId } = {}) {
  let usersQuery = supabase.from('users').select('line_user_id').eq('notifications_enabled', true);
  if (lineUserId) usersQuery = usersQuery.eq('line_user_id', lineUserId);
  const { data: users, error } = await usersQuery;
  if (error) {
    console.error('[daily-digest] failed to list users:', error.message);
    return;
  }

  const { startISO, endISO } = getBangkokDayRangeISO();

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
