// API authentication: every request for a user's data must prove it comes
// from that LINE user.
//
// - The LIFF app sends `Authorization: Bearer <ID token>` (liff.getIDToken()).
//   It's verified with LINE (POST /oauth2/v2.1/verify) against the LIFF app's
//   channel (the LIFF_ID prefix) or LINE_LOGIN_CHANNEL_ID. The token's `sub`
//   is the LINE user id.
// - A LINE Login *access token* (what the iOS app holds) is accepted too:
//   GET /oauth2/v2.1/verify checks its channel, then /v2/profile gives the id.
// - Verified tokens are cached in memory until they expire, so only the
//   first request with a token costs a round trip to LINE.
// - Routes compare that id with the :line_user_id they serve (requireOwnUser,
//   registered via router.param in every router) -> 401 without a valid
//   token, 403 for someone else's data.
//
// Escape hatches:
// - Test users: ids starting with "test_" (never a real LINE id, which is
//   "U" + 32 hex) skip the check for requests made directly on this machine
//   (loopback, no X-Forwarded-For/Forwarded header, which a tunnel adds), so
//   the test suites run unchanged against a local server.
// - AUTH_REQUIRED=false turns enforcement off entirely (e.g. until the iOS app
//   sends a token). The default is on.
// - CSV download is a plain browser navigation, which can't carry a header:
//   it uses a short-lived signed link instead (signExportLink / verifyExportLink).
const crypto = require('crypto');

const VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';
const PROFILE_URL = 'https://api.line.me/v2/profile';
const TIMEOUT_MS = 10000;
const CACHE_MAX = 2000;
const EXPORT_LINK_TTL_S = 120;

const cache = new Map(); // token -> { userId, expMs }

const authRequired = () => process.env.AUTH_REQUIRED !== 'false';

function channelIds() {
  const liffChannel = String(process.env.LIFF_ID || '').split('-')[0];
  return [...new Set([liffChannel, process.env.LINE_LOGIN_CHANNEL_ID].filter((id) => /^\d+$/.test(String(id || ''))))];
}

async function postForm(url, fields) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { ok: res.ok, body: await res.json().catch(() => ({})) };
}

async function verifyIdToken(token) {
  for (const clientId of channelIds()) {
    const { ok, body } = await postForm(VERIFY_URL, { id_token: token, client_id: clientId });
    if (ok && body.sub) return { userId: body.sub, expMs: Number(body.exp) * 1000 };
  }
  return null;
}

async function verifyAccessToken(token) {
  const res = await fetch(`${VERIFY_URL}?access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return null;
  const info = await res.json().catch(() => ({}));
  if (!channelIds().includes(String(info.client_id)) || !(info.expires_in > 0)) return null;
  const profile = await fetch(PROFILE_URL, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!profile.ok) return null;
  const { userId } = await profile.json().catch(() => ({}));
  return userId ? { userId, expMs: Date.now() + Math.min(info.expires_in, 3600) * 1000 } : null;
}

// -> the LINE user id, or null for a missing/invalid/expired token.
async function userIdForToken(token) {
  if (!token) return null;
  const hit = cache.get(token);
  if (hit && hit.expMs > Date.now()) return hit.userId;
  if (hit) cache.delete(token);
  // ID tokens are JWTs (three dot-separated parts); anything else is tried as an access token.
  const result = token.split('.').length === 3 ? await verifyIdToken(token) : await verifyAccessToken(token);
  if (!result || !(result.expMs > Date.now())) return null;
  if (cache.size >= CACHE_MAX) {
    const now = Date.now();
    for (const [k, v] of cache) if (v.expMs <= now) cache.delete(k);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  }
  cache.set(token, result);
  return result.userId;
}

const bearer = (req) => {
  const m = String(req.headers.authorization || '').match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
};

function isLocalTestRequest(req, lineUserId) {
  if (!String(lineUserId || '').startsWith('test_')) return false;
  if (req.headers['x-forwarded-for'] || req.headers.forwarded) return false;
  const addr = (req.socket && req.socket.remoteAddress) || '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

// ---- Signed export links ----
const linkSecret = () => process.env.EXPORT_LINK_SECRET
  || crypto.createHash('sha256').update(`export-link|${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`).digest('hex');
const canonical = (params) => [...params.entries()].filter(([k]) => k !== 'sig' && k !== 'exp').sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('&');
const hmac = (lineUserId, exp, params) => crypto.createHmac('sha256', linkSecret()).update(`${lineUserId}|${exp}|${canonical(params)}`).digest('hex');

// -> query string (with exp + sig) for GET /transactions/:u/export
function signExportLink(lineUserId, params) {
  const exp = String(Math.floor(Date.now() / 1000) + EXPORT_LINK_TTL_S);
  const out = new URLSearchParams(params);
  out.delete('sig');
  out.delete('exp');
  out.set('exp', exp);
  out.set('sig', hmac(lineUserId, exp, out));
  return out.toString();
}

function verifyExportLink(lineUserId, query) {
  const params = new URLSearchParams(query);
  const exp = params.get('exp');
  const sig = params.get('sig') || '';
  if (!/^\d+$/.test(exp || '') || Number(exp) < Date.now() / 1000 || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const expected = hmac(lineUserId, exp, params);
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'));
}

// ---- Middleware ----

async function checkUser(req, res, next, lineUserId) {
  try {
    if (!authRequired() || isLocalTestRequest(req, lineUserId)) return next();
    if (req.method === 'GET' && /\/export$/.test(req.path) && req.query.sig) {
      if (verifyExportLink(lineUserId, req.originalUrl.split('?')[1] || '')) return next();
      return res.status(401).json({ error: 'This download link has expired. Try again.', code: 'link_invalid' });
    }
    const userId = await userIdForToken(bearer(req));
    if (!userId) return res.status(401).json({ error: 'Please sign in again.', code: 'auth_invalid' });
    if (userId !== lineUserId) return res.status(403).json({ error: 'Not allowed', code: 'forbidden' });
    req.authUserId = userId;
    return next();
  } catch (error) {
    console.error('[auth] verification failed:', error.message);
    return res.status(503).json({ error: "Couldn't verify your sign-in right now. Try again.", code: 'auth_unavailable' });
  }
}

// router.param('line_user_id', requireOwnUser)
const requireOwnUser = (req, res, next, lineUserId) => checkUser(req, res, next, lineUserId);
// For routes that take the user in the body (POST /api/users).
const requireBodyUser = (req, res, next) => checkUser(req, res, next, req.body && req.body.line_user_id);

module.exports = { requireOwnUser, requireBodyUser, userIdForToken, signExportLink, verifyExportLink, isLocalTestRequest, channelIds, _cache: cache };
