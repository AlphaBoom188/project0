// LINE voice messages -> transcript -> the typed-text expense path.
// Free: LINE, transcription and the OpenAI text parser are all stubbed, so
// this checks routing, refusals, the "Heard" row and confirm -> transaction.
// Real transcription of a real Thai m4a lives in tests/openai/voice_message.test.js.
const { BACKEND } = require('../lib');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function stub(relPath, exports) {
  const p = require.resolve(`${BACKEND}/${relPath}`);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
}

const sent = [];
let downloads = 0;
stub('services/lineMessagingClient.js', {
  async replyText(replyToken, text) { sent.push({ kind: 'text', text }); },
  async replyConfirmationCard(replyToken, options) { sent.push({ kind: 'confirm', options }); },
  async getImageBuffer() { downloads += 1; return Buffer.from('fake-m4a'); },
  async pushText() {},
});

let transcribeCalls = 0;
let nextTranscript = { text: '', provider: 'openai' };
stub('services/voiceTranscription.js', {
  async transcribeVoice() {
    transcribeCalls += 1;
    if (nextTranscript instanceof Error) throw nextTranscript;
    return nextTranscript;
  },
});

let parserInputs = [];
stub('services/textExpenseParser.js', {
  async parseExpenseText(lineUserId, text) {
    parserInputs.push(text);
    const m = text.match(/(\d+(?:\.\d+)?)/);
    return m
      ? { isExpense: true, amount: Number(m[1]), description: 'กาแฟ', suggestedCategoryId: null, suggestedCategoryName: null }
      : { isExpense: false, amount: null, description: null, suggestedCategoryId: null, suggestedCategoryName: null };
  },
});

const controller = require(`${BACKEND}/controllers/lineWebhookController.js`);

let failures = 0;
function assert(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) failures += 1;
}

const U = 'U' + crypto.randomBytes(16).toString('hex');
const res = () => ({ status() { return this; }, end() {}, json() {} });
async function fire(message) {
  const before = sent.length;
  await controller.webhook({ body: { events: [{ type: 'message', source: { type: 'user', userId: U }, replyToken: 'r', timestamp: Date.now(), mode: 'active', message }] } }, res());
  return sent.slice(before);
}
const audio = (duration = 3000) => ({ id: 'm-' + crypto.randomBytes(4).toString('hex'), type: 'audio', duration, contentProvider: { type: 'line' } });

async function cleanup() {
  await db.from('transactions').delete().eq('line_user_id', U);
  await db.from('categories').delete().eq('line_user_id', U);
  await db.from('users').delete().eq('line_user_id', U);
}

(async () => {
  // --- Too long: refused before download or transcription ---
  let out = await fire(audio(61000));
  assert(out.length === 1 && out[0].kind === 'text' && out[0].text.includes('under a minute'), 'a voice message over 60s gets a "keep it under a minute" reply');
  assert(downloads === 0 && transcribeCalls === 0, 'an over-long voice message is never downloaded or transcribed');

  // --- Transcription failure ---
  nextTranscript = new Error('boom');
  out = await fire(audio());
  assert(out.length === 1 && out[0].text.startsWith("Sorry, I couldn't understand that voice message"), 'a transcription error gets an apology, not a crash');

  // --- Empty transcript ---
  nextTranscript = { text: '', provider: 'openai' };
  parserInputs = [];
  out = await fire(audio());
  assert(out.length === 1 && out[0].text.startsWith("I didn't catch anything"), 'an empty transcript gets a "didn\'t catch anything" reply');
  assert(parserInputs.length === 0, 'an empty transcript never reaches the parser');

  // --- Expense: confirmation card with a Heard row first ---
  nextTranscript = { text: 'กาแฟ 120 บาท', provider: 'typhoon' };
  out = await fire(audio());
  assert(parserInputs[parserInputs.length - 1] === 'กาแฟ 120 บาท', 'the transcript goes to the same parser as typed text');
  const card = out[0];
  assert(card && card.kind === 'confirm', `a spoken expense gets the Confirm/Cancel card (got ${card && card.kind})`);
  const rows = card ? card.options.rows : [];
  assert(rows[0] && rows[0].label === 'Heard' && rows[0].value === 'กาแฟ 120 บาท', 'the card\'s first row shows what was heard');
  assert(rows.some((r) => r.label === 'Amount' && r.value === '120') && rows.some((r) => r.label === 'Category' && r.value === 'Others'), 'amount 120, category falls back to Others');

  // --- Confirm creates the transaction ---
  const token = new URLSearchParams(card.options.confirmData).get('token');
  await controller.webhook({ body: { events: [{ type: 'postback', source: { type: 'user', userId: U }, replyToken: 'r', timestamp: Date.now(), postback: { data: `action=confirm&token=${token}` } }] } }, res());
  const { data: txns } = await db.from('transactions').select('amount, type, description').eq('line_user_id', U);
  assert(txns && txns.length === 1 && Number(txns[0].amount) === 120 && txns[0].type === 'expense', `Confirm saves one 120 expense (got ${JSON.stringify(txns)})`);

  // --- Not an expense: the reply says what was heard ---
  nextTranscript = { text: 'สวัสดีครับ', provider: 'openai' };
  out = await fire(audio());
  assert(out.length === 1 && out[0].text.startsWith('I heard: "สวัสดีครับ"') && out[0].text.includes("couldn't find an expense"), 'a non-expense voice reply quotes the transcript');

  // --- Spoken summary command ---
  nextTranscript = { text: 'สรุป', provider: 'typhoon' };
  out = await fire(audio());
  assert(out.length === 1 && out[0].text.startsWith("This period's summary"), 'saying "สรุป" runs the summary command');

  // --- Long transcript is capped on the card ---
  nextTranscript = { text: 'ก'.repeat(300) + ' 50', provider: 'openai' };
  out = await fire(audio());
  assert(out[0].kind === 'confirm' && out[0].options.rows[0].value.length === 200, 'the Heard row is capped at 200 characters');

  // --- Typed text unchanged: no Heard row ---
  out = await fire({ id: 'm-t', type: 'text', text: 'coffee 80', quoteToken: 'q' });
  assert(out[0].kind === 'confirm' && out[0].options.rows[0].label === 'Amount', 'typed messages still get the card without a Heard row');

  await cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); await cleanup(); process.exit(1); });
