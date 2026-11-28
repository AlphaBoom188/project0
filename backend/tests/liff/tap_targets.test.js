// Every visible tappable control is at least --tap-min (44px) tall, on every
// panel and the main sheets, on the synthetic QA seed (scripts/qa-seed.js).
// CLAUDE.md: "tap targets at least --tap-min (44px)". Chips, segments, range
// pills and small buttons were 36px until 2026-11-23.
// Icon-only controls must also be 44px wide; text controls only need the height.
const { BASE, BACKEND, OUTPUT } = require('../lib');
const { chromium } = require('playwright-core');
const { execFileSync } = require('child_process');
const path = require('path');

require('fs').mkdirSync(OUTPUT, { recursive: true });
const U = `test_tap_${Date.now().toString(36)}`;
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const seed = (...extra) => execFileSync(process.execPath, [path.join(BACKEND, 'scripts/qa-seed.js'), '--user', U, '--base', BASE, ...extra], { stdio: 'ignore', timeout: 360000 });

// Measured in the page: visible, enabled controls inside `root` below 44px.
const SMALL = (root) => {
  const scope = document.querySelector(root);
  if (!scope) return ['(missing root)'];
  const sel = 'button, a[href], select, [role="button"], [role="tab"], [role="switch"], summary';
  const out = [];
  for (const e of scope.querySelectorAll(sel)) {
    if (e.disabled || !e.offsetParent) continue;
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    // A switch's hit area is its whole row label.
    const hit = e.closest('label') && e.matches('[role="switch"], input') ? e.closest('label').getBoundingClientRect() : r;
    const iconOnly = !e.textContent.trim();
    if (hit.height < 43.5 || (iconOnly && hit.width < 43.5)) {
      out.push(`${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}.${String(e.className).split(' ')[0]} "${(e.getAttribute('aria-label') || e.textContent).trim().replace(/\s+/g, ' ').slice(0, 24)}" ${Math.round(hit.width)}x${Math.round(hit.height)}`);
    }
  }
  return out;
};

(async () => {
  seed();
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://static.line-scdn.net/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false, getIDToken: () => null,
      getProfile: async () => ({ userId: '${U}', displayName: 'Tap Targets', pictureUrl: '' }) };` }));
  await page.goto(`${BASE}/liff/`);
  await page.waitForSelector('#app:not([hidden])', { timeout: 20000 });

  for (const tab of ['home', 'tasks', 'transactions', 'budgets', 'networth', 'tax', 'settings', 'more']) {
    await page.evaluate((t) => switchTab(t), tab);
    await page.waitForTimeout(2500); // let async sections render
    const small = await page.evaluate(SMALL, `#tab-${tab}`);
    assert(small.length === 0, `${tab}: every control >= 44px${small.length ? ` (small: ${small.join('; ')})` : ''}`);
  }
  // The nav and the main sheets.
  assert((await page.evaluate(SMALL, 'nav')).length === 0, 'bottom nav >= 44px');
  const sheets = [
    ['Add entry', async () => { await page.evaluate(() => switchTab('home')); await page.click('#fab-add'); }, '#add-expense-modal'],
    ['New reminder', async () => { await page.evaluate(() => switchTab('tasks')); await page.click('#fab-add'); }, '.modal:not([hidden])'],
    ['Account filter', async () => { await page.evaluate(() => switchTab('transactions')); await page.click('#txn-account-button'); }, '#account-filter-modal'],
    ['Export / Import', async () => { await page.click('#txn-data-button'); }, '#data-modal'],
  ];
  for (const [name, open, root] of sheets) {
    await open();
    await page.waitForTimeout(1200);
    const small = await page.evaluate(SMALL, root);
    assert(small.length === 0, `${name} sheet: every control >= 44px${small.length ? ` (small: ${small.join('; ')})` : ''}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => switchTab('tasks'));
  await page.screenshot({ path: `${OUTPUT}/tap_targets_tasks.png` });
  assert(errors.length === 0, `no page JS errors (got ${JSON.stringify(errors)})`);
  await browser.close();
  seed('--reset');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e.message.split('\n')[0]); try { seed('--reset'); } catch {} process.exit(1); });
