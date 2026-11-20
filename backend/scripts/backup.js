#!/usr/bin/env node
// Manual backup: `npm run backup` (same as the 03:00 job). See services/backup.js.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { runBackup } = require('../services/backup');

runBackup().then((r) => {
  const rows = Object.values(r.tables).reduce((s, n) => s + n, 0);
  console.log(`Backup written to ${r.dir}\n  ${Object.keys(r.tables).length} tables, ${rows} rows, ${r.files} files, ${(r.bytes / 1048576).toFixed(2)} MB${r.removed.length ? `\n  removed old: ${r.removed.join(', ')}` : ''}`);
}).catch((e) => {
  console.error(`Backup failed: ${e.message}`);
  process.exit(1);
});
