const supabase = require('../config/supabase');

function monthRange(periodMonth) {
  const start = new Date(periodMonth);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

async function withSpent(event) {
  const { startISO, endISO } = monthRange(event.period_month);
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('amount')
    .eq('line_user_id', event.line_user_id)
    .eq('category_id', event.category_id)
    .eq('type', 'expense')
    .gte('transaction_date', startISO)
    .lt('transaction_date', endISO);
  if (error) throw error;

  const spent = (transactions || []).reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const amount = parseFloat(event.amount);
  return { ...event, spent, remaining: amount - spent, percent: amount > 0 ? Math.min(100, (spent / amount) * 100) : 0 };
}

const budgetEventController = {
  async getBudgetEvents(req, res) {
    try {
      const { line_user_id } = req.params;
      const { month } = req.query;

      let query = supabase
        .from('budget_events')
        .select('*, categories ( id, name )')
        .eq('line_user_id', line_user_id)
        .order('period_month', { ascending: false });
      if (month) query = query.eq('period_month', month);

      const { data: events, error } = await query;
      if (error) throw error;

      const computed = await Promise.all((events || []).map(withSpent));
      res.json({ success: true, budget_events: computed });
    } catch (error) {
      console.error('Error in getBudgetEvents:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async createBudgetEvent(req, res) {
    try {
      const { line_user_id } = req.params;
      const { category_id, title, amount, period_month } = req.body;

      if (!category_id || !title || !amount || !period_month) {
        return res.status(400).json({ error: 'category_id, title, amount, and period_month are required' });
      }
      if (amount <= 0) {
        return res.status(400).json({ error: 'amount must be positive' });
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

      const { data: event, error } = await supabase
        .from('budget_events')
        .insert({ line_user_id, category_id, title, amount, period_month })
        .select('*, categories ( id, name )')
        .single();
      if (error) throw error;

      res.status(201).json({ success: true, budget_event: await withSpent(event) });
    } catch (error) {
      console.error('Error in createBudgetEvent:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async updateBudgetEvent(req, res) {
    try {
      const { line_user_id, event_id } = req.params;
      const { title, amount, period_month } = req.body;

      const updateData = {};
      if (title !== undefined) updateData.title = title;
      if (amount !== undefined) {
        if (amount <= 0) return res.status(400).json({ error: 'amount must be positive' });
        updateData.amount = amount;
      }
      if (period_month !== undefined) updateData.period_month = period_month;

      const { data: event, error } = await supabase
        .from('budget_events')
        .update(updateData)
        .eq('id', event_id)
        .eq('line_user_id', line_user_id)
        .select('*, categories ( id, name )')
        .single();
      if (error) {
        // .single() on zero matched rows (unknown id, or not this user's) -> PGRST116
        if (error.code === 'PGRST116') return res.status(404).json({ error: 'Budget event not found' });
        throw error;
      }

      res.json({ success: true, budget_event: await withSpent(event) });
    } catch (error) {
      console.error('Error in updateBudgetEvent:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async deleteBudgetEvent(req, res) {
    try {
      const { line_user_id, event_id } = req.params;
      const { error } = await supabase.from('budget_events').delete().eq('id', event_id).eq('line_user_id', line_user_id);
      if (error) throw error;
      res.json({ success: true, message: 'Budget event deleted' });
    } catch (error) {
      console.error('Error in deleteBudgetEvent:', error);
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = budgetEventController;
