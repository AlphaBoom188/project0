const cron = require('node-cron');
const store = require('../services/reminderStore');
const notify = require('../services/reminderNotify');
const { afterFire, pushKind } = require('../services/reminderMath');

// Every minute: push each reminder whose next_fire_at has come. The row is
// advanced first (store.claim, optimistic on next_fire_at), so two server
// instances never push the same one twice and a failed push isn't retried
// in a loop. Reminders are what the user asked for, so they're sent even
// when the daily-digest/nudge notifications are turned off.
// `scope` ({ lineUserId } or { ids }) narrows a run for tests; the cron
// passes nothing.
async function dispatchDueReminders({ now = new Date(), ...scope } = {}) {
  let due;
  try {
    due = await store.dueReminders(now, scope);
  } catch (error) {
    console.error('job: reminders failed to list due reminders:', error.message);
    return { sent: 0 };
  }
  let sent = 0;
  for (const r of due) {
    try {
      const kind = pushKind(r, now);
      const claimed = await store.claim(r, afterFire(r, now));
      if (!claimed) continue; // another instance took it, or it was edited meanwhile
      await notify.push(r, kind);
      sent += 1;
    } catch (error) {
      // LINE refuses pushes to people who blocked the OA, and to groups the bot left.
      console.warn(`[reminders] push failed (${error.message})`);
    }
  }
  return { sent, due: due.length };
}

let running = false;
function startReminderDispatchJob() {
  cron.schedule('* * * * *', async () => {
    if (running) return; // a slow run never overlaps the next minute's
    running = true;
    try {
      await dispatchDueReminders();
    } finally {
      running = false;
    }
  }, { timezone: 'Asia/Bangkok' });
  console.log('[reminders] dispatch scheduled every minute');
}

module.exports = { startReminderDispatchJob, dispatchDueReminders };
