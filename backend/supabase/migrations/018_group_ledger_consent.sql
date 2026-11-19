-- 018: consent for group expenses in personal ledgers (security review finding 4).
--
-- Before this, any member of a shared LINE group could log "+x 99999 @you" and
-- a share landed in your personal transactions. Now a member's share is copied
-- to their personal ledger only when users.group_ledger_copies is TRUE:
--   NULL  = never decided: a user who only exists because they spoke in a
--           group chat. No personal copies; the group's balances still count them.
--   TRUE  = set automatically the first time they use the app themselves (LIFF
--           login, iOS login, or a 1:1 chat with the bot), or chosen in Settings.
--   FALSE = turned off in Settings; never switched back on automatically.

ALTER TABLE users ADD COLUMN IF NOT EXISTS group_ledger_copies BOOLEAN;

-- Existing users are app users, except accounts that were created by a group
-- chat (users row created within a minute of joining their first group).
UPDATE users u SET group_ledger_copies = TRUE
WHERE u.group_ledger_copies IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM line_group_members m
    WHERE m.line_user_id = u.line_user_id
      AND m.joined_at BETWEEN u.created_at - INTERVAL '1 minute' AND u.created_at + INTERVAL '1 minute'
  );
