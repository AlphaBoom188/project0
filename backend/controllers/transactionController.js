const supabase = require('../config/supabase');
const {
  createTransaction: createSharedTransaction,
  InvalidCategoryError,
  DuplicateSlipError,
} = require('../services/transactionCreate');

const transactionController = {
  // Get all transactions for a user
  async getTransactions(req, res) {
    try {
      const { line_user_id } = req.params;
      const { type, category_id, start_date, end_date, limit = 50, offset = 0 } = req.query;

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

      const { data: transactions, error } = await query;

      if (error) throw error;

      res.json({ success: true, transactions });
    } catch (error) {
      console.error('Error in getTransactions:', error);
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

      res.json({ success: true, transaction });
    } catch (error) {
      console.error('Error in getTransaction:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Create a new transaction
  async createTransaction(req, res) {
    try {
      const { line_user_id } = req.params;
      const { category_id, amount, type, description, slip_hash, thumbnail_url, transaction_date } = req.body;

      if (!category_id || !amount || !type || !transaction_date) {
        return res.status(400).json({
          error: 'category_id, amount, type, and transaction_date are required',
        });
      }

      if (!['income', 'expense'].includes(type)) {
        return res.status(400).json({ error: 'type must be either income or expense' });
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
      });

      res.status(201).json({ success: true, transaction });
    } catch (error) {
      if (error instanceof InvalidCategoryError) {
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

      res.json({ success: true, transaction });
    } catch (error) {
      console.error('Error in updateTransaction:', error);
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
