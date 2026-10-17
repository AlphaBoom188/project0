-- Migration 015: investment lots, holding currency, goal tracker
--
-- Adapts the Yahoo Finance lot model + Portseido goal tracker
-- (docs/master_uxui_specification_finance.md) to this schema. Decisions:
--   * Lots are the source of truth for a holding; asset_holdings.quantity /
--     average_cost become a server-maintained cache of the open position, so a
--     fully sold holding legitimately has quantity 0.
--   * Realized gains / win rate match sells to buys FIFO (closed lots).
--   * Every holding has a currency (THB or USD); portfolio totals are shown in
--     THB using the live USD->THB rate.
--   * Dividends, benchmark history and goal projections are computed on read
--     from lots + Yahoo data -- nothing else is stored.
-- New tables have RLS enabled with no policies: the backend's service-role key
-- bypasses RLS, while the anon key gets no access at all.

-- 1) Holding currency. Existing rows: Thai listings (.BK), mutual funds and gold
--    are THB; everything else (US stocks/ETFs, crypto priced by CoinGecko in USD) is USD.
ALTER TABLE asset_holdings ADD COLUMN IF NOT EXISTS currency VARCHAR(3);
UPDATE asset_holdings
SET currency = CASE WHEN symbol ILIKE '%.BK' OR asset_type IN ('mutual_fund', 'gold') THEN 'THB' ELSE 'USD' END
WHERE currency IS NULL;
ALTER TABLE asset_holdings ALTER COLUMN currency SET DEFAULT 'USD';
ALTER TABLE asset_holdings ALTER COLUMN currency SET NOT NULL;
ALTER TABLE asset_holdings DROP CONSTRAINT IF EXISTS asset_holdings_currency_check;
ALTER TABLE asset_holdings ADD CONSTRAINT asset_holdings_currency_check CHECK (currency IN ('THB', 'USD'));

-- 2) Previous close, for "Day's gain" (stored by the price refresh).
ALTER TABLE asset_holdings ADD COLUMN IF NOT EXISTS previous_close NUMERIC(14, 4);

-- 3) quantity is now the open position derived from lots, so 0 is valid.
ALTER TABLE asset_holdings DROP CONSTRAINT IF EXISTS asset_holdings_quantity_check;
ALTER TABLE asset_holdings ADD CONSTRAINT asset_holdings_quantity_check CHECK (quantity >= 0);

-- 4) Lots: one row per buy or sell. price/fee are per the holding's currency.
CREATE TABLE IF NOT EXISTS asset_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id VARCHAR NOT NULL REFERENCES users(line_user_id) ON DELETE CASCADE,
  holding_id UUID NOT NULL REFERENCES asset_holdings(id) ON DELETE CASCADE,
  side VARCHAR(4) NOT NULL CHECK (side IN ('buy', 'sell')),
  quantity NUMERIC(18, 6) NOT NULL CHECK (quantity > 0),
  price NUMERIC(14, 4) NOT NULL CHECK (price >= 0),
  fee NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  trade_date DATE NOT NULL, -- Asia/Bangkok calendar date
  comment VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_asset_lots_holding_id ON asset_lots(holding_id);
CREATE INDEX IF NOT EXISTS idx_asset_lots_line_user_id ON asset_lots(line_user_id);
ALTER TABLE asset_lots ENABLE ROW LEVEL SECURITY;

-- Every existing holding becomes one opening "buy" lot at its average cost,
-- dated when it was added (Bangkok date). Re-running is safe: holdings that
-- already have lots are skipped.
INSERT INTO asset_lots (line_user_id, holding_id, side, quantity, price, trade_date, comment)
SELECT h.line_user_id, h.id, 'buy', h.quantity, h.average_cost,
       (COALESCE(h.created_at, NOW()) AT TIME ZONE 'Asia/Bangkok')::date, 'Opening balance (migrated)'
FROM asset_holdings h
WHERE h.quantity > 0
  AND NOT EXISTS (SELECT 1 FROM asset_lots l WHERE l.holding_id = h.id);

-- 5) Goal tracker: one goal per user. Percentages are stored as percents (10 = 10%).
CREATE TABLE IF NOT EXISTS investment_goals (
  line_user_id VARCHAR PRIMARY KEY REFERENCES users(line_user_id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  start_value NUMERIC(16, 2) NOT NULL CHECK (start_value >= 0),
  years INTEGER NOT NULL CHECK (years BETWEEN 1 AND 60),
  expected_annual_return NUMERIC(6, 3) NOT NULL CHECK (expected_annual_return BETWEEN -50 AND 100),
  monthly_contribution NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (monthly_contribution >= 0),
  contribution_growth NUMERIC(6, 3) NOT NULL DEFAULT 0 CHECK (contribution_growth BETWEEN 0 AND 100),
  target_value NUMERIC(16, 2) CHECK (target_value > 0), -- optional; defaults to the projected end value
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE investment_goals ENABLE ROW LEVEL SECURITY;
