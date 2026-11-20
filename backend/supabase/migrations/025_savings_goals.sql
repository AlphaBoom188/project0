-- 025: savings goals ("Japan trip ฿50,000 by June"). Progress is the linked
-- account's balance when one is chosen, otherwise saved_amount (what the
-- user adds by hand). reminder_id points at the optional monthly "put aside
-- ฿X" reminder (migration 020) so it can be updated or removed with the goal.
-- Separate from investment_goals (the portfolio goal tracker, migration 015).

CREATE TABLE IF NOT EXISTS savings_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id VARCHAR(64) NOT NULL REFERENCES users(line_user_id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  target_amount NUMERIC(14, 2) NOT NULL CHECK (target_amount > 0),
  target_date DATE,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  saved_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (saved_amount >= 0),
  reminder_id UUID REFERENCES reminders(id) ON DELETE SET NULL,
  achieved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_savings_goals_user ON savings_goals(line_user_id, created_at);
ALTER TABLE savings_goals ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
