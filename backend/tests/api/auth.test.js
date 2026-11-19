// API authentication (services/lineAuth.js): LINE token required for any
// :line_user_id route, 403 for someone else's data, public routes open, the
// local test_ bypass, signed CSV export links, AUTH_REQUIRED=false.
// HTTP checks use a real-shaped LINE id (never a real user: random hex) so
// no bypass applies; the 403/expiry checks run the middleware in-process.
const { BASE } = require('../lib');
const crypto = require('crypto');
const auth = require(`${require('../lib').BACKEND}/services/lineAuth.js`);

let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const REAL = `U${crypto.randomBytes(16).toString('hex')}`;
const TEST = `test_auth_${Date.now()}`;
const req = (path, opts = {}) => fetch(`${BASE}${path}`, opts).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null), type: r.headers.get('content-type') || '' }));
const tunnel = { 'X-Forwarded-For': '203.0.113.7' };

(async () => {
  // --- Token required ---
  let r = await req(`/api/transactions/${REAL}`);
  assert(r.status === 401 && r.body.code === 'auth_invalid', `no token -> 401 auth_invalid (got ${r.status})`);
  for (const path of [`/api/users/${REAL}`, `/api/portfolio/${REAL}`, `/api/groups/${REAL}`, `/api/accounts/${REAL}`, `/api/categories/${REAL}`]) {
    assert((await req(path)).status === 401, `no token -> 401 on ${path.replace(REAL, ':u')}`);
  }
  r = await req('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ line_user_id: REAL, display_name: 'x' }) });
  assert(r.status === 401, 'POST /api/users without a token -> 401 (body user is checked too)');
  r = await req(`/api/transactions/${REAL}`, { headers: { Authorization: 'Bearer not.a.token' } });
  assert(r.status === 401, `a bogus ID token (rejected by LINE) -> 401 (got ${r.status})`);
  r = await req(`/api/transactions/${REAL}`, { headers: { Authorization: 'Bearer plainaccesstoken' } });
  assert(r.status === 401, `a bogus access token -> 401 (got ${r.status})`);

  // --- Public routes stay open ---
  assert((await req('/health')).status === 200, 'GET /health is public');
  assert((await req(`/api/bills/public/${crypto.randomUUID()}`)).status === 404, 'the public shared-bill link is not behind auth (404 for an unknown bill)');
  assert((await req('/api/line/login-url')).status !== 401, 'LINE login URL is public');
  assert((await req('/api/line/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status !== 200, 'the webhook still requires its LINE signature');

  // --- Local test bypass ---
  r = await req(`/api/transactions/${TEST}`);
  assert(r.status !== 401 && r.status !== 403, `a test_ user from this machine skips the token (got ${r.status})`);
  r = await req(`/api/transactions/${TEST}`, { headers: tunnel });
  assert(r.status === 401, 'a test_ user through a tunnel (X-Forwarded-For) still needs a token');

  // --- Signed CSV export links ---
  const signed = auth.signExportLink(REAL, 'type=expense');
  r = await req(`/api/transactions/${REAL}/export?${signed}`, { headers: tunnel });
  assert(r.status === 200 && r.type.includes('text/csv'), `a signed export link works without a token (got ${r.status} ${r.type})`);
  r = await req(`/api/transactions/${REAL}/export?${signed.replace('type=expense', 'type=income')}`, { headers: tunnel });
  assert(r.status === 401 && r.body.code === 'link_invalid', 'changing the query breaks the signature -> 401 link_invalid');
  r = await req(`/api/transactions/${'U' + crypto.randomBytes(16).toString('hex')}/export?${signed}`, { headers: tunnel });
  assert(r.status === 401, "a link signed for one user doesn't work for another");
  r = await req(`/api/transactions/${REAL}/export?type=expense`, { headers: tunnel });
  assert(r.status === 401, 'export without a token or signature -> 401');
  const realNow = Date.now;
  Date.now = () => realNow() + 121 * 1000;
  assert(!auth.verifyExportLink(REAL, signed), 'a signed link expires after 2 minutes');
  Date.now = realNow;
  assert(auth.verifyExportLink(REAL, signed), 'and is valid before that');
  r = await req(`/api/transactions/${TEST}/export-link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'q=coffee&type=expense' }) });
  assert(r.status === 200 && /exp=\d+/.test(r.body.query) && /sig=[0-9a-f]{64}/.test(r.body.query) && r.body.query.includes('q=coffee'), 'POST export-link returns the signed query');

  // --- Middleware, in-process: 403 for someone else's data ---
  const run = (lineUserId, headers = {}) => new Promise((resolve) => {
    const fakeReq = { headers, socket: { remoteAddress: '203.0.113.7' }, method: 'GET', path: '/x', query: {}, originalUrl: '/x' };
    const res = { status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, body: b }); } };
    auth.requireOwnUser(fakeReq, res, () => resolve({ code: 'next', req: fakeReq }), lineUserId);
  });
  const OTHER = `U${crypto.randomBytes(16).toString('hex')}`;
  auth._cache.set('cached-token', { userId: REAL, expMs: Date.now() + 60000 });
  let m = await run(REAL, { authorization: 'Bearer cached-token' });
  assert(m.code === 'next' && m.req.authUserId === REAL, 'a valid token for this user passes (sets req.authUserId)');
  m = await run(OTHER, { authorization: 'Bearer cached-token' });
  assert(m.code === 403 && m.body.code === 'forbidden', "a valid token for someone else's data -> 403");
  auth._cache.set('expired-token', { userId: REAL, expMs: Date.now() - 1 });
  m = await run(REAL, { authorization: 'Bearer expired-token' });
  assert(m.code === 401, 'an expired cached token is not accepted');
  process.env.AUTH_REQUIRED = 'false';
  m = await run(OTHER);
  assert(m.code === 'next', 'AUTH_REQUIRED=false turns enforcement off');
  delete process.env.AUTH_REQUIRED;
  assert(auth.channelIds().length >= 1 && auth.channelIds().every((id) => /^\d+$/.test(id)), 'channel ids come from LIFF_ID / LINE_LOGIN_CHANNEL_ID');

  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
