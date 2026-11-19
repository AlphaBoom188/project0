// Ops agent: records every error the server logs, handles small ones by rule,
// and alerts the owner on LINE about big ones (with a short Claude-written
// diagnosis when an Anthropic key is configured). Migration 017 tables.
//
// - Capture: install() wraps console.error, so every existing
//   `console.error('Error in X:', error)` is recorded without touching the
//   call sites, plus unhandled rejections and uncaught exceptions. Errors are
//   grouped by a fingerprint (source + message with ids/numbers stripped),
//   buffered in memory and flushed to error_events every 30 s.
// - Watchdog (tick, every 5 minutes): checks the database, then classifies
//   each recently active fingerprint:
//     small: transient upstream failures (timeouts, 429/5xx, network) below a
//            threshold, the post-migration schema-cache blip, a known error
//            recurring a few times -> marked handled, no message;
//     big:   crashes, failed scheduled jobs, a brand-new error, an error
//            repeating >= 5 times in a window, a dependency failing >= 20
//            times, the schema-cache error lasting > 15 min, a total spike,
//            the database unreachable for 10 min -> LINE alert.
//   Alerts have a cooldown per key (6 h), so one problem means one message.
// - runOnce(job, slot, fn): job_runs PRIMARY KEY makes each scheduled slot
//   run exactly once even with several processes or a restart.
// Not installed on test servers (DISABLE_CRON=1) or with OPS_AGENT=off.
const crypto = require('crypto');
const supabase = require('../config/supabase');

const FLUSH_MS = 30 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const COOLDOWN_MS = 6 * 60 * 60 * 1000;
const SPIKE_TOTAL = 50;
const REPEAT_BIG = 5;
const TRANSIENT_BIG = 20;
const SCHEMA_CACHE_GRACE_MS = 15 * 60 * 1000;
const JOB_RUNS_KEEP_DAYS = 30;
const ERRORS_KEEP_DAYS = 90;   // the privacy policy promises this
const ALERTS_KEEP_DAYS = 180;

const origError = console.error.bind(console);
const pending = new Map(); // fingerprint -> { source, message, stack, count }
let installed = false;
let dbFailures = 0;

// ---- Fingerprinting (pure) ----

