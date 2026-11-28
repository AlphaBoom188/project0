-- 027: atomic account balance change. services/accountBalance.js used a
-- read-then-write (two round trips, and two saves at once could lose one).
-- One UPDATE ... SET balance = balance + delta does both in one statement.
-- Only the backend (service role) may call it: the anon key must never be
-- able to move balances.

CREATE OR REPLACE FUNCTION adjust_account_balance(p_account_id UUID, p_delta NUMERIC)
RETURNS NUMERIC
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE accounts SET balance = balance + p_delta WHERE id = p_account_id RETURNING balance;
$$;

REVOKE ALL ON FUNCTION adjust_account_balance(UUID, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION adjust_account_balance(UUID, NUMERIC) TO service_role;

NOTIFY pgrst, 'reload schema';
