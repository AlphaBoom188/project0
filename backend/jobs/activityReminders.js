const cron = require('node-cron');
const supabase = require('../config/supabase');
const { pushText } = require('../services/lineMessagingClient');
const { getBangkokDayRangeISO } = require('../services/bangkokDay');

// Activity detection: only nudges users who haven't recorded anything yet
// today. This is the only reminder channel that actually exists -- there's no
// way to push a notification into a closed/backgrounded LIFF web page, so
// "channel-aware routing" for an unprompted reminder (as opposed to a
// response to a live request, see transactionCreate.js) can only ever mean
// "send it via LINE." Intentionally not pretending otherwise.
// `lineUserId` scopes a run to one user (tests); the cron passes nothing.
async function sendActivityReminder({ lineUserId } = {}) {
  let usersQuery = supabase.from('users').select('line_user_id').eq('notifications_enabled', true);
  if (lineUserId) usersQuery = usersQuery.eq('line_user_id', lineUserId);
  const { data: users, error } = await usersQuery;
  if (error) {
    console.error('[activity-reminder] failed to list users:', error.message);
    return;
  }

  const { startISO: todayStartISO } = getBangkokDayRangeISO();

  for (const user of users || []) {
    try {
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('id')
        .eq('line_user_id', user.line_user_id)
        .gte('transaction_date', todayStartISO)
        .limit(1);
      if (txError) throw txError;

      if (transactions && transactions.length > 0) continue;

      await pushText(user.line_user_id, "You haven't logged anything yet today. Got a coffee, lunch, or fare to add?");
    } catch (err) {
      console.error('[activity-reminder] failed for user', user.line_user_id, err.message);
    }
  }
}

function startActivityReminderJob() {
  const schedule = (cronExpr, label) =>
    cron.schedule(
      cronExpr,
      () => {
        console.log(`[activity-reminder] running (${label})...`);
        sendActivityReminder().then(() => console.log(`[activity-reminder] done (${label})`));
      },
      { timezone: 'Asia/Bangkok' }
    );

  schedule('0 12 * * *', 'afternoon');
  schedule('0 20 * * *', 'evening');
  console.log('[activity-reminder] scheduled for 12:00 and 20:00 Asia/Bangkok');
}

module.exports = { startActivityReminderJob, sendActivityReminder };
