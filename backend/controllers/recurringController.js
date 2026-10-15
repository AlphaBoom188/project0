const supabase = require('../config/supabase');

const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'];

function validatePayWindow(payStartDay, payEndDay) {
  for (const [label, value] of [['pay_start_day', payStartDay], ['pay_end_day', payEndDay]]) {
    if (value !== undefined && value !== null && (value < 1 || value > 31)) {
      return `${label} must be between 1 and 31`;
    }
  }
  return null;
}

const recurringController = {
  // List a user's recurring rules
  async getRecurring(req, res) {
    try {
      const { line_user_id } = req.params;

      const { data: recurring, error } = await supabase
        .from('recurring_transactions')
        .select('*, categories ( id, name, type )')
        .eq('line_user_id', line_user_id)
        .order('next_run_date', { ascending: true });

      if (error) throw error;

      res.json({ success: true, recurring });
    } catch (error) {
      console.error('Error in getRecurring:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Create a recurring rule. next_run_date is the first occurrence (defaults to now).
  async createRecurring(req, res) {
    try {
      const { line_user_id } = req.params;
      const { category_id, amount, type, description, frequency, start_date, pay_start_day, pay_end_day } = req.body;

      if (!category_id || !amount || !type || !frequency) {
        return res.status(400).json({ error: 'category_id, amount, type, and frequency are required' });
      }
      if (!['income', 'expense'].includes(type)) {
        return res.status(400).json({ error: 'type must be either income or expense' });
      }
      if (!FREQUENCIES.includes(frequency)) {
        return res.status(400).json({ error: `frequency must be one of: ${FREQUENCIES.join(', ')}` });
      }
      const payWindowError = validatePayWindow(pay_start_day, pay_end_day);
      if (payWindowError) {
        return res.status(400).json({ error: payWindowError });
      }

      const { data: category, error: categoryError } = await supabase
        .from('categories')
        .select('id')
        .eq('id', category_id)
        .eq('line_user_id', line_user_id)
        .single();

      if (categoryError || !category) {
        return res.status(400).json({ error: 'Invalid category or category does not belong to user' });
      }

      const { data: rule, error } = await supabase
        .from('recurring_transactions')
        .insert({
          line_user_id,
          category_id,
          amount,
          type,
          description: description || null,
          frequency,
          next_run_date: start_date || new Date().toISOString(),
          is_active: true,
          pay_start_day: pay_start_day || null,
          pay_end_day: pay_end_day || null,
        })
        .select('*, categories ( id, name, type )')
        .single();

      if (error) throw error;

      res.status(201).json({ success: true, recurring: rule });
    } catch (error) {
      console.error('Error in createRecurring:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Update a rule's fields, or toggle is_active to pause/resume it without deleting.
  async updateRecurring(req, res) {
    try {
      const { line_user_id, recurring_id } = req.params;
      const { category_id, amount, description, frequency, is_active, pay_start_day, pay_end_day } = req.body;

      const updateData = {};
      if (category_id !== undefined) updateData.category_id = category_id;
      if (amount !== undefined) updateData.amount = amount;
      if (description !== undefined) updateData.description = description;
      if (frequency !== undefined) {
        if (!FREQUENCIES.includes(frequency)) {
          return res.status(400).json({ error: `frequency must be one of: ${FREQUENCIES.join(', ')}` });
        }
        updateData.frequency = frequency;
      }
      if (is_active !== undefined) updateData.is_active = Boolean(is_active);
      if (pay_start_day !== undefined || pay_end_day !== undefined) {
        const payWindowError = validatePayWindow(pay_start_day, pay_end_day);
        if (payWindowError) {
          return res.status(400).json({ error: payWindowError });
        }
        if (pay_start_day !== undefined) updateData.pay_start_day = pay_start_day;
        if (pay_end_day !== undefined) updateData.pay_end_day = pay_end_day;
      }

      const { data: rule, error } = await supabase
        .from('recurring_transactions')
        .update(updateData)
        .eq('id', recurring_id)
        .eq('line_user_id', line_user_id)
        .select('*, categories ( id, name, type )')
        .single();

      if (error) throw error;

      res.json({ success: true, recurring: rule });
    } catch (error) {
      console.error('Error in updateRecurring:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async deleteRecurring(req, res) {
    try {
      const { line_user_id, recurring_id } = req.params;

      const { error } = await supabase
        .from('recurring_transactions')
        .delete()
        .eq('id', recurring_id)
        .eq('line_user_id', line_user_id);

      if (error) throw error;

      res.json({ success: true, message: 'Recurring rule deleted' });
    } catch (error) {
      console.error('Error in deleteRecurring:', error);
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = recurringController;
