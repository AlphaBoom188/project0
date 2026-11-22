// DEV_LIFF_STUB (docs/QA.md): the local QA stub SDK must only ever activate
// with the flag set, on direct loopback, for a test_ user. Starts two extra
// server instances (DISABLE_CRON=1), one without the flag and one with it.
const { BACKEND } = require('../lib');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const SDK_TAG = '<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>';
const REAL = fs.readFileSync(path.join(BACKEND, '../liff-app/index.html'), 'utf8');

function start(port, extraEnv) {
  const env = { ...process.env, PORT: String(port), DISABLE_CRON: '1', ...extraEnv };
  if (!extraEnv.DEV_LIFF_STUB) delete env.DEV_LIFF_STUB;
  const child = spawn(process.execPath, ['index.js'], { cwd: BACKEND, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  return { child, log: () => log };
}
async function waitUp(port) {
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return true; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}
const get = (port, p, headers = {}) => fetch(`http://127.0.0.1:${port}${p}`, { headers }).then(async (r) => ({ status: r.status, text: await r.text(), cache: r.headers.get('cache-control') }));

(async () => {
  const off = start(3201, {});
  const on = start(3202, { DEV_LIFF_STUB: '1' });
  const warn = start(3203, { DEV_LIFF_STUB: '1', AUTH_TEST_BYPASS: 'false' });
  try {
    assert(await waitUp(3201) && await waitUp(3202) && await waitUp(3203), 'three instances up');

    // Without the flag
    let r = await get(3201, '/liff-dev-sdk.js?u=test_x');
    assert(r.status === 404, `no flag: /liff-dev-sdk.js is 404 (got ${r.status})`);
    r = await get(3201, '/liff/?devuser=test_x');
    assert(r.status === 200 && r.text === REAL, 'no flag: /liff/?devuser= serves the untouched page');
    assert(!off.log().includes('DEV LIFF STUB ON'), 'no flag: no boot line');

    // Flag on, but through a proxy (X-Forwarded-For / Forwarded)
    for (const h of [{ 'X-Forwarded-For': '1.2.3.4' }, { Forwarded: 'for=1.2.3.4' }]) {
      const name = Object.keys(h)[0];
      r = await get(3202, '/liff-dev-sdk.js?u=test_x', h);
      assert(r.status === 404, `flag + ${name}: stub is 404 (got ${r.status})`);
      r = await get(3202, '/liff/?devuser=test_x', h);
      assert(r.text === REAL, `flag + ${name}: page untouched`);
    }

    // Flag on, loopback, but not a test_ user (or a malformed one)
    for (const u of ['U123', 'test_', 'test_X', 'test_a"b', `test_${'a'.repeat(41)}`, 'test_x</script>']) {
      r = await get(3202, `/liff-dev-sdk.js?u=${encodeURIComponent(u)}`);
      const page = await get(3202, `/liff/?devuser=${encodeURIComponent(u)}`);
      assert(r.status === 404 && page.text === REAL, `flag + devuser=${JSON.stringify(u)}: refused`);
    }
    r = await get(3202, '/liff/');
    assert(r.text === REAL, 'flag, no devuser: page untouched');

    // Flag on, loopback, valid user
    r = await get(3202, '/liff/?devuser=test_qa');
    assert(r.status === 200 && !r.text.includes(SDK_TAG) && r.text.includes('<script src="/liff-dev-sdk.js?u=test_qa"></script>') && r.cache === 'no-store', 'valid: page swaps the LINE SDK for the stub, no-store');
    assert(r.text.replace('<script src="/liff-dev-sdk.js?u=test_qa"></script>', SDK_TAG) === REAL, 'valid: exactly that one tag changed');
    r = await get(3202, '/liff/index.html?devuser=test_qa');
    assert(r.text.includes('/liff-dev-sdk.js?u=test_qa'), 'valid: /liff/index.html too');
    r = await get(3202, '/liff-dev-sdk.js?u=test_qa');
    assert(r.status === 200 && r.text.includes('userId: "test_qa"') && r.cache === 'no-store', 'valid: stub with the user as a JSON string, no-store');
    assert(on.log().includes('DEV LIFF STUB ON — local QA only'), 'boot line logged');
    assert(/AUTH_TEST_BYPASS=false/.test(warn.log()), 'flag + AUTH_TEST_BYPASS=false: warning at boot');

    // The page loads it and signs in as the QA user
    const browser = await chromium.launch({ channel: 'chrome' });
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://localhost:3202/liff/?devuser=test_qa_stubcheck');
    await page.waitForSelector('#app:not([hidden])', { timeout: 20000 }).catch(() => {});
    assert(await page.isVisible('#app') && (await page.evaluate(() => window.liff && window.liff.isInClient() === false)), 'browser: the app opens on the stub');
    assert(errors.length === 0, `browser: no page errors (got ${JSON.stringify(errors)})`);
    await browser.close();
  } finally {
    for (const s of [off, on, warn]) s.child.kill('SIGTERM');
    // the browser check created test_qa_stubcheck through POST /api/users
    const { createClient } = require('@supabase/supabase-js');
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    await db.from('categories').delete().eq('line_user_id', 'test_qa_stubcheck');
    await db.from('users').delete().eq('line_user_id', 'test_qa_stubcheck');
  }
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); console.log('FAIL: crashed'); process.exit(1); });
