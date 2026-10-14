const supabase = require('../config/supabase');

const userController = {
  // Create or update user after LINE Login
  async createOrUpdateUser(req, res) {
    try {
      const { line_user_id, display_name, picture_url } = req.body;

      if (!line_user_id) {
        return res.status(400).json({ error: 'line_user_id is required' });
      }

      // Check if user exists
      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('line_user_id', line_user_id)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      let user;

      if (existingUser) {
        // Update existing user
        const { data: updatedUser, error: updateError } = await supabase
          .from('users')
          .update({
            display_name: display_name || existingUser.display_name,
            picture_url: picture_url || existingUser.picture_url,
          })
          .eq('line_user_id', line_user_id)
          .select()
          .single();

        if (updateError) throw updateError;
        user = updatedUser;
      } else {
        // Create new user
        const { data: newUser, error: insertError } = await supabase
          .from('users')
          .insert({
            line_user_id,
            display_name,
            picture_url,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        user = newUser;

        // Create preset categories for new user
        await supabase.rpc('create_preset_categories', {
          user_line_id: line_user_id,
        });
      }

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
