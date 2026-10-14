const supabase = require('../config/supabase');

// Fetches a user's expense categories, used to ground AI category suggestions in real data.
async function fetchExpenseCategories(lineUserId) {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name')
    .eq('line_user_id', lineUserId)
    .eq('type', 'expense');

  if (error) throw error;
  return data || [];
}

function matchCategoryByName(categories, name) {
  if (!name) return null;
  return categories.find((c) => c.name.toLowerCase() === String(name).toLowerCase()) || null;
}

module.exports = { fetchExpenseCategories, matchCategoryByName };
