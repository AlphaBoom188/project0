const crypto = require('crypto');
const supabase = require('../config/supabase');
const { upsertUser } = require('../services/userUpsert');
const { fetchExpenseCategories, matchCategoryByName } = require('../services/categoryMatch');
const { findDuplicateBySlipHash, extractReceiptFromImage } = require('../services/receiptExtraction');
const { parseExpenseText } = require('../services/textExpenseParser');
const { transcribeVoice } = require('../services/voiceTranscription');
const { handleGroupEvent } = require('./lineGroupHandler');
const reminders = require('./lineReminderHandler');
const { allow, LIMITS } = require('../services/rateLimit');

const RATE_LIMITED_REPLY = "You're sending a lot right now. Please wait a few minutes and try again.";
// Bot paths that call OpenAI share the REST endpoints' per-user budgets (services/rateLimit.js).
const overLimit = (kind, lineUserId) => !allow(kind, lineUserId, LIMITS[kind].max, LIMITS[kind].windowMs);
const { createTransaction, InvalidCategoryError, DuplicateSlipError } = require('../services/transactionCreate');
const { signThumbnailPath } = require('../services/signedUrl');
const pending = require('../services/pendingConfirmations');
const { replyText, replyConfirmationCard, getImageBuffer } = require('../services/lineMessagingClient');

const SUMMARY_COMMANDS = new Set(['summary', 'สรุป']);

function log(...args) {
  console.log('[line-webhook]', ...args);
}

const { bangkokParts, bangkokMidnight } = require('../services/bangkokDay');

