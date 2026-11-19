const cron = require('node-cron');
const { getBangkokYmd } = require('../services/bangkokDay');
const { runOnce } = require('../services/opsAgent');
const supabase = require('../config/supabase');
const { digestMessages, pushToGroup } = require('../services/groupBillNotify');

const MIN_AGE_MS = 20 * 60 * 60 * 1000; // a bill posted this afternoon isn't nagged about tonight

// 19:00 Bangkok: "Don't forget to pay" in every active group that has an open
// bill at least 20 hours old with someone still unpaid. One push per group
// (each push counts once per group member against the LINE message quota).
// GROUP_REMINDERS=off disables it. `groupId` scopes a run to one group (tests);
// the cron passes nothing.
async function sendGroupBillReminders({ groupId, now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - MIN_AGE_MS).toISOString();
  let query = supabase.from('group_expenses').select('group_id, line_groups!inner ( is_active )')
    .eq('kind', 'expense').eq('status', 'open').lte('created_at', cutoff).eq('line_groups.is_active', true);
  if (groupId) query = query.eq('group_id', groupId);
  const { data, error } = await query;
  if (error) {
    console.error('job: group bill reminders failed to list bills:', error.message);
    return { groups: 0 };
  }
  let sent = 0;
  for (const id of [...new Set(data.map((r) => r.group_id))]) {
    try {
      const messages = await digestMessages(id);
      if (messages && (await pushToGroup(id, messages))) sent += 1;
    } catch (err) {
      console.error(`[group-reminders] failed for a group: ${err.message}`);
    }
  }
  return { groups: sent };
}

function startGroupBillReminderJob() {
  if (process.env.GROUP_REMINDERS === 'off') {
    console.log('[group-reminders] off (GROUP_REMINDERS=off)');
    return;
  }
  cron.schedule(
    '0 19 * * *',
    () => {
      console.log('[group-reminders] running...');
      runOnce('groupBillReminders', getBangkokYmd(), () => sendGroupBillReminders()).then(() => console.log('[group-reminders] done'));
    },
    { timezone: 'Asia/Bangkok' }
  );
  console.log('[group-reminders] scheduled for 19:00 Asia/Bangkok');
}

module.exports = { startGroupBillReminderJob, sendGroupBillReminders };
