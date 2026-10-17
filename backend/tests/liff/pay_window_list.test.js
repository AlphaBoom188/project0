// Recurring pay window in the LIFF app: the rule shows "Due <start> - <end>"
// with Unpaid/Overdue, and Mark Paid / Undo flip it for the current month.
// Needs migration 014 (paid_period).
const { BASE, OUTPUT } = require('../lib');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

require('fs').mkdirSync(OUTPUT, { recursive: true });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const U = 'test_pay_window_liff';
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures++; };
const api = (p, o = {}) =>
  fetch(`${BASE}/api${p}`, { headers: { 'Content-Type': 'application/json' }, ...o }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

async function cleanup() {
  for (const t of ['recurring_transactions', 'transactions', 'categories', 'users']) await db.from(t).delete().eq('line_user_id', U);
}

(async () => {
  await cleanup();
  await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: U, display_name: 'Pay Window LIFF' }) });
  const [cat] = (await api(`/categories/${U}?type=expense`)).body.categories;
  const created = await api(`/recurring/${U}`, { method: 'POST', body: JSON.stringify({ category_id: cat.id, amount: 15000, type: 'expense', frequency: 'monthly', start_date: '2030-01-01', description: 'Rent', pay_start_day: 1, pay_end_day: 5 }) });
  const status = created.body.recurring.pay_status;
  await api(`/recurring/${U}`, { method: 'POST', body: JSON.stringify({ category_id: cat.id, amount: 300, type: 'expense', frequency: 'weekly', start_date: '2030-01-01', description: 'Gym' }) });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://static.line-scdn.net/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false,
      getProfile: async () => ({ userId: '${U}', displayName: 'Pay Window LIFF', pictureUrl: '' }) };` }));
  await page.goto(`${BASE}/liff/`);
  await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });
  await page.click('.nav-tab[data-tab="budgets"]');
  await page.click('#advanced-toggle');
  await page.waitForSelector('.recurring-row', { timeout: 8000 });

  const rentRow = page.locator('.recurring-row', { hasText: 'Rent' });
  const gymRow = page.locator('.recurring-row', { hasText: 'Gym' });
  const fmt = (ymd) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const dueText = await rentRow.locator('.recurring-pay-row span').first().textContent();
  assert(dueText === `Due ${fmt(status.start)} – ${fmt(status.end)}`, `monthly rule shows its window (got "${dueText}")`);
  const pill = await rentRow.locator('.bill-status-pill').textContent();
  assert(pill === (status.overdue ? 'Overdue' : 'Unpaid'), `status pill matches the server (got "${pill}", overdue=${status.overdue})`);
  assert((await gymRow.locator('.recurring-pay-row').count()) === 0, 'weekly rule shows no pay window');
  await page.locator('#recurring-list').screenshot({ path: `${OUTPUT}/pay_window_unpaid.png` });

  await rentRow.locator('.recurring-paid-toggle').click();
  await page.waitForFunction(() => [...document.querySelectorAll('.recurring-row')].some((r) => r.textContent.includes('Rent') && r.querySelector('.bill-status-pill')?.textContent === 'Paid'), null, { timeout: 8000 }).catch(() => {});
  assert((await rentRow.locator('.bill-status-pill').textContent()) === 'Paid' && (await rentRow.locator('.recurring-paid-toggle').textContent()) === 'Undo', 'Mark Paid -> Paid, button becomes Undo');
  const { data: stored } = await db.from('recurring_transactions').select('paid_period').eq('line_user_id', U).eq('description', 'Rent').single();
  assert(stored.paid_period === status.period, `paid_period saved for the current month (got ${stored.paid_period})`);
  await page.locator('#recurring-list').screenshot({ path: `${OUTPUT}/pay_window_paid.png` });

  await rentRow.locator('.recurring-paid-toggle').click();
  await page.waitForFunction(() => [...document.querySelectorAll('.recurring-row')].some((r) => r.textContent.includes('Rent') && r.querySelector('.bill-status-pill')?.textContent !== 'Paid'), null, { timeout: 8000 }).catch(() => {});
  assert((await rentRow.locator('.recurring-paid-toggle').textContent()) === 'Mark Paid', 'Undo -> back to Mark Paid');

  assert(errors.length === 0, `no page JS errors (got ${JSON.stringify(errors)})`);
  await browser.close();
  await cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e.message.split('\n')[0]); await cleanup(); process.exit(1); });
