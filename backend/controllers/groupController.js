// LIFF side of LINE group bills (migrations 016 + 019). Bills are created in
// the group chat (controllers/lineGroupHandler.js); here members see them, pay
// (PromptPay QR / bank details + slip upload), and the owner confirms, marks
// paid or cancels. Every change is announced back in the group chat.
const supabase = require('../config/supabase');
const ledger = require('../services/groupLedger');
const notify = require('../services/groupBillNotify');
const { memberStatus, paidPositions, unpaidShares, unpaidTotal, owesOn, memberBalances, leaderboard } = require('../services/groupBillMath');
const { bangkokParts, bangkokMidnight } = require('../services/bangkokDay');
const { promptPayPayload, formatPromptPayId } = require('../services/promptpay');
const { fromCents, toCents } = require('../services/billSplit');

const nameOf = (names, id) => names.get(id) || `Member ${String(id).slice(-4)}`;

async function groupsFor(lineUserId) {
  const { data, error } = await supabase
    .from('line_group_members')
    .select('group_id, left_at, line_groups ( group_id, name, source_type, is_active )')
    .eq('line_user_id', lineUserId);
  if (error) throw error;
  return data;
}

const sumCents = (list) => list.reduce((sum, s) => sum + toCents(s.share), 0);

// What I owe on others' open bills, and what's still owed to me on mine.
function myTotals(bills, me) {
  let owe = 0;
  let owed = 0;
  for (const b of bills) {
    if (b.status !== 'open') continue;
    if (b.payer_line_user_id === me) owed += sumCents(unpaidShares(b));
    else owe += sumCents(unpaidShares(b).filter((s) => s.line_user_id === me));
  }
  return { my_owe: fromCents(owe), my_owed: fromCents(owed) };
}

function billSummary(b, names, me) {
  const owing = owesOn(b);
  const mine = b.shares.find((s) => s.line_user_id === me);
  return {
    id: b.id,
    description: b.description,
    amount: b.amount,
    status: b.status,
    created_at: b.created_at,
    owner_name: nameOf(names, b.payer_line_user_id),
    is_owner: b.payer_line_user_id === me,
    my_status: memberStatus(b, me),
    my_share: mine ? mine.share : null,
    paid_count: owing.filter((s) => s.paid_at).length,
    owe_count: owing.length,
    pending_slips: b.payer_line_user_id === me ? owing.filter((s) => !s.paid_at && s.slip_status === 'pending').length : 0,
  };
}

// Loads a bill the user may see (member of its group) or sends 404.
async function loadBill(req, res) {
  const { line_user_id, bill_id } = req.params;
  const bill = await ledger.getBill(bill_id);
  if (!bill || !(await ledger.isMember(bill.group_id, line_user_id))) {
    res.status(404).json({ error: 'Bill not found' });
    return null;
  }
  return bill;
}

async function loadOwnedOpenBill(req, res) {
  const bill = await loadBill(req, res);
  if (!bill) return null;
  if (bill.payer_line_user_id !== req.params.line_user_id) {
    res.status(403).json({ error: 'Only the person who paid can do this', code: 'forbidden' });
    return null;
  }
  if (bill.status !== 'open') {
    res.status(409).json({ error: `This bill is already ${bill.status === 'paid' ? 'fully paid' : 'cancelled'}` });
    return null;
  }
  return bill;
}

const fail = (res, label) => (error) => {
  console.error(`Error in ${label}:`, error);
  res.status(500).json({ error: error.message });
};


// The Groups page's member list (current members; ids stay server-side):
// open-bill balances from the viewer's side, plus this Bangkok month's
// fastest-payer counts (same window and math as the chat "rank").
function groupMembers(bills, members, names, me, now = new Date()) {
  const { year, month } = bangkokParts(now);
  const board = leaderboard(bills, bangkokMidnight(year, month, 1).toISOString(), bangkokMidnight(year, month + 1, 1).toISOString());
  const ranks = new Map(board.rows.map((r, i) => [r.line_user_id, { ...r, rank: i + 1 }]));
  const rows = memberBalances(bills, me, members.map((m) => m.line_user_id)).map((r) => {
    const rk = ranks.get(r.line_user_id);
    return {
      name: nameOf(names, r.line_user_id),
      is_me: r.line_user_id === me,
      owes_me: r.owes_me,
      i_owe: r.i_owe,
      unpaid_total: r.unpaid_total,
      unpaid_bills: r.unpaid_bills,
      rank: rk ? rk.rank : null,
      firsts: rk ? rk.first : 0,
    };
  });
  // Me first, then whoever owes the most, then by name.
  rows.sort((a, b) => Number(b.is_me) - Number(a.is_me) || Number(b.unpaid_total) - Number(a.unpaid_total) || a.name.localeCompare(b.name));
  return {
    members: rows,
    top_host: board.topHost ? { name: nameOf(names, board.topHost.line_user_id), bills: board.topHost.bills } : null,
  };
}

