// Renders the real LIFF page in Chrome with a stubbed LIFF SDK, against seeded data.
const { BASE, BACKEND, FIXTURES, OUTPUT } = require('../lib');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SHOTS = OUTPUT;
require('fs').mkdirSync(SHOTS, { recursive: true });
const U = 'test_uxui_001';
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures++; };
async function api(path, o = {}) {
  const r = await fetch(`${BASE}/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...o });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const day = (y, m, d, h = 12) => new Date(Date.UTC(y, m, d, h)).toISOString();

async function seed() {
  await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: U, display_name: 'UX Test' }) });
  const cats = (await api(`/categories/${U}?type=expense`)).body.categories;
  const income = (await api(`/categories/${U}?type=income`)).body.categories[0];
  const [a, b] = cats;
  for (const c of [a, b]) await api(`/categories/${U}/${c.id}`, { method: 'PUT', body: JSON.stringify({ budget_amount: 1000, budget_period: 'monthly' }) });
  const now = new Date(), y = now.getUTCFullYear(), m = now.getUTCMonth(), d = now.getUTCDate();
  const tx = (category_id, amount, type, date, description) =>
    api(`/transactions/${U}`, { method: 'POST', body: JSON.stringify({ category_id, amount, type, transaction_date: date, description, channel: 'liff' }) });
  await tx(a.id, 850, 'expense', new Date().toISOString(), 'Groceries today');           // 85% -> amber
  await tx(b.id, 1200, 'expense', day(y, m, d - 1, 5), 'Big purchase yesterday');        // 120% -> red
  await tx(income.id, 5000, 'income', day(y, m, 3), 'Salary');
  await tx(a.id, 100, 'expense', day(y, m - 1, 20), 'Previous cycle item');
  const bill = (await api(`/bills/${U}`, { method: 'POST', body: JSON.stringify({ title: 'Dinner', total_amount: 300, split_type: 'equal', participants: [{ display_name: 'Ann' }, { display_name: 'Bo' }] }) })).body.bill;
  const billFull = (await api(`/bills/${U}/${bill.id}`)).body.bill;
  const ann = billFull.shared_bill_participants.find((p) => p.display_name === 'Ann');
  await api(`/bills/${U}/${bill.id}/participants/${ann.id}`, { method: 'PATCH', body: JSON.stringify({ is_paid: true }) });
  return { a, b, billFull };
}

async function cleanup() {
  await db.from('shared_bills').delete().eq('line_user_id', U);
  await db.from('budget_events').delete().eq('line_user_id', U);
  await db.from('transactions').delete().eq('line_user_id', U);
  await db.from('categories').delete().eq('line_user_id', U);
  await db.from('users').delete().eq('line_user_id', U);
}

(async () => {
  await cleanup();
  const { a, b, billFull } = await seed();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://static.line-scdn.net/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, getProfile: async () => ({ userId: '${U}', displayName: 'UX Test', pictureUrl: '' }), openWindow() {} };` })
  );
  await page.goto(`${BASE}/liff/`);
  await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });
  await page.waitForSelector('#transaction-list .transaction-day-header');

  // Home: day-grouped recent list
  const homeHeaders = await page.$$eval('#transaction-list .transaction-day-header', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
  assert(homeHeaders[0].startsWith('Today') && homeHeaders[0].includes('Spent 850.00'), `Home first header is Today with day spend (got "${homeHeaders[0]}")`);
  assert(homeHeaders[1]?.startsWith('Yesterday'), `second header is Yesterday (got "${homeHeaders[1]}")`);
  await page.screenshot({ path: `${SHOTS}/1_home.png`, fullPage: true });

  // Transactions tab: default = this cycle
  await page.click('.nav-tab[data-tab="transactions"]');
  await page.waitForFunction(() => document.querySelector('#txn-period-label').textContent.length > 0);
  await page.waitForSelector('#txn-full-list .transaction-row');
  const label = await page.textContent('#txn-period-label');
  const now = new Date(); const mon = now.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
  const lastDom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  assert(label === `This cycle · ${mon} 1 – ${mon} ${lastDom}`, `period label is the current cycle, ending on its last day (got "${label}")`);
  assert(await page.isDisabled('#txn-period-next'), 'next-cycle arrow disabled on current cycle');
  const rowsNow = await page.$$eval('#txn-full-list .transaction-description', (els) => els.map((e) => e.textContent));
  assert(rowsNow.length === 3 && !rowsNow.includes('Previous cycle item'), `current cycle shows 3 rows, excludes last cycle (got ${JSON.stringify(rowsNow)})`);
  await page.screenshot({ path: `${SHOTS}/2_transactions_cycle.png`, fullPage: true });

  await page.click('#txn-period-prev');
  await page.waitForFunction(() => !document.querySelector('#txn-period-label').textContent.startsWith('This cycle'));
  await page.waitForFunction(() => document.querySelectorAll('#txn-full-list .transaction-row').length === 1, null, { timeout: 8000 }).catch(() => {});
  const rowsPrev = await page.$$eval('#txn-full-list .transaction-description', (els) => els.map((e) => e.textContent));
  assert(rowsPrev.length === 1 && rowsPrev[0] === 'Previous cycle item', `previous cycle shows only its row (got ${JSON.stringify(rowsPrev)})`);
  assert(!(await page.isDisabled('#txn-period-next')), 'next arrow enabled on a past cycle');

  for (const id of ['#txn-period-prev', '#txn-period-prev', '#txn-period-next', '#txn-period-next']) await page.click(id);
  await page.waitForTimeout(2500);
  const rowsAfterRapid = await page.$$eval('#txn-full-list .transaction-description', (els) => els.map((e) => e.textContent));
  // started at offset -1; prev,prev,next,next lands back on -1 (last cycle)
  assert(!(await page.textContent('#txn-period-label')).startsWith('This cycle') && JSON.stringify(rowsAfterRapid) === '["Previous cycle item"]', `rapid prev/next taps settle on the matching list (got ${JSON.stringify(rowsAfterRapid)})`);

  await page.click('.range-pill[data-range="all"]');
  await page.waitForTimeout(600);
  assert(await page.isHidden('#txn-period-nav'), 'All hides the cycle navigator');
  assert((await page.$$('#txn-full-list .transaction-row')).length === 4, 'All shows all 4 transactions');

  await page.click('.range-pill[data-range="custom"]');
  await page.waitForTimeout(300);
  assert(await page.isVisible('#txn-filter-start'), 'Custom reveals date inputs');

  await page.click('.range-pill[data-range="cycle"]');
  await page.selectOption('#txn-filter-type', 'transfer');
  await page.waitForTimeout(600);
  assert(await page.isVisible('#txn-empty-state'), 'Transfer filter with no transfers shows empty state');
  assert(await page.isHidden('#txn-full-list'), 'empty list card is hidden');
  await page.selectOption('#txn-filter-type', '');

  // 16px controls (iOS focus-zoom)
  const sizes = await page.$$eval('input:not([type=file]):not([type=checkbox]), select', (els) => [...new Set(els.map((e) => getComputedStyle(e).fontSize))]);
  assert(sizes.length === 1 && sizes[0] === '16px', `every input/select is 16px (got ${JSON.stringify(sizes)})`);

  // Budgets tab: warn vs over
  await page.click('.nav-tab[data-tab="budgets"]');
  await page.waitForSelector('#categories-list .category-row');
  await page.waitForTimeout(500);
  const fills = await page.$$eval('#categories-list .category-row', (rows) => rows.map((r) => ({ name: r.querySelector('.category-name').textContent, cls: r.querySelector('.category-budget-fill')?.className })));
  assert(fills.find((f) => f.name === a.name)?.cls.includes('warn'), `${a.name} at 85% is amber (got ${fills.find((f) => f.name === a.name)?.cls})`);
  assert(fills.find((f) => f.name === b.name)?.cls.includes('over'), `${b.name} at 120% is red`);
  await page.screenshot({ path: `${SHOTS}/3_budgets.png`, fullPage: true });

  // Tap targets on visible text/icon buttons in Budgets tab
  const small = await page.$$eval('.link-button, .category-delete, .row-icon-button, .recurring-delete', (els) =>
    els.filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent.trim().slice(0, 20), w: r.width, h: r.height }; }).filter((r) => r.w < 44 || r.h < 44));
  assert(small.length === 0, `visible text/icon buttons are >= 44x44 (undersized: ${JSON.stringify(small)})`);

  // Bill detail progress
  await page.click('.nav-tab[data-tab="home"]');
  await page.click('#bills-list .category-row');
  await page.waitForFunction(() => document.querySelector('#bill-progress-count').textContent.length > 0);
  const count = await page.textContent('#bill-progress-count');
  const outstanding = await page.textContent('#bill-progress-outstanding');
  const bo = billFull.shared_bill_participants.find((p) => p.display_name === 'Bo');
  assert(count === '1 of 2 paid', `bill progress count (got "${count}")`);
  assert(outstanding === `${parseFloat(bo.amount_owed).toFixed(2)} outstanding`, `bill outstanding amount (got "${outstanding}")`);
  const pills = await page.$$eval('#bill-detail-participants .bill-status-pill', (els) => els.map((e) => e.textContent));
  assert(JSON.stringify(pills) === '["Paid","Unpaid"]' || JSON.stringify(pills) === '["Unpaid","Paid"]', `participant status pills (got ${JSON.stringify(pills)})`);
  await page.screenshot({ path: `${SHOTS}/4_bill_detail.png` });
  // toggle Bo paid -> settled
  const boRow = page.locator('#bill-detail-participants .category-row', { hasText: 'Bo' });
  await boRow.locator('.bill-participant-toggle').click();
  await page.waitForFunction(() => document.querySelector('#bill-progress-outstanding').textContent === 'Settled', null, { timeout: 8000 });
  assert(true, 'marking last participant paid flips to Settled');

  // Dark mode render
  await page.click('#close-bill-detail', { timeout: 5000 });
  assert(await page.isHidden('#bill-detail-modal'), 'modal Close button is clickable (not covered by bottom nav)');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.click('.nav-tab[data-tab="budgets"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/5_budgets_dark.png`, fullPage: true });
  await page.click('.nav-tab[data-tab="transactions"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/6_transactions_dark.png`, fullPage: true });

  assert(errors.length === 0, `no page JS errors (got ${JSON.stringify(errors)})`);
  await browser.close();
  await cleanup();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exitCode = failures ? 1 : 0;
})().catch(async (e) => { console.error(e.message.split('\n')[0]); await cleanup(); process.exit(1); });
