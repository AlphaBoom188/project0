// DB side of LINE group bills (migrations 016 + 019). The webhook handler
// (controllers/lineGroupHandler.js) and the LIFF endpoints
// (controllers/groupController.js) call these; the math lives in
// services/groupSplitMath.js (splits) and services/groupBillMath.js (bills).
const supabase = require('../config/supabase');
const { upsertUser } = require('./userUpsert');
const { autoCategorize } = require('./autoCategorize');
const { createTransaction } = require('./transactionCreate');
const { getGroupMemberName, getGroupName } = require('./lineMessagingClient');
const crypto = require('crypto');
const sharp = require('sharp');
const { equalShares } = require('./groupSplitMath');
const { isFullyPaid, paidPositions } = require('./groupBillMath');

const SLIP_BUCKET = 'payment-slips';

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
    if (!user) await upsertUser({ lineUserId: userId, displayName: name, pictureUrl: null, appUser: false });
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

// Members whose shares may be copied into their personal ledger: only those who
// use the app and haven't turned it off (users.group_ledger_copies = TRUE,
// migration 018). Anyone else in the group is tracked in the group's balances
// only, so a group member can't write into someone's personal transactions.
// Fails closed (no copies) if the column can't be read.
async function membersAcceptingCopies(ids) {
  const { data, error } = await supabase.from('users').select('line_user_id, group_ledger_copies').in('line_user_id', ids);
  if (error) {
    console.error('[group] could not read group_ledger_copies (migration 018?):', error.message);
    return new Set();
  }
  return new Set(data.filter((u) => u.group_ledger_copies === true).map((u) => u.line_user_id));
}