function normalize(text) {
  return String(text || '')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/\bU[0-9a-f]{32}\b/g, '<user>')
    .replace(/\btest_[\w-]+/g, '<user>')
    .replace(/\b[0-9a-f]{16,}\b/gi, '<hex>')
    .replace(/"[^"]{0,200}"|'[^']{0,200}'/g, '<str>')
    .replace(/\d+(\.\d+)?/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

// console.error(...) arguments -> { source, message, stack }
function describe(args) {
  const err = args.find((a) => a instanceof Error) || args.find((a) => a && typeof a === 'object' && typeof a.message === 'string');
  const strings = args.filter((a) => typeof a === 'string');
  const source = String(strings[0] || (err && err.name) || 'error').replace(/[:\s]+$/, '').slice(0, 100) || 'error';
  let message = err ? String(err.message || err) : strings.slice(1).join(' ');
  if (!message) message = strings[0] || 'unknown error';
  return { source, message: message.slice(0, 1000), stack: err && err.stack ? String(err.stack).slice(0, 2000) : null };
}

const fingerprint = (source, message) => crypto.createHash('sha256').update(`${normalize(source)}|${normalize(message)}`).digest('hex').slice(0, 32);

// ---- Capture ----

function recordError(...args) {
  try {
    const d = describe(args);
    const fp = fingerprint(d.source, d.message);
    const p = pending.get(fp) || { ...d, count: 0 };
    p.count += 1;
    p.message = d.message;
    p.stack = d.stack || p.stack;
    pending.set(fp, p);
  } catch {
    // never let error capture throw
  }
}

async function flush() {
  if (!pending.size) return;
  const batch = [...pending.entries()];
  pending.clear();
  try {
    const { data: existing, error: readError } = await supabase.from('error_events').select('fingerprint, count, window_count').in('fingerprint', batch.map(([fp]) => fp));
    if (readError) throw readError;
    const prev = new Map((existing || []).map((e) => [e.fingerprint, e]));
    const now = new Date().toISOString();
    const rows = batch.map(([fp, p]) => {
      const e = prev.get(fp);
      return {
        fingerprint: fp,
        source: p.source,
        message: p.message,
        stack: p.stack,
        count: (e ? e.count : 0) + p.count,
        window_count: (e ? e.window_count : 0) + p.count,
        last_seen: now,
        status: 'open',
        ...(e ? {} : { first_seen: now, window_started_at: now }),
      };
    });
    const { error } = await supabase.from('error_events').upsert(rows, { onConflict: 'fingerprint' });
    if (error) throw error;
  } catch (error) {
    origError('[ops] could not record errors:', error.message); // origError: not re-captured
  }
}

function install() {
  if (installed) return;
  installed = true;
  console.error = (...args) => {
    origError(...args);
    recordError(...args);
  };
  process.on('unhandledRejection', (reason) => {
    console.error('process: unhandled rejection', reason instanceof Error ? reason : new Error(String(reason)));
  });
  process.on('uncaughtException', (error) => {
    console.error('process: uncaught exception', error);
    // Node's default is to exit; keep that (the supervisor restarts us) but record first.
    flush().finally(() => process.exit(1));
  });
  setInterval(flush, FLUSH_MS).unref();
}

// ---- Run-once scheduled jobs ----

async function runOnce(job, slot, fn) {
  const { error } = await supabase.from('job_runs').insert({ job, slot });
  if (error && error.code === '23505') {
    console.log(`[ops] ${job} ${slot} already ran; skipping`);
    return { skipped: true };
  }
  // Any other insert failure (e.g. migration 017 not applied yet) fails open:
  // the job still runs, as it did before the guard existed.
  const tracked = !error;
  if (error) origError(`[ops] job_runs unavailable (${error.message}); running ${job} unguarded`);
  try {
    const detail = await fn();
    if (tracked) await supabase.from('job_runs').update({ finished_at: new Date().toISOString(), ok: true, detail: detail == null ? null : String(detail).slice(0, 500) }).eq('job', job).eq('slot', slot);
    return { ok: true };
  } catch (err) {
    console.error(`job:${job} failed`, err);
    if (tracked) await supabase.from('job_runs').update({ finished_at: new Date().toISOString(), ok: false, detail: String(err && err.message).slice(0, 500) }).eq('job', job).eq('slot', slot);
    return { ok: false };
  }
}

// ---- Classification (pure) ----

const TRANSIENT = /timed out|timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|fetch failed|socket hang up|network error|\b(429|502|503|504)\b|rate limit|Too Many Requests/i;
const SCHEMA_CACHE = /schema cache|PGRST205/i;

// ev: an error_events row; previouslyAlerted: this fingerprint alerted before.
// -> { level: 'small' | 'big', reason }
function classify(ev, now = new Date(), { previouslyAlerted = false } = {}) {
  const text = `${ev.source} ${ev.message}`;
  const windowCount = Number(ev.window_count) || 0;
  if (/^process:/.test(ev.source)) return { level: 'big', reason: 'The server crashed or hit an unhandled error' };
  if (/^job:/.test(ev.source)) return { level: 'big', reason: 'A scheduled job failed' };
  if (SCHEMA_CACHE.test(text)) {
    return now - new Date(ev.first_seen) > SCHEMA_CACHE_GRACE_MS && windowCount > 0
      ? { level: 'big', reason: 'A database table has been missing for over 15 minutes (migration not applied?)' }
      : { level: 'small', reason: 'Schema cache refresh after a migration (clears itself)' };
  }
  if (TRANSIENT.test(text)) {
    return windowCount >= TRANSIENT_BIG
      ? { level: 'big', reason: `An outside service is failing repeatedly (${windowCount} times in 15 minutes)` }
      : { level: 'small', reason: 'Transient network/upstream error' };
  }
  if (windowCount >= REPEAT_BIG) return { level: 'big', reason: `The same error repeated ${windowCount} times in 15 minutes` };
  if (!previouslyAlerted) return { level: 'big', reason: 'A new kind of error appeared' };
  return { level: 'small', reason: 'A known error recurred a few times' };
}

// ---- Alerts ----

function formatAlert({ severity, title, summary, diagnosis }) {
  const lines = [`[${severity.toUpperCase()}] ${title}`, '', summary];
  if (diagnosis) lines.push('', 'Diagnosis:', diagnosis);
  return lines.join('\n').slice(0, 4500); // LINE text limit is 5,000
}

async function defaultNotify(text) {
  const owner = process.env.OWNER_LINE_USER_ID;
  if (!owner) throw new Error('OWNER_LINE_USER_ID is not set');
  const { pushText } = require('./lineMessagingClient');
  await pushText(owner, text);
}

// Short plain-language diagnosis from Claude, or null when no key / SDK is
// available or the call fails. Only error text (normalized ids), source,
// counts and a stack excerpt are sent.
async function diagnose({ title, summary, details }) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  let Anthropic;
  try {
    Anthropic = require('@anthropic-ai/sdk');
  } catch {
    return null; // SDK not installed: alerts go out without a diagnosis
  }
  Anthropic = Anthropic.default || Anthropic;
  const client = new Anthropic({ timeout: 60 * 1000, maxRetries: 1 });
  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 2000,
      output_config: { effort: 'low' },
      // On a policy decline the API re-runs the request on a fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: 'You are the on-call assistant for a small production backend: Node.js/Express with Supabase (Postgres), serving a LINE bot and a LINE MINI App for personal expense tracking in Thailand, run by one developer on their own Mac behind a tunnel. Given an alert, reply in plain text (no markdown, at most 6 short lines): what is most likely wrong, how it affects users, and the first thing to check or do. Base it only on the details given; if they are not enough, say what to look at.',
      messages: [{ role: 'user', content: `${title}\n${summary}\n\nDetails:\n${JSON.stringify(details).slice(0, 6000)}` }],
    });
    if (response.stop_reason === 'refusal') return null;
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    return text ? text.slice(0, 1500) : null;
  } catch (error) {
    if (error instanceof Anthropic.APIError) origError(`[ops] diagnosis unavailable (API ${error.status}): ${error.message}`);
    else origError('[ops] diagnosis unavailable:', error.message);
    return null;
  }
}

