-- Migration 013: Google OAuth for verified export email
--
-- Explicitly scoped: LINE Login remains the ONLY identity/auth model for the
-- app (the Phase 2A decision to keep line_user_id as the real primary key is
-- unchanged). Google Sign-In here is narrow and secondary -- its only job is
-- replacing the free-text, unverified `email` column with a real, verified
-- Google account email for the CSV export feature, per the user's explicit
-- framing: "LINE login as the main entry but the google oauth for export."
-- `email` is kept as-is (legacy manual fallback for anyone who hasn't linked
-- Google yet); services/emailRelay's caller prefers google_email when set.
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_email VARCHAR;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_linked_at TIMESTAMPTZ;
