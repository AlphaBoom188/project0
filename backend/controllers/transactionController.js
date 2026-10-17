const supabase = require('../config/supabase');
const {
  createTransaction: createSharedTransaction,
  InvalidCategoryError,
  DuplicateSlipError,
  InvalidAccountError,
} = require('../services/transactionCreate');
const { withSignedThumbnails } = require('../services/signedUrl');
const { autoCategorize } = require('../services/autoCategorize');
const { buildTransactionsCsv } = require('../services/csvExport');
const { sendCsvByEmail } = require('../services/emailRelay');

// Free-text search over description (case-insensitive substring). LIKE wildcards
// in the user's text are escaped so "50%" means a literal percent sign; capped
// at 100 chars since it's a substring match, not a query language.
function applySearch(query, q) {
  const term = typeof q === 'string' ? q.trim().slice(0, 100) : '';
  if (!term) return query;
  return query.ilike('description', `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
}

// Shared by both export endpoints so the download and email paths can't filter differently.
async function queryTransactionsForExport(lineUserId, { type, category_id, start_date, end_date, q }) {
  let query = supabase
    .from('transactions')
    .select('transaction_date, type, amount, description, payment_method, categories ( name )')
    .eq('line_user_id', lineUserId)
    .order('transaction_date', { ascending: false });

  if (type) query = query.eq('type', type);
  if (category_id) query = query.eq('category_id', category_id);
  if (start_date) query = query.gte('transaction_date', start_date);
  if (end_date) query = query.lte('transaction_date', end_date);
  query = applySearch(query, q);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

const transactionController = {
  // Get all transactions for a user
  async getTransactions(req, res) {
    try {
      const { line_user_id } = req.params;
      const { type, category_id, start_date, end_date, q, limit = 50, offset = 0 } = req.query;

      let query = supabase
        .from('transactions')
        .select(`
          *,
          categories (
            id,
            name,
            type
          )
        `)
        .eq('line_user_id', line_user_id)
        .order('transaction_date', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      if (type) {
        query = query.eq('type', type);
      }

      if (category_id) {
        query = query.eq('category_id', category_id);
      }

      if (start_date) {
        query = query.gte('transaction_date', start_date);
      }

      if (end_date) {
        query = query.lte('transaction_date', end_date);
      }

      query = applySearch(query, q);

      const { data: transactions, error } = await query;

      if (error) throw error;

      res.json({ success: true, transactions: await withSignedThumbnails(transactions) });
    } catch (error) {
      console.error('Error in getTransactions:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Export transactions as CSV, with a UTF-8 BOM so Thai text renders correctly
  // when opened directly in Excel rather than as mojibake.
  async exportTransactions(req, res) {
    try {
      const { line_user_id } = req.params;
      const transactions = await queryTransactionsForExport(line_user_id, req.query);
      const csv = buildTransactionsCsv(transactions);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="transactions-${line_user_id}.csv"`);
      res.send('\uFEFF' + csv);
    } catch (error) {
      console.error('Error in exportTransactions:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Same filtered export, emailed as an attachment instead of downloaded directly.
  async exportTransactionsByEmail(req, res) {
    try {
      const { line_user_id } = req.params;

      const { data: user, error: userError } = await supabase
        .from('users')
        .select('email, google_email')
        .eq('line_user_id', line_user_id)
        .single();
      if (userError) throw userError;

      // Prefers the verified Google email (migration 013) over the legacy
      // free-text field -- same export, just a safer address when available.
      const toEmail = user?.google_email || user?.email;
      if (!toEmail) {
        return res.status(400).json({ error: 'No email address saved. Add one in Settings first.' });
      }

      const transactions = await queryTransactionsForExport(line_user_id, req.query);
      const csv = buildTransactionsCsv(transactions);

      await sendCsvByEmail({
        to: toEmail,
        subject: 'Your Expense Export',
        filename: `transactions-${line_user_id}.csv`,
        csv,
      });

      res.json({ success: true, message: `Export emailed to ${toEmail}.` });
    } catch (error) {
      if (error.notConfigured) {
        return res.status(501).json({ error: error.message });
      }
      console.error('Error in exportTransactionsByEmail:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Get a single transaction by ID
  async getTransaction(req, res) {
    try {
      const { line_user_id, transaction_id } = req.params;

      const { data: transaction, error } = await supabase
        .from('transactions')
        .select(`
          *,
          categories (
            id,
            name,
            type
          )
        `)
        .eq('id', transaction_id)
        .eq('line_user_id', line_user_id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Transaction not found' });
        }
        throw error;
      }

      res.json({ success: true, transaction: await withSignedThumbnails(transaction) });
    } catch (error) {
      console.error('Error in getTransaction:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Create a new transaction
  async createTransaction(req, res) {
    try {
      const { line_user_id } = req.params;
      let { category_id } = req.body;
      const { amount, type, description, slip_hash, thumbnail_url, transaction_date, from_account_id, to_account_id, channel } = req.body;

      if (!amount || !type || !transaction_date) {
        return res.status(400).json({
          error: 'amount, type, and transaction_date are required',
        });
      }

      if (!['income', 'expense', 'transfer'].includes(type)) {
        return res.status(400).json({ error: 'type must be income, expense, or transfer' });
      }

      // category_id doesn't apply to transfers (they're not income/expense); for
      // the other two it's normally required, but an expense with a description
      // can be auto-categorized instead of forcing every caller to pick one.
      if (type !== 'transfer' && !category_id) {
        if (type === 'expense' && description) {
          const inferred = await autoCategorize(line_user_id, description);
          category_id = inferred ? inferred.id : null;
        }
        if (!category_id) {
          return res.status(400).json({
            error: 'category_id is required (or provide a description on an expense so it can be auto-categorized)',
          });
        }
      }

      const transaction = await createSharedTransaction({
        lineUserId: line_user_id,
        categoryId: category_id,
        amount,
        type,
        description,
        slipHash: slip_hash,
        thumbnailUrl: thumbnail_url,
        transactionDate: transaction_date,
        fromAccountId: from_account_id,
        toAccountId: to_account_id,
        channel,
      });
      // budget_alert is surfaced as its own response field, not left nested in
      // the transaction row, so the LIFF client can show it without reaching
      // into transaction internals.
      const { budget_alert, ...transactionFields } = transaction;

      res.status(201).json({ success: true, transaction: await withSignedThumbnails(transactionFields), budget_alert: budget_alert || null });
    } catch (error) {
      if (error instanceof InvalidCategoryError || error instanceof InvalidAccountError) {
        return res.status(400).json({ error: error.message });
      }
      if (error instanceof DuplicateSlipError) {
        return res.status(409).json({ error: error.message });
      }
      console.error('Error in createTransaction:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Update a transaction
  async updateTransaction(req, res) {
    try {
      const { line_user_id, transaction_id } = req.params;
      const { category_id, amount, type, description, thumbnail_url, transaction_date } = req.body;

      const updateData = {};
      if (category_id !== undefined) updateData.category_id = category_id;
      if (amount !== undefined) updateData.amount = amount;
      if (type !== undefined) updateData.type = type;
      if (description !== undefined) updateData.description = description;
      if (thumbnail_url !== undefined) updateData.thumbnail_url = thumbnail_url;
      if (transaction_date !== undefined) updateData.transaction_date = transaction_date;

      // If updating category_id, verify it belongs to user
      if (category_id !== undefined) {
        const { data: category, error: categoryError } = await supabase
          .from('categories')
          .select('id')
          .eq('id', category_id)
          .eq('line_user_id', line_user_id)
          .single();

        if (categoryError || !category) {
          return res.status(400).json({ error: 'Invalid category or category does not belong to user' });
        }
      }

      const { data: transaction, error } = await supabase
        .from('transactions')
        .update(updateData)
        .eq('id', transaction_id)
        .eq('line_user_id', line_user_id)
        .select(`
          *,
          categories (
            id,
            name,
            type
          )
        `)
        .single();

      if (error) throw error;

      res.json({ success: true, transaction: await withSignedThumbnails(transaction) });
    } catch (error) {
      console.error('Error in updateTransaction:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Permanently delete every transaction for a user (Settings -> "Clear Transaction History").
  // Irreversible; the client is responsible for confirming with the user before calling this.
  async deleteAllTransactions(req, res) {
    try {
      const { line_user_id } = req.params;

      const { error, count } = await supabase
        .from('transactions')
        .delete({ count: 'exact' })
        .eq('line_user_id', line_user_id);

      if (error) throw error;

      res.json({ success: true, deleted_count: count ?? 0 });
    } catch (error) {
      console.error('Error in deleteAllTransactions:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Delete a transaction
  async deleteTransaction(req, res) {
    try {
      const { line_user_id, transaction_id } = req.params;

      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', transaction_id)
        .eq('line_user_id', line_user_id);

      if (error) throw error;

      res.json({ success: true, message: 'Transaction deleted successfully' });
    } catch (error) {
      console.error('Error in deleteTransaction:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Get transaction summary by category for a date range
  async getTransactionSummary(req, res) {
    try {
      const { line_user_id } = req.params;
      const { start_date, end_date, type } = req.query;

      if (!start_date || !end_date) {
        return res.status(400).json({ error: 'start_date and end_date are required' });
      }

      let query = supabase
        .from('transactions')
        .select(`
          amount,
          type,
          categories (
            id,
            name
          )
        `)
        .eq('line_user_id', line_user_id)
        .gte('transaction_date', start_date)
        .lte('transaction_date', end_date);

      if (type) {
        query = query.eq('type', type);
      }

      const { data: transactions, error } = await query;

      if (error) throw error;

      // Aggregate by category
      const summary = {};
      transactions.forEach((t) => {
        const categoryName = t.categories?.name || 'Uncategorized';
        if (!summary[categoryName]) {
          summary[categoryName] = {
            category_id: t.categories?.id,
            category_name: categoryName,
            total_amount: 0,
            count: 0,
            type: t.type,
          };
        }
        summary[categoryName].total_amount += parseFloat(t.amount);
        summary[categoryName].count += 1;
      });

      res.json({ success: true, summary: Object.values(summary) });
    } catch (error) {
      console.error('Error in getTransactionSummary:', error);
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = transactionController;
