-- 019: per-bill group collection (owner decision 2026-11-19, replaces the
-- running tab of 016).
--
-- Each "+ข้าว 600" in a LINE group is now a bill: the person who paid asks
-- everyone else for their share; each person pays the owner (PromptPay QR,
-- bank transfer) and uploads a slip, the owner confirms it, and the bill
-- closes as "paid" once every share is paid. The owner can also cancel it.
-- Reuses group_expenses (kind 'expense' = a bill) and group_expense_shares.
--
-- Existing rows from the running-tab era are closed as paid (their debts were
-- settled through the old "settle" entries, which no longer count).

ALTER TABLE group_expenses
  ADD COLUMN IF NOT EXISTS status VARCHAR(10) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'paid', 'cancelled')),
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP WITH TIME ZONE;

-- paid_at: when the owner confirmed (or the owner's own share: at creation).
-- slip_*: the payer's uploaded transfer slip, waiting for the owner.
ALTER TABLE group_expense_shares
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS paid_method VARCHAR(10)
    CHECK (paid_method IN ('owner', 'slip', 'marked')),
  ADD COLUMN IF NOT EXISTS slip_path TEXT,
  ADD COLUMN IF NOT EXISTS slip_status VARCHAR(10)
    CHECK (slip_status IN ('pending', 'confirmed', 'rejected')),
  ADD COLUMN IF NOT EXISTS slip_uploaded_at TIMESTAMP WITH TIME ZONE;

UPDATE group_expenses SET status = 'paid', closed_at = created_at WHERE status = 'open';
UPDATE group_expense_shares s SET paid_at = e.created_at, paid_method = 'owner'
  FROM group_expenses e WHERE s.expense_id = e.id AND s.paid_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_group_expenses_open ON group_expenses(group_id, status, created_at DESC);

-- How a user gets paid back: shown on their bills to the members who owe them.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS promptpay_id VARCHAR(15),
  ADD COLUMN IF NOT EXISTS bank_name VARCHAR(64),
  ADD COLUMN IF NOT EXISTS bank_account_no VARCHAR(20),
  ADD COLUMN IF NOT EXISTS bank_account_name VARCHAR(128);

-- Private bucket for transfer slips (<payer line_user_id>/<ms>-<8 hex>.jpg).
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-slips', 'payment-slips', false)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
