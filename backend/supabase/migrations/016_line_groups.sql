-- 016: LINE group split tracker.
--
-- The bot can be added to a LINE group (or multi-person room). Members log
-- shared costs there; each expense is split equally among the group's joined
-- members (or the payer + @mentioned people), and the bot keeps running
-- "who owes whom" balances, with settle-up payments recorded the same way.
--
-- A standard Official Account can't list a group's members, so members are
-- recorded as they appear: anyone who sends a message in the group, or is
-- @mentioned in an expense, joins. Each member's share is also written to
-- their own personal ledger as an expense (transaction_id below), per the
-- owner's "my share only" decision.
--
-- Additive only: no existing table changes.

CREATE TABLE IF NOT EXISTS line_groups (
  group_id VARCHAR(64) PRIMARY KEY,          -- LINE groupId (C...) or roomId (R...)
  source_type VARCHAR(10) NOT NULL CHECK (source_type IN ('group', 'room')),
  name VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,   -- false after the bot is removed
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS line_group_members (
  group_id VARCHAR(64) NOT NULL REFERENCES line_groups(group_id) ON DELETE CASCADE,
  line_user_id VARCHAR(255) NOT NULL REFERENCES users(line_user_id) ON DELETE CASCADE,
  display_name VARCHAR(255),
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  left_at TIMESTAMP WITH TIME ZONE,           -- set on memberLeft; excluded from new splits
  PRIMARY KEY (group_id, line_user_id)
);
CREATE INDEX IF NOT EXISTS idx_line_group_members_user ON line_group_members(line_user_id);

-- kind 'expense': payer paid `amount`, shared by the rows in group_expense_shares.
-- kind 'settlement': payer paid `amount` to one member (a single share row
-- for the receiver), reducing what the payer owes.
CREATE TABLE IF NOT EXISTS group_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id VARCHAR(64) NOT NULL REFERENCES line_groups(group_id) ON DELETE CASCADE,
  kind VARCHAR(12) NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense', 'settlement')),
  payer_line_user_id VARCHAR(255) NOT NULL REFERENCES users(line_user_id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_group_expenses_group ON group_expenses(group_id, created_at DESC);

CREATE TABLE IF NOT EXISTS group_expense_shares (
  expense_id UUID NOT NULL REFERENCES group_expenses(id) ON DELETE CASCADE,
  line_user_id VARCHAR(255) NOT NULL REFERENCES users(line_user_id) ON DELETE CASCADE,
  share DECIMAL(12, 2) NOT NULL CHECK (share >= 0),
  -- The member's personal-ledger copy of their share (expenses only).
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  PRIMARY KEY (expense_id, line_user_id)
);
CREATE INDEX IF NOT EXISTS idx_group_expense_shares_user ON group_expense_shares(line_user_id);

ALTER TABLE line_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_expense_shares ENABLE ROW LEVEL SECURITY;
-- No policies: only the backend (service role, bypasses RLS) touches these.
