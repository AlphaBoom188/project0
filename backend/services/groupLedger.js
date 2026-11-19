// DB side of the LINE group split tracker (migration 016). The webhook
// handler (controllers/lineGroupHandler.js) calls these; the math lives in
// services/groupSplitMath.js.
const supabase = require('../config/supabase');
const { upsertUser } = require('./userUpsert');
const { autoCategorize } = require('./autoCategorize');
const { createTransaction } = require('./transactionCreate');
const { getGroupMemberName, getGroupName } = require('./lineMessagingClient');
const { equalShares, netBalances, simplifyDebts } = require('./groupSplitMath');

const UNDO_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Members seen recently, so ordinary group chatter doesn't hit the DB (or the
// LINE profile API) on every message. Process-local and best-effort.
const seen = new Map();
const SEEN_TTL_MS = 10 * 60 * 1000;

async function ensureGroup(groupId, sourceType) {
  const { data: existing, error } = await supabase.from('line_groups').select('*').eq('group_id', groupId).maybeSingle();
  if (error) throw error;
  if (existing) {
    if (!existing.is_active) await supabase.from('line_groups').update({ is_active: true }).eq('group_id', groupId);
    return existing;
  }
  const name = sourceType === 'group' ? await getGroupName(groupId) : null;
  const { data, error: insertError } = await supabase
    .from('line_groups')
    .upsert({ group_id: groupId, source_type: sourceType, name }, { onConflict: 'group_id' })
    .select()
    .single();
  if (insertError) throw insertError;
  return data;
}

async function deactivateGroup(groupId) {
  await supabase.from('line_groups').update({ is_active: false }).eq('group_id', groupId);
}

// Adds (or re-adds) a member. Creates their users row on first sight, so
// their share can land in their personal ledger. -> display name
async function ensureMember(groupId, sourceType, userId, { force = false } = {}) {
  const key = `${groupId}|${userId}`;
  const cached = seen.get(key);
  if (!force && cached && Date.now() - cached.at < SEEN_TTL_MS) return cached.name;

  const { data: member, error } = await supabase
    .from('line_group_members').select('display_name, left_at').eq('group_id', groupId).eq('line_user_id', userId).maybeSingle();
  if (error) throw error;
  let name = member ? member.display_name : null;
  if (!member || member.left_at || !name) {
    name = name || (await getGroupMemberName(sourceType, groupId, userId));
    const { data: user } = await supabase.from('users').select('line_user_id').eq('line_user_id', userId).maybeSingle();
    if (!user) await upsertUser({ lineUserId: userId, displayName: name, pictureUrl: null });
    const { error: upsertError } = await supabase
      .from('line_group_members')
      .upsert({ group_id: groupId, line_user_id: userId, display_name: name, left_at: null }, { onConflict: 'group_id,line_user_id' });
    if (upsertError) throw upsertError;
  }
  seen.set(key, { name, at: Date.now() });
  return name;
}

async function markMemberLeft(groupId, userId) {
  seen.delete(`${groupId}|${userId}`);
  await supabase.from('line_group_members').update({ left_at: new Date().toISOString() }).eq('group_id', groupId).eq('line_user_id', userId);
}

async function listMembers(groupId, { includeLeft = false } = {}) {
  let query = supabase.from('line_group_members').select('line_user_id, display_name, left_at').eq('group_id', groupId).order('joined_at');
  if (!includeLeft) query = query.is('left_at', null);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// Writes each member's share to their own ledger as an expense. Best-effort:
// a failure is logged and the group record stands.
async function writePersonalShares(expense, shares, groupName) {
  const label = `${expense.description || 'Group expense'} · ${groupName || 'group'}`;
  await Promise.all(shares.filter((s) => s.share > 0).map(async (s) => {
    try {
      const category = await autoCategorize(s.line_user_id, expense.description || 'Group expense');
      if (!category) return;
      const transaction = await createTransaction({
        lineUserId: s.line_user_id,
        categoryId: category.id,
        amount: s.share,
        type: 'expense',
        description: label.slice(0, 200),
        transactionDate: expense.created_at,
        channel: 'group',
      });
      await supabase.from('group_expense_shares').update({ transaction_id: transaction.id }).eq('expense_id', expense.id).eq('line_user_id', s.line_user_id);
    } catch (error) {
      console.error(`[group] personal share for ${s.line_user_id} failed:`, error.message);
    }
  }));
}

async function addExpense({ group, payerId, amount, description, participantIds }) {
  const shares = equalShares(amount, participantIds, payerId);
  const { data: expense, error } = await supabase
    .from('group_expenses')
    .insert({ group_id: group.group_id, kind: 'expense', payer_line_user_id: payerId, amount, description })
    .select()
    .single();
  if (error) throw error;
  const { error: sharesError } = await supabase.from('group_expense_shares').insert(shares.map((s) => ({ expense_id: expense.id, ...s })));
  if (sharesError) {
    await supabase.from('group_expenses').delete().eq('id', expense.id);
    throw sharesError;
  }
  await writePersonalShares(expense, shares, group.name);
  return { expense, shares };
}

async function addSettlement({ groupId, fromId, toId, amount }) {
  const { data: expense, error } = await supabase
    .from('group_expenses')
    .insert({ group_id: groupId, kind: 'settlement', payer_line_user_id: fromId, amount, description: null })
    .select()
    .single();
  if (error) throw error;
  const { error: shareError } = await supabase.from('group_expense_shares').insert({ expense_id: expense.id, line_user_id: toId, share: amount });
  if (shareError) {
    await supabase.from('group_expenses').delete().eq('id', expense.id);
    throw shareError;
  }
  return expense;
}

// Deletes the sender's most recent entry in this group (last 7 days),
// including the personal-ledger copies of its shares. -> the entry or null
async function undoLast(groupId, userId) {
  const since = new Date(Date.now() - UNDO_WINDOW_MS).toISOString();
  const { data: last, error } = await supabase
    .from('group_expenses')
    .select('*, group_expense_shares ( line_user_id, transaction_id )')
    .eq('group_id', groupId).eq('payer_line_user_id', userId).gte('created_at', since)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!last) return null;
  const txnIds = last.group_expense_shares.map((s) => s.transaction_id).filter(Boolean);
  if (txnIds.length) await supabase.from('transactions').delete().in('id', txnIds);
  const { error: delError } = await supabase.from('group_expenses').delete().eq('id', last.id);
  if (delError) throw delError;
  return last;
}

// -> { net: Map(id -> cents), payments: [{ from, to, amount }], names: Map,
//      members (incl. left), entries (newest first) }
async function groupBalances(groupId) {
  const { data, error } = await supabase
    .from('group_expenses')
    .select('id, kind, payer_line_user_id, amount, description, created_at, group_expense_shares ( line_user_id, share )')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const entries = data.map((e) => ({ ...e, shares: e.group_expense_shares }));
  const net = netBalances(entries);
  const members = await listMembers(groupId, { includeLeft: true });
  const names = new Map(members.map((m) => [m.line_user_id, m.display_name]));
  return { net, payments: simplifyDebts(net), names, members, entries };
}

module.exports = {
  ensureGroup, deactivateGroup, ensureMember, markMemberLeft, listMembers,
  addExpense, addSettlement, undoLast, groupBalances,
  _seen: seen, // tests clear it
};
