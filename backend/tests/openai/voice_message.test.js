// Real transcription of a real Thai m4a (tests/fixtures/voice_coffee_120_th.m4a:
// "กาแฟ หนึ่งร้อยยี่สิบ บาท", macOS `say -v Kanya` -> afconvert AAC/m4a, the
// container LINE voice messages use). Costs a fraction of a cent.
// - OpenAI path end to end through the webhook with the real parser.
// - Typhoon with a bogus key falls back to OpenAI.
// - With a real TYPHOON_API_KEY in .env: Typhoon itself transcribes the m4a.
// - The LIFF mic endpoint (POST /api/voice/:u/parse) with the same recording;
//   needs the backend running (TEST_BASE_URL), like the other suites.
const { BACKEND, FIXTURES } = require('../lib');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const AUDIO = fs.readFileSync(path.join(FIXTURES, 'voice_coffee_120_th.m4a'));
const realTyphoonKey = process.env.TYPHOON_API_KEY;

const sent = [];
const clientPath = require.resolve(`${BACKEND}/services/lineMessagingClient.js`);
require.cache[clientPath] = {
  id: clientPath, filename: clientPath, loaded: true,
  exports: {
    async replyText(_, text) { sent.push({ kind: 'text', text }); },
    async replyConfirmationCard(_, options) { sent.push({ kind: 'confirm', options }); },
    async getImageBuffer() { return AUDIO; },
    async pushText() {},
  },
};

let failures = 0;
function assert(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) failures += 1;
}
const mentions120 = (t) => /120|หนึ่งร้อยยี่สิบ|ร้อยยี่สิบ/.test(t);
const U = 'U' + crypto.randomBytes(16).toString('hex');
const cleanup = async () => {
  await db.from('transactions').delete().eq('line_user_id', U);
  await db.from('categories').delete().eq('line_user_id', U);
  await db.from('users').delete().eq('line_user_id', U);
};

(async () => {
  // Fresh module per scenario, since the clients read TYPHOON_API_KEY lazily but cache.
  const fresh = () => {
    delete require.cache[require.resolve(`${BACKEND}/services/voiceTranscription.js`)];
    return require(`${BACKEND}/services/voiceTranscription.js`);
  };

  // --- OpenAI only ---
  delete process.env.TYPHOON_API_KEY;
  let r = await fresh().transcribeVoice(AUDIO);
  assert(r.provider === 'openai' && mentions120(r.text), `OpenAI transcribes the Thai m4a with the amount (got ${r.provider}: "${r.text}")`);

  // --- Bogus Typhoon key -> falls back ---
  process.env.TYPHOON_API_KEY = 'invalid-key-for-fallback-test';
  r = await fresh().transcribeVoice(AUDIO);
  assert(r.provider === 'openai' && mentions120(r.text), `a failing Typhoon call falls back to OpenAI (got ${r.provider})`);

  // --- Real Typhoon key, if configured ---
  if (realTyphoonKey) {
    process.env.TYPHOON_API_KEY = realTyphoonKey;
    r = await fresh().transcribeVoice(AUDIO);
    assert(r.provider === 'typhoon' && mentions120(r.text), `Typhoon accepts the m4a and hears the amount (got ${r.provider}: "${r.text}")`);
  } else {
    console.log('(skipped: no TYPHOON_API_KEY, so Typhoon itself is untested)');
  }

  // --- End to end through the webhook with the real parser ---
  if (realTyphoonKey) process.env.TYPHOON_API_KEY = realTyphoonKey; else delete process.env.TYPHOON_API_KEY;
  fresh();
  const controller = require(`${BACKEND}/controllers/lineWebhookController.js`);
  await controller.webhook({ body: { events: [{ type: 'message', source: { type: 'user', userId: U }, replyToken: 'r', timestamp: Date.now(), mode: 'active',
    message: { id: 'm1', type: 'audio', duration: 2700, contentProvider: { type: 'line' } } }] } }, { status() { return this; }, end() {}, json() {} });
  const card = sent[sent.length - 1];
  const rows = card && card.kind === 'confirm' ? card.options.rows : [];
  assert(card && card.kind === 'confirm', `the voice message produces a confirmation card (got ${JSON.stringify(card)})`);
  assert(rows[0] && rows[0].label === 'Heard' && mentions120(rows[0].value), `Heard row shows the transcript (got ${rows[0] && rows[0].value})`);
  assert(rows.some((x) => x.label === 'Amount' && x.value === '120'), `the parser reads amount 120 from the transcript (got ${JSON.stringify(rows)})`);

  // --- LIFF mic endpoint, same fixture (iOS MediaRecorder also produces audio/mp4) ---
  // The REST API needs a LINE token except for local test_ users (services/lineAuth.js).
  const { BASE } = require('../lib');
  const TU = `test_voice_ep_${Date.now()}`;
  await fetch(`${BASE}/api/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ line_user_id: TU, display_name: 'Voice EP' }) });
  const r2 = await fetch(`${BASE}/api/voice/${TU}/parse`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio_base64: AUDIO.toString('base64'), mime_type: 'audio/mp4' }) }).then(async (x) => ({ status: x.status, body: await x.json() }));
  assert(r2.status === 200 && mentions120(r2.body.transcript) && r2.body.expense.is_expense && r2.body.expense.amount === 120,
    `POST /api/voice/:u/parse transcribes and parses the recording (got ${r2.status} ${JSON.stringify(r2.body)})`);
  assert(r2.body.expense.category_name === null || typeof r2.body.expense.category_id === 'string', 'category_id comes with category_name when matched');
  for (const t of ['categories', 'users']) await db.from(t).delete().eq('line_user_id', TU);

  await cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); await cleanup(); process.exit(1); });
