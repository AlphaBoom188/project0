-- Recurring expense/income rules. The engine (jobs/recurringTransactions.js)
-- generates a real transaction row whenever next_run_date is due, then advances
-- next_run_date to the following occurrence.

CREATE TABLE IF NOT EXISTS recurring_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id VARCHAR NOT NULL REFERENCES users(line_user_id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
  amount DECIMAL NOT NULL,
  type VARCHAR NOT NULL CHECK (type IN ('income', 'expense')),
  description TEXT,
  frequency VARCHAR NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
  next_run_date TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_line_user_id ON recurring_transactions(line_user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_next_run_date ON recurring_transactions(next_run_date) WHERE is_active = TRUE;
