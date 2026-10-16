-- Migration 010: Shared Bills (reverse-engineered "KhunThong"-style bill splitting)
--
-- Reconciled against docs/phase_2_product_architecture_blueprint.md section 7 --
-- that doc's own shared_bills/shared_bill_participants tables assume a
-- `users.id UUID` primary key and link participants back to a `users` row.
-- This project keeps `line_user_id` as the actual user identity (see Phase 2A),
-- and participants here are NOT required to be registered users at all -- most
-- won't be, since the whole point is splitting a bill with people who may never
-- open the app. Participants are plain display names; settlement is tracked via
-- a public, unguessable-UUID share link (see bill.html / public bill endpoints),
-- not via resolving a second LINE account server-side. Linking a participant to
-- a real account and pushing them LINE notifications is an intentionally
-- deferred decision -- same pattern as pay_start_day/pay_end_day in Phase 2A.

CREATE TABLE IF NOT EXISTS shared_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id VARCHAR NOT NULL REFERENCES users(line_user_id) ON DELETE CASCADE,
  title VARCHAR(128) NOT NULL,
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount > 0),
  split_type VARCHAR(16) NOT NULL CHECK (split_type IN ('equal', 'custom', 'itemized')),
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'settled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shared_bill_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES shared_bills(id) ON DELETE CASCADE,
  display_name VARCHAR(128) NOT NULL,
  amount_owed NUMERIC(12, 2) NOT NULL CHECK (amount_owed >= 0),
  is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at TIMESTAMPTZ
);

-- Only populated for split_type = 'itemized'. participant_id = NULL means the
-- line item (e.g. tax, service charge) is shared equally across everyone,
-- including the creator's own untracked share.
CREATE TABLE IF NOT EXISTS shared_bill_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES shared_bills(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES shared_bill_participants(id) ON DELETE SET NULL,
  name VARCHAR(128) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_shared_bills_line_user_id ON shared_bills(line_user_id);
CREATE INDEX IF NOT EXISTS idx_shared_bill_participants_bill_id ON shared_bill_participants(bill_id);
CREATE INDEX IF NOT EXISTS idx_shared_bill_items_bill_id ON shared_bill_items(bill_id);
