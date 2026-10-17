const cron = require('node-cron');
const supabase = require('../config/supabase');
const { pushText } = require('../services/lineMessagingClient');
const { getUserPreferences } = require('../services/userPreferences');
const { remindersDueToday } = require('../services/payWindow');

const fmt = (ymdStr) => new Date(`${ymdStr}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function reminderText(rule, reminder) {
  const what = `"${rule.description || 'Recurring payment'}" (${parseFloat(rule.amount).toFixed(2)})`;
  return reminder.kind === 'due'
    ? `Reminder: ${what} is due between ${fmt(reminder.start)} and ${fmt(reminder.end)}. Mark it paid in the app once it's done.`
    : `Overdue: ${what} was due by ${fmt(reminder.end)} and isn't marked paid yet.`;
}

// Pay-window reminders for monthly recurring rules (see services/payWindow.js).
// Auto-logging itself is untouched -- jobs/recurringTransactions.js still logs
// on next_run_date; this only nudges about paying. `lineUserId` scopes a run to
// one user (tests); `now` lets tests pick the day. The cron passes neither.
async function sendPayWindowReminders({ lineUserId, now = new Date() } = {}) {
  let query = supabase
    .from('recurring_transactions')
    .select('*')
    .eq('is_active', true)
    .eq('frequency', 'monthly')
    .or('pay_start_day.not.is.null,pay_end_day.not.is.null');
  if (lineUserId) query = query.eq('line_user_id', lineUserId);

  const { data: rules, error } = await query;
  if (error) {
    console.error('[pay-window] failed to list rules:', error.message);
    return;
  }

  for (const rule of rules || []) {
    try {
      const reminders = remindersDueToday(rule, now);
      if (reminders.length === 0) continue;
      const { notificationsEnabled } = await getUserPreferences(rule.line_user_id);
      if (!notificationsEnabled) continue;
      for (const reminder of reminders) await pushText(rule.line_user_id, reminderText(rule, reminder));
    } catch (err) {
      console.error('[pay-window] failed for rule', rule.id, err.message);
    }
  }
}

function startPayWindowReminderJob() {
  cron.schedule(
    '0 9 * * *',
    () => {
      console.log('[pay-window] running...');
      sendPayWindowReminders().then(() => console.log('[pay-window] done'));
    },
    { timezone: 'Asia/Bangkok' }
  );
  console.log('[pay-window] scheduled for 09:00 Asia/Bangkok');
}

module.exports = { startPayWindowReminderJob, sendPayWindowReminders };