const groupController = {
  // GET /api/groups/:line_user_id -- every group the user is (or was) in, with
  // open-bill totals. Newest activity first.
  async listGroups(req, res) {
    try {
      const { line_user_id } = req.params;
      const memberships = await groupsFor(line_user_id);
      const groups = await Promise.all(memberships.map(async (m) => {
        const bills = await ledger.listBills(m.group_id, { limit: 200 });
        const members = await ledger.listMembers(m.group_id);
        return {
          group_id: m.group_id,
          name: m.line_groups.name,
          source_type: m.line_groups.source_type,
          is_active: m.line_groups.is_active,
          member_count: members.length,
          i_left: !!m.left_at,
          open_bills: bills.filter((b) => b.status === 'open').length,
          ...myTotals(bills, line_user_id),
          last_activity: bills.length ? bills[0].created_at : null,
        };
      }));
      groups.sort((a, b) => String(b.last_activity || '').localeCompare(String(a.last_activity || '')));
      res.json({ success: true, groups });
    } catch (error) {
      fail(res, 'listGroups')(error);
    }
  },

  // GET /api/groups/:line_user_id/:group_id -- one group: open bills first,
  // then the 20 most recent closed ones. 404 unless the user is (or was) a member.
  async getGroup(req, res) {
    try {
      const { line_user_id, group_id } = req.params;
      const membership = (await groupsFor(line_user_id)).find((m) => m.group_id === group_id);
      if (!membership) return res.status(404).json({ error: 'Group not found' });
      const [bills, names, members] = await Promise.all([ledger.listBills(group_id, { limit: 200 }), ledger.memberNames(group_id), ledger.listMembers(group_id)]);
      const open = bills.filter((b) => b.status === 'open');
      const closed = bills.filter((b) => b.status !== 'open').slice(0, 20);
      res.json({
        success: true,
        group: {
          group_id,
          name: membership.line_groups.name,
          source_type: membership.line_groups.source_type,
          is_active: membership.line_groups.is_active,
          member_count: members.length,
        },
        ...myTotals(bills, line_user_id),
        ...groupMembers(bills, members, names, line_user_id),
        open_bills: open.map((b) => billSummary(b, names, line_user_id)),
        closed_bills: closed.map((b) => billSummary(b, names, line_user_id)),
      });
    } catch (error) {
      fail(res, 'getGroup')(error);
    }
  },

  // GET /api/groups/:line_user_id/bills/:bill_id -- one bill for a member:
  // who paid, the owner's payment details (with a PromptPay QR payload for
  // the viewer's unpaid share) and, for the owner, the slips to check.
  async getBill(req, res) {
    try {
      const { line_user_id } = req.params;
      const bill = await loadBill(req, res);
      if (!bill) return;
      const names = await ledger.memberNames(bill.group_id);
      const isOwner = bill.payer_line_user_id === line_user_id;
      const positions = paidPositions(bill);
      const { data: owner } = await supabase.from('users')
        .select('promptpay_id, bank_name, bank_account_no, bank_account_name').eq('line_user_id', bill.payer_line_user_id).maybeSingle();
      const mine = bill.shares.find((s) => s.line_user_id === line_user_id);
      const myStatus = memberStatus(bill, line_user_id);
      const payable = bill.status === 'open' && (myStatus === 'unpaid' || myStatus === 'slip_pending');
      const { data: group } = await supabase.from('line_groups').select('name').eq('group_id', bill.group_id).maybeSingle();

      const shares = await Promise.all(bill.shares
        .slice()
        .sort((a, b) => Number(b.line_user_id === bill.payer_line_user_id) - Number(a.line_user_id === bill.payer_line_user_id))
        .map(async (s) => {
          const own = s.line_user_id === line_user_id;
          return {
            line_user_id: s.line_user_id,
            name: nameOf(names, s.line_user_id),
            share: s.share,
            status: memberStatus(bill, s.line_user_id),
            paid_at: s.paid_at,
            paid_method: s.paid_method,
            position: positions.get(s.line_user_id) || null,
            is_me: own,
            slip_status: isOwner || own ? s.slip_status : null,
            slip_url: (isOwner || own) && s.slip_status === 'pending' ? await ledger.signSlip(s.slip_path) : null,
          };
        }));

      res.json({
        success: true,
        bill: {
          id: bill.id,
          group_id: bill.group_id,
          group_name: group ? group.name : null,
          description: bill.description,
          amount: bill.amount,
          status: bill.status,
          created_at: bill.created_at,
          closed_at: bill.closed_at,
          owner_name: nameOf(names, bill.payer_line_user_id),
          is_owner: isOwner,
          my_status: myStatus,
          my_share: mine ? mine.share : null,
          unpaid_total: unpaidTotal(bill),
          shares,
        },
        pay_to: payable && owner ? {
          name: nameOf(names, bill.payer_line_user_id),
          promptpay_id: owner.promptpay_id ? formatPromptPayId(owner.promptpay_id) : null,
          promptpay_payload: owner.promptpay_id ? promptPayPayload(owner.promptpay_id, mine.share) : null,
          bank_name: owner.bank_name,
          bank_account_no: owner.bank_account_no,
          bank_account_name: owner.bank_account_name,
        } : null,
      });
    } catch (error) {
      fail(res, 'getBill')(error);
    }
  },

  // POST /api/groups/:line_user_id/bills/:bill_id/slip { image_base64 }
  // The member sends their transfer slip; the owner is asked to confirm it.
  async uploadSlip(req, res) {
    try {
      const { line_user_id } = req.params;
      const bill = await loadBill(req, res);
      if (!bill) return;
      const status = memberStatus(bill, line_user_id);
      if (bill.status !== 'open') return res.status(409).json({ error: `This bill is already ${bill.status === 'paid' ? 'fully paid' : 'cancelled'}` });
      if (status === 'paid') return res.status(409).json({ error: 'Your share is already paid' });
      if (status !== 'unpaid' && status !== 'slip_pending') return res.status(400).json({ error: "You don't owe anything on this bill" });
      const b64 = String((req.body && req.body.image_base64) || '').replace(/^data:image\/\w+;base64,/, '');
      if (!b64) return res.status(400).json({ error: 'image_base64 is required' });
      let path;
      try {
        path = await ledger.saveSlip(bill, line_user_id, Buffer.from(b64, 'base64'));
      } catch (error) {
        if (/unsupported image|Input buffer|corrupt/i.test(error.message)) return res.status(400).json({ error: "That file isn't an image we can read" });
        throw error;
      }
      const notified = await notify.notifySlip(bill, line_user_id);
      res.json({ success: true, slip_status: 'pending', notified, slip_url: await ledger.signSlip(path) });
    } catch (error) {
      fail(res, 'uploadSlip')(error);
    }
  },

  // POST /api/groups/:line_user_id/bills/:bill_id/shares/:member_id/confirm
  // Owner: the slip is good (or, with no slip, they were paid some other way).
  async confirmShare(req, res) {
    try {
      const bill = await loadOwnedOpenBill(req, res);
      if (!bill) return;
      const { member_id } = req.params;
      const share = bill.shares.find((s) => s.line_user_id === member_id);
      if (!share || member_id === bill.payer_line_user_id) return res.status(404).json({ error: 'Member not found on this bill' });
      if (share.paid_at) return res.status(409).json({ error: 'Already paid' });
      const method = share.slip_status === 'pending' ? 'slip' : 'marked';
      const result = await ledger.markSharePaid(bill, member_id, method);
      if (!result.ok) return res.status(409).json({ error: 'Already paid' });
      await notify.notifyPaid(result.bill, member_id, method);
      res.json({ success: true, method, position: result.position, fully_paid: result.fullyPaid });
    } catch (error) {
      fail(res, 'confirmShare')(error);
    }
  },

  // POST /api/groups/:line_user_id/bills/:bill_id/shares/:member_id/reject
  // Owner: the slip doesn't check out; the member is asked to send it again.
  async rejectSlip(req, res) {
    try {
      const bill = await loadOwnedOpenBill(req, res);
      if (!bill) return;
      const ok = await ledger.rejectSlip(bill, req.params.member_id);
      if (!ok) return res.status(409).json({ error: 'No slip waiting from this member' });
      await notify.notifyRejected(bill, req.params.member_id);
      res.json({ success: true });
    } catch (error) {
      fail(res, 'rejectSlip')(error);
    }
  },

  // POST /api/groups/:line_user_id/bills/:bill_id/cancel -- owner voids the bill.
  async cancelBill(req, res) {
    try {
      const bill = await loadOwnedOpenBill(req, res);
      if (!bill) return;
      if (!(await ledger.cancelBill(bill))) return res.status(409).json({ error: 'This bill is already closed' });
      await notify.notifyCancelled(bill, req.params.line_user_id);
      res.json({ success: true });
    } catch (error) {
      fail(res, 'cancelBill')(error);
    }
  },
};

module.exports = groupController;
