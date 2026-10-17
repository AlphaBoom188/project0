const { BASE, BACKEND, FIXTURES, OUTPUT } = require('../lib');
const fs = require('fs');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const RECEIPT_PATH = require('path').join(FIXTURES, 'receipt.jpg');

const serviceClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Stub the LINE messaging client (the two things that need a real channel access
// token / real LINE-hosted content, which we don't have). Everything else in
// lineWebhookController.js runs unmodified.
const sentMessages = [];
const clientPath = require.resolve(`${BACKEND}/services/lineMessagingClient.js`);
require.cache[clientPath] = {
  id: clientPath,
  filename: clientPath,
  loaded: true,
  exports: {
    async replyText(replyToken, text) {
      sentMessages.push({ kind: 'text', replyToken, text });
    },
    async replyConfirmationCard(replyToken, options) {
      sentMessages.push({ kind: 'confirm', replyToken, options });
    },
    async getImageBuffer(_messageId) {
      return fs.readFileSync(RECEIPT_PATH);
    },
    async pushText(to, text) {
      sentMessages.push({ kind: 'push', to, text });
    },
  },
};

const lineWebhookController = require(`${BACKEND}/controllers/lineWebhookController.js`);

function makeRes() {
  return { statusCode: 200, status(c) { this.statusCode = c; return this; }, end() {}, json(o) { this.body = o; } };
}

function lastMessage() {
  return sentMessages[sentMessages.length - 1];
}

function tokenFromConfirmCard(msg) {
  const data = msg.options.confirmData; // "action=confirm&token=XXXX"
  return new URLSearchParams(data).get('token');
}

async function fireEvent(event) {
  const before = sentMessages.length;
  await lineWebhookController.webhook({ body: { events: [event] } }, makeRes());
  return sentMessages.slice(before);
}

function assert(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) process.exitCode = 1;
}

