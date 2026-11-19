// LINE group / room events for the split tracker. lineWebhookController.js
// routes every event whose source is a group or room here, so group chatter
// never reaches the 1:1 expense parser (which would answer every message).
//
// The bot stays quiet unless addressed: exact command words, or an expense
// starting with "+" / @mentioning the bot (services/groupSplitMath.js).
// Anyone who sends any message joins the group's member list silently.
const { replyText } = require('../services/lineMessagingClient');
const ledger = require('../services/groupLedger');
const { parseGroupMessage, parseSettleAmount } = require('../services/groupSplitMath');

const baht = (n) => `฿${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const nameOf = (names, id) => names.get(id) || `Member ${String(id).slice(-4)}`;

const HELP = [
  'I split shared costs in this group.',
  'Log a cost you paid: "+ข้าว 600" or "+taxi 300 @Ann @Bo" (only those mentioned share it).',
  'Commands: "balance" (who owes whom), "settle @Ann" (you paid Ann back; add an amount for part of it), "undo" (remove your last entry), "members", "join".',
  'Everyone who sends a message here is included in new splits. Each person\'s share is also added to their own expenses in the app.',
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
  const { shares } = await ledger.addExpense({ group, payerId: userId, amount: parsed.amount, description: parsed.description, participantIds });

  const names = new Map(members.map((m) => [m.line_user_id, m.display_name]));
  const lines = [`${parsed.description ? `${parsed.description} ` : ''}${baht(parsed.amount)} paid by ${nameOf(names, userId)}`];
  if (shares.length === 1) {
    lines.push('Only you have joined so far, so it\'s recorded as yours alone. Others join by sending any message here (or "join").');
  } else {
    lines.push(`Split ${shares.length} ways: ${shares.map((s) => `${nameOf(names, s.line_user_id)} ${baht(s.share)}`).join(', ')}`);
  }
  lines.push('Wrong? Send "undo".');
  return replyText(event.replyToken, lines.join('\n'));
}

async function handleBalance(event, group) {
  const { payments, names } = await ledger.groupBalances(group.group_id);
  if (!payments.length) return replyText(event.replyToken, 'Everyone is settled up.');
  const title = group.name ? `Balances in ${group.name}:` : 'Balances:';
  return replyText(event.replyToken, [title, ...payments.map((p) => `${nameOf(names, p.from)} pays ${nameOf(names, p.to)} ${baht(p.amount)}`), 'Once paid, send "settle @name".'].join('\n'));
}

async function handleSettle(event, group, sourceType, userId, rest) {
  const { ids, unresolved } = await resolveMentions(event, group, sourceType);
  const { payments, names } = await ledger.groupBalances(group.group_id);
  const mine = payments.filter((p) => p.from === userId);
  if (unresolved.length) return replyText(event.replyToken, `I don't know ${unresolved.join(', ')} yet. Ask them to send any message here first.`);
  if (ids.length !== 1 || ids[0] === userId) {
    if (!mine.length) return replyText(event.replyToken, "You don't owe anyone here right now.");
    return replyText(event.replyToken, [`You owe: ${mine.map((p) => `${nameOf(names, p.to)} ${baht(p.amount)}`).join(', ')}`, 'Once paid, send "settle @name" (add an amount for part of it).'].join('\n'));
  }
  const toId = ids[0];
  let { amount } = parseSettleAmount(rest);
  if (amount === null) {
    const owed = mine.find((p) => p.to === toId);
    if (!owed) {
      return replyText(event.replyToken, `By the current balances you don't owe ${nameOf(names, toId)}.${mine.length ? ` You owe: ${mine.map((p) => `${nameOf(names, p.to)} ${baht(p.amount)}`).join(', ')}.` : ''} To record a payment anyway, add the amount: "settle @name 100".`);
    }
    amount = owed.amount;
  }
  if (!(amount > 0)) return replyText(event.replyToken, 'The amount has to be more than zero.');
  await ledger.addSettlement({ groupId: group.group_id, fromId: userId, toId, amount });
  return replyText(event.replyToken, `Recorded: ${nameOf(names, userId)} paid ${nameOf(names, toId)} ${baht(amount)}. Wrong? Send "undo".`);
}

async function handleUndo(event, group, userId) {
  const removed = await ledger.undoLast(group.group_id, userId);
  if (!removed) return replyText(event.replyToken, 'Nothing of yours to undo from the last 7 days.');
  if (removed.kind === 'settlement') {
    const members = await ledger.listMembers(group.group_id, { includeLeft: true });
    const names = new Map(members.map((m) => [m.line_user_id, m.display_name]));
    return replyText(event.replyToken, `Removed your payment of ${baht(removed.amount)} to ${nameOf(names, removed.group_expense_shares[0].line_user_id)}.`);
  }
  return replyText(event.replyToken, `Removed your last entry: ${removed.description ? `${removed.description} ` : ''}${baht(removed.amount)}.`);
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
    case 'balance': return handleBalance(event, group);
    case 'settle': return handleSettle(event, group, sourceType, userId, parsed.rest);
    case 'undo': return handleUndo(event, group, userId);
    case 'members': {
      const members = await ledger.listMembers(groupId);
      return replyText(event.replyToken, `Members (${members.length}): ${members.map((m) => m.display_name || `Member ${m.line_user_id.slice(-4)}`).join(', ')}`);
    }
    case 'join':
      await ledger.ensureMember(groupId, sourceType, userId, { force: true });
      return replyText(event.replyToken, `${name || 'You'} joined. New expenses here will be split with you.`);
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
