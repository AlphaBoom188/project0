-- 020: reminders, to-dos and notes (owner decision 2026-11-20, Abdul-style
-- assistant), plus a read-only Google Calendar link.
--
-- A reminder is one row. remind_at is the current occurrence (NULL = a to-do
-- with no time). next_fire_at is when the minute job pushes next: the
-- occurrence itself, a follow-up (important / must-not-miss only) or a snooze.
-- fire_count counts pushes for the current occurrence. A repeating reminder
-- moves remind_at to its next occurrence once this one is finished.
--
-- Group reminders (group_id set) are posted in that LINE group and @mention
-- mention_ids; line_user_id is whoever set it.

CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id VARCHAR(64) NOT NULL REFERENCES users(line_user_id) ON DELETE CASCADE,
  group_id VARCHAR(64) REFERENCES line_groups(group_id) ON DELETE CASCADE,
  mention_ids TEXT[] NOT NULL DEFAULT '{}',
  title VARCHAR(200) NOT NULL,
  details TEXT,
  category VARCHAR(10) CHECK (category IN ('work', 'finance', 'health', 'client', 'order', 'other')),
  importance SMALLINT NOT NULL DEFAULT 0 CHECK (importance BETWEEN 0 AND 2),
  repeat VARCHAR(10) NOT NULL DEFAULT 'none' CHECK (repeat IN ('none', 'daily', 'weekdays', 'weekly', 'monthly')),
  remind_at TIMESTAMP WITH TIME ZONE,
  anchor_at TIMESTAMP WITH TIME ZONE, -- first occurrence of a repeating reminder: its time of day, weekday, day of month
  next_fire_at TIMESTAMP WITH TIME ZONE,
  fire_count SMALLINT NOT NULL DEFAULT 0,
  last_fired_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  done_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CHECK (repeat = 'none' OR (remind_at IS NOT NULL AND anchor_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(next_fire_at) WHERE status = 'open' AND next_fire_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(line_user_id, status, remind_at);
CREATE INDEX IF NOT EXISTS idx_reminders_group ON reminders(group_id) WHERE group_id IS NOT NULL;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

-- Notes: free text, filed under the Bangkok day they were written for.
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id VARCHAR(64) NOT NULL REFERENCES users(line_user_id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  note_date DATE NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notes_user_date ON notes(line_user_id, note_date DESC);
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Google Calendar (read-only, calendar.events.readonly). The refresh token is
-- stored AES-256-GCM encrypted (services/googleCalendar.js); events are read
-- on demand and never stored.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS gcal_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS gcal_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS gcal_linked_at TIMESTAMP WITH TIME ZONE;

NOTIFY pgrst, 'reload schema';