// Writes each consenting member's share to their own ledger as an expense.
// Best-effort: a failure is logged and the group record stands.
async function writePersonalShares(expense, shares, groupName) {
  const label = `${expense.description || 'Group expense'} · ${groupName || 'group'}`;
  const accepting = await membersAcceptingCopies(shares.map((s) => s.line_user_id));
  await Promise.all(shares.filter((s) => s.share > 0 && accepting.has(s.line_user_id)).map(async (s) => {
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

// A new bill: the payer (owner) paid `amount`; everyone in participantIds owes
// an equal share. The owner's own share is paid at creation. A bill with
// nobody else on it is born paid.
async function addBill({ group, payerId, amount, description, participantIds }) {
  const shares = equalShares(amount, participantIds, payerId);
  const now = new Date().toISOString();
  const onlyOwner = shares.every((s) => s.line_user_id === payerId);
  const { data: bill, error } = await supabase
    .from('group_expenses')
    .insert({ group_id: group.group_id, kind: 'expense', payer_line_user_id: payerId, amount, description, status: onlyOwner ? 'paid' : 'open', closed_at: onlyOwner ? now : null })
    .select()
    .single();
  if (error) throw error;
  const rows = shares.map((s) => ({
    expense_id: bill.id, ...s,
    ...(s.line_user_id === payerId ? { paid_at: now, paid_method: 'owner' } : {}),
  }));
  const { error: sharesError } = await supabase.from('group_expense_shares').insert(rows);
  if (sharesError) {
    await supabase.from('group_expenses').delete().eq('id', bill.id);
    throw sharesError;
  }
  await writePersonalShares(bill, shares, group.name);
  return { bill, shares };
}

const BILL_SELECT = 'id, group_id, kind, payer_line_user_id, amount, description, status, created_at, closed_at, group_expense_shares ( line_user_id, share, paid_at, paid_method, slip_path, slip_status, slip_uploaded_at, transaction_id )';
const shape = (row) => row && ({ ...row, amount: Number(row.amount), shares: row.group_expense_shares.map((x) => ({ ...x, share: Number(x.share) })) });

async function getBill(billId) {
  const { data, error } = await supabase.from('group_expenses').select(BILL_SELECT).eq('id', billId).eq('kind', 'expense').maybeSingle();
  if (error) throw error;
  return shape(data);
}

// Newest first. status: 'open' | undefined (all).
async function listBills(groupId, { status, limit = 200 } = {}) {
  let query = supabase.from('group_expenses').select(BILL_SELECT).eq('group_id', groupId).eq('kind', 'expense').order('created_at', { ascending: false }).limit(limit);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return data.map(shape);
}

async function removeSlipFiles(paths) {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  const { error } = await supabase.storage.from(SLIP_BUCKET).remove(list);
  if (error) console.error('[group] slip cleanup failed:', error.message);
}

// Voids a bill: status cancelled, personal-ledger copies and slips removed.
async function cancelBill(bill) {
  const { data, error } = await supabase.from('group_expenses')
    .update({ status: 'cancelled', closed_at: new Date().toISOString() })
    .eq('id', bill.id).eq('status', 'open').select('id');
  if (error) throw error;
  if (!data.length) return false; // already closed
  const txnIds = bill.shares.map((s) => s.transaction_id).filter(Boolean);
  if (txnIds.length) await supabase.from('transactions').delete().in('id', txnIds);
  await removeSlipFiles(bill.shares.map((s) => s.slip_path));
  return true;
}

// The sender's most recent open bill in this group (last 7 days). -> bill | null
async function lastOpenBillBy(groupId, userId) {
  const since = new Date(Date.now() - UNDO_WINDOW_MS).toISOString();
  const { data, error } = await supabase.from('group_expenses').select(BILL_SELECT)
    .eq('group_id', groupId).eq('kind', 'expense').eq('payer_line_user_id', userId).eq('status', 'open').gte('created_at', since)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return shape(data);
}

// Stores a payer's transfer slip (resized JPEG) and marks it pending.
// Replaces any earlier slip for the same share. -> path
async function saveSlip(bill, payerId, imageBuffer) {
  const share = bill.shares.find((s) => s.line_user_id === payerId);
  const jpeg = await sharp(imageBuffer).rotate().resize({ width: 1080, withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
  const path = `${payerId}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`;
  const { error } = await supabase.storage.from(SLIP_BUCKET).upload(path, jpeg, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  const { error: updateError } = await supabase.from('group_expense_shares')
    .update({ slip_path: path, slip_status: 'pending', slip_uploaded_at: new Date().toISOString() })
    .eq('expense_id', bill.id).eq('line_user_id', payerId).is('paid_at', null);
  if (updateError) {
    await removeSlipFiles([path]);
    throw updateError;
  }
  if (share && share.slip_path) await removeSlipFiles([share.slip_path]);
  return path;
}

async function signSlip(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(SLIP_BUCKET).createSignedUrl(path, 60 * 60);
  if (error) {
    console.error('[group] signing slip failed:', error.message);
    return null;
  }
  return data.signedUrl;
}

// Owner confirms a member paid (their slip, or marked by hand). Closes the
// bill when it was the last unpaid share.
// -> { ok, position, fullyPaid, bill } (ok false if already paid / closed)
async function markSharePaid(bill, memberId, method) {
  const update = { paid_at: new Date().toISOString(), paid_method: method };
  if (method === 'slip') update.slip_status = 'confirmed';
  const { data, error } = await supabase.from('group_expense_shares').update(update)
    .eq('expense_id', bill.id).eq('line_user_id', memberId).is('paid_at', null).select('line_user_id');
  if (error) throw error;
  if (!data.length) return { ok: false };
  const fresh = await getBill(bill.id);
  const fullyPaid = isFullyPaid(fresh);
  if (fullyPaid) {
    await supabase.from('group_expenses').update({ status: 'paid', closed_at: new Date().toISOString() }).eq('id', bill.id).eq('status', 'open');
    fresh.status = 'paid';
  }
  return { ok: true, position: paidPositions(fresh).get(memberId), fullyPaid, bill: fresh };
}

async function rejectSlip(bill, memberId) {
  const share = bill.shares.find((s) => s.line_user_id === memberId);
  const { data, error } = await supabase.from('group_expense_shares')
    .update({ slip_status: 'rejected', slip_path: null })
    .eq('expense_id', bill.id).eq('line_user_id', memberId).is('paid_at', null).eq('slip_status', 'pending').select('line_user_id');
  if (error) throw error;
  if (data.length && share) await removeSlipFiles([share.slip_path]);
  return data.length > 0;
}

// Membership check for the LIFF endpoints (left members can still look).
async function isMember(groupId, userId) {
  const { data, error } = await supabase.from('line_group_members').select('line_user_id').eq('group_id', groupId).eq('line_user_id', userId).maybeSingle();
  if (error) throw error;
  return !!data;
}

async function memberNames(groupId) {
  const members = await listMembers(groupId, { includeLeft: true });
  return new Map(members.map((m) => [m.line_user_id, m.display_name]));
}

module.exports = {
  ensureGroup, deactivateGroup, ensureMember, markMemberLeft, listMembers, isMember, memberNames,
  addBill, getBill, listBills, cancelBill, lastOpenBillBy, saveSlip, signSlip, markSharePaid, rejectSlip, removeSlipFiles,
  SLIP_BUCKET,
  _seen: seen, // tests clear it
};
