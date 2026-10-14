const supabase = require('../config/supabase');

const categoryController = {
  // Get all categories for a user
  async getCategories(req, res) {
    try {
      const { line_user_id } = req.params;
      const { type } = req.query;

      let query = supabase
        .from('categories')
        .select('*')
        .eq('line_user_id', line_user_id)
        .order('created_at', { ascending: true });

      if (type) {
        query = query.eq('type', type);
      }

      const { data: categories, error } = await query;

      if (error) throw error;

      res.json({ success: true, categories });
    } catch (error) {
      console.error('Error in getCategories:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Create a new category
  async createCategory(req, res) {
    try {
      const { line_user_id } = req.params;
      const { name, type, budget_amount, budget_period } = req.body;

      if (!name || !type) {
        return res.status(400).json({ error: 'name and type are required' });
      }

      if (!['income', 'expense'].includes(type)) {
        return res.status(400).json({ error: 'type must be either income or expense' });
      }

      if (budget_period && !['daily', 'weekly', 'monthly', 'yearly'].includes(budget_period)) {
        return res.status(400).json({ error: 'budget_period must be daily, weekly, monthly, or yearly' });
      }

      const { data: category, error } = await supabase
        .from('categories')
        .insert({
          line_user_id,
          name,
          type,
          budget_amount: budget_amount || null,
          budget_period: budget_period || null,
          is_preset: false,
        })
        .select()
        .single();

      if (error) throw error;

      res.status(201).json({ success: true, category });
    } catch (error) {
      console.error('Error in createCategory:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Update a category
  async updateCategory(req, res) {
    try {
      const { line_user_id, category_id } = req.params;
      const { name, budget_amount, budget_period } = req.body;

      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (budget_amount !== undefined) updateData.budget_amount = budget_amount;
      if (budget_period !== undefined) updateData.budget_period = budget_period;

      const { data: category, error } = await supabase
        .from('categories')
        .update(updateData)
        .eq('id', category_id)
        .eq('line_user_id', line_user_id)
        .select()
        .single();

      if (error) throw error;

      res.json({ success: true, category });
    } catch (error) {
      console.error('Error in updateCategory:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Delete a category (with safety check for existing transactions)
  async deleteCategory(req, res) {
    try {
      const { line_user_id, category_id } = req.params;

      // Check if category has transactions
      const { data: transactions, error: checkError } = await supabase
        .from('transactions')
        .select('id')
        .eq('category_id', category_id);

      if (checkError) throw checkError;

      if (transactions && transactions.length > 0) {
        return res.status(400).json({
          error: 'Cannot delete category with existing transactions',
          transaction_count: transactions.length,
          message: 'Please reassign transactions to another category before deleting',
        });
      }

      // Delete the category
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', category_id)
        .eq('line_user_id', line_user_id);

      if (error) throw error;

      res.json({ success: true, message: 'Category deleted successfully' });
    } catch (error) {
      console.error('Error in deleteCategory:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Reassign transactions from one category to another
  async reassignTransactions(req, res) {
    try {
      const { line_user_id } = req.params;
      const { from_category_id, to_category_id } = req.body;

      if (!from_category_id || !to_category_id) {
        return res.status(400).json({ error: 'from_category_id and to_category_id are required' });
      }

      // Verify both categories belong to the user
      const { data: categories, error: verifyError } = await supabase
        .from('categories')
        .select('id')
        .eq('line_user_id', line_user_id)
        .in('id', [from_category_id, to_category_id]);

      if (verifyError) throw verifyError;

      if (!categories || categories.length !== 2) {
        return res.status(400).json({ error: 'Invalid category IDs or categories do not belong to user' });
      }

      // Reassign transactions
      const { error } = await supabase
        .from('transactions')
        .update({ category_id: to_category_id })
        .eq('category_id', from_category_id)
        .eq('line_user_id', line_user_id);

      if (error) throw error;

      res.json({ success: true, message: 'Transactions reassigned successfully' });
    } catch (error) {
      console.error('Error in reassignTransactions:', error);
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = categoryController;
