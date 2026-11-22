// Per-user rate limits for endpoints that spend money on every call (OpenAI
// Vision/transcription/LLM): without them any LINE user who opens the LIFF app
// or friends the bot could loop a request and run up the bill.
// In memory and per process: limits reset on restart, which is fine for cost
// control at this scale (one server process; DISABLE_CRON instances are tests).
const buckets = new Map(); // `${name}|${key}` -> [timestamps]

// -> true if allowed (and counted), false if over the limit.
function allow(name, key, max, windowMs) {
  const id = `${name}|${key}`;
  const now = Date.now();
  const recent = (buckets.get(id) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    buckets.set(id, recent);
    return false;
  }
  recent.push(now);
  buckets.set(id, recent);
  if (buckets.size > 10000) for (const [k, v] of buckets) if (!v.some((t) => now - t < 3600000)) buckets.delete(k);
  return true;
}

// Express middleware keyed by :line_user_id (runs after the auth check).
function rateLimit(name, max, windowMs) {
  return (req, res, next) => {
    if (allow(name, req.params.line_user_id, max, windowMs)) return next();
    res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
    return res.status(429).json({ error: "You're doing that a lot. Please wait a few minutes and try again.", code: 'rate_limited' });
  };
}

const TEN_MIN = 10 * 60 * 1000;
// Shared limits, so the REST endpoints and the bot draw from one budget per kind.
const LIMITS = {
  ocr: { max: 30, windowMs: TEN_MIN },        // receipt scans (REST, bot photos, bill item scans)
  voice: { max: 30, windowMs: TEN_MIN },      // transcriptions (LIFF mic, bot voice messages)
  text: { max: 60, windowMs: TEN_MIN },       // bot free-text parsing
  statement: { max: 30, windowMs: TEN_MIN },  // statement previews (LLM categories)
  slipRead: { max: 120, windowMs: TEN_MIN },  // bulk slip reads (Vision); duplicates count too
  slipImport: { max: 20, windowMs: TEN_MIN }, // bulk slip imports
};

module.exports = { allow, rateLimit, LIMITS, _buckets: buckets };
