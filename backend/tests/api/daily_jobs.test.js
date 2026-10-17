// Daily digest + activity reminder both use the Asia/Bangkok calendar day.
// Runs the jobs in-process with LINE pushes captured (nothing is sent), each
// scoped to this suite's test users.
const { BACKEND, BASE } = require('../lib');
const { createClient } = require('@supabase/supabase-js');

const pushed = [];
const clientPath = require.resolve(`${BACKEND}/services/lineMessagingClient.js`);
require.cache[clientPath] = {
  id: clientPath, filename: clientPath, loaded: true,
  exports: { async replyText() {}, async replyConfirmationCard() {}, async getImageBuffer() {}, async pushText(to, text) { pushed.push({ to, text }); } },
};
const { sendDailyDigest } = require(`${BACKEND}/jobs/dailyDigest.js`);
const { sendActivityReminder } = require(`${BACKEND}/jobs/activityReminders.js`);
const { getBangkokDayRangeISO } = require(`${BACKEND}/services/bangkokDay.js`);

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ACTIVE = 'test_daily_jobs_active';
const IDLE = 'test_daily_jobs_idle';
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures++; };
const api = (p, o = {}) =>
  fetch(`${BASE}/api${p}`, { headers: { 'Content-Type': 'application/json' }, ...o }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

// Bangkok calendar dates computed independently of the code under test (via Intl).
const bangkokYmd = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(date);
const today = bangkokYmd(new Date());
const yesterday = bangkokYmd(new Date(Date.now() - 86400000));
const tomorrow = bangkokYmd(new Date(Date.now() + 86400000));
const at = (ymd, hhmm) => new Date(`${ymd}T${hhmm}:00+07:00`).toISOString();

async function cleanup() {
  for (const u of [ACTIVE, IDLE]) for (const t of ['transactions', 'categories', 'users']) await db.from(t).delete().eq('line_user_id', u);
}

(async () => {
  // --- the helper itself, at fixed instants ---
  const early = getBangkokDayRangeISO(new Date('2026-10-16T18:30:00Z')); // 01:30 on Oct 17 in Bangkok
  assert(early.startISO === '2026-10-16T17:00:00.000Z' && early.endISO === '2026-10-17T17:00:00.000Z', `01:30 Bangkok belongs to that Bangkok day (got ${early.startISO} - ${early.endISO})`);
  const late = getBangkokDayRangeISO(new Date('2026-10-17T16:59:59Z')); // 23:59:59 on Oct 17 in Bangkok
  assert(late.startISO === early.startISO, `23:59 Bangkok is still the same day (got ${late.startISO})`);
  const midnight = getBangkokDayRangeISO(new Date('2026-10-17T17:00:00Z')); // 00:00 Oct 18 in Bangkok
  assert(midnight.startISO === '2026-10-17T17:00:00.000Z', `Bangkok midnight starts the next day (got ${midnight.startISO})`);

  // --- digest totals cover exactly today's Bangkok day ---
  await cleanup();
  for (const u of [ACTIVE, IDLE]) await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: u, display_name: u }) });
  const [expenseCat] = (await api(`/categories/${ACTIVE}?type=expense`)).body.categories;
  const [incomeCat] = (await api(`/categories/${ACTIVE}?type=income`)).body.categories;
  const [idleCat] = (await api(`/categories/${IDLE}?type=expense`)).body.categories;
  const tx = (u, category_id, type, amount, transaction_date) =>
    api(`/transactions/${u}`, { method: 'POST', body: JSON.stringify({ category_id, type, amount, transaction_date, description: 'daily jobs test', channel: 'liff' }) });
  await tx(ACTIVE, expenseCat.id, 'expense', 111, at(today, '01:30'));    // before 07:00 Bangkok -- the UTC-day bug dropped this
  await tx(ACTIVE, expenseCat.id, 'expense', 222, at(today, '20:00'));
  await tx(ACTIVE, incomeCat.id, 'income', 1000, at(today, '12:00'));
  await tx(ACTIVE, expenseCat.id, 'expense', 999, at(yesterday, '23:30')); // yesterday -- excluded
  await tx(ACTIVE, expenseCat.id, 'expense', 555, at(tomorrow, '00:30'));  // tomorrow -- the UTC-day bug included this
  await tx(IDLE, idleCat.id, 'expense', 50, at(yesterday, '21:00'));      // nothing today

  pushed.length = 0;
  await sendDailyDigest({ lineUserId: ACTIVE });
  const digest = pushed.find((p) => p.to === ACTIVE)?.text || '';
  assert(/Income: 1000\.00/.test(digest), `digest income is today's 1000.00 (got ${JSON.stringify(digest)})`);
  assert(/Expense: 333\.00/.test(digest), 'digest expense = 111 (01:30) + 222 (20:00), excluding yesterday 23:30 and tomorrow 00:30');
  assert(/Net: 667\.00/.test(digest), 'digest net = 667.00');

  pushed.length = 0;
  await sendDailyDigest({ lineUserId: IDLE });
  assert(pushed.length === 0, `no digest for a user whose only activity was yesterday (got ${pushed.length})`);

  // --- activity reminder uses the same day ---
  pushed.length = 0;
  await sendActivityReminder({ lineUserId: ACTIVE });
  assert(pushed.length === 0, 'no reminder for a user who logged something today (even only before 07:00 counts)');
  await sendActivityReminder({ lineUserId: IDLE });
  assert(pushed.length === 1 && pushed[0].to === IDLE, `reminder for a user with nothing logged today (got ${JSON.stringify(pushed.map((p) => p.to))})`);

  await cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); await cleanup(); process.exit(1); });
