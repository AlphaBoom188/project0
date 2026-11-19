-- 017: production hardening -- error watchdog, run-once jobs, scale index.
-- Additive only.

-- Every error the server logs, grouped by a fingerprint (the message with
-- numbers/ids stripped). Written by services/opsAgent.js; read by the
-- watchdog job, which decides what's small (handled/ignored) and what's big
-- (an alert to the owner's LINE).
CREATE TABLE IF NOT EXISTS error_events (
  fingerprint VARCHAR(64) PRIMARY KEY,           -- sha256 prefix of the normalized message + source
  source VARCHAR(100) NOT NULL,                  -- e.g. 'Error in getAccounts', 'job:dailyDigest', 'process'
  message TEXT NOT NULL,                         -- latest sample message (truncated)
  stack TEXT,                                    -- latest sample stack (truncated)
  count INTEGER NOT NULL DEFAULT 1,              -- all time
  window_count INTEGER NOT NULL DEFAULT 1,       -- since window_started_at (reset by the watchdog)
  window_started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  first_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'handled', 'alerted', 'ignored'))
);
CREATE INDEX IF NOT EXISTS idx_error_events_last_seen ON error_events(last_seen DESC);

-- Run-once guard for scheduled jobs: a job inserts (job, slot) before running,
-- e.g. ('dailyDigest', '2026-11-19'); the PRIMARY KEY makes a second process
-- (or a restart around the schedule time) skip that slot instead of sending
-- every push twice.
CREATE TABLE IF NOT EXISTS job_runs (
  job VARCHAR(64) NOT NULL,
  slot VARCHAR(64) NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMP WITH TIME ZONE,
  ok BOOLEAN,
  detail TEXT,
  PRIMARY KEY (job, slot)
);

-- Alerts sent to the owner (cooldowns + history).
CREATE TABLE IF NOT EXISTS ops_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) NOT NULL,                     -- what it's about (fingerprint, 'db_down', ...)
  severity VARCHAR(16) NOT NULL,
  summary TEXT NOT NULL,
  diagnosis TEXT,                                -- Claude's plain-language diagnosis, when available
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  delivered BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_ops_alerts_key_sent ON ops_alerts(key, sent_at DESC);

-- The main read path ("this user's transactions by date") had only
-- single-column indexes; at millions of rows this composite one is what
-- keeps it fast.
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(line_user_id, transaction_date DESC);

ALTER TABLE error_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_alerts ENABLE ROW LEVEL SECURITY;
-- No policies: only the backend (service role) touches these.
