const supabase = require('../config/supabase');
const { upsertUser } = require('../services/userUpsert');

const userController = {
  // Create or update user after LINE Login
  async createOrUpdateUser(req, res) {
    try {
      const { line_user_id, display_name, picture_url } = req.body;

      if (!line_user_id) {
        return res.status(400).json({ error: 'line_user_id is required' });
      }

      const user = await upsertUser({ lineUserId: line_user_id, displayName: display_name, pictureUrl: picture_url });

      res.json({ success: true, user });
    } catch (error) {
      console.error('Error in createOrUpdateUser:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Get user profile
  async getUser(req, res) {
    try {
      const { line_user_id } = req.params;

      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('line_user_id', line_user_id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'User not found' });
        }
        throw error;
      }

      res.json({ success: true, user });
    } catch (error) {
      console.error('Error in getUser:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Update user billing cycle
  async updateBillingCycle(req, res) {
    try {
      const { line_user_id } = req.params;
      const { billing_cycle_start_day } = req.body;

      if (!billing_cycle_start_day || billing_cycle_start_day < 1 || billing_cycle_start_day > 31) {
        return res.status(400).json({ error: 'billing_cycle_start_day must be between 1 and 31' });
      }

      const { data: user, error } = await supabase
        .from('users')
        .update({ billing_cycle_start_day })
        .eq('line_user_id', line_user_id)
        .select()
        .single();

      if (error) throw error;

      res.json({ success: true, user });
    } catch (error) {
      console.error('Error in updateBillingCycle:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Update notification/thumbnail preferences
  async updatePreferences(req, res) {
    try {
      const { line_user_id } = req.params;
      const { notifications_enabled, thumbnails_enabled, email } = req.body;

      const updateData = {};
      if (notifications_enabled !== undefined) updateData.notifications_enabled = Boolean(notifications_enabled);
      if (thumbnails_enabled !== undefined) updateData.thumbnails_enabled = Boolean(thumbnails_enabled);
      if (email !== undefined) {
        if (email !== null && email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return res.status(400).json({ error: 'email is not a valid address' });
        }
        updateData.email = email || null;
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'At least one of notifications_enabled, thumbnails_enabled, or email is required' });
      }

      const { data: user, error } = await supabase
        .from('users')
        .update(updateData)
        .eq('line_user_id', line_user_id)
        .select()
        .single();

      if (error) throw error;

      res.json({ success: true, user });
    } catch (error) {
      console.error('Error in updatePreferences:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Configure the Emergency Fund goal: a target amount plus which existing
  // account's balance counts as "current progress" (see migration 011's
  // header comment for why this points at accounts instead of its own ledger).
  // Either field can be cleared by passing null.
  async updateEmergencyFund(req, res) {
    try {
      const { line_user_id } = req.params;
      const { goal_amount, account_id } = req.body;

      const updateData = {};
      if (goal_amount !== undefined) {
        if (goal_amount !== null && goal_amount < 0) {
          return res.status(400).json({ error: 'goal_amount must be non-negative' });
        }
        updateData.emergency_fund_goal_amount = goal_amount;
      }
      if (account_id !== undefined) {
        if (account_id !== null) {
          const { data: account, error: accountError } = await supabase
            .from('accounts')
            .select('id')
            .eq('id', account_id)
            .eq('line_user_id', line_user_id)
            .single();
          if (accountError || !account) {
            return res.status(400).json({ error: 'Invalid account or account does not belong to user' });
          }
        }
        updateData.emergency_fund_account_id = account_id;
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'At least one of goal_amount or account_id is required' });
      }

      const { data: user, error } = await supabase
        .from('users')
        .update(updateData)
        .eq('line_user_id', line_user_id)
        .select()
        .single();
      if (error) throw error;

      res.json({ success: true, user });
    } catch (error) {
      console.error('Error in updateEmergencyFund:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Delete user account
  async deleteUser(req, res) {
    try {
      const { line_user_id } = req.params;

      const { error } = await supabase
        .from('users')
        .delete()
        .eq('line_user_id', line_user_id);

      if (error) throw error;

      res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
      console.error('Error in deleteUser:', error);
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = userController;
