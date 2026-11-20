// Nightly backup of the whole database and the private storage buckets to
// this machine (the Supabase free plan keeps no backups). One dated folder
// per run under BACKUP_DIR (default ~/Backups/expense-tracker), the last
// BACKUP_KEEP (default 14) kept. Folders are created 0700 and files 0600:
// they hold everyone's data, including the encrypted calendar tokens.
// Restore: scripts/restore.js. Never put backups inside the repo.
const fs = require('fs');
const os = require('os');
const path = require('path');
const supabase = require('../config/supabase');

// Parents before children, so a restore can insert in this order.
const TABLES = [
  'users', 'categories', 'accounts', 'transactions', 'recurring_transactions',
  'shared_bills', 'shared_bill_participants', 'shared_bill_items', 'budget_events',
  'asset_holdings', 'asset_lots', 'investment_goals',
  'line_groups', 'line_group_members', 'group_expenses', 'group_expense_shares',
  'reminders', 'notes', 'savings_goals',
  'tax_profiles', 'tax_incomes', 'tax_documents',
  'error_events', 'ops_alerts', 'job_runs',
];
const BUCKETS = ['receipt-thumbnails', 'payment-slips', 'tax-documents'];
const PAGE = 1000;

const backupRoot = () => process.env.BACKUP_DIR || path.join(os.homedir(), 'Backups', 'expense-tracker');
const keepCount = () => Math.max(1, Number(process.env.BACKUP_KEEP) || 14);

async function dumpTable(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1);
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) return null; // a migration not applied here
      throw new Error(`${table}: ${error.message}`);
    }
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

// Every object path in a bucket (folders are one level: <user>/<file>).
async function listBucket(bucket) {
  const out = [];
  const { data: top, error } = await supabase.storage.from(bucket).list('', { limit: 1000 });
  if (error) return null;
  for (const entry of top) {
    if (entry.metadata) { out.push(entry.name); continue; }
    for (let offset = 0; ; offset += 1000) {
      const { data: files } = await supabase.storage.from(bucket).list(entry.name, { limit: 1000, offset });
      (files || []).forEach((f) => out.push(`${entry.name}/${f.name}`));
      if (!files || files.length < 1000) break;
    }
  }
  return out;
}

function writePrivate(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, content, { mode: 0o600 });
}

// -> { dir, tables: { name: rows }, files, bytes, removed: [old folders] }
async function runBackup({ root = backupRoot(), keep = keepCount(), now = new Date(), withFiles = true } = {}) {
  const stamp = now.toISOString().replace(/[:]/g, '-').slice(0, 19);
  const dir = path.join(root, stamp);
  const tmp = `${dir}.partial`;
  fs.mkdirSync(tmp, { recursive: true, mode: 0o700 });
  const summary = { createdAt: now.toISOString(), tables: {}, buckets: {} };
  let bytes = 0;
  for (const table of TABLES) {
    const rows = await dumpTable(table);
    if (rows === null) continue;
    const json = JSON.stringify(rows);
    writePrivate(path.join(tmp, 'db', `${table}.json`), json);
    summary.tables[table] = rows.length;
    bytes += json.length;
  }
  let files = 0;
  if (withFiles) {
    for (const bucket of BUCKETS) {
      const paths = await listBucket(bucket);
      if (paths === null) continue;
      summary.buckets[bucket] = paths.length;
      for (const p of paths) {
        const { data, error } = await supabase.storage.from(bucket).download(p);
        if (error) throw new Error(`${bucket}/${p}: ${error.message}`);
        const buf = Buffer.from(await data.arrayBuffer());
        writePrivate(path.join(tmp, 'storage', bucket, p), buf);
        files += 1;
        bytes += buf.length;
      }
    }
  }
  writePrivate(path.join(tmp, 'manifest.json'), JSON.stringify(summary, null, 2));
  fs.renameSync(tmp, dir); // only complete backups get a dated name
  // Keep the newest `keep` complete backups; drop older ones and stale partials.
  const entries = fs.readdirSync(root).filter((n) => /^\d{4}-\d{2}-\d{2}T/.test(n)).sort();
  const removed = [];
  for (const n of entries.filter((x) => x.endsWith('.partial') && x !== path.basename(tmp))) {
    fs.rmSync(path.join(root, n), { recursive: true, force: true });
    removed.push(n);
  }
  const complete = entries.filter((x) => !x.endsWith('.partial'));
  for (const n of complete.slice(0, Math.max(0, complete.length - keep))) {
    fs.rmSync(path.join(root, n), { recursive: true, force: true });
    removed.push(n);
  }
  return { dir, tables: summary.tables, buckets: summary.buckets, files, bytes, removed };
}

module.exports = { runBackup, TABLES, BUCKETS, backupRoot };
