-- Phase 3 schema additions, reconciled against the actual existing schema
-- (docs/PHASE_3_SPEC.md's migration assumed a users.id UUID PK and a from-
-- scratch categories table that don't match this database -- see commit
-- message / conversation for the full reconciliation).
--
-- Deliberately NOT included, because they already exist and would either
-- silently no-op or create a duplicate concept:
--   - users.budget_cycle_start_day -> reusing the existing billing_cycle_start_day
--   - categories table (already exists, line_user_id-keyed, with budget_amount/
--     budget_period/is_preset covering everything the spec's version wanted)
--   - transactions.category_id (already exists, referencing the real categories.id)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'THB',
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) NOT NULL DEFAULT 'Asia/Bangkok';

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) NOT NULL DEFAULT 'CASH';
