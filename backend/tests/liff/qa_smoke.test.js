// Deploy smoke test (docs/QA.md, `npm run qa:smoke`): the critical path in
// about a minute. Every panel opens with no console errors and no sideways
// scroll; an expense saves with a toast and Undo removes it; the Export /
// Import sheet opens; the theme switch applies; screenshots of every panel in
// light and dark go to tests/.output/qa-smoke/.
const { BASE, OUTPUT, openTab } = require('../lib');
const path = require('path');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

const SHOTS = path.join(OUTPUT, 'qa-smoke');
require('fs').mkdirSync(SHOTS, { recursive: true });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const U = `test_smoke_${Date.now()}`;
const PANELS = ['home', 'tasks', 'transactions', 'budgets', 'networth', 'tax', 'more', 'settings'];

const api = (p, opts = {}) => fetch(`${BASE}/api${p}`, { ...opts, headers: { 'Content-Type': 'application/json' } }).then((r) => r.json().catch(() => ({})));
async function cleanup() {
  for (const t of ['transactions', 'categories', 'users']) await db.from(t).delete().eq('line_user_id', U);
}

(async () => {
  await cleanup();
  await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: U, display_name: 'Smoke Test' }) });
  const food = (await api(`/categories/${U}?type=expense`)).categories.find((c) => c.name === 'Food');

  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    await page.route('https://static.line-scdn.net/**', (route) => route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false,
      getIDToken: () => null, getProfile: async () => ({ userId: '${U}', displayName: 'Smoke Test', pictureUrl: '' }) };` }));
    await page.goto(`${BASE}/liff/`);
    await page.waitForSelector('#app:not([hidden])', { timeout: 20000 });

    // 1. Every panel: no errors, no sideways scroll
    const wide = [];
    for (const tab of PANELS) {
      await openTab(page, tab);
      await page.waitForTimeout(500);
      const w = await page.evaluate(() => document.documentElement.scrollWidth);
      if (w > 390) wide.push(`${tab}:${w}`);
    }
    assert(wide.length === 0, `no horizontal overflow on any panel (got ${JSON.stringify(wide)})`);
    assert(errors.length === 0, `every panel opens without console errors (got ${JSON.stringify(errors)})`);

    // 2. Add an expense, toast, Undo
    await openTab(page, 'home');
    await page.click('#fab-add');
    await page.waitForSelector(`#category-chips [data-cat="${food.id}"]`, { timeout: 10000 });
    await page.fill('#field-amount', '64');
    await page.fill('#field-description', 'Smoke coffee');
    await page.click(`#category-chips [data-cat="${food.id}"]`);
    const [post] = await Promise.all([page.waitForResponse((r) => r.url().includes(`/transactions/${U}`) && r.request().method() === 'POST'), page.click('#add-entry-save')]);
    await page.waitForSelector('#toast:not([hidden]) .toast-undo', { timeout: 10000 });
    assert(post.status() === 201 && (await page.textContent('#toast')).includes('64'), 'expense saves with a toast');
    await Promise.all([page.waitForResponse((r) => r.request().method() === 'DELETE'), page.click('#toast .toast-undo')]);
    const { data: left } = await db.from('transactions').select('id').eq('line_user_id', U);
    assert(left.length === 0, 'Undo removes it');

    // 3. Export / Import sheet
    await openTab(page, 'transactions');
    await page.click('#txn-data-button');
    await page.waitForSelector('#data-modal:not([hidden])');
    assert(await page.isVisible('#export-csv-button'), 'Export / Import sheet opens');
    await page.click('#data-modal .sheet-close');
    assert(await page.isHidden('#data-modal'), 'its close button closes it');

    // 4. Theme switch, then 5. screenshots in light and dark
    for (const theme of ['light', 'dark']) {
      await openTab(page, 'settings');
      await page.click(`#theme-option-${theme}`);
      const applied = await page.evaluate(() => document.documentElement.dataset.theme);
      assert(applied === theme, `theme switch applies ${theme} (got ${applied})`);
      for (const tab of PANELS) {
        await openTab(page, tab);
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(SHOTS, `${tab}_${theme}.png`), fullPage: true });
      }
    }
    await openTab(page, 'settings');
    await page.click('#theme-option-system');
    assert(errors.length === 0, `no console errors over the whole run (got ${JSON.stringify(errors)})`);
  } finally {
    await browser.close();
    await cleanup();
  }
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); console.log('FAIL: crashed'); await cleanup(); process.exit(1); });
