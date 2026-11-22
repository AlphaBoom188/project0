-- 026: "Track as a subscription only" (repeat-payment cards). A tracked rule
-- is listed under Subscriptions & bills but never logs entries by itself:
-- jobs/recurringTransactions.js skips it. The user can switch it to
-- logging later from the rule's action sheet.

ALTER TABLE recurring_transactions ADD COLUMN IF NOT EXISTS track_only BOOLEAN NOT NULL DEFAULT FALSE;

NOTIFY pgrst, 'reload schema';
