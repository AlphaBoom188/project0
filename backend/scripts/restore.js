#!/usr/bin/env node
// Restore a backup made by services/backup.js into the database in .env.
//
//   node scripts/restore.js <backup folder>                  # dry run: shows what it would write
//   node scripts/restore.js <backup folder> --confirm        # upserts every table (parents first) and uploads files
//   node scripts/restore.js <folder> --confirm --tables users,transactions   # only these tables
//   node scripts/restore.js <folder> --confirm --user U123...                 # only one user's rows and files
//
// Rows are UPSERTed on their primary key, so restoring over a live database
// puts back deleted or changed rows without touching newer ones. It does not
// delete rows created after the backup.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const supabase = require('../config/supabase');
const { TABLES } = require('../services/backup');

const PK = { users: 'line_user_id', tax_profiles: 'line_user_id,tax_year', job_runs: 'job,slot', line_groups: 'group_id', line_group_members: 'group_id,line_user_id', investment_goals: 'line_user_id', group_expense_shares: 'expense_id,line_user_id' };

async function main() {
  const [dir, ...args] = process.argv.slice(2);
  if (!dir || !fs.existsSync(path.join(dir, 'manifest.json'))) {
    console.error('Usage: node scripts/restore.js <backup folder> [--confirm] [--tables a,b] [--user <line_user_id>]');
    process.exit(1);
  }
  const confirm = args.includes('--confirm');
  const only = args.includes('--tables') ? args[args.indexOf('--tables') + 1].split(',') : null;
  const user = args.includes('--user') ? args[args.indexOf('--user') + 1] : null;
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  console.log(`Backup from ${manifest.createdAt}${confirm ? '' : ' (dry run: add --confirm to write)'}`);
  for (const table of TABLES) {
    if (only && !only.includes(table)) continue;
    const file = path.join(dir, 'db', `${table}.json`);
    if (!fs.existsSync(file)) continue;
    let rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (user) rows = rows.filter((r) => r.line_user_id === user || r.payer_line_user_id === user);
    console.log(`  ${table}: ${rows.length} rows`);
    if (!confirm || !rows.length) continue;
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from(table).upsert(rows.slice(i, i + 500), { onConflict: PK[table] || 'id' });
      if (error) throw new Error(`${table}: ${error.message}`);
    }
  }
  const storage = path.join(dir, 'storage');
  const buckets = fs.existsSync(storage) && !(only && !only.includes('storage')) ? fs.readdirSync(storage) : [];
  for (const bucket of buckets) {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    let files = walk(path.join(storage, bucket)).map((f) => path.relative(path.join(storage, bucket), f));
    if (user) files = files.filter((f) => f.startsWith(`${user}/`));
    console.log(`  storage ${bucket}: ${files.length} files`);
    if (!confirm) continue;
    for (const f of files) {
      const { error } = await supabase.storage.from(bucket).upload(f, fs.readFileSync(path.join(storage, bucket, f)), { contentType: 'image/jpeg', upsert: true });
      if (error) throw new Error(`${bucket}/${f}: ${error.message}`);
    }
  }
  console.log(confirm ? 'Restore complete.' : 'Dry run complete.');
}

main().catch((e) => { console.error(`Restore failed: ${e.message}`); process.exit(1); });
