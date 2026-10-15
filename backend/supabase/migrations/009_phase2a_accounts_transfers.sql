-- Phase 2A, reconciled against the actual line_user_id-keyed schema (see
-- docs/phase_2_product_architecture_blueprint.md's own migration for the
-- Google-OAuth/UUID-id version this does NOT follow -- that would require a
-- full identity migration across every table and every client; out of scope
-- for this pass. line_user_id stays the primary key everywhere.

-- 1. Accounts & multi-wallet tracking
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id VARCHAR NOT NULL REFERENCES users(line_user_id) ON DELETE CASCADE,
  account_name VARCHAR(128) NOT NULL,
  account_type VARCHAR(32) NOT NULL CHECK (account_type IN ('bank', 'credit_card', 'e_wallet', 'cash')),
  bank_code VARCHAR(32),
  account_number_masked VARCHAR(32),
  balance DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_line_user_id ON accounts(line_user_id);

-- 2. Transfers between accounts (e.g. bank -> e-wallet top-up), without
-- misclassifying them as income/expense
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS from_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS to_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

-- Widen the existing type CHECK (income/expense) to also allow 'transfer'.
-- transactions_type_check is Postgres's deterministic auto-generated name for
-- migration 003's unnamed inline CHECK; DROP IF EXISTS makes this safe to
-- rerun even if that assumption is ever wrong (the ADD below would then just
-- fail loudly on a duplicate constraint name, not silently do nothing).
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check CHECK (type IN ('income', 'expense', 'transfer'));

-- 3. Flexible date-range recurring (e.g. rent due anytime in the 1st-5th
-- window, not necessarily on exactly one day). Nullable/additive -- the
-- existing next_run_date-driven engine in jobs/recurringTransactions.js is
-- unaffected until it's deliberately extended to read these.
ALTER TABLE recurring_transactions
  ADD COLUMN IF NOT EXISTS pay_start_day INTEGER CHECK (pay_start_day BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS pay_end_day INTEGER CHECK (pay_end_day BETWEEN 1 AND 31);
