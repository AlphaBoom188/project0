const crypto = require('crypto');
const supabase = require('../config/supabase');
const { upsertUser } = require('../services/userUpsert');
const { fetchExpenseCategories, matchCategoryByName } = require('../services/categoryMatch');
const { findDuplicateBySlipHash, extractReceiptFromImage } = require('../services/receiptExtraction');
const { parseExpenseText } = require('../services/textExpenseParser');
const { createTransaction, InvalidCategoryError, DuplicateSlipError } = require('../services/transactionCreate');
const { signThumbnailPath } = require('../services/signedUrl');
const pending = require('../services/pendingConfirmations');
const { replyText, replyConfirmationCard, getImageBuffer } = require('../services/lineMessagingClient');

const SUMMARY_COMMANDS = new Set(['summary', 'สรุป']);

function log(...args) {
  console.log('[line-webhook]', ...args);
}

function toTransactionDateISO(dateStr) {
  if (dateStr) {
    const d = new Date(`${dateStr}T12:00:00Z`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

// Current billing-cycle window [start, end) based on the user's configured cycle start day.
function getBillingCycleRange(billingCycleStartDay) {
  const day = billingCycleStartDay || 1;
  const now = new Date();
  let start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));
  if (start > now) {
    start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, day));
  }
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, day));
  return { startISO: start.toISOString(), endISO: end.toISOString() };
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
    "Thanks for adding me! Send a photo of a receipt, or just text me something like \"coffee 120\", and I'll log it as an expense. Text \"summary\" anytime for your current period's totals."
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
  log('text: start', lineUserId, JSON.stringify(text));

  if (SUMMARY_COMMANDS.has(text.toLowerCase())) {
    return handleSummaryCommand(event, lineUserId);
  }

  await ensureUserExists(lineUserId);
  const parsed = await parseExpenseText(lineUserId, text);
  log('text: parsed', lineUserId, JSON.stringify(parsed));

  if (!parsed.isExpense) {
    await replyText(
      event.replyToken,
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
  log('image: extracted', lineUserId, JSON.stringify(extracted));

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
  switch (event.type) {
    case 'follow':
      return handleFollow(event);
    case 'message':
      if (event.message.type === 'text') return handleTextMessage(event);
      if (event.message.type === 'image') return handleImageMessage(event);
      return; // ignore other message types (sticker, video, audio, location, file)
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
