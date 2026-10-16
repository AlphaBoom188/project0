-- Migration 012: Event/Occasion budget buckets
--
-- From docs/phase_2_product_architecture_blueprint.md section 5 ("Breakdown
-- Budgeting & One-Time Expected Costs") -- never built until now. Distinction
-- confirmed with the user: a category's existing budget_amount/budget_period
-- (categories table) is the recurring, predictable limit ("normal"); this
-- table is the one-off, specific-month limit layered on top of it
-- ("special"/event/occasion), e.g. a one-off clinic visit stacked on top of
-- a regular monthly skincare budget. Always tied to an existing category
-- (category_id NOT NULL) -- "spent" is computed by summing that category's
-- transactions within the target month, reusing the existing
-- category/transaction link rather than adding a new transaction-tagging
-- column. Deliberately NOT wired into services/budgetAlert.js's push-alert
-- system in this round -- this is a Budgets-tab display feature (a progress
-- bar) for now, not a new notification trigger. A real product decision
-- left for later, same pattern as pay_start_day/pay_end_day in Phase 2A.
CREATE TABLE IF NOT EXISTS budget_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id VARCHAR NOT NULL REFERENCES users(line_user_id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  title VARCHAR(128) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  period_month DATE NOT NULL, -- first day of the target month (YYYY-MM-01)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_events_line_user_id ON budget_events(line_user_id);
