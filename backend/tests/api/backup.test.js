// services/backup.js + scripts/restore.js: a backup into a temporary folder
// (database only, for speed), retention, private permissions, a dry run, and
// restoring a deleted test user from it. The folder is removed at the end.
const { BACKEND } = require('../lib');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const { runBackup } = require(`${BACKEND}/services/backup.js`);

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'et-backup-test-'));
const U = `test_backup_${crypto.randomBytes(4).toString('hex')}`;

(async () => {
  try {
    await db.from('users').insert({ line_user_id: U, display_name: 'Backup Test' });
    const { data: cat } = await db.from('categories').insert({ line_user_id: U, name: 'Food', type: 'expense' }).select().single();
    await db.from('transactions').insert({ line_user_id: U, category_id: cat.id, amount: 123, type: 'expense', description: 'backup me', transaction_date: new Date().toISOString() });
    await db.from('notes').insert({ line_user_id: U, body: 'a note', note_date: '2026-11-20' });

    const t0 = new Date('2026-11-20T00:00:00Z');
    const a = await runBackup({ root, keep: 2, now: t0, withFiles: false });
    assert(fs.existsSync(path.join(a.dir, 'manifest.json')) && a.tables.users >= 1 && a.tables.transactions >= 1, 'backup folder with a manifest and tables');
    const users = JSON.parse(fs.readFileSync(path.join(a.dir, 'db', 'users.json'), 'utf8'));
    assert(users.some((u) => u.line_user_id === U), 'the test user is in it');
    assert((fs.statSync(a.dir).mode & 0o777) === 0o700 && (fs.statSync(path.join(a.dir, 'db', 'users.json')).mode & 0o777) === 0o600, 'folder 0700, files 0600');
    await runBackup({ root, keep: 2, now: new Date(t0.getTime() + 86400000), withFiles: false });
    const c = await runBackup({ root, keep: 2, now: new Date(t0.getTime() + 2 * 86400000), withFiles: false });
    const left = fs.readdirSync(root).sort();
    assert(left.length === 2 && !left.includes(path.basename(a.dir)) && c.removed.includes(path.basename(a.dir)), `keeps the newest 2 (got ${left})`);
    fs.mkdirSync(path.join(root, '2026-01-01T00-00-00.partial'));
    await runBackup({ root, keep: 2, now: new Date(t0.getTime() + 3 * 86400000), withFiles: false });
    assert(!fs.readdirSync(root).some((n) => n.endsWith('.partial')), 'stale partial backups are cleaned up');

    // Lose the user, then restore just them.
    const latest = path.join(root, fs.readdirSync(root).sort().pop());
    await db.from('transactions').delete().eq('line_user_id', U);
    await db.from('categories').delete().eq('line_user_id', U);
    await db.from('users').delete().eq('line_user_id', U);
    const dry = execFileSync('node', [`${BACKEND}/scripts/restore.js`, latest, '--user', U], { encoding: 'utf8' });
    assert(dry.includes('dry run') && dry.includes('users: 1 rows') && (await db.from('users').select('line_user_id').eq('line_user_id', U)).data.length === 0, 'dry run writes nothing');
    const real = execFileSync('node', [`${BACKEND}/scripts/restore.js`, latest, '--confirm', '--user', U], { encoding: 'utf8' });
    assert(real.includes('Restore complete.'), 'restore runs');
    const back = await db.from('transactions').select('amount, description').eq('line_user_id', U);
    const notes = await db.from('notes').select('body').eq('line_user_id', U);
    assert((await db.from('users').select('display_name').eq('line_user_id', U).single()).data.display_name === 'Backup Test' && back.data.length === 1 && Number(back.data[0].amount) === 123 && notes.data[0].body === 'a note', 'user, transactions and notes are back');
    let failed = false;
    try { execFileSync('node', [`${BACKEND}/scripts/restore.js`, '/nonexistent'], { encoding: 'utf8', stdio: 'pipe' }); } catch { failed = true; }
    assert(failed, 'a missing folder is refused');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    await db.from('notes').delete().eq('line_user_id', U);
    await db.from('transactions').delete().eq('line_user_id', U);
    await db.from('categories').delete().eq('line_user_id', U);
    await db.from('users').delete().eq('line_user_id', U);
  }
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); console.log('FAIL: crashed'); process.exit(1); });
