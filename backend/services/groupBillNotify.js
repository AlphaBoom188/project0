// Builds and sends the group-bill messages (services/groupBillFlex.js).
// The webhook handler replies (free); LIFF actions and the daily reminder
// push (count against the Official Account's monthly message quota, per
// recipient), so pushes are kept to the moments that matter.
const supabase = require('../config/supabase');
const { pushMessages } = require('./lineMessagingClient');
const ledger = require('./groupLedger');
const flex = require('./groupBillFlex');
const { reminderDigest, leaderboard, paidPositions, unpaidShares, unpaidTotal } = require('./groupBillMath');
const { bangkokParts, bangkokMidnight } = require('./bangkokDay');

const nameOf = (names, id) => names.get(id) || `Member ${String(id).slice(-4)}`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

async function pushToGroup(groupId, messages) {
  const { data: group } = await supabase.from('line_groups').select('is_active').eq('group_id', groupId).maybeSingle();
  if (!group || !group.is_active) return false; // bot was removed: nowhere to post
  try {
    await pushMessages(groupId, messages.filter(Boolean));
    return true;
  } catch (error) {
    console.warn(`[group] push to group failed: ${error.message}`);
    return false;
  }
}

// Bill card + a mention line asking those who owe to pay.
function billMessages(bill, names) {
  const members = bill.shares.map((s) => ({
    name: nameOf(names, s.line_user_id),
    share: s.share,
    isOwner: s.line_user_id === bill.payer_line_user_id,
    paid: !!s.paid_at,
  })).sort((a, b) => Number(b.isOwner) - Number(a.isOwner));
  const owing = unpaidShares(bill).map((s) => s.line_user_id);
  return [
    flex.billCard({ bill, ownerName: nameOf(names, bill.payer_line_user_id), members }),
    flex.mentionMessage(owing, `please pay ${nameOf(names, bill.payer_line_user_id)} your share. Tap Pay on the card.`),
  ].filter(Boolean);
}

// "Don't forget to pay" across the group's open bills. -> messages | null when nothing is owed
async function digestMessages(groupId) {
  const bills = await ledger.listBills(groupId, { status: 'open' });
  const { openBills, rows } = reminderDigest(bills);
  if (!rows.length) return null;
  const names = await ledger.memberNames(groupId);
  return [
    flex.reminderCard({ groupId, openBills, rows: rows.map((r) => ({ name: nameOf(names, r.line_user_id), owed: r.owed })) }),
    flex.mentionMessage(rows.map((r) => r.line_user_id), 'a friendly reminder to pay. Tap Pay to see the details.'),
  ].filter(Boolean);
}

// Fastest payers this Bangkok month.
async function leaderboardMessage(groupId, now = new Date()) {
  const { year, month } = bangkokParts(now);
  const from = bangkokMidnight(year, month, 1).toISOString();
  const to = bangkokMidnight(year, month + 1, 1).toISOString();
  const bills = await ledger.listBills(groupId, { limit: 500 });
  const { rows, topHost } = leaderboard(bills, from, to);
  const names = await ledger.memberNames(groupId);
  return flex.leaderboardCard({
    groupId,
    period: `${MONTHS[month]} ${year}`,
    rows: rows.map((r) => ({ ...r, name: nameOf(names, r.line_user_id) })),
    topHostName: topHost ? `${nameOf(names, topHost.line_user_id)} (${topHost.bills} bill${topHost.bills === 1 ? '' : 's'})` : null,
  });
}

// After the owner confirms a payment: "X paid" line, plus the fully-paid card
// when it was the last one.
async function notifyPaid(bill, memberId, method) {
  const names = await ledger.memberNames(bill.group_id);
  const share = bill.shares.find((s) => s.line_user_id === memberId);
  const positions = paidPositions(bill);
  const messages = [flex.paidText({
    payerName: nameOf(names, memberId),
    ownerName: nameOf(names, bill.payer_line_user_id),
    amount: share.share,
    billTitle: bill.description,
    position: positions.get(memberId),
    method,
    remaining: unpaidShares(bill).length,
  })];
  if (bill.status === 'paid') {
    const payers = [...positions.entries()].sort((a, b) => a[1] - b[1]).map(([id, position]) => ({
      name: nameOf(names, id), share: bill.shares.find((s) => s.line_user_id === id).share, position,
    }));
    messages.push(flex.fullyPaidCard({ bill, payers }));
  }
  return pushToGroup(bill.group_id, messages);
}

// A slip arrived: tell the owner 1:1 (works if they've added the bot as a
// friend); otherwise ask in the group.
async function notifySlip(bill, payerId) {
  const names = await ledger.memberNames(bill.group_id);
  const share = bill.shares.find((s) => s.line_user_id === payerId);
  const title = bill.description || 'Shared bill';
  const text = `${nameOf(names, payerId)} sent a payment slip for "${title}" (฿${Number(share.share).toFixed(2)}). Check it and confirm: ${flex.billUrl(bill.id)}`;
  try {
    await pushMessages(bill.payer_line_user_id, [{ type: 'text', text }]);
    return 'owner';
  } catch (error) {
    console.warn(`[group] slip notice to owner failed (${error.message}); posting in the group`);
  }
  const mention = flex.mentionMessage([bill.payer_line_user_id], `${nameOf(names, payerId)} sent a payment slip for "${title}". Please check it in the app.`);
  return (await pushToGroup(bill.group_id, [mention])) ? 'group' : 'none';
}

async function notifyRejected(bill, memberId) {
  const names = await ledger.memberNames(bill.group_id);
  const text = `${nameOf(names, bill.payer_line_user_id)} couldn't confirm your slip for "${bill.description || 'Shared bill'}". Please check the amount and send it again: ${flex.billUrl(bill.id)}`;
  try {
    await pushMessages(memberId, [{ type: 'text', text }]);
  } catch (error) {
    console.warn(`[group] slip-rejected notice failed (${error.message})`);
  }
}

async function notifyCancelled(bill, byId) {
  const names = await ledger.memberNames(bill.group_id);
  return pushToGroup(bill.group_id, [flex.cancelledCard({ bill, byName: nameOf(names, byId), unpaid: unpaidTotal(bill) })]);
}

module.exports = { billMessages, digestMessages, leaderboardMessage, notifyPaid, notifySlip, notifyRejected, notifyCancelled, pushToGroup, nameOf };
