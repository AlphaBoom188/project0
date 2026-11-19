const supabase = require('../config/supabase');

// Creates or updates a user by line_user_id, provisioning preset categories on first creation.
// Shared by the REST /api/users endpoint, the LINE Login callback, the LINE Bot follow event
// and 1:1 messages (appUser: true), and group chats (appUser: false).
//
// appUser: the person is using the app themselves, which turns on copies of their
// group-expense shares into their personal ledger (users.group_ledger_copies,
// migration 018) unless they already decided. Someone who only spoke in a group
// stays undecided (NULL): no personal copies.
const isMissingColumn = (error) => error && (error.code === 'PGRST204' || /group_ledger_copies/.test(error.message || ''));

async function upsertUser({ lineUserId, displayName, pictureUrl, appUser = true }) {
  const { data: existingUser, error: fetchError } = await supabase
    .from('users')
    .select('*')
    .eq('line_user_id', lineUserId)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') {
    throw fetchError;
  }

  if (existingUser) {
    const update = {
      display_name: displayName || existingUser.display_name,
      picture_url: pictureUrl || existingUser.picture_url,
    };
    if (appUser && existingUser.group_ledger_copies === null) update.group_ledger_copies = true;
    let { data: updatedUser, error: updateError } = await supabase.from('users').update(update).eq('line_user_id', lineUserId).select().single();
    if (isMissingColumn(updateError)) {
      // Migration 018 not applied yet: behave as before it.
      delete update.group_ledger_copies;
      ({ data: updatedUser, error: updateError } = await supabase.from('users').update(update).eq('line_user_id', lineUserId).select().single());
    }
    if (updateError) throw updateError;
    return updatedUser;
  }

  const row = { line_user_id: lineUserId, display_name: displayName, picture_url: pictureUrl };
  if (appUser) row.group_ledger_copies = true;
  let { data: newUser, error: insertError } = await supabase.from('users').insert(row).select().single();
  if (isMissingColumn(insertError)) {
    delete row.group_ledger_copies;
    ({ data: newUser, error: insertError } = await supabase.from('users').insert(row).select().single());
  }
  if (insertError) throw insertError;

  await supabase.rpc('create_preset_categories', { user_line_id: lineUserId });

  return newUser;
}

module.exports = { upsertUser };
