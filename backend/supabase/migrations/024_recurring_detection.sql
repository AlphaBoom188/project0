-- 024: repeat-payment detection. Keys of detected repeat payments the user
-- dismissed or already turned into a reminder (services/recurringDetect.js),
-- so they aren't suggested again.

ALTER TABLE users ADD COLUMN IF NOT EXISTS recurring_dismissed TEXT[] NOT NULL DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
