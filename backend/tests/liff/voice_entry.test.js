// Add Expense -> mic button in headless Chrome. getUserMedia hangs in headless
// Chrome on macOS (even with --use-fake-device-for-media-stream), so the page
// gets a synthetic microphone: a WebAudio tone as the MediaStream. The real
// MediaRecorder still records it, so everything after the mic itself is
// exercised. POST /api/voice/:u/parse is stubbed so no OpenAI call is made;
// the stub records what the page sent. The real transcription path
// is covered by tests/openai/voice_message.test.js.
const { BASE, OUTPUT } = require('../lib');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

require('fs').mkdirSync(OUTPUT, { recursive: true });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const U = `test_voice_liff_${Date.now()}`;
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };

const FAKE_MIC = () => {
  navigator.mediaDevices.getUserMedia = async () => {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const dest = ctx.createMediaStreamDestination();
    osc.frequency.value = 440;
    osc.connect(dest);
    osc.start();
    return dest.stream;
  };
};

async function openApp(browser, { init, voiceReply } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript(FAKE_MIC);
  const errors = [];
  const voiceRequests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (init) await page.addInitScript(init);
  await page.route('https://static.line-scdn.net/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false,
      getProfile: async () => ({ userId: '${U}', displayName: 'Voice Entry Test', pictureUrl: '' }) };` }));
  await page.route(/\/api\/voice\/[^/]+\/parse$/, async (route) => {
    voiceRequests.push(route.request().postDataJSON());
    const reply = typeof voiceReply === 'function' ? await voiceReply() : voiceReply;
    await route.fulfill({ status: reply.status || 200, contentType: 'application/json', body: JSON.stringify(reply.body) });
  });
  await page.goto(`${BASE}/liff/`);
  await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });
  await page.click('#fab-add');
  await page.waitForSelector('#add-expense-modal:not([hidden])');
  return { page, errors, voiceRequests };
}

const stop = async (page) => page.click('#voice-button');

(async () => {
  await fetch(`${BASE}/api/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ line_user_id: U, display_name: 'Voice Entry Test' }) });
  const { body: cats } = await fetch(`${BASE}/api/categories/${U}?type=expense`).then(async (r) => ({ body: await r.json() }));
  const food = cats.categories.find((c) => c.name === 'Food');
  const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });

  // --- Happy path ---
  const ok = { body: { success: true, transcript: 'กาแฟ หนึ่งร้อยยี่สิบบาท', provider: 'openai', expense: { is_expense: true, amount: 120, description: 'กาแฟ', category_id: food.id, category_name: 'Food' } } };
  const { page, errors, voiceRequests } = await openApp(browser, { voiceReply: ok });
  assert(await page.isVisible('#voice-button'), 'the Speak button shows when the browser can record');
  const box = await page.$eval('#voice-button', (b) => b.getBoundingClientRect().height);
  assert(box >= 44 && (await page.textContent('#voice-button-text')) === 'Speak', `Speak button is >= 44px tall (got ${box})`);
  await page.click('#voice-button');
  await page.waitForFunction(() => document.getElementById('voice-button').classList.contains('recording'), null, { timeout: 5000 })
    .catch(async () => { throw new Error(`recording never started: "${await page.textContent('#scan-status')}" errors=${JSON.stringify(errors)}`); });
  assert((await page.getAttribute('#voice-button', 'aria-pressed')) === 'true' && (await page.textContent('#scan-status')).startsWith('Listening'), 'recording: pressed state and a "Listening…" hint');
  await page.waitForTimeout(2300);
  assert(/^Stop 0:0[12]$/.test(await page.textContent('#voice-button-text')), `the button counts up (got "${await page.textContent('#voice-button-text')}")`);
  await page.screenshot({ path: `${OUTPUT}/voice_recording.png` });
  await stop(page);
  await page.waitForFunction(() => document.getElementById('field-amount').value === '120', null, { timeout: 15000 }).catch(() => {});
  assert(voiceRequests.length === 1 && /^audio\/(webm|mp4|ogg)/.test(voiceRequests[0].mime_type) && voiceRequests[0].audio_base64.length > 1000,
    `one request with the recording and its type (got ${voiceRequests.length}, ${voiceRequests[0] && voiceRequests[0].mime_type}, ${voiceRequests[0] && voiceRequests[0].audio_base64.length} chars)`);
  assert((await page.inputValue('#field-amount')) === '120' && (await page.inputValue('#field-description')) === 'กาแฟ' && (await page.inputValue('#field-category')) === food.id, 'amount, description and category are filled in');
  assert((await page.textContent('#scan-status')) === 'Heard: "กาแฟ หนึ่งร้อยยี่สิบบาท". Review the details below before saving.', 'the status shows what was heard');
  assert(!(await page.$eval('#voice-button', (b) => b.classList.contains('recording'))) && (await page.textContent('#voice-button-text')) === 'Speak', 'the button returns to Speak');
  const { count: before } = await db.from('transactions').select('*', { count: 'exact', head: true }).eq('line_user_id', U);
  assert(before === 0, 'nothing is saved until Save');
  await page.click('#add-expense-form button[type="submit"]');
  await page.waitForSelector('#add-expense-modal', { state: 'hidden', timeout: 15000 }).catch(() => {});
  const { data: saved } = await db.from('transactions').select('amount, description, category_id').eq('line_user_id', U);
  assert(saved.length === 1 && Number(saved[0].amount) === 120 && saved[0].category_id === food.id, 'Save stores the voice-filled expense');
  assert(errors.length === 0, `no page JS errors (got ${JSON.stringify(errors)})`);

  // --- Close while recording: discarded, no request ---
  await page.click('#fab-add');
  await page.waitForSelector('#add-expense-modal:not([hidden])');
  assert((await page.inputValue('#field-amount')) === '' && (await page.isHidden('#scan-status')), 'reopening the form starts clean');
  await page.click('#voice-button');
  await page.waitForTimeout(800);
  await page.click('#cancel-add-expense');
  await page.waitForTimeout(800);
  assert(voiceRequests.length === 1, 'closing the form while recording discards the recording');
  await page.context().close();

  // --- Closed while the mic is still starting (QA 2026-11-23 B1) ---
  // The permission prompt holds getUserMedia; closing the sheet then used to
  // let the mic start anyway, hidden, and upload at the 60 s cap.
  const slow = await openApp(browser, {
    voiceReply: ok,
    init: () => {
      const real = navigator.mediaDevices.getUserMedia;
      window.__micTracks = [];
      navigator.mediaDevices.getUserMedia = (c) => new Promise((resolve) => { window.__releaseMic = resolve; })
        .then(() => real.call(navigator.mediaDevices, c)).then((s) => { window.__micTracks.push(...s.getTracks()); return s; });
    },
  });
  await slow.page.click('#voice-button');
  await slow.page.waitForFunction(() => typeof window.__releaseMic === 'function', null, { timeout: 5000 });
  await slow.page.click('#cancel-add-expense');
  await slow.page.evaluate(() => window.__releaseMic());
  await slow.page.waitForTimeout(1200);
  const slowState = await slow.page.evaluate(() => ({ text: document.getElementById('voice-button-text').textContent, live: window.__micTracks.filter((t) => t.readyState === 'live').length, tracks: window.__micTracks.length }));
  assert(slowState.text === 'Speak' && slowState.tracks > 0 && slowState.live === 0, `closing during the mic prompt: no hidden recording, mic released (got ${JSON.stringify(slowState)})`);
  await slow.page.click('#fab-add');
  await slow.page.waitForSelector('#add-expense-modal:not([hidden])');
  assert((await slow.page.textContent('#voice-button-text')) === 'Speak', 'reopening shows Speak, not a running timer');
  // A recording that ends after the sheet is hidden (the 60 s cap path) never uploads.
  await slow.page.evaluate(() => { window.__releaseMic = null; });
  await slow.page.click('#voice-button');
  await slow.page.waitForFunction(() => typeof window.__releaseMic === 'function', null, { timeout: 5000 });
  await slow.page.evaluate(() => window.__releaseMic());
  await slow.page.waitForFunction(() => document.getElementById('voice-button').classList.contains('recording'), null, { timeout: 5000 });
  await slow.page.waitForTimeout(1200);
  await slow.page.evaluate(() => { el.addExpenseModal.hidden = true; voice.recorder.stop(); });
  await slow.page.waitForTimeout(1200);
  assert(slow.voiceRequests.length === 0, 'a recording that stops after the sheet is hidden is not uploaded');
  await slow.page.context().close();

  // --- Not an expense ---
  const noAmount = { body: { success: true, transcript: 'สวัสดีครับ', provider: 'openai', expense: { is_expense: false, amount: null, description: null, category_id: null, category_name: null } } };
  const n = await openApp(browser, { voiceReply: noAmount });
  await n.page.click('#voice-button');
  await n.page.waitForTimeout(1500);
  await stop(n.page);
  await n.page.waitForFunction(() => document.getElementById('scan-status').textContent.startsWith('Heard'), null, { timeout: 15000 }).catch(() => {});
  assert((await n.page.textContent('#scan-status')) === 'Heard: "สวัสดีครับ". No amount found. Try again, or type it below.' && (await n.page.$eval('#scan-status', (e) => e.classList.contains('scan-error'))),
    'no amount found -> an error-styled hint with the transcript');
  assert((await n.page.inputValue('#field-amount')) === '', 'nothing filled in');
  await n.page.context().close();

  // --- Server error ---
  const fail = await openApp(browser, { voiceReply: { status: 422, body: { error: "I didn't catch anything. Try again, e.g. \"กาแฟ 120 บาท\"." } } });
  await fail.page.click('#voice-button');
  await fail.page.waitForTimeout(1500);
  await stop(fail.page);
  await fail.page.waitForFunction(() => document.getElementById('scan-status').classList.contains('scan-error'), null, { timeout: 15000 }).catch(() => {});
  assert((await fail.page.textContent('#scan-status')).startsWith("I didn't catch anything"), 'a server error is shown without the [status] prefix');
  await fail.page.context().close();

  // --- Too short ---
  const short = await openApp(browser, { voiceReply: ok });
  await short.page.click('#voice-button');
  await short.page.waitForTimeout(150);
  await stop(short.page);
  await short.page.waitForTimeout(600);
  assert((await short.page.textContent('#scan-status')).startsWith('That was too short') && short.voiceRequests.length === 0, 'a tap-tap recording is rejected locally, no request');
  await short.page.context().close();

  // --- Microphone blocked ---
  const blocked = await openApp(browser, {
    voiceReply: ok,
    init: () => { navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })); },
  });
  await blocked.page.click('#voice-button');
  await blocked.page.waitForFunction(() => !document.getElementById('scan-status').hidden, null, { timeout: 5000 }).catch(() => {});
  assert((await blocked.page.textContent('#scan-status')).startsWith('Microphone access is blocked') && blocked.errors.length === 0, 'mic permission denied -> a clear hint, no crash');
  await blocked.page.context().close();

  // --- No MediaRecorder: no button ---
  const unsupported = await openApp(browser, { voiceReply: ok, init: () => { delete window.MediaRecorder; } });
  assert(await unsupported.page.isHidden('#voice-button'), 'no MediaRecorder -> the Speak button is hidden');
  await unsupported.page.context().close();

  await browser.close();
  for (const t of ['transactions', 'categories', 'users']) await db.from(t).delete().eq('line_user_id', U);
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e.message.split('\n')[0]); for (const t of ['transactions', 'categories', 'users']) await db.from(t).delete().eq('line_user_id', U); process.exit(1); });
