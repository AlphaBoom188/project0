const supabase = require('../config/supabase');
const { upsertUser } = require('../services/userUpsert');

const userController = {
  // Create or update user after LINE Login
  async createOrUpdateUser(req, res) {
    try {
      const { line_user_id, display_name, picture_url, via } = req.body;

      if (!line_user_id) {
        return res.status(400).json({ error: 'line_user_id is required' });
      }

      // via: 'group_bill' -- opened from a group bill's Pay / See who paid
      // button. That alone doesn't make someone an app user, so it doesn't
      // turn on personal-ledger copies of group shares (migration 018).
      const user = await upsertUser({ lineUserId: line_user_id, displayName: display_name, pictureUrl: picture_url, appUser: via !== 'group_bill' });

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
      const { notifications_enabled, thumbnails_enabled, email, group_ledger_copies } = req.body;

      const updateData = {};
      if (notifications_enabled !== undefined) updateData.notifications_enabled = Boolean(notifications_enabled);
      if (thumbnails_enabled !== undefined) updateData.thumbnails_enabled = Boolean(thumbnails_enabled);
      if (group_ledger_copies !== undefined) updateData.group_ledger_copies = Boolean(group_ledger_copies);
      if (email !== undefined) {
        if (email !== null && email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return res.status(400).json({ error: 'email is not a valid address' });
        }
        updateData.email = email || null;
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'At least one of notifications_enabled, thumbnails_enabled, group_ledger_copies, or email is required' });
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

  // PUT /api/users/:line_user_id/payment-details
  // How this user gets paid back for group bills (migration 019). Shown on
  // their bills to the group members who owe them. Send null/"" to clear.
  async updatePaymentDetails(req, res) {
    try {
      const { line_user_id } = req.params;
      const { normalizePromptPayId } = require('../services/promptpay');
      const body = req.body || {};
      const clean = (v) => (v === null || v === undefined ? '' : String(v).trim());
      const update = {};
      if ('promptpay_id' in body) {
        const raw = clean(body.promptpay_id);
        const id = raw ? normalizePromptPayId(raw) : null;
        if (raw && !id) return res.status(400).json({ error: 'PromptPay ID must be a 10-digit mobile number, a 13-digit ID number or a 15-digit e-wallet ID' });
        update.promptpay_id = id;
      }
      if ('bank_account_no' in body) {
        const digits = clean(body.bank_account_no).replace(/[\s-]/g, '');
        if (digits && !/^\d{10,15}$/.test(digits)) return res.status(400).json({ error: 'Bank account number must be 10 to 15 digits' });
        update.bank_account_no = digits || null;
      }
      if ('bank_name' in body) update.bank_name = clean(body.bank_name).slice(0, 64) || null;
      if ('bank_account_name' in body) update.bank_account_name = clean(body.bank_account_name).slice(0, 128) || null;
      if (!Object.keys(update).length) return res.status(400).json({ error: 'Send at least one of promptpay_id, bank_name, bank_account_no, bank_account_name' });
      const { data, error } = await supabase.from('users').update(update).eq('line_user_id', line_user_id)
        .select('promptpay_id, bank_name, bank_account_no, bank_account_name').single();
      if (error) {
        if (error.code === 'PGRST116') return res.status(404).json({ error: 'User not found' });
        throw error;
      }
      res.json({ success: true, payment_details: data });
    } catch (error) {
      console.error('Error in updatePaymentDetails:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Delete user account
  // DELETE /api/users/:line_user_id  body: { confirm: "DELETE" }
  // "Delete my account" (PDPA right to erasure): every row of the user's data
  // and their receipt thumbnails. Transactions and recurring rules go first,
  // because they block deleting the categories they use (ON DELETE RESTRICT);
  // the users row then cascades to everything else. Group expenses this user
  // paid are removed from those groups' ledgers too (they can't outlive the
  // user row they reference).
  async deleteUser(req, res) {
    try {
      const { line_user_id } = req.params;
      if (!req.body || req.body.confirm !== 'DELETE') {
        return res.status(400).json({ error: 'Send { "confirm": "DELETE" } to delete this account and all of its data.' });
      }

      const { BUCKET } = require('../services/receiptThumbnail');
      const { SLIP_BUCKET } = require('../services/groupLedger');
      // Everything in the user's folder of a private bucket: receipt
      // thumbnails, and payment slips they sent for group bills.
      const removeFolder = async (bucket) => {
        let removed = 0;
        for (;;) {
          const { data: files, error: listError } = await supabase.storage.from(bucket).list(line_user_id, { limit: 1000 });
          if (listError || !files || files.length === 0) break;
          const { error: removeError } = await supabase.storage.from(bucket).remove(files.map((f) => `${line_user_id}/${f.name}`));
          if (removeError) throw removeError;
          removed += files.length;
          if (files.length < 1000) break;
        }
        return removed;
      };
      const thumbnails = await removeFolder(BUCKET);
      await removeFolder(SLIP_BUCKET);
      // Slips other members sent for bills this user collected: those bills
      // go with the user row (cascade), so their slips go too.
      const { data: owned } = await supabase.from('group_expenses').select('id').eq('payer_line_user_id', line_user_id);
      if (owned && owned.length) {
        const { data: slips } = await supabase.from('group_expense_shares').select('slip_path').in('expense_id', owned.map((b) => b.id)).not('slip_path', 'is', null);
        if (slips && slips.length) await supabase.storage.from(SLIP_BUCKET).remove(slips.map((x) => x.slip_path));
      }

      const counted = async (table) => {
        const { data, error } = await supabase.from(table).delete().eq('line_user_id', line_user_id).select('line_user_id');
        if (error) throw error;
        return data.length;
      };
      const transactions = await counted('transactions');
      await counted('recurring_transactions');
      const { data: user, error } = await supabase.from('users').delete().eq('line_user_id', line_user_id).select('line_user_id');
      if (error) throw error;

      res.json({ success: true, deleted: { user: user.length, transactions, thumbnails } });
    } catch (error) {
      console.error('Error in deleteUser:', error);
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = userController;
