-- 023: morning briefing (opt-in). At 07:30 Bangkok the bot sends today's
-- reminders, calendar events, overdue items and open to-dos in one message,
-- only on days with something to say. Off by default: each one is a LINE
-- push counted against the Official Account's monthly quota. "today" /
-- "วันนี้" in the 1:1 chat gives the same briefing as a (free) reply.

ALTER TABLE users ADD COLUMN IF NOT EXISTS morning_briefing BOOLEAN NOT NULL DEFAULT FALSE;

NOTIFY pgrst, 'reload schema';
