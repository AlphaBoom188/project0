-- Migration 011: Investment Portfolio & Asset Tracking + Emergency Fund
--
-- Reconciled against docs/phase_2_product_architecture_blueprint.md section 8
-- ("Long-Term Roadmap: Asset & Portfolio Tracking") -- same line_user_id-keyed
-- model as every other table, no users.id UUID dependency.
--
-- Live market prices are only attempted for 'stock'/'etf' (Yahoo Finance's
-- unofficial, keyless chart endpoint) and 'crypto' (CoinGecko's public API,
-- keyed by CoinGecko coin id, e.g. "bitcoin" -- NOT a ticker like "BTC").
-- 'mutual_fund' and 'gold' have no reliable free global pricing API (Thai
-- mutual fund NAVs in particular aren't on either service), so those two
-- asset types are manual-price-entry only by design -- see
-- services/marketPrices.js and the header comment there.
CREATE TABLE IF NOT EXISTS asset_holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id VARCHAR NOT NULL REFERENCES users(line_user_id) ON DELETE CASCADE,
  asset_type VARCHAR(16) NOT NULL CHECK (asset_type IN ('stock', 'etf', 'crypto', 'mutual_fund', 'gold')),
  symbol VARCHAR(32) NOT NULL,
  name VARCHAR(128),
  quantity NUMERIC(18, 6) NOT NULL CHECK (quantity > 0),
  average_cost NUMERIC(14, 4) NOT NULL CHECK (average_cost >= 0),
  current_price NUMERIC(14, 4),
  priced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_holdings_line_user_id ON asset_holdings(line_user_id);

-- Emergency Fund: deliberately NOT a new parallel balance ledger -- it points
-- at an existing accounts row (Phase 2A) and reads that account's real
-- balance as "current amount saved", so there's exactly one source of truth
-- for any given pile of money instead of two that can drift apart.
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_fund_goal_amount NUMERIC(14, 2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_fund_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
