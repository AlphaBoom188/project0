const supabase = require('../config/supabase');

class InvalidCategoryError extends Error {}
class DuplicateSlipError extends Error {}

// Inserts a transaction after verifying the category belongs to the user.
// Shared by the REST /api/transactions endpoint and the LINE Bot Confirm action.
async function createTransaction({ lineUserId, categoryId, amount, type, description, slipHash, thumbnailUrl, transactionDate }) {
  const { data: category, error: categoryError } = await supabase
    .from('categories')
    .select('id')
    .eq('id', categoryId)
    .eq('line_user_id', lineUserId)
    .single();

  if (categoryError || !category) {
    throw new InvalidCategoryError('Invalid category or category does not belong to user');
  }

  const { data: transaction, error } = await supabase
    .from('transactions')
    .insert({
      line_user_id: lineUserId,
      category_id: categoryId,
      amount,
      type,
      description: description || null,
      slip_hash: slipHash || null,
      thumbnail_url: thumbnailUrl || null,
      transaction_date: transactionDate,
    })
    .select(`
      *,
      categories (
        id,
        name,
        type
      )
    `)
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new DuplicateSlipError('Duplicate slip detected. This receipt has already been recorded.');
    }
    throw error;
  }

  return transaction;
}

module.exports = { createTransaction, InvalidCategoryError, DuplicateSlipError };
