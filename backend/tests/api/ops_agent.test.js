// services/opsAgent.js: fingerprinting, classification, error recording,
// run-once jobs, and the watchdog's alert/cooldown behaviour. In-process
// against the real DB (migration 017); alerts go to a stub, never LINE, and
// Claude isn't called (no ANTHROPIC_API_KEY in this process).
const { BACKEND } = require('../lib');
delete process.env.ANTHROPIC_API_KEY;
const ops = require(`${BACKEND}/services/opsAgent.js`);
const supabase = require(`${BACKEND}/config/supabase.js`);

let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const TAG = `test:ops_${Date.now()}`;

async function cleanup() {
  await supabase.from('error_events').delete().like('source', 'test:ops_%');
  await supabase.from('job_runs').delete().like('job', 'test_ops_%');
  await supabase.from('ops_alerts').delete().like('summary', '%test:ops_%');
}

(async () => {
  // --- Pure: fingerprints ---
  const a = ops.fingerprint('Error in getAccounts', 'invalid input for 3f2504e0-4f89-41d3-9a0c-0305e82c3301 at row 17');
  const b = ops.fingerprint('Error in getAccounts', 'invalid input for 6ba7b810-9dad-41d1-80b4-00c04fd430c8 at row 3');
  assert(a === b && a.length === 32, 'ids and numbers are stripped, so the same error groups together');
  assert(a !== ops.fingerprint('Error in getBills', 'invalid input for x'), 'different sources or messages get different fingerprints');
  assert(!ops.normalize('user Uabcdef0123456789abcdef0123456789 test_foo_1').includes('Uabcdef'), 'LINE user ids are normalized away');
  const d = ops.describe(['Error in createBill:', new Error('boom')]);
  assert(d.source === 'Error in createBill' && d.message === 'boom' && d.stack.includes('Error: boom'), 'describe() reads the console.error arguments');

  // --- Pure: classification ---
  const now = new Date();
  const ev = (o) => ({ source: 'Error in x', message: 'y', window_count: 1, count: 1, first_seen: now.toISOString(), ...o });
  const c = (o, opts) => ops.classify(ev(o), now, opts);
  assert(c({ source: 'process: uncaught exception' }).level === 'big', 'a crash is big');
  assert(c({ source: 'job:dailyDigest failed' }).level === 'big', 'a failed scheduled job is big');
  assert(c({ message: 'replyMessage timed out after 10000ms' }, { previouslyAlerted: true }).level === 'small', 'an occasional timeout is small');
  assert(c({ message: 'fetch failed', window_count: 25 }).level === 'big', 'a dependency failing 25 times in 15 min is big');
  assert(c({ message: "Could not find the table 'public.x' in the schema cache" }).level === 'small', 'the post-migration schema-cache blip is small');
  assert(c({ message: 'PGRST205', first_seen: new Date(now - 20 * 60000).toISOString() }).level === 'big', 'a table missing for 20 minutes is big');
  assert(c({}, { previouslyAlerted: false }).level === 'big', 'a brand-new error is big (one alert)');
  assert(c({}, { previouslyAlerted: true }).level === 'small', 'a known error recurring a little is small');
  assert(c({ window_count: 6 }, { previouslyAlerted: true }).level === 'big', 'a known error repeating 6 times is big');
  const text = ops.formatAlert({ severity: 'high', title: 'T', summary: 'S', diagnosis: 'D' });
  assert(text === '[HIGH] T\n\nS\n\nDiagnosis:\nD' && ops.formatAlert({ severity: 'high', title: 'T', summary: 'x'.repeat(9000) }).length <= 4500, 'alert text layout, capped for LINE');

  // --- DB: migration 017 present ---
  const { error: tableError } = await supabase.from('error_events').select('fingerprint').limit(1);
  if (tableError) {
    assert(false, `migration 017 is applied (got ${tableError.code}: run backend/supabase/migrations/017_ops_watchdog.sql)`);
    process.exit(1);
  }
  await cleanup();

  // --- Recording ---
  for (let i = 0; i < 3; i += 1) ops.recordError(`${TAG} handler:`, new Error(`widget ${i + 100} exploded`));
  await ops.flush();
  let { data: rows } = await supabase.from('error_events').select('*').like('source', `${TAG}%`);
  assert(rows.length === 1 && rows[0].count === 3 && rows[0].window_count === 3 && rows[0].status === 'open', `three occurrences group into one row with count 3 (got ${JSON.stringify(rows.map((r) => r.count))})`);

  // --- Run-once ---
  let runs = 0;
  const slot = `slot_${Date.now()}`;
  const r1 = await ops.runOnce('test_ops_job', slot, async () => { runs += 1; return 'done'; });
  const r2 = await ops.runOnce('test_ops_job', slot, async () => { runs += 1; });
  assert(r1.ok && r2.skipped && runs === 1, 'a job slot runs exactly once');
  const { data: jr } = await supabase.from('job_runs').select('*').eq('job', 'test_ops_job').eq('slot', slot).single();
  assert(jr.ok === true && jr.detail === 'done' && jr.finished_at, 'the run is recorded with its result');
  const r3 = await ops.runOnce('test_ops_job', `${slot}_b`, async () => { throw new Error(`${TAG} job blew up`); });
  const { data: jr3 } = await supabase.from('job_runs').select('ok, detail').eq('job', 'test_ops_job').eq('slot', `${slot}_b`).single();
  assert(r3.ok === false && jr3.ok === false && jr3.detail.includes('job blew up'), 'a failing job is recorded as failed, not thrown');

  // --- Watchdog: one alert per problem, then cooldown ---
  const sent = [];
  const notify = async (t) => { sent.push(t); };
  let out = await ops.tick({ notify, sourcePrefix: TAG });
  assert(out.db === true && out.big === 1 && sent.length === 1, `a new error produces one alert (got ${JSON.stringify(out)}, ${sent.length} sent)`);
  assert(sent[0].startsWith('[HIGH] A new kind of error appeared') && sent[0].includes('widget') && sent[0].includes('3 time(s) in the last 15 min'), `alert text says what, how often (got ${JSON.stringify(sent[0].slice(0, 160))})`);
  ({ data: rows } = await supabase.from('error_events').select('status, window_count').like('source', `${TAG}%`));
  assert(rows[0].status === 'alerted' && rows[0].window_count === 0, 'the event is marked alerted and its window reset');
  for (let i = 0; i < 6; i += 1) ops.recordError(`${TAG} handler:`, new Error(`widget ${i} exploded`));
  out = await ops.tick({ notify, sourcePrefix: TAG });
  assert(out.big === 1 && sent.length === 1, 'the same problem again within the cooldown sends nothing more');
  ops.recordError(`${TAG} handler:`, new Error('upstream ETIMEDOUT while calling prices'));
  out = await ops.tick({ notify, sourcePrefix: TAG });
  assert(out.small === 1 && out.big === 0 && sent.length === 1, 'a transient timeout is handled quietly');
  const { data: alerts } = await supabase.from('ops_alerts').select('*').like('summary', `%${TAG}%`);
  assert(alerts.length === 1 && alerts[0].delivered === true && alerts[0].diagnosis === null, 'the alert is stored as delivered; no diagnosis without an Anthropic key');

  // Delivery failure is recorded, not thrown.
  const failing = await ops.alert({ key: `${TAG}_fail`, severity: 'high', title: `${TAG} x`, summary: 'y' }, { notify: async () => { throw new Error('LINE down'); } });
  assert(failing.delivered === false, 'a failed delivery is reported, not thrown');
  await supabase.from('ops_alerts').delete().eq('key', `${TAG}_fail`);

  await cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); await cleanup(); process.exit(1); });
