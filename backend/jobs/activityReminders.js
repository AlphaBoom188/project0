const cron = require('node-cron');
const supabase = require('../config/supabase');
const { pushText } = require('../services/lineMessagingClient');

// Asia/Bangkok has no DST, so this fixed +7h offset is always correct for
// computing "today" in the user's local calendar day -- unlike dailyDigest.js's
// UTC day boundary (a pre-existing, unrelated quirk left as-is here), this job
// needs the actual Bangkok day since "haven't logged anything today" would
// otherwise flip 7 hours early/late.
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

function getBangkokTodayStartISO() {
  const now = new Date();
  const bangkokNow = new Date(now.getTime() + BANGKOK_OFFSET_MS);
  const startOfBangkokDayUTC = new Date(Date.UTC(bangkokNow.getUTCFullYear(), bangkokNow.getUTCMonth(), bangkokNow.getUTCDate()));
  return new Date(startOfBangkokDayUTC.getTime() - BANGKOK_OFFSET_MS).toISOString();
}

// Activity detection: only nudges users who haven't recorded anything yet
// today. This is the only reminder channel that actually exists -- there's no
// way to push a notification into a closed/backgrounded LIFF web page, so
// "channel-aware routing" for an unprompted reminder (as opposed to a
// response to a live request, see transactionCreate.js) can only ever mean
// "send it via LINE." Intentionally not pretending otherwise.
async function sendActivityReminder() {
  const { data: users, error } = await supabase.from('users').select('line_user_id').eq('notifications_enabled', true);
  if (error) {
    console.error('[activity-reminder] failed to list users:', error.message);
    return;
  }

  const todayStartISO = getBangkokTodayStartISO();

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