async function recentlyAlerted(key, now) {
  const { data, error } = await supabase.from('ops_alerts').select('id').eq('key', key).gte('sent_at', new Date(now - COOLDOWN_MS).toISOString()).limit(1);
  return !error && data.length > 0;
}

async function alert({ key, severity, title, summary, details }, { notify = defaultNotify, now = new Date(), store = true } = {}) {
  if (store && (await recentlyAlerted(key, now).catch(() => false))) return { skipped: 'cooldown' };
  const diagnosis = await diagnose({ title, summary, details }).catch(() => null);
  let delivered = false;
  try {
    await notify(formatAlert({ severity, title, summary, diagnosis }));
    delivered = true;
  } catch (error) {
    origError('[ops] alert delivery failed:', error.message);
  }
  if (store) await supabase.from('ops_alerts').insert({ key, severity, summary: `${title}: ${summary}`.slice(0, 2000), diagnosis, delivered }).then(() => {}, () => {});
  return { delivered, diagnosis: !!diagnosis };
}

// ---- Watchdog ----

const minutesAgo = (date, now) => Math.max(0, Math.round((now - new Date(date)) / 60000));

// One pass. `sourcePrefix` scopes it to matching sources (tests); `notify`
// replaces the LINE push (tests).
async function tick({ now = new Date(), notify = defaultNotify, sourcePrefix = null } = {}) {
  try {
    const { error } = await supabase.from('users').select('line_user_id').limit(1);
    if (error) throw error;
    dbFailures = 0;
  } catch (error) {
    dbFailures += 1;
    if (dbFailures >= 2) {
      await alert({ key: 'db_down', severity: 'critical', title: 'Database unreachable', summary: `The server has not been able to reach Supabase for about ${dbFailures * 5} minutes: ${error.message}. Users can't load or save anything. (If the project paused, restore it in the Supabase dashboard.)`, details: { error: error.message } }, { notify, now, store: false });
    }
    return { db: false };
  }

  await flush();
  let query = supabase.from('error_events').select('*').gte('last_seen', new Date(now - WINDOW_MS).toISOString()).gt('window_count', 0);
  if (sourcePrefix) query = query.like('source', `${sourcePrefix}%`);
  const { data: events, error } = await query;
  if (error) {
    origError('[ops] watchdog could not read error_events:', error.message);
    return { db: true, error: error.message };
  }

  const keys = events.map((e) => e.fingerprint);
  const { data: past } = keys.length ? await supabase.from('ops_alerts').select('key').in('key', keys) : { data: [] };
  const alertedBefore = new Set((past || []).map((a) => a.key));

  let total = 0;
  const outcome = { db: true, small: 0, big: 0, alerts: 0 };
  for (const ev of events) {
    total += ev.window_count;
    const c = classify(ev, now, { previouslyAlerted: alertedBefore.has(ev.fingerprint) });
    if (c.level === 'big') {
      outcome.big += 1;
      const r = await alert({
        key: ev.fingerprint,
        severity: /crashed|job failed|missing/i.test(c.reason) ? 'critical' : 'high',
        title: c.reason,
        summary: `${ev.source}: ${ev.message}\n${ev.window_count} time(s) in the last 15 min, ${ev.count} in total; first seen ${minutesAgo(ev.first_seen, now)} min ago.`,
        details: { source: ev.source, message: normalize(ev.message), stack: ev.stack ? ev.stack.split('\n').slice(0, 8).join('\n') : null, window_count: ev.window_count, total: ev.count, first_seen: ev.first_seen },
      }, { notify, now });
      if (r.delivered) outcome.alerts += 1;
    } else {
      outcome.small += 1;
    }
    await supabase.from('error_events')
      .update({ status: c.level === 'big' ? 'alerted' : 'handled', window_count: 0, window_started_at: now.toISOString() })
      .eq('fingerprint', ev.fingerprint);
  }
  if (total >= SPIKE_TOTAL && !sourcePrefix) {
    const r = await alert({ key: 'error_spike', severity: 'high', title: 'Error spike', summary: `${total} errors in the last 15 minutes across ${events.length} kinds.`, details: { kinds: events.slice(0, 10).map((e) => ({ source: e.source, message: normalize(e.message), n: e.window_count })) } }, { notify, now });
    if (r.delivered) outcome.alerts += 1;
  }

  // Housekeeping (the "small" auto-handling that needs an action).
  // Retention (see liff-app/privacy.html): job records 30 days, error
  // reports 90 days, alert history 180 days.
  if (!sourcePrefix) {
    const daysAgo = (d) => new Date(now - d * 24 * 3600 * 1000).toISOString();
    await supabase.from('job_runs').delete().lt('started_at', daysAgo(JOB_RUNS_KEEP_DAYS)).then(() => {}, () => {});
    await supabase.from('error_events').delete().lt('last_seen', daysAgo(ERRORS_KEEP_DAYS)).then(() => {}, () => {});
    await supabase.from('ops_alerts').delete().lt('sent_at', daysAgo(ALERTS_KEEP_DAYS)).then(() => {}, () => {});
  }
  return outcome;
}

module.exports = { install, recordError, flush, runOnce, tick, classify, normalize, fingerprint, describe, formatAlert, alert, _pending: pending };
