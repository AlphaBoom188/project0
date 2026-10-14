const supabase = require('../config/supabase');

// Creates or updates a user by line_user_id, provisioning preset categories on first creation.
// Shared by the REST /api/users endpoint, the LINE Login callback, and the LINE Bot follow event.
async function upsertUser({ lineUserId, displayName, pictureUrl }) {
  const { data: existingUser, error: fetchError } = await supabase
    .from('users')
    .select('*')
    .eq('line_user_id', lineUserId)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') {
    throw fetchError;
  }

  if (existingUser) {
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({
        display_name: displayName || existingUser.display_name,
        picture_url: pictureUrl || existingUser.picture_url,
      })
      .eq('line_user_id', lineUserId)
      .select()
      .single();

    if (updateError) throw updateError;
    return updatedUser;
  }

  const { data: newUser, error: insertError } = await supabase
    .from('users')
    .insert({ line_user_id: lineUserId, display_name: displayName, picture_url: pictureUrl })
    .select()
    .single();

  if (insertError) throw insertError;

  await supabase.rpc('create_preset_categories', { user_line_id: lineUserId });

  return newUser;
}

module.exports = { upsertUser };
