const cron = require('node-cron');
const { getBangkokYmd } = require('../services/bangkokDay');
const { runOnce } = require('../services/opsAgent');
const { runBackup } = require('../services/backup');

// 03:00 Bangkok: back up the database and storage to this machine
// (services/backup.js). BACKUP=off disables it. A failure is logged as a
// critical job error, so the ops agent alerts the owner.
function startNightlyBackupJob() {
  if (process.env.BACKUP === 'off') {
    console.log('[backup] off (BACKUP=off)');
    return;
  }
  cron.schedule('0 3 * * *', () => runOnce('nightlyBackup', getBangkokYmd(), async () => {
    try {
      const r = await runBackup();
      const rows = Object.values(r.tables).reduce((s, n) => s + n, 0);
      console.log(`[backup] ${r.dir}: ${rows} rows, ${r.files} files`);
      return `${rows} rows, ${r.files} files`;
    } catch (error) {
      console.error(`job: nightly backup failed: ${error.message}`);
      throw error;
    }
  }), { timezone: 'Asia/Bangkok' });
  console.log('[backup] nightly backup scheduled for 03:00 Asia/Bangkok');
}

module.exports = { startNightlyBackupJob };
