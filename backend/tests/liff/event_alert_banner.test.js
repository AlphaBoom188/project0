// Event budget alerts in the LIFF app: adding an expense through the real Add
// form shows the backend's alert message in the top banner -- amber for the
// 80% heads-up, red once the bucket is used up.
const { BASE, OUTPUT } = require('../lib');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

require('fs').mkdirSync(OUTPUT, { recursive: true });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const U = 'test_event_banner';
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures++; };
const api = (p, o = {}) =>
  fetch(`${BASE}/api${p}`, { headers: { 'Content-Type': 'application/json' }, ...o }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

async function cleanup() {
  for (const t of ['budget_events', 'transactions', 'categories', 'users']) await db.from(t).delete().eq('line_user_id', U);
}

(async () => {
  await cleanup();
  await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: U, display_name: 'Event Banner Test' }) });
  const [food] = (await api(`/categories/${U}?type=expense`)).body.categories;
  // The Add form dates expenses at today's UTC date, 12:00Z -- same month as this bucket.
  const periodMonth = `${new Date().toISOString().slice(0, 7)}-01`;
  await api(`/budget-events/${U}`, { method: 'POST', body: JSON.stringify({ category_id: food.id, title: 'Songkran Trip', amount: 1000, period_month: periodMonth }) });
  await api(`/transactions/${U}`, { method: 'POST', body: JSON.stringify({ category_id: food.id, amount: 700, type: 'expense', transaction_date: new Date().toISOString(), channel: 'liff' }) });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://static.line-scdn.net/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false,
      getProfile: async () => ({ userId: '${U}', displayName: 'Event Banner Test', pictureUrl: '' }) };` }));
  await page.goto(`${BASE}/liff/`);
  await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });

  const addExpense = async (amount) => {
    await page.click('#fab-add');
    await page.waitForSelector('#add-expense-modal:not([hidden])');
    await page.selectOption('#field-category', food.id);
    await page.fill('#field-amount', String(amount));
    await page.click('#add-expense-form button[type="submit"]');
    await page.waitForSelector('#add-expense-modal', { state: 'hidden', timeout: 10000 });
  };

  await addExpense(150); // 700 -> 850 of 1000
  await page.waitForSelector('#budget-alert-banner:not([hidden])', { timeout: 8000 }).catch(() => {});
  let text = await page.textContent('#budget-alert-banner');
  let cls = await page.getAttribute('#budget-alert-banner', 'class');
  assert(text.includes('85% of event budget "Songkran Trip"'), `heads-up shown in the banner (got "${text}")`);
  assert(cls.includes('warning'), `heads-up banner is amber (class "${cls}")`);
  await page.screenshot({ path: `${OUTPUT}/event_alert_warning.png` });

  await addExpense(200); // 850 -> 1050
  await page.waitForFunction(() => document.querySelector('#budget-alert-banner').textContent.includes('used up'), null, { timeout: 8000 }).catch(() => {});
  text = await page.textContent('#budget-alert-banner');
  cls = await page.getAttribute('#budget-alert-banner', 'class');
  assert(text === 'Event budget "Songkran Trip" is used up: 1050.00 of 1000.00 spent.', `used-up message shown (got "${text}")`);
  assert(!cls.includes('warning'), `used-up banner is red, not amber (class "${cls}")`);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: `${OUTPUT}/event_alert_over_dark.png` });

  assert(errors.length === 0, `no page JS errors (got ${JSON.stringify(errors)})`);
  await browser.close();
  await cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e.message.split('\n')[0]); await cleanup(); process.exit(1); });
