const supabase = require('../config/supabase');
const { evaluateBudgetAlert, pushBudgetAlertIfEnabled } = require('./budgetAlert');
const { evaluateEventBudgetAlerts, pushEventBudgetAlertsIfEnabled } = require('./eventBudgetAlert');
const { adjustAccountBalance } = require('./accountBalance');

const { isOwnThumbnailPath } = require('./receiptThumbnail');

class InvalidCategoryError extends Error {}
class InvalidThumbnailError extends Error {}
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
  // 'liff' gets the budget alert back in the return value for an instant
  // in-app banner instead of a LINE push -- every other value (the LINE bot,
  // the recurring-transactions job, or simply omitted) pushes via LINE, since
  // that's the only way to reach someone who isn't looking at a screen.
  // Never both, so one budget crossing never produces two alerts.
  channel,
}) {
  if (thumbnailUrl && !isOwnThumbnailPath(lineUserId, thumbnailUrl)) {
    throw new InvalidThumbnailError('thumbnail_url must be a receipt thumbnail returned for this user by the scan endpoint');
  }
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

  let budgetAlert = null;
  let eventBudgetAlerts = [];
  if (type === 'expense') {
    // Cheap DB-only reads, safe to await (unlike the push itself) -- this is
    // what lets the LIFF channel get the alert back in this same response.
    try {
      budgetAlert = await evaluateBudgetAlert(lineUserId, categoryId, amount);
    } catch (err) {
      console.error('evaluateBudgetAlert failed:', err.message);
    }

    if (budgetAlert && channel !== 'liff') {
      // Fire-and-forget: never let a push failure affect the response.
      pushBudgetAlertIfEnabled(lineUserId, budgetAlert).catch((err) =>
        console.error('pushBudgetAlertIfEnabled failed:', err.message)
      );
    }

    // Event/occasion buckets for this category + month: same routing rule.
    try {
      eventBudgetAlerts = await evaluateEventBudgetAlerts(lineUserId, categoryId, amount, transaction.transaction_date);
    } catch (err) {
      console.error('evaluateEventBudgetAlerts failed:', err.message);
    }
    if (eventBudgetAlerts.length > 0 && channel !== 'liff') {
      pushEventBudgetAlertsIfEnabled(lineUserId, eventBudgetAlerts).catch((err) =>
        console.error('pushEventBudgetAlertsIfEnabled failed:', err.message)
      );
    }
  }

  return { ...transaction, budget_alert: budgetAlert, event_budget_alerts: eventBudgetAlerts };
}

module.exports = { createTransaction, InvalidCategoryError, InvalidThumbnailError, DuplicateSlipError, InvalidAccountError };