async function main() {
  const lineUserId = 'U' + crypto.randomBytes(16).toString('hex');
  console.log('Test LINE userId:', lineUserId);

  // --- 0. regression: a user who NEVER triggers follow (e.g. already friended the
  // Official Account before the webhook existed) should still get provisioned lazily
  // on their first text message, not dead-end into "couldn't find a category". ---
  const neverFollowedUserId = 'U' + crypto.randomBytes(16).toString('hex');
  const noFollowMsgs = await fireEvent({
    type: 'message',
    source: { type: 'user', userId: neverFollowedUserId },
    replyToken: 'reply-no-follow',
    timestamp: Date.now(),
    mode: 'active',
    message: { id: 'msg-0', type: 'text', text: 'coffee 120', quoteToken: 'q0' },
  });
  assert(noFollowMsgs[0].kind === 'confirm', 'a never-followed user is lazily provisioned and still gets a confirmation card');
  const { data: lazyUser } = await serviceClient.from('users').select('line_user_id').eq('line_user_id', neverFollowedUserId).maybeSingle();
  assert(!!lazyUser, 'lazy provisioning actually created the users row');
  await serviceClient.from('categories').delete().eq('line_user_id', neverFollowedUserId);
  await serviceClient.from('users').delete().eq('line_user_id', neverFollowedUserId);

  // --- 1. follow event: should create the user + preset categories ---
  const followMsgs = await fireEvent({
    type: 'follow',
    source: { type: 'user', userId: lineUserId },
    replyToken: 'reply-follow',
    timestamp: Date.now(),
    mode: 'active',
  });
  assert(followMsgs.length === 1 && followMsgs[0].kind === 'text', 'follow event sends a welcome text');

  const { data: user } = await serviceClient.from('users').select('*').eq('line_user_id', lineUserId).single();
  assert(!!user, 'follow event created a users row');

  const { data: presetCategories } = await serviceClient.from('categories').select('id, name').eq('line_user_id', lineUserId).eq('type', 'expense');
  assert((presetCategories || []).some((c) => c.name === 'Food'), 'preset expense categories were created');
  const othersCategory = (presetCategories || []).find((c) => c.name === 'Others');
  assert(!!othersCategory, '"Others" fallback category exists');

  // --- 2. text message: "coffee 120" should produce a confirmation card ---
  const textMsgs = await fireEvent({
    type: 'message',
    source: { type: 'user', userId: lineUserId },
    replyToken: 'reply-text-1',
    timestamp: Date.now(),
    mode: 'active',
    message: { id: 'msg-1', type: 'text', text: 'coffee 120', quoteToken: 'q1' },
  });
  const textCard = lastMessage();
  assert(textMsgs.length === 1 && textCard.kind === 'confirm', 'text "coffee 120" produces a confirmation card');
  const amountRow = textCard.options.rows.find((r) => r.label === 'Amount');
  assert(amountRow && amountRow.value === '120', `extracted amount is 120 (got ${amountRow && amountRow.value})`);

  // --- 3. confirm the pending text-based transaction ---
  const confirmToken = tokenFromConfirmCard(textCard);
  const confirmMsgs = await fireEvent({
    type: 'postback',
    source: { type: 'user', userId: lineUserId },
    replyToken: 'reply-postback-1',
    timestamp: Date.now(),
    mode: 'active',
    postback: { data: `action=confirm&token=${confirmToken}` },
  });
  assert(confirmMsgs.length === 1 && /Saved/i.test(confirmMsgs[0].text), 'confirm postback replies with a save confirmation');

  const { data: savedTx } = await serviceClient.from('transactions').select('*').eq('line_user_id', lineUserId);
  assert((savedTx || []).some((t) => Number(t.amount) === 120), 'the confirmed transaction actually landed in the DB');

  // --- 4. re-confirming the same (now-consumed) token should say it expired ---
  const staleMsgs = await fireEvent({
    type: 'postback',
    source: { type: 'user', userId: lineUserId },
    replyToken: 'reply-postback-stale',
    timestamp: Date.now(),
    mode: 'active',
    postback: { data: `action=confirm&token=${confirmToken}` },
  });
  assert(/expired/i.test(staleMsgs[0].text), 'reusing a consumed confirm token is rejected as expired');

  // --- 5. cancel flow: parse, then cancel, then confirm with the same token should also say expired ---
  const cancelTextMsgs = await fireEvent({
    type: 'message',
    source: { type: 'user', userId: lineUserId },
    replyToken: 'reply-text-2',
    timestamp: Date.now(),
    mode: 'active',
    message: { id: 'msg-2', type: 'text', text: 'taxi 80', quoteToken: 'q2' },
  });
  const cancelCard = cancelTextMsgs[0];
  const cancelToken = new URLSearchParams(cancelCard.options.cancelData).get('token');
  const cancelReply = await fireEvent({
    type: 'postback',
    source: { type: 'user', userId: lineUserId },
    replyToken: 'reply-postback-cancel',
    timestamp: Date.now(),
    mode: 'active',
    postback: { data: `action=cancel&token=${cancelToken}` },
  });
  assert(/discard/i.test(cancelReply[0].text), 'cancel postback acknowledges discarding');

  const { data: txAfterCancel } = await serviceClient.from('transactions').select('*').eq('line_user_id', lineUserId);
  assert(!(txAfterCancel || []).some((t) => Number(t.amount) === 80), 'cancelled transaction was never saved');

  // --- 6. image message: real OpenAI Vision extraction via the stubbed getImageBuffer ---
  const imageMsgs = await fireEvent({
    type: 'message',
    source: { type: 'user', userId: lineUserId },
    replyToken: 'reply-image-1',
    timestamp: Date.now(),
    mode: 'active',
    message: { id: 'msg-3', type: 'image', contentProvider: { type: 'line' }, quoteToken: 'q3' },
  });
  const imageCard = imageMsgs[0];
  assert(imageCard.kind === 'confirm', 'image message produces a confirmation card');
  const merchantRow = imageCard.options.rows.find((r) => r.label === 'Merchant');
  assert(merchantRow && /GREENLEAF/i.test(merchantRow.value), `extracted merchant matches receipt (got ${merchantRow && merchantRow.value})`);
  const imgAmountRow = imageCard.options.rows.find((r) => r.label === 'Amount');
  assert(imgAmountRow && imgAmountRow.value === '320', `extracted amount is 320 (got ${imgAmountRow && imgAmountRow.value})`);
  assert(
    typeof imageCard.options.heroImageUrl === 'string' && imageCard.options.heroImageUrl.startsWith('https://'),
    `confirmation card has a real signed hero image URL (got ${imageCard.options.heroImageUrl})`
  );

  const imageToken = tokenFromConfirmCard(imageCard);
  await fireEvent({
    type: 'postback',
    source: { type: 'user', userId: lineUserId },
    replyToken: 'reply-postback-image',
    timestamp: Date.now(),
    mode: 'active',
    postback: { data: `action=confirm&token=${imageToken}` },
  });

  const { data: txWithSlip } = await serviceClient.from('transactions').select('*').eq('line_user_id', lineUserId).not('slip_hash', 'is', null);
  assert((txWithSlip || []).length === 1, 'image-sourced transaction saved with a slip_hash');
  assert(!!(txWithSlip || [])[0]?.thumbnail_url, `saved transaction has a thumbnail_url storage path (got ${JSON.stringify(txWithSlip?.[0]?.thumbnail_url)})`);

  // --- 7. sending the SAME image again should be caught as a duplicate before any card is shown ---
  const dupMsgs = await fireEvent({
    type: 'message',
    source: { type: 'user', userId: lineUserId },
    replyToken: 'reply-image-2',
    timestamp: Date.now(),
    mode: 'active',
    message: { id: 'msg-4', type: 'image', contentProvider: { type: 'line' }, quoteToken: 'q4' },
  });
  assert(dupMsgs[0].kind === 'text' && /already been recorded/i.test(dupMsgs[0].text), 'resending the same receipt image is rejected as a duplicate');

  // --- 8. summary command reflects only the text-sourced transaction (120). The
  // image-sourced one is dated 2026-01-15 (from the synthetic receipt), which falls
  // outside the current billing-cycle window around "now" -- correctly excluded. ---
  const summaryMsgs = await fireEvent({
    type: 'message',
    source: { type: 'user', userId: lineUserId },
    replyToken: 'reply-summary',
    timestamp: Date.now(),
    mode: 'active',
    message: { id: 'msg-5', type: 'text', text: 'summary', quoteToken: 'q5' },
  });
  console.log('Summary reply:\n' + summaryMsgs[0].text);
  assert(/Expense: 120\.00/.test(summaryMsgs[0].text), 'summary command correctly includes only the in-period transaction (120), excluding the out-of-period receipt (320)');

  // --- 9. budget alert: a category with a low daily budget should trigger exactly
  // one push the moment a confirmed transaction crosses it, and not re-alert after. ---
  const { data: budgetCategory } = await serviceClient
    .from('categories')
    .insert({ line_user_id: lineUserId, name: 'Budget Test Category', type: 'expense', budget_amount: 100, budget_period: 'daily' })
    .select()
    .single();

  async function confirmTextExpense(text, msgId) {
    const msgs = await fireEvent({
      type: 'message',
      source: { type: 'user', userId: lineUserId },
      replyToken: `reply-${msgId}`,
      timestamp: Date.now(),
      mode: 'active',
      message: { id: msgId, type: 'text', text, quoteToken: msgId },
    });
    const card = msgs[0];
    const token = tokenFromConfirmCard(card);
    await fireEvent({
      type: 'postback',
      source: { type: 'user', userId: lineUserId },
      replyToken: `reply-${msgId}-postback`,
      timestamp: Date.now(),
      mode: 'active',
      postback: { data: `action=confirm&token=${token}` },
    });
  }

  const pushesBefore = sentMessages.filter((m) => m.kind === 'push').length;
  await confirmTextExpense('budget test category 150', 'msg-budget-1');
  await new Promise((r) => setTimeout(r, 1500)); // budget check is fire-and-forget, let it settle
  const pushesAfterCrossing = sentMessages.filter((m) => m.kind === 'push');
  assert(
    pushesAfterCrossing.length === pushesBefore + 1 && /budget alert/i.test(pushesAfterCrossing[pushesAfterCrossing.length - 1].text),
    `crossing the budget triggers exactly one push alert (got ${pushesAfterCrossing.length - pushesBefore} new pushes)`
  );

  await confirmTextExpense('budget test category 10', 'msg-budget-2');
  await new Promise((r) => setTimeout(r, 1500));
  const pushesAfterSecond = sentMessages.filter((m) => m.kind === 'push').length;
  assert(pushesAfterSecond === pushesAfterCrossing.length, 'staying over budget on a later transaction does not re-alert');

  await serviceClient.from('transactions').delete().eq('category_id', budgetCategory.id);
  await serviceClient.from('categories').delete().eq('id', budgetCategory.id);

  // --- cleanup ---
  await serviceClient.from('transactions').delete().eq('line_user_id', lineUserId);
  await serviceClient.from('categories').delete().eq('line_user_id', lineUserId);
  await serviceClient.from('users').delete().eq('line_user_id', lineUserId);
  console.log('\nTest fixtures cleaned up.');
}

main().catch((e) => {
  console.error('HARNESS ERROR:', e);
  process.exit(1);
});
