const supabase = require('../config/supabase');

const DEFAULTS = { notificationsEnabled: true, saveReceiptThumbnails: true };

// Fails open to the documented defaults (both ON) -- including if migration
// 005 hasn't been applied yet and the columns don't exist, so callers don't
// need to special-case rollout ordering.
async function getUserPreferences(lineUserId) {
  const { data, error } = await supabase
    .from('users')
    .select('notifications_enabled, thumbnails_enabled')
    .eq('line_user_id', lineUserId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error('Error fetching user preferences, defaulting to enabled:', error.message);
    return DEFAULTS;
  }

  return {
    notificationsEnabled: data.notifications_enabled !== false,
    saveReceiptThumbnails: data.thumbnails_enabled !== false,
  };
}

module.exports = { getUserPreferences };
