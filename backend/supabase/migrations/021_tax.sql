-- 021: Tax section, Phase 2 (owner decisions 2026-11-19: a Tax tab, tax
-- years 2568 and 2569, PND 90 and 91). The calculation is pure
-- (services/tax/taxMath.js); these tables only hold what the user entered.
--
-- tax_profiles: one row per user per tax year. `profile` = marital status,
-- spouse income, 65+/disabled, children's birth years; `claims` = deduction
-- key -> amount (or count), validated against that year's rules.
-- tax_incomes: one row per income line (kind from the rules catalogue).

CREATE TABLE IF NOT EXISTS tax_profiles (
  line_user_id VARCHAR(64) NOT NULL REFERENCES users(line_user_id) ON DELETE CASCADE,
  tax_year SMALLINT NOT NULL CHECK (tax_year BETWEEN 2560 AND 2600),
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  claims JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (line_user_id, tax_year)
);
ALTER TABLE tax_profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS tax_incomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id VARCHAR(64) NOT NULL REFERENCES users(line_user_id) ON DELETE CASCADE,
  tax_year SMALLINT NOT NULL CHECK (tax_year BETWEEN 2560 AND 2600),
  kind VARCHAR(40) NOT NULL,
  payer VARCHAR(200),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  withheld NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (withheld >= 0),
  expense_method VARCHAR(6) NOT NULL DEFAULT 'flat' CHECK (expense_method IN ('flat', 'actual')),
  actual_expenses NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (actual_expenses >= 0),
  credit_rate NUMERIC(4, 2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tax_incomes_user_year ON tax_incomes(line_user_id, tax_year, created_at);
ALTER TABLE tax_incomes ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
