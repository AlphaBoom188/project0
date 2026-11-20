// Settings -> "Add my share of LINE group expenses to my transactions"
// (users.group_ledger_copies, migration 018): on for app users, saves when
// toggled, and stays off after reopening the app.
const { BASE, openTab } = require('../lib');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const U = `test_group_copies_${Date.now()}`;
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const cleanup = async () => { for (const t of ['categories', 'users']) await db.from(t).delete().eq('line_user_id', U); };

async function openSettings(browser) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://static.line-scdn.net/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false,
      getIDToken: () => 'stub', getProfile: async () => ({ userId: '${U}', displayName: 'Group Copies Test', pictureUrl: '' }) };` }));
  await page.goto(`${BASE}/liff/`);
  await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });
  await openTab(page, 'settings');
  await page.waitForTimeout(500);
  return { page, errors };
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  let { page, errors } = await openSettings(browser);
  assert(await page.isChecked('#setting-group-copies'), 'on by default for someone using the app');
  await Promise.all([page.waitForResponse((r) => r.url().endsWith('/preferences'), { timeout: 15000 }), page.click('#setting-group-copies')]);
  const { data } = await db.from('users').select('group_ledger_copies').eq('line_user_id', U).single();
  assert(data.group_ledger_copies === false && (await page.textContent('#settings-status')) === 'Saved.', 'unticking saves false');
  assert(errors.length === 0, `no page JS errors (got ${JSON.stringify(errors)})`);
  await page.context().close();
  ({ page, errors } = await openSettings(browser));
  assert(!(await page.isChecked('#setting-group-copies')), 'reopening the app keeps it off');
  await browser.close();
  await cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e.message.split('\n')[0]); await cleanup(); process.exit(1); });