function toTransactionDateISO(dateStr) {
  if (dateStr) {
    const d = new Date(`${dateStr}T12:00:00Z`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

// Current billing-cycle window [start, end) based on the user's configured cycle
// start day, at Bangkok midnights (same as the LIFF app's getBillingCycleRange).
function getBillingCycleRange(billingCycleStartDay, now = new Date()) {
  const day = billingCycleStartDay || 1;
  const { year } = bangkokParts(now);
  let { month } = bangkokParts(now);
  if (bangkokMidnight(year, month, day) > now) month -= 1;
  return { startISO: bangkokMidnight(year, month, day).toISOString(), endISO: bangkokMidnight(year, month + 1, day).toISOString() };
}

// follow only fires the first time someone adds the bot as a friend -- if this Official
// Account was already friended before the webhook existed, follow never fires again, and
// the user would otherwise have no row (and thus no categories) when they message the bot.
// Idempotent: a no-op update for a user who already exists.
async function ensureUserExists(lineUserId) {
  const { data: existing } = await supabase.from('users').select('line_user_id').eq('line_user_id', lineUserId).maybeSingle();
  if (existing) return;
  log('provisioning previously-unseen user on first message', lineUserId);
  await upsertUser({ lineUserId, displayName: null, pictureUrl: null });
}

// Falls back to the user's "Others" preset category when nothing matched during parsing,
// so the confirm flow never dead-ends just because the AI couldn't pick a category.
async function resolveCategory(lineUserId, suggestedCategoryId, suggestedCategoryName) {
  if (suggestedCategoryId) {
    return { id: suggestedCategoryId, name: suggestedCategoryName };
  }
  const categories = await fetchExpenseCategories(lineUserId);
  const fallback = matchCategoryByName(categories, 'Others');
  return fallback ? { id: fallback.id, name: fallback.name } : null;
}

async function handleFollow(event) {
  const lineUserId = event.source?.userId;
  if (!lineUserId) return;
  log('follow: start', lineUserId);

  await upsertUser({ lineUserId, displayName: null, pictureUrl: null });
  log('follow: user upserted', lineUserId);

  await replyText(
    event.replyToken,
    "Thanks for adding me! Send a photo of a receipt, or just text me something like \"coffee 120\", and I'll log it as an expense. I can remind you too: \"พรุ่งนี้ 9 โมง เตือนประชุม\". Text \"summary\" anytime for your current period's totals, or \"reminders\" for what's coming up."
  );
  log('follow: reply sent', lineUserId);
}

async function handleSummaryCommand(event, lineUserId) {
  const { data: user } = await supabase
    .from('users')
    .select('billing_cycle_start_day')
    .eq('line_user_id', lineUserId)
    .single();

  const { startISO, endISO } = getBillingCycleRange(user?.billing_cycle_start_day);

  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('amount, type')
    .eq('line_user_id', lineUserId)
    .gte('transaction_date', startISO)
    .lt('transaction_date', endISO);

  if (error) throw error;

  const totals = (transactions || []).reduce(
    (acc, t) => {
      acc[t.type] += parseFloat(t.amount);
      return acc;
    },
    { income: 0, expense: 0 }
  );

  const net = totals.income - totals.expense;
  await replyText(
    event.replyToken,
    `This period's summary:\nIncome: ${totals.income.toFixed(2)}\nExpense: ${totals.expense.toFixed(2)}\nNet: ${net.toFixed(2)}`
  );
}

async function handleTextMessage(event) {
  const lineUserId = event.source?.userId;
  const text = event.message.text?.trim() || '';
  if (!lineUserId) return;
  log('text: start', lineUserId, `${text.length} chars`); // never the message itself: logs persist on disk
  return handleExpenseText(event, lineUserId, text);
}

// Voice messages over this length get a polite refusal instead of a
// transcription call -- an expense is a few words, and this caps cost.
const MAX_VOICE_MS = 60 * 1000;

// A LINE voice message (m4a): transcribe it (Typhoon, else OpenAI), then treat
// the transcript exactly like a typed message -- same summary command, same
// parser, same Confirm/Cancel card, with a "Heard" row so a misheard amount is
// obvious before anything is saved.
async function handleAudioMessage(event) {
  const lineUserId = event.source?.userId;
  if (!lineUserId) return;
  const durationMs = event.message.duration || 0;
  log('audio: start', lineUserId, `${durationMs}ms`);

  if (overLimit('voice', lineUserId)) {
    await replyText(event.replyToken, RATE_LIMITED_REPLY);
    return;
  }
  if (durationMs > MAX_VOICE_MS) {
    await replyText(event.replyToken, 'That voice message is a bit long. Please keep it under a minute, e.g. "กาแฟ 120 บาท".');
    return;
  }

  let transcript;
  try {
    const audio = await getImageBuffer(event.message.id); // generic content download, despite the name
    const result = await transcribeVoice(audio);
    transcript = result.text;
    log('audio: transcribed', lineUserId, result.provider, `${(transcript || '').length} chars`);
  } catch (error) {
    console.error('[line-webhook] audio: transcription failed:', error.message);
    await replyText(event.replyToken, "Sorry, I couldn't understand that voice message. Please try again or type it, e.g. \"coffee 120\".");
    return;
  }

  if (!transcript) {
    await replyText(event.replyToken, "I didn't catch anything in that voice message. Try saying something like \"กาแฟ 120 บาท\".");
    return;
  }
  return handleExpenseText(event, lineUserId, transcript, { heard: transcript.slice(0, 200) });
}

// Shared by typed and voice messages. `heard` (voice only) adds the transcript
// to the replies so the user can see what was understood.
async function handleExpenseText(event, lineUserId, text, { heard = null } = {}) {
  if (SUMMARY_COMMANDS.has(text.toLowerCase())) {
    return handleSummaryCommand(event, lineUserId);
  }

  await ensureUserExists(lineUserId);
  if (!heard && overLimit('text', lineUserId)) {
    await replyText(event.replyToken, RATE_LIMITED_REPLY);
    return;
  }
  // Reminders, to-dos and notes first (controllers/lineReminderHandler.js);
  // anything that isn't one carries on as an expense.
  if (await reminders.handlePersonalText(event, lineUserId, text, { heard })) return;
  const parsed = await parseExpenseText(lineUserId, text);
  log('text: parsed', lineUserId, parsed.isExpense ? 'expense' : 'not an expense');

  if (!parsed.isExpense) {
    await replyText(
      event.replyToken,
      (heard ? `I heard: "${heard}"\n` : '') +
        "Sorry, I couldn't find an expense in that message. Try something like \"coffee 120\", send a receipt photo, or text \"summary\" for your current totals."
    );
    log('text: reply sent (not an expense)', lineUserId);
    return;
  }

  const category = await resolveCategory(lineUserId, parsed.suggestedCategoryId, parsed.suggestedCategoryName);
  log('text: category resolved', lineUserId, JSON.stringify(category));
  if (!category) {
    await replyText(event.replyToken, "I couldn't find a category to file this under. Please set up categories in the app first.");
    log('text: reply sent (no category)', lineUserId);
    return;
  }

  const transactionDate = toTransactionDateISO(null);
  const token = pending.create({
    lineUserId,
    categoryId: category.id,
    amount: parsed.amount,
    description: parsed.description,
    transactionDate,
    slipHash: null,
  });
  log('text: pending created', lineUserId, token);

  await replyConfirmationCard(event.replyToken, {
    title: 'Log this expense?',
    rows: [
      ...(heard ? [{ label: 'Heard', value: heard }] : []),
      { label: 'Amount', value: String(parsed.amount) },
      { label: 'For', value: parsed.description || '(no description)' },
      { label: 'Category', value: category.name },
    ],
    confirmData: `action=confirm&token=${token}`,
    cancelData: `action=cancel&token=${token}`,
  });
  log('text: confirmation card sent', lineUserId, token);
}

async function handleImageMessage(event) {
  const lineUserId = event.source?.userId;
  if (!lineUserId) return;
  log('image: start', lineUserId, event.message.id);

  await ensureUserExists(lineUserId);
  if (overLimit('ocr', lineUserId)) {
    await replyText(event.replyToken, RATE_LIMITED_REPLY);
    return;
  }
  const imageBuffer = await getImageBuffer(event.message.id);
  log('image: downloaded', lineUserId, `${imageBuffer.length} bytes`);
  const slipHash = crypto.createHash('sha256').update(imageBuffer).digest('hex');

  const existing = await findDuplicateBySlipHash(lineUserId, slipHash);
  log('image: duplicate check done', lineUserId, existing ? 'DUPLICATE' : 'new');
  if (existing) {
    await replyText(event.replyToken, 'This receipt has already been recorded.');
    log('image: reply sent (duplicate)', lineUserId);
    return;
  }

  const imageBase64 = imageBuffer.toString('base64');
  const extracted = await extractReceiptFromImage(lineUserId, imageBase64);
  log('image: extracted', lineUserId, extracted && extracted.amount != null ? 'amount found' : 'no amount');

  const category = await resolveCategory(lineUserId, extracted.suggested_category_id, extracted.suggested_category_name);
  log('image: category resolved', lineUserId, JSON.stringify(category));
  if (!category) {
    await replyText(event.replyToken, "I couldn't find a category to file this under. Please set up categories in the app first.");
    log('image: reply sent (no category)', lineUserId);
    return;
  }

  const transactionDate = toTransactionDateISO(extracted.date);
  const token = pending.create({
    lineUserId,
    categoryId: category.id,
    amount: extracted.amount,
    description: extracted.merchant,
    transactionDate,
    slipHash,
    thumbnailPath: extracted.thumbnail_path,
  });
  log('image: pending created', lineUserId, token);

  const heroImageUrl = await signThumbnailPath(extracted.thumbnail_path);

  await replyConfirmationCard(event.replyToken, {
    title: 'Log this receipt?',
    heroImageUrl,
    rows: [
      { label: 'Amount', value: extracted.amount != null ? String(extracted.amount) : '(unreadable)' },
      { label: 'Merchant', value: extracted.merchant || '(unreadable)' },
      { label: 'Date', value: extracted.date || '(unreadable)' },
      { label: 'Category', value: category.name },
    ],
    confirmData: `action=confirm&token=${token}`,
    cancelData: `action=cancel&token=${token}`,
  });
  log('image: confirmation card sent', lineUserId, token);
}

async function handlePostback(event) {
  const params = new URLSearchParams(event.postback.data);
  if (params.get('rem')) return reminders.handlePostback(event, params);
  const action = params.get('action');
  const token = params.get('token');
  log('postback: start', action, token);
  if (!token) return;

  const data = pending.get(token);

  if (action === 'cancel') {
    pending.remove(token);
    await replyText(event.replyToken, 'Okay, discarded.');
    return;
  }

  if (action !== 'confirm') return;

  if (!data) {
    await replyText(event.replyToken, 'This confirmation has expired. Please send it again.');
    return;
  }
  if (data.kind === 'reminder') return reminders.confirmPending(event, token, data);

  try {
    await createTransaction({
      lineUserId: data.lineUserId,
      categoryId: data.categoryId,
      amount: data.amount,
      type: 'expense',
      description: data.description,
      slipHash: data.slipHash,
      thumbnailUrl: data.thumbnailPath,
      transactionDate: data.transactionDate,
      channel: 'line_chat',
    });
    pending.remove(token);
    await replyText(event.replyToken, `Saved: ${data.amount} — ${data.description || 'expense'}.`);
  } catch (error) {
    pending.remove(token);
    if (error instanceof DuplicateSlipError) {
      await replyText(event.replyToken, 'This receipt has already been recorded.');
      return;
    }
    if (error instanceof InvalidCategoryError) {
      await replyText(event.replyToken, "That category no longer exists. Please try again.");
      return;
    }
    throw error;
  }
}

async function handleEvent(event) {
  // Group and room chats are the split tracker's; never the 1:1 flows below,
  // which would try to parse (and answer) every message in the chat.
  const sourceType = event.source && event.source.type;
  // Reminder buttons (Done / Snooze / Stop / Cancel) work in any chat.
  if (event.type === 'postback' && /(^|&)rem=/.test(event.postback.data || '')) {
    return reminders.handlePostback(event, new URLSearchParams(event.postback.data));
  }
  if (sourceType === 'group' || sourceType === 'room') return handleGroupEvent(event);
  switch (event.type) {
    case 'follow':
      return handleFollow(event);
    case 'message':
      if (event.message.type === 'text') return handleTextMessage(event);
      if (event.message.type === 'image') return handleImageMessage(event);
      if (event.message.type === 'audio') return handleAudioMessage(event);
      return; // ignore other message types (sticker, video, location, file)
    case 'postback':
      return handlePostback(event);
    default:
      return; // ignore unfollow, join, leave, etc.
  }
}

const lineWebhookController = {
  async webhook(req, res) {
    const events = req.body.events || [];
    log('received', events.length, 'event(s):', events.map((e) => e.type).join(', ') || '(none)');

    // Errors in one event must not block the others or crash the request.
    await Promise.all(
      events.map((event) =>
        handleEvent(event)
          .then(() => log('event handled OK:', event.type))
          .catch((error) => {
            console.error('[line-webhook] event FAILED:', event.type, error);
          })
      )
    );

    res.status(200).end();
    log('responded 200');
  },
};

module.exports = lineWebhookController;
