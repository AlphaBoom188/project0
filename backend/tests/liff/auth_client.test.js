// LIFF side of API auth: every API request carries the LIFF ID token, an
// expired token triggers one silent liff.login() (not a loop), and CSV
// download goes through a signed export link. Uses a test_ user, so the
// server's local test bypass accepts the stub token.
const { BASE, openTab } = require('../lib');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const U = `test_auth_liff_${Date.now()}`;
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };

async function openApp(browser, { expireOnce = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await context.newPage();
  const errors = [];
  const apiCalls = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (r.url().includes('/api/')) apiCalls.push({ url: r.url(), method: r.method(), auth: r.headers().authorization || null }); });
  await page.route('https://static.line-scdn.net/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: `window.__logins = [];
      window.liff = { init: async () => {}, isLoggedIn: () => true, login(o) { window.__logins.push(o || {}); }, openWindow() {}, isApiAvailable: () => false,
        getIDToken: () => 'stub-id-token', getProfile: async () => ({ userId: '${U}', displayName: 'Auth Client Test', pictureUrl: '' }) };` }));
  if (expireOnce) {
    await page.route(/\/api\/accounts\/[^/]+$/, (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Please sign in again.', code: 'auth_invalid' }) }));
  }
  await page.goto(`${BASE}/liff/`);
  await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });
  return { page, errors, apiCalls };
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });

  const { page, errors, apiCalls } = await openApp(browser);
  await page.waitForTimeout(500);
  assert(apiCalls.length >= 4 && apiCalls.every((c) => c.auth === 'Bearer stub-id-token'), `every API request carries the LIFF ID token (${apiCalls.filter((c) => c.auth !== 'Bearer stub-id-token').map((c) => c.url).join(', ') || `${apiCalls.length} requests`})`);
  assert(apiCalls.some((c) => c.method === 'POST' && c.url.endsWith('/api/users')), 'including the first POST /api/users');

  // CSV download: signed link first, then a navigation carrying exp + sig.
  await page.click('.nav-tab[data-tab="transactions"]');
  await page.waitForTimeout(500);
  const [nav] = await Promise.all([
    page.waitForRequest((r) => r.url().includes(`/transactions/${U}/export?`), { timeout: 15000 }),
    page.click('#txn-data-button').then(() => page.click('#export-csv-button')),
  ]);
  const linkCall = apiCalls.find((c) => c.url.endsWith('/export-link'));
  assert(linkCall && linkCall.method === 'POST' && linkCall.auth === 'Bearer stub-id-token', 'Download CSV first asks for a signed link (with the token)');
  assert(/[?&]exp=\d+/.test(nav.url()) && /[?&]sig=[0-9a-f]{64}/.test(nav.url()), `the download navigation carries exp + sig (got ${nav.url().replace(BASE, '')})`);
  assert(errors.length === 0, `no page JS errors (got ${JSON.stringify(errors)})`);
  await page.context().close();

  // Expired token: one silent re-login, not a loop.
  const exp = await openApp(browser, { expireOnce: true });
  await openTab(exp.page, 'networth');
  await exp.page.waitForTimeout(1500);
  let logins = await exp.page.evaluate(() => window.__logins);
  assert(logins.length === 1 && String(logins[0].redirectUri || '').includes('/liff/'), `a 401 auth_invalid calls liff.login() once, back to this page (got ${JSON.stringify(logins)})`);
  await exp.page.click('.nav-tab[data-tab="home"]');
  await openTab(exp.page, 'networth');
  await exp.page.evaluate(() => { getCache.clear(); return loadNetWorthTab().catch(() => {}); });
  await exp.page.waitForTimeout(800);
  logins = await exp.page.evaluate(() => window.__logins);
  assert(logins.length === 1, `a second 401 within a minute doesn't redirect again (got ${logins.length})`);
  assert(exp.errors.length === 0, `no page JS errors (got ${JSON.stringify(exp.errors)})`);

  await browser.close();
  for (const t of ['categories', 'users']) await db.from(t).delete().eq('line_user_id', U);
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e.message.split('\n')[0]); for (const t of ['categories', 'users']) await db.from(t).delete().eq('line_user_id', U); process.exit(1); });
