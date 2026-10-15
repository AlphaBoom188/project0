const supabase = require('../config/supabase');

// Read-modify-write, not an atomic increment -- acceptable at this app's scale
// (single user per line_user_id, low write concurrency) without adding a
// Postgres RPC function just for this. Revisit if that assumption ever breaks.
async function adjustAccountBalance(accountId, delta) {
  const { data: account, error: fetchError } = await supabase.from('accounts').select('balance').eq('id', accountId).single();
  if (fetchError) throw fetchError;

  const newBalance = parseFloat(account.balance) + delta;
  const { error: updateError } = await supabase.from('accounts').update({ balance: newBalance }).eq('id', accountId);
  if (updateError) throw updateError;
}

module.exports = { adjustAccountBalance };
