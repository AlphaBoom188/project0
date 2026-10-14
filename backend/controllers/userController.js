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
