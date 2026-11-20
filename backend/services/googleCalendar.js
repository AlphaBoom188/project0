// Read-only Google Calendar for the Tasks tab (migration 020). Separate from
// the export-email link in googleOAuth.js: its own consent (scope
// calendar.events.readonly, offline access), same OAuth client and redirect
// URI; the callback tells them apart by the signed state ("gcal:<id>").
//
// The refresh token is stored AES-256-GCM encrypted. Events are fetched on
// demand from the primary calendar and never stored. Like the export link,
// the consent page must open in the system browser (liff.openWindow external).
const crypto = require('crypto');
const supabase = require('../config/supabase');
const { requireConfig } = require('./googleOAuth');
const { signState } = require('./lineAuth');

const SCOPE = 'openid email https://www.googleapis.com/auth/calendar.events.readonly';
const TIMEOUT_MS = 15000;

const key = () => crypto.createHash('sha256').update(`gcal|${process.env.GCAL_TOKEN_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`).digest();

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

function decrypt(stored) {
  const [v, iv, tag, body] = String(stored || '').split('.');
  if (v !== 'v1' || !iv || !tag || !body) throw new Error('Unreadable calendar token');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
}

function buildCalendarAuthUrl(lineUserId) {
  const { clientId, redirectUri } = requireConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent', // always returns a refresh token
    include_granted_scopes: 'false',
    state: signState(`gcal:${lineUserId}`),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function tokenRequest(body) {
  const { clientId, clientSecret } = requireConfig();
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...body }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = await resp.json().catch(() => ({}));
  return { ok: resp.ok, json };
}

// Callback: code -> stores the encrypted refresh token. -> the Google email
async function linkCalendar(lineUserId, code) {
  const { redirectUri } = requireConfig();
  const { ok, json } = await tokenRequest({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' });
  if (!ok || !json.access_token) throw new Error(json.error_description || json.error || 'Google token exchange failed');
  if (!String(json.scope || '').includes('calendar.events.readonly')) throw new Error('Calendar access was not granted. Tick the calendar box on the Google screen.');
  if (!json.refresh_token) throw new Error('Google did not return offline access. Please try again.');
  const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${json.access_token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    .then((r) => r.json()).catch(() => ({}));
  const { error } = await supabase.from('users').update({
    gcal_refresh_token: encrypt(json.refresh_token),
    gcal_email: info.email || null,
    gcal_linked_at: new Date().toISOString(),
  }).eq('line_user_id', lineUserId);
  if (error) throw error;
  accessCache.set(lineUserId, { token: json.access_token, exp: Date.now() + ((json.expires_in || 3600) - 120) * 1000 });
  return info.email || null;
}

const accessCache = new Map();

async function loadLink(lineUserId) {
  const { data, error } = await supabase.from('users').select('gcal_refresh_token, gcal_email, gcal_linked_at').eq('line_user_id', lineUserId).maybeSingle();
  if (error) throw error;
  return data && data.gcal_refresh_token ? data : null;
}

async function clearLink(lineUserId) {
  accessCache.delete(lineUserId);
  await supabase.from('users').update({ gcal_refresh_token: null, gcal_email: null, gcal_linked_at: null }).eq('line_user_id', lineUserId);
}

class NotLinkedError extends Error {}

async function accessToken(lineUserId) {
  const cached = accessCache.get(lineUserId);
  if (cached && cached.exp > Date.now()) return cached.token;
  const link = await loadLink(lineUserId);
  if (!link) throw new NotLinkedError('Google Calendar is not connected');
  const { ok, json } = await tokenRequest({ refresh_token: decrypt(link.gcal_refresh_token), grant_type: 'refresh_token' });
  if (!ok) {
    if (json.error === 'invalid_grant') { // revoked on Google's side
      await clearLink(lineUserId);
      throw new NotLinkedError('Google Calendar access was removed. Connect it again in Settings.');
    }
    throw new Error(json.error_description || json.error || 'Google token refresh failed');
  }
  accessCache.set(lineUserId, { token: json.access_token, exp: Date.now() + ((json.expires_in || 3600) - 120) * 1000 });
  return json.access_token;
}

// Google event -> what the app shows (title and times only).
function mapEvent(e) {
  if (!e || e.status === 'cancelled') return null;
  const allDay = !!(e.start && e.start.date && !e.start.dateTime);
  const toIso = (x) => (x && x.dateTime ? new Date(x.dateTime).toISOString() : x && x.date ? `${x.date}` : null);
  return { id: String(e.id || ''), title: (e.summary || '(No title)').slice(0, 200), start: toIso(e.start), end: toIso(e.end), all_day: allDay };
}

async function listEvents(lineUserId, fromISO, toISO) {
  const token = await accessToken(lineUserId);
  const params = new URLSearchParams({ timeMin: fromISO, timeMax: toISO, singleEvents: 'true', orderBy: 'startTime', maxResults: '250', fields: 'items(id,status,summary,start,end)' });
  const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = await resp.json().catch(() => ({}));
  if (resp.status === 401) { accessCache.delete(lineUserId); throw new Error('Google Calendar token expired, try again'); }
  if (!resp.ok) throw new Error((json.error && json.error.message) || `Google Calendar error ${resp.status}`);
  return (json.items || []).map(mapEvent).filter(Boolean);
}

// Disconnect: revoke on Google's side (best effort), then forget the token.
async function unlinkCalendar(lineUserId) {
  const link = await loadLink(lineUserId);
  if (link) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decrypt(link.gcal_refresh_token))}`, { method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      console.warn(`[gcal] revoke failed (${error.message})`);
    }
  }
  await clearLink(lineUserId);
}

module.exports = { buildCalendarAuthUrl, linkCalendar, listEvents, unlinkCalendar, loadLink, mapEvent, encrypt, decrypt, NotLinkedError, SCOPE };
