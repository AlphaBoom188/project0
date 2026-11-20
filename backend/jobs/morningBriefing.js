const cron = require('node-cron');
const supabase = require('../config/supabase');
const { getBangkokYmd } = require('../services/bangkokDay');
const { runOnce } = require('../services/opsAgent');
const { loadBriefing } = require('../services/briefing');
const { pushMessages } = require('../services/lineMessagingClient');

// 07:30 Bangkok: the morning briefing for users who turned it on (Settings,
// migration 023) and haven't turned notifications off. Sent only on days
// with something to say. `lineUserId` scopes a run to one user (tests).
async function sendMorningBriefings({ lineUserId, now = new Date() } = {}) {
  let q = supabase.from('users').select('line_user_id').eq('morning_briefing', true).neq('notifications_enabled', false);
  if (lineUserId) q = q.eq('line_user_id', lineUserId);
  const { data: users, error } = await q;
  if (error) {
    console.error('job: morning briefing failed to list users:', error.message);
    return { sent: 0 };
  }
  const liffUrl = process.env.LIFF_ID ? `https://liff.line.me/${process.env.LIFF_ID}?tab=tasks` : null;
  let sent = 0;
  for (const { line_user_id: id } of users) {
    try {
      const { text } = await loadBriefing(id, now);
      if (!text) continue;
      const message = { type: 'text', text };
      if (liffUrl) message.quickReply = { items: [{ type: 'action', action: { type: 'uri', label: 'Open Tasks', uri: liffUrl } }] };
      await pushMessages(id, [message]);
      sent += 1;
    } catch (err) {
      console.warn(`[briefing] push failed (${err.message})`);
    }
  }
  return { sent, users: users.length };
}

function startMorningBriefingJob() {
  cron.schedule('30 7 * * *', () => runOnce('morningBriefing', getBangkokYmd(), async () => JSON.stringify(await sendMorningBriefings())), { timezone: 'Asia/Bangkok' });
  console.log('[briefing] scheduled for 07:30 Asia/Bangkok');
}

module.exports = { startMorningBriefingJob, sendMorningBriefings };
