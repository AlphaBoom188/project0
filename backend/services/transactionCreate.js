const supabase = require('../config/supabase');
const { checkBudgetAndAlert } = require('./budgetAlert');
const { adjustAccountBalance } = require('./accountBalance');

class InvalidCategoryError extends Error {}
class DuplicateSlipError extends Error {}
class InvalidAccountError extends Error {}

async function verifyAccountsBelongToUser(lineUserId, accountIds) {
  const { data, error } = await supabase.from('accounts').select('id').eq('line_user_id', lineUserId).in('id', accountIds);
  if (error) throw error;
  if (!data || data.length !== accountIds.length) {
    throw new InvalidAccountError('Invalid account or account does not belong to user');
  }
}

// Inserts a transaction after verifying the category (income/expense) or both
// accounts (transfer) belong to the user. Shared by the REST /api/transactions
// endpoint and the LINE Bot Confirm action.
async function createTransaction({
  lineUserId,
  categoryId,
  amount,
  type,
  description,
  slipHash,
  thumbnailUrl,
  transactionDate,
  fromAccountId,
  toAccountId,
}) {
  if (type === 'transfer') {
    if (!fromAccountId || !toAccountId) {
      throw new InvalidAccountError('A transfer requires both fromAccountId and toAccountId');
    }
    if (fromAccountId === toAccountId) {
      throw new InvalidAccountError('fromAccountId and toAccountId must be different accounts');
    }
    await verifyAccountsBelongToUser(lineUserId, [fromAccountId, toAccountId]);
  } else {
    const { data: category, error: categoryError } = await supabase
      .from('categories')
      .select('id')
      .eq('id', categoryId)
      .eq('line_user_id', lineUserId)
      .single();

    if (categoryError || !category) {
      throw new InvalidCategoryError('Invalid category or category does not belong to user');
    }

    // Optional: an expense/income can still be attributed to an account (e.g.
    // "lunch paid from BBL account") without that making it a transfer.
    const accountIdsToVerify = [fromAccountId, toAccountId].filter(Boolean);
    if (accountIdsToVerify.length > 0) {
      await verifyAccountsBelongToUser(lineUserId, accountIdsToVerify);
    }
  }

  const { data: transaction, error } = await supabase
    .from('transactions')
    .insert({
      line_user_id: lineUserId,
      category_id: type === 'transfer' ? null : categoryId,
      amount,
      type,
      description: description || null,
      slip_hash: slipHash || null,
      thumbnail_url: thumbnailUrl || null,
      from_account_id: fromAccountId || null,
      to_account_id: toAccountId || null,
      transaction_date: transactionDate,
    })
    .select(
      `
      *,
      categories (
        id,
        name,
        type
      ),
      from_account:accounts!transactions_from_account_id_fkey ( id, account_name ),
      to_account:accounts!transactions_to_account_id_fkey ( id, account_name )
    `
    )
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new DuplicateSlipError('Duplicate slip detected. This receipt has already been recorded.');
    }
    throw error;
  }

  // Balance effects, best-effort after the transaction row is already committed:
  // losing the balance update on a rare failure is preferable to losing the
  // transaction record itself, so these are logged loudly rather than rolled back.
  const balanceUpdates = [];
  if (type === 'transfer') {
    balanceUpdates.push(adjustAccountBalance(fromAccountId, -amount));
    balanceUpdates.push(adjustAccountBalance(toAccountId, amount));
  } else if (type === 'expense' && fromAccountId) {
    balanceUpdates.push(adjustAccountBalance(fromAccountId, -amount));
  } else if (type === 'income' && toAccountId) {
    balanceUpdates.push(adjustAccountBalance(toAccountId, amount));
  }
  if (balanceUpdates.length > 0) {
    await Promise.all(balanceUpdates).catch((err) =>
      console.error('Failed to update account balance for transaction', transaction.id, ':', err.message)
    );
  }

  if (type === 'expense') {
    // Fire-and-forget: never let a budget-check/push failure affect the response.
    checkBudgetAndAlert(lineUserId, categoryId, amount).catch((err) =>
      console.error('checkBudgetAndAlert failed:', err.message)
    );
  }

  return transaction;
}

module.exports = { createTransaction, InvalidCategoryError, DuplicateSlipError, InvalidAccountError };
