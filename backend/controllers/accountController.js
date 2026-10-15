const supabase = require('../config/supabase');

const ACCOUNT_TYPES = ['bank', 'credit_card', 'e_wallet', 'cash'];

const accountController = {
  async getAccounts(req, res) {
    try {
      const { line_user_id } = req.params;

      const { data: accounts, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('line_user_id', line_user_id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      res.json({ success: true, accounts });
    } catch (error) {
      console.error('Error in getAccounts:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async createAccount(req, res) {
    try {
      const { line_user_id } = req.params;
      const { account_name, account_type, bank_code, account_number_masked, balance } = req.body;

      if (!account_name || !account_type) {
        return res.status(400).json({ error: 'account_name and account_type are required' });
      }
      if (!ACCOUNT_TYPES.includes(account_type)) {
        return res.status(400).json({ error: `account_type must be one of: ${ACCOUNT_TYPES.join(', ')}` });
      }

      const { data: account, error } = await supabase
        .from('accounts')
        .insert({
          line_user_id,
          account_name,
          account_type,
          bank_code: bank_code || null,
          account_number_masked: account_number_masked || null,
          balance: balance || 0,
        })
        .select()
        .single();

      if (error) throw error;

      res.status(201).json({ success: true, account });
    } catch (error) {
      console.error('Error in createAccount:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async updateAccount(req, res) {
    try {
      const { line_user_id, account_id } = req.params;
      const { account_name, bank_code, account_number_masked, balance } = req.body;

      const updateData = {};
      if (account_name !== undefined) updateData.account_name = account_name;
      if (bank_code !== undefined) updateData.bank_code = bank_code;
      if (account_number_masked !== undefined) updateData.account_number_masked = account_number_masked;
      // Direct balance edits are for correcting drift (e.g. after manually
      // reconciling with the real bank app) -- normal balance changes should
      // flow through transactions/transfers instead, not this endpoint.
      if (balance !== undefined) updateData.balance = balance;

      const { data: account, error } = await supabase
        .from('accounts')
        .update(updateData)
        .eq('id', account_id)
        .eq('line_user_id', line_user_id)
        .select()
        .single();

      if (error) throw error;

      res.json({ success: true, account });
    } catch (error) {
      console.error('Error in updateAccount:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async deleteAccount(req, res) {
    try {
      const { line_user_id, account_id } = req.params;

      const { data: inUse, error: checkError } = await supabase
        .from('transactions')
        .select('id')
        .or(`from_account_id.eq.${account_id},to_account_id.eq.${account_id}`)
        .limit(1);

      if (checkError) throw checkError;
      if (inUse && inUse.length > 0) {
        return res.status(400).json({ error: 'Cannot delete an account that has transactions. Reassign or remove those first.' });
      }

      const { error } = await supabase.from('accounts').delete().eq('id', account_id).eq('line_user_id', line_user_id);

      if (error) throw error;

      res.json({ success: true, message: 'Account deleted successfully' });
    } catch (error) {
      console.error('Error in deleteAccount:', error);
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = accountController;
