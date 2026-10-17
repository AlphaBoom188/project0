const { BASE, BACKEND, FIXTURES, OUTPUT } = require('../lib');
const { createClient } = require('@supabase/supabase-js');

const serviceClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Stub the LINE messaging client so we can capture pushes without real tokens/content.
const pushed = [];
const clientPath = require.resolve(`${BACKEND}/services/lineMessagingClient.js`);
require.cache[clientPath] = {
  id: clientPath,
  filename: clientPath,
  loaded: true,
  exports: {
    async replyText() {},
    async replyConfirmationCard() {},
    async getImageBuffer() {
      const fs = require('fs');
      return fs.readFileSync(require('path').join(FIXTURES, 'receipt.jpg'));
    },
    async pushText(to, text) {
      pushed.push({ to, text });
    },
  },
};

const { createTransaction } = require(`${BACKEND}/services/transactionCreate.js`);
const { extractReceiptFromImage } = require(`${BACKEND}/services/receiptExtraction.js`);
const { sendDailyDigest } = require(`${BACKEND}/jobs/dailyDigest.js`);

function assert(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) process.exitCode = 1;
}

async function main() {
  const lineUserId = 'test_opt_out_001';

  await serviceClient.from('users').upsert({
    line_user_id: lineUserId,
    display_name: 'Opt-out test',
    notifications_enabled: false,
    thumbnails_enabled: false,
  });

  const { data: category } = await serviceClient
    .from('categories')
    .insert({ line_user_id: lineUserId, name: 'Opt Out Budget Cat', type: 'expense', budget_amount: 50, budget_period: 'daily' })
    .select()
    .single();

  // --- 1. Budget alert should NOT fire for an opted-out user, even when clearly over budget ---
  await createTransaction({
    lineUserId,
    categoryId: category.id,
    amount: 999,
    type: 'expense',
    transactionDate: new Date().toISOString(),
  });
  await new Promise((r) => setTimeout(r, 1500)); // let the fire-and-forget check settle
  assert(pushed.length === 0, `budget alert suppressed for notifications_enabled=false user (got ${pushed.length} pushes)`);

  // --- 2. Thumbnail upload should NOT happen for a thumbnails_enabled=false user ---
  const { data: imageBuffer } = { data: require('fs').readFileSync(require('path').join(FIXTURES, 'receipt.jpg')) };
  const extracted = await extractReceiptFromImage(lineUserId, imageBuffer.toString('base64'));
  assert(extracted.thumbnail_path === null, `thumbnail upload suppressed for thumbnails_enabled=false user (got ${JSON.stringify(extracted.thumbnail_path)})`);

  // --- 3. Daily digest should skip an opted-out user even though they have today's activity ---
  pushed.length = 0;
  await sendDailyDigest();
  assert(!pushed.some((p) => p.to === lineUserId), 'daily digest skips a notifications_enabled=false user');

  // --- cleanup ---
  await serviceClient.from('transactions').delete().eq('line_user_id', lineUserId);
  await serviceClient.from('categories').delete().eq('line_user_id', lineUserId);
  await serviceClient.from('users').delete().eq('line_user_id', lineUserId);
  console.log('\nCleaned up.');
}

main().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
