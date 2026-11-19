// Read-only views of the LINE group split tracker for the LIFF app. Logging
// and settling stay in the group chat (controllers/lineGroupHandler.js), so
// the chat remains the one place everyone sees changes happen.
const supabase = require('../config/supabase');
const { groupBalances } = require('../services/groupLedger');
const { fromCents } = require('../services/billSplit');

const nameOf = (names, id) => names.get(id) || `Member ${String(id).slice(-4)}`;

async function groupsFor(lineUserId) {
  const { data, error } = await supabase
    .from('line_group_members')
    .select('group_id, left_at, line_groups ( group_id, name, source_type, is_active )')
    .eq('line_user_id', lineUserId);
  if (error) throw error;
  return data;
}

// What this user pays / receives in the simplified plan.
const myPayments = (payments, names, me) =>
  payments
    .filter((p) => p.from === me || p.to === me)
    .map((p) => (p.from === me ? { direction: 'pay', name: nameOf(names, p.to), amount: p.amount } : { direction: 'receive', name: nameOf(names, p.from), amount: p.amount }));

const groupController = {
  // GET /api/groups/:line_user_id -- every group the user is (or was) in,
  // with their net balance and the payments involving them. Newest activity first.
  async listGroups(req, res) {
    try {
      const { line_user_id } = req.params;
      const memberships = await groupsFor(line_user_id);
      const groups = await Promise.all(memberships.map(async (m) => {
        const { net, payments, names, members, entries } = await groupBalances(m.group_id);
        return {
          group_id: m.group_id,
          name: m.line_groups.name,
          source_type: m.line_groups.source_type,
          is_active: m.line_groups.is_active,
          member_count: members.filter((x) => !x.left_at).length,
          i_left: !!m.left_at,
          my_net: fromCents(net.get(line_user_id) || 0),
          my_payments: myPayments(payments, names, line_user_id),
          last_activity: entries.length ? entries[0].created_at : null,
        };
      }));
      groups.sort((a, b) => String(b.last_activity || '').localeCompare(String(a.last_activity || '')));
      res.json({ success: true, groups });
    } catch (error) {
      console.error('Error in listGroups:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // GET /api/groups/:line_user_id/:group_id -- one group: everyone's net,
  // the full who-pays-whom plan, and the 20 most recent entries. 404 unless
  // the user is (or was) a member.
  async getGroup(req, res) {
    try {
      const { line_user_id, group_id } = req.params;
      const membership = (await groupsFor(line_user_id)).find((m) => m.group_id === group_id);
      if (!membership) return res.status(404).json({ error: 'Group not found' });
      const { net, payments, names, members, entries } = await groupBalances(group_id);
      res.json({
        success: true,
        group: {
          group_id,
          name: membership.line_groups.name,
          source_type: membership.line_groups.source_type,
          is_active: membership.line_groups.is_active,
          member_count: members.filter((x) => !x.left_at).length,
        },
        my_net: fromCents(net.get(line_user_id) || 0),
        my_payments: myPayments(payments, names, line_user_id),
        payments: payments.map((p) => ({ from_name: nameOf(names, p.from), to_name: nameOf(names, p.to), amount: p.amount, involves_me: p.from === line_user_id || p.to === line_user_id })),
        members: members
          .map((x) => ({ name: nameOf(names, x.line_user_id), net: fromCents(net.get(x.line_user_id) || 0), left: !!x.left_at, is_me: x.line_user_id === line_user_id }))
          .sort((a, b) => b.net - a.net),
        recent: entries.slice(0, 20).map((e) => {
          const mine = e.shares.find((s) => s.line_user_id === line_user_id);
          return {
            kind: e.kind,
            payer_name: nameOf(names, e.payer_line_user_id),
            paid_by_me: e.payer_line_user_id === line_user_id,
            amount: Number(e.amount),
            description: e.description,
            created_at: e.created_at,
            split_count: e.shares.length,
            to_name: e.kind === 'settlement' ? nameOf(names, e.shares[0].line_user_id) : null,
            my_share: e.kind === 'expense' && mine ? Number(mine.share) : null,
          };
        }),
      });
    } catch (error) {
      console.error('Error in getGroup:', error);
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = groupController;
