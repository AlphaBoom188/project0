// Security fixes from the 2026-11-19 review:
// signed Google OAuth state, CSV formula injection, per-user rate limits on
// paid AI endpoints (REST + bot), statement text caps, AUTH_TEST_BYPASS.
const { BASE, BACKEND } = require('../lib');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const auth = require(`${BACKEND}/services/lineAuth.js`);
const stamp = Date.now();
const U = `test_sec_${stamp}`;
const RL = `test_sec_rl_${stamp}`;
const BOT = `test_sec_bot_${stamp}`;

let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const req = (path, opts = {}) => fetch(`${BASE}${path}`, opts).then(async (r) => ({ status: r.status, headers: r.headers, text: await r.text() }));
const post = (path, body) => req(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const cleanup = async () => { for (const u of [U, RL, BOT]) for (const t of ['transactions', 'categories', 'users']) await db.from(t).delete().eq('line_user_id', u); };

(async () => {
  await post('/api/users', { line_user_id: U, display_name: 'Sec' });

  // --- 1. Google OAuth state is signed ---
  let r = await req(`/api/google/callback?code=anything&state=${encodeURIComponent(U)}`);
  assert(r.status === 400 && r.text.includes('Link expired'), `a bare user id as state is rejected (got ${r.status})`);
  const forged = auth.signState(U).replace(/^[^.]+/, Buffer.from('test_victim').toString('base64url'));
  r = await req(`/api/google/callback?code=anything&state=${encodeURIComponent(forged)}`);
  assert(r.status === 400, 'a signed state with the user id swapped is rejected');
  r = await req(`/api/google/callback?code=anything&state=${encodeURIComponent(auth.signState(U, -5))}`);
  assert(r.status === 400, 'an expired state is rejected');
  assert(auth.verifyState(auth.signState(U)) === U && auth.verifyState('a.b.c') === null, 'signState/verifyState round-trip');
  const { data: userRow } = await db.from('users').select('google_email').eq('line_user_id', U).single();
  assert(!userRow.google_email, 'no email was linked by any rejected callback');

  // --- 2. CSV formula injection ---
  const { body: cats } = await fetch(`${BASE}/api/categories/${U}?type=expense`).then(async (x) => ({ body: await x.json() }));
  const cat = cats.categories[0].id;
  for (const description of ['=HYPERLINK("http://evil.example","x")', '+1+1', '-2', '@SUM(A1)', 'plain coffee']) {
    await post(`/api/transactions/${U}`, { type: 'expense', amount: 10, category_id: cat, description, transaction_date: '2026-11-01T12:00:00Z' });
  }
  r = await req(`/api/transactions/${U}/export`);
  assert(r.text.includes(`"'=HYPERLINK(""http://evil.example"",""x"")"`), 'a leading = is neutralized with an apostrophe (and still quoted)');
  assert(r.text.includes(",'+1+1,") && r.text.includes(",'-2,") && r.text.includes(",'@SUM(A1),"), 'leading + - @ are neutralized too');
  assert(r.text.includes(',plain coffee,') && r.text.includes(',10,') && !r.text.includes("'10"), 'normal text and numeric amounts are unchanged');

  // --- 3. Rate limits ---
  await post('/api/users', { line_user_id: RL, display_name: 'RL' });
  let last;
  for (let i = 0; i < 30; i += 1) last = await post(`/api/voice/${RL}/parse`, {});
  assert(last.status === 400, `the first 30 voice requests reach the endpoint (got ${last.status})`);
  last = await post(`/api/voice/${RL}/parse`, {});
  assert(last.status === 429 && JSON.parse(last.text).code === 'rate_limited' && Number(last.headers.get('retry-after')) === 600, `the 31st in 10 minutes -> 429 with Retry-After (got ${last.status})`);
  r = await post(`/api/voice/${U}/parse`, {});
  assert(r.status === 400, 'limits are per user: another user is unaffected');

  // Bot: the same budget, in-process with LINE and the parser stubbed.
  const stub = (rel, exports) => { const p = require.resolve(`${BACKEND}/${rel}`); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };
  const replies = [];
  let parses = 0;
  stub('services/lineMessagingClient.js', { async replyText(_, t) { replies.push(t); }, async replyConfirmationCard() { replies.push('[card]'); }, async getImageBuffer() { return Buffer.alloc(0); }, async pushText() {}, async getGroupMemberName() { return null; }, async getGroupName() { return null; } });
  stub('services/textExpenseParser.js', { async parseExpenseText() { parses += 1; return { isExpense: false }; } });
  const controller = require(`${BACKEND}/controllers/lineWebhookController.js`);
  const res = { status() { return this; }, end() {}, json() {} };
  for (let i = 0; i < 61; i += 1) {
    await controller.webhook({ body: { events: [{ type: 'message', replyToken: 'r', source: { type: 'user', userId: BOT }, message: { id: `m${i}`, type: 'text', text: `hello ${i}` } }] } }, res);
  }
  assert(parses === 60 && replies[60].startsWith("You're sending a lot right now"), `the bot parses 60 messages, then asks the user to wait (parsed ${parses})`);

  // --- 5. Statement text caps ---
  const t0 = Date.now();
  r = await post(`/api/statements/${U}/parse`, { pages: [[{ x: 10, y: 10, s: `01/11/26 ${'A '.repeat(200000)}1.00 2.00` }, { x: 10, y: 20, s: 'Bangkok Bank STATEMENT OF SAVING ACCOUNT' }]] });
  assert(Date.now() - t0 < 5000 && [200, 422].includes(r.status), `a hostile 400 KB text run is capped and handled quickly (${Date.now() - t0} ms, ${r.status})`);

  // --- 7. AUTH_TEST_BYPASS=false ---
  const local = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };
  assert(auth.isLocalTestRequest(local, 'test_x') === true, 'the bypass applies to local test_ requests by default');
  process.env.AUTH_TEST_BYPASS = 'false';
  assert(auth.isLocalTestRequest(local, 'test_x') === false, 'AUTH_TEST_BYPASS=false removes it');
  delete process.env.AUTH_TEST_BYPASS;

  await cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); await cleanup(); process.exit(1); });
