const supabase = require('../config/supabase');

// One atomic UPDATE through the adjust_account_balance function (migration
// 027): a single round trip, and two saves at once can't lose either change.
// Until 027 is applied it falls back to the old read-modify-write (logged once).
let rpcMissing = false;

async function readModifyWrite(accountId, delta) {
  const { data: account, error: fetchError } = await supabase.from('accounts').select('balance').eq('id', accountId).single();
  if (fetchError) throw fetchError;
  const newBalance = parseFloat(account.balance) + delta;
  const { error: updateError } = await supabase.from('accounts').update({ balance: newBalance }).eq('id', accountId);
  if (updateError) throw updateError;
}

// PostgREST "function not found" (PGRST202) or Postgres undefined_function (42883).
const isMissingFunction = (error) => error && (error.code === 'PGRST202' || error.code === '42883');

async function adjustAccountBalance(accountId, delta) {
  if (!rpcMissing) {
    const { error } = await supabase.rpc('adjust_account_balance', { p_account_id: accountId, p_delta: delta });
    if (!error) return;
    if (!isMissingFunction(error)) throw error;
    rpcMissing = true;
    console.warn('[accountBalance] adjust_account_balance() not found: run migration 027. Using read-modify-write until then.');
  }
  await readModifyWrite(accountId, delta);
}

module.exports = { adjustAccountBalance };
