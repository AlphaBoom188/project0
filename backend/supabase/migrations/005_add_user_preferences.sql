-- Adds per-user notification/thumbnail preferences, both defaulted ON.
-- Existing rows get the default applied retroactively since these are NOT NULL.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS thumbnails_enabled BOOLEAN NOT NULL DEFAULT TRUE;
