const cron = require('node-cron');
const supabase = require('../config/supabase');
const { getBangkokYmd } = require('../services/bangkokDay');
const { runOnce } = require('../services/opsAgent');
const { loadReport, reportText, cycleRange } = require('../services/monthlyReport');
const { pushMessages } = require('../services/lineMessagingClient');

// 08:00 Bangkok every day: users whose billing cycle starts today get last
// cycle's report (one push a month; respects notifications_enabled; skipped
// when fewer than 3 transactions were logged). `lineUserId` + `force` scope a
// run for tests.
async function sendMonthlyReports({ lineUserId, now = new Date(), force = false } = {}) {
  let q = supabase.from('users').select('line_user_id, billing_cycle_start_day').neq('notifications_enabled', false);
  if (lineUserId) q = q.eq('line_user_id', lineUserId);
  const { data: users, error } = await q;
  if (error) {
    console.error('job: monthly report failed to list users:', error.message);
    return { sent: 0 };
  }
  const today = getBangkokYmd(now);
  const liffUrl = process.env.LIFF_ID ? `https://liff.line.me/${process.env.LIFF_ID}?report=last` : null;
  let sent = 0;
  for (const u of users) {
    if (!force && getBangkokYmd(cycleRange(u.billing_cycle_start_day, 0, now).start) !== today) continue;
    try {
      const report = await loadReport(u.line_user_id, { offset: -1, now });
      if (report.count < 3) continue;
      const message = { type: 'text', text: `Your money report\n${reportText(report)}` };
      if (liffUrl) message.quickReply = { items: [{ type: 'action', action: { type: 'uri', label: 'Open report', uri: liffUrl } }] };
      await pushMessages(u.line_user_id, [message]);
      sent += 1;
    } catch (err) {
      console.warn(`[report] push failed (${err.message})`);
    }
  }
  return { sent };
}

function startMonthlyReportJob() {
  cron.schedule('0 8 * * *', () => runOnce('monthlyReport', getBangkokYmd(), async () => JSON.stringify(await sendMonthlyReports())), { timezone: 'Asia/Bangkok' });
  console.log('[report] scheduled daily 08:00 Asia/Bangkok (sends on each user\'s cycle start day)');
}

module.exports = { startMonthlyReportJob, sendMonthlyReports };
