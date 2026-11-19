// LINE group / room events for group bills (migrations 016 + 019).
// lineWebhookController.js routes every event whose source is a group or room
// here, so group chatter never reaches the 1:1 expense parser.
//
// The bot stays quiet unless addressed: exact command words, or an expense
// starting with "+" / @mentioning the bot (services/groupSplitMath.js).
// Anyone who sends any message joins the group's member list silently.
//
// Each expense is a bill (owner decision 2026-11-19, KhunThong-style): the
// person who paid asks everyone else for their share; people pay through the
// LIFF app (PromptPay QR / bank transfer + slip) and the owner confirms.
const { replyText, replyMessages } = require('../services/lineMessagingClient');
const ledger = require('../services/groupLedger');
const notify = require('../services/groupBillNotify');
const { parseGroupMessage } = require('../services/groupSplitMath');
const { cancelledCard } = require('../services/groupBillFlex');

const baht = (n) => `฿${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const HELP = [
  'I collect shared bills in this group.',
  'Paid for everyone? Send "+ข้าว 600" (split with everyone here) or "+taxi 300 @Ann @Bo" (only those mentioned). I post a bill card; each person taps Pay, transfers by PromptPay or bank, and sends the slip. You confirm it in the app.',
  'Commands: "bills" (who still owes), "rank" (fastest payers this month), "undo" (cancel your last open bill), "members", "join".',
  'Everyone who sends a message here is included in new bills.',
].join('\n');

const groupCache = new Map();
async function getGroup(groupId, sourceType) {
  const cached = groupCache.get(groupId);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.group;
  const group = await ledger.ensureGroup(groupId, sourceType);
  groupCache.set(groupId, { group, at: Date.now() });
  return group;
}

const groupIdOf = (source) => source.groupId || source.roomId;

// Mentioned people (not the bot). LINE only includes userId when the person
// allows it; otherwise match the mention text against known members' names.
// -> { ids, unresolved: [text] }
async function resolveMentions(event, group, sourceType) {
  const text = event.message.text || '';
  const mentionees = (event.message.mention && event.message.mention.mentionees) || [];
  const ids = [];
  const unresolved = [];
  let members = null;
  for (const m of mentionees) {
    if (m.isSelf || m.type === 'all') continue;
    if (m.userId) {
      await ledger.ensureMember(group.group_id, sourceType, m.userId);
      ids.push(m.userId);
      continue;
    }
    const label = text.slice(m.index, m.index + m.length).replace(/^@/, '').trim().toLowerCase();
    members ||= await ledger.listMembers(group.group_id);
    const match = members.find((mem) => (mem.display_name || '').toLowerCase() === label);
    if (match) ids.push(match.line_user_id);
    else unresolved.push(`@${label}`);
  }
  return { ids: [...new Set(ids)], unresolved };
}

async function handleExpense(event, group, sourceType, userId, parsed) {
  const { ids, unresolved } = await resolveMentions(event, group, sourceType);
  if (unresolved.length) {
    return replyText(event.replyToken, `I don't know ${unresolved.join(', ')} yet. Ask them to send any message here (or "join"), then log it again.`);
  }
  const members = await ledger.listMembers(group.group_id);
  const participantIds = ids.length ? [userId, ...ids] : members.map((m) => m.line_user_id);
  if (!participantIds.includes(userId)) participantIds.push(userId);
  const { bill } = await ledger.addBill({ group, payerId: userId, amount: parsed.amount, description: parsed.description, participantIds });
  if (participantIds.length === 1) {
    return replyText(event.replyToken, `${parsed.description ? `${parsed.description} ` : ''}${baht(parsed.amount)} recorded, but only you have joined so far, so nobody owes you yet. Others join by sending any message here (or "join"), then log it again.`);
  }
  const names = await ledger.memberNames(group.group_id);
  const fresh = await ledger.getBill(bill.id);
  return replyMessages(event.replyToken, notify.billMessages(fresh, names));
}

async function handleRemind(event, group) {
  const messages = await notify.digestMessages(group.group_id);
  if (!messages) return replyText(event.replyToken, 'No unpaid bills here. Everyone is square.');
  return replyMessages(event.replyToken, messages);
}

async function handleUndo(event, group, userId) {
  const bill = await ledger.lastOpenBillBy(group.group_id, userId);
  if (!bill) return replyText(event.replyToken, 'You have no open bill from the last 7 days to cancel.');
  const names = await ledger.memberNames(group.group_id);
  const unpaid = bill.shares.filter((s) => s.line_user_id !== userId && !s.paid_at).reduce((sum, s) => sum + s.share, 0);
  await ledger.cancelBill(bill);
  return replyMessages(event.replyToken, [cancelledCard({ bill, byName: notify.nameOf(names, userId), unpaid })]);
}

async function handleGroupMessage(event) {
  const sourceType = event.source.type;
  const groupId = groupIdOf(event.source);
  const userId = event.source.userId;
  const group = await getGroup(groupId, sourceType);
  if (!userId) return; // LINE omits userId for some users; nothing to attribute
  const name = await ledger.ensureMember(groupId, sourceType, userId);
  if (event.message.type !== 'text') return;

  const mentionees = (event.message.mention && event.message.mention.mentionees) || [];
  const parsed = parseGroupMessage(event.message.text, mentionees);
  if (!parsed) return;
  if (parsed.kind === 'invalid') {
    return replyText(event.replyToken, 'Add an amount, e.g. "+ข้าว 600" or "+taxi 300 @Ann".');
  }
  if (parsed.kind === 'expense') return handleExpense(event, group, sourceType, userId, parsed);

  switch (parsed.command) {
    case 'remind': return handleRemind(event, group);
    case 'leaderboard': return replyMessages(event.replyToken, [await notify.leaderboardMessage(group.group_id)]);
    case 'paid': return replyText(event.replyToken, 'To pay a bill, tap Pay on its card (or send "bills"), transfer, then send your slip in the app. The person who paid confirms it, and I post it here.');
    case 'undo': return handleUndo(event, group, userId);
    case 'members': {
      const members = await ledger.listMembers(groupId);
      return replyText(event.replyToken, `Members (${members.length}): ${members.map((m) => m.display_name || `Member ${m.line_user_id.slice(-4)}`).join(', ')}`);
    }
    case 'join':
      await ledger.ensureMember(groupId, sourceType, userId, { force: true });
      return replyText(event.replyToken, `${name || 'You'} joined. New bills here will include you.`);
    default:
      return replyText(event.replyToken, HELP);
  }
}

async function handleGroupEvent(event) {
  const groupId = groupIdOf(event.source);
  switch (event.type) {
    case 'join':
      groupCache.delete(groupId);
      await getGroup(groupId, event.source.type);
      return replyText(event.replyToken, `Hi! ${HELP}`);
    case 'leave':
      groupCache.delete(groupId);
      return ledger.deactivateGroup(groupId);
    case 'memberLeft':
      return Promise.all(((event.left && event.left.members) || []).filter((m) => m.userId).map((m) => ledger.markMemberLeft(groupId, m.userId)));
    case 'message':
      return handleGroupMessage(event);
    default:
      return; // memberJoined (they join by talking), postback, etc.
  }
}

module.exports = { handleGroupEvent, HELP, _groupCache: groupCache };
