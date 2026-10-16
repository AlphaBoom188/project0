const supabase = require('../config/supabase');
const { extractReceiptItems } = require('../services/billItemExtraction');
const { computeEqualSplit, validateCustomAmounts, computeItemizedSplit, sumItemCents, toCents } = require('../services/billSplit');

const SPLIT_TYPES = ['equal', 'custom', 'itemized'];

// Recomputes and persists a bill's status: 'settled' once every participant
// has paid, 'active' otherwise (so un-marking a payment reopens it too).
async function refreshBillStatus(billId) {
  const { data: participants, error } = await supabase
    .from('shared_bill_participants')
    .select('is_paid')
    .eq('bill_id', billId);
  if (error) throw error;

  const allPaid = participants.length > 0 && participants.every((p) => p.is_paid);
  const { error: updateError } = await supabase
    .from('shared_bills')
    .update({ status: allPaid ? 'settled' : 'active' })
    .eq('id', billId);
  if (updateError) throw updateError;
}

const billController = {
  // OCR itemized extraction for building an 'itemized' split -- read-only,
  // doesn't touch the database (nothing is created until the bill itself is).
  async scanReceiptItems(req, res) {
    try {
      const { image_base64 } = req.body;
      if (!image_base64) {
        return res.status(400).json({ error: 'image_base64 is required' });
      }
      const data = await extractReceiptItems(image_base64);
      res.json({ success: true, data });
    } catch (error) {
      console.error('Error in scanReceiptItems:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async getBills(req, res) {
    try {
      const { line_user_id } = req.params;
      const { data: bills, error } = await supabase
        .from('shared_bills')
        .select('*, shared_bill_participants ( id, display_name, amount_owed, is_paid )')
        .eq('line_user_id', line_user_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      res.json({ success: true, bills });
    } catch (error) {
      console.error('Error in getBills:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async getBillDetail(req, res) {
    try {
      const { line_user_id, bill_id } = req.params;
      const { data: bill, error } = await supabase
        .from('shared_bills')
        .select('*, shared_bill_participants ( * ), shared_bill_items ( * )')
        .eq('id', bill_id)
        .eq('line_user_id', line_user_id)
        .single();
      if (error) throw error;
      res.json({ success: true, bill });
    } catch (error) {
      console.error('Error in getBillDetail:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async createBill(req, res) {
    try {
      const { line_user_id } = req.params;
      const { title, total_amount, split_type, participants, items } = req.body;

      if (!title || !total_amount || !split_type) {
        return res.status(400).json({ error: 'title, total_amount, and split_type are required' });
      }
      if (!SPLIT_TYPES.includes(split_type)) {
        return res.status(400).json({ error: `split_type must be one of: ${SPLIT_TYPES.join(', ')}` });
      }
      if (!Array.isArray(participants) || participants.length === 0) {
        return res.status(400).json({ error: 'participants must be a non-empty array' });
      }
      for (const p of participants) {
        if (!p.display_name || !p.display_name.trim()) {
          return res.status(400).json({ error: 'Every participant needs a display_name' });
        }
      }

      let amounts;
      if (split_type === 'equal') {
        amounts = computeEqualSplit(total_amount, participants.length);
      } else if (split_type === 'custom') {
        amounts = participants.map((p) => p.amount_owed);
        const validationError = validateCustomAmounts(amounts);
        if (validationError) return res.status(400).json({ error: validationError });
      } else {
        if (!Array.isArray(items) || items.length === 0) {
          return res.status(400).json({ error: 'items must be a non-empty array for an itemized split' });
        }
        for (const item of items) {
          if (!item.name || typeof item.amount !== 'number' || item.amount <= 0) {
            return res.status(400).json({ error: 'Every item needs a name and a positive amount' });
          }
        }
        if (sumItemCents(items) !== toCents(total_amount)) {
          return res.status(400).json({ error: 'total_amount must equal the sum of all item amounts' });
        }
        const result = computeItemizedSplit(items, participants.length);
        if (result.error) return res.status(400).json({ error: result.error });
        amounts = result.amounts;
      }

      const { data: bill, error: billError } = await supabase
        .from('shared_bills')
        .insert({ line_user_id, title, total_amount, split_type, status: 'active' })
        .select()
        .single();
      if (billError) throw billError;

      const { data: insertedParticipants, error: participantsError } = await supabase
        .from('shared_bill_participants')
        .insert(participants.map((p, i) => ({ bill_id: bill.id, display_name: p.display_name.trim(), amount_owed: amounts[i] })))
        .select();
      if (participantsError) throw participantsError;

      if (split_type === 'itemized') {
        const { error: itemsError } = await supabase.from('shared_bill_items').insert(
          items.map((item) => ({
            bill_id: bill.id,
            name: item.name,
            amount: item.amount,
            participant_id:
              item.participant_index === null || item.participant_index === undefined
                ? null
                : insertedParticipants[item.participant_index].id,
          }))
        );
        if (itemsError) throw itemsError;
      }

      res.status(201).json({ success: true, bill: { ...bill, shared_bill_participants: insertedParticipants } });
    } catch (error) {
      console.error('Error in createBill:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async updateParticipant(req, res) {
    try {
      const { line_user_id, bill_id, participant_id } = req.params;
      const { is_paid } = req.body;
      if (typeof is_paid !== 'boolean') {
        return res.status(400).json({ error: 'is_paid (boolean) is required' });
      }

      const { data: bill, error: billError } = await supabase
        .from('shared_bills')
        .select('id')
        .eq('id', bill_id)
        .eq('line_user_id', line_user_id)
        .single();
      if (billError || !bill) return res.status(404).json({ error: 'Bill not found' });

      await updateParticipantPaidState(bill_id, participant_id, is_paid, res);
    } catch (error) {
      console.error('Error in updateParticipant:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async deleteBill(req, res) {
    try {
      const { line_user_id, bill_id } = req.params;
      const { error } = await supabase.from('shared_bills').delete().eq('id', bill_id).eq('line_user_id', line_user_id);
      if (error) throw error;
      res.json({ success: true, message: 'Bill deleted' });
    } catch (error) {
      console.error('Error in deleteBill:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Public, unauthenticated by design: the bill_id is an unguessable UUID and
  // acts as the access token, the same model a payment-split share link uses.
  // Lets a participant who never opens the app view their share and self-mark
  // it paid, without the creator needing to resolve a second LINE account.
  async getPublicBill(req, res) {
    try {
      const { bill_id } = req.params;
      const { data: bill, error } = await supabase
        .from('shared_bills')
        .select('id, title, total_amount, split_type, status, created_at, users ( display_name ), shared_bill_participants ( id, display_name, amount_owed, is_paid )')
        .eq('id', bill_id)
        .single();
      if (error || !bill) return res.status(404).json({ error: 'Bill not found' });

      res.json({
        success: true,
        bill: {
          id: bill.id,
          title: bill.title,
          total_amount: bill.total_amount,
          split_type: bill.split_type,
          status: bill.status,
          created_at: bill.created_at,
          creator_display_name: bill.users ? bill.users.display_name : null,
          participants: bill.shared_bill_participants,
        },
      });
    } catch (error) {
      console.error('Error in getPublicBill:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async updatePublicParticipant(req, res) {
    try {
      const { bill_id, participant_id } = req.params;
      const { is_paid } = req.body;
      if (typeof is_paid !== 'boolean') {
        return res.status(400).json({ error: 'is_paid (boolean) is required' });
      }
      await updateParticipantPaidState(bill_id, participant_id, is_paid, res);
    } catch (error) {
      console.error('Error in updatePublicParticipant:', error);
      res.status(500).json({ error: error.message });
    }
  },
};

// Shared by the creator-scoped and public settlement endpoints.
async function updateParticipantPaidState(billId, participantId, isPaid, res) {
  const { data: participant, error } = await supabase
    .from('shared_bill_participants')
    .update({ is_paid: isPaid, paid_at: isPaid ? new Date().toISOString() : null })
    .eq('id', participantId)
    .eq('bill_id', billId)
    .select()
    .single();
  if (error || !participant) return res.status(404).json({ error: 'Participant not found on this bill' });

  await refreshBillStatus(billId);

  res.json({ success: true, participant });
}

module.exports = billController;
