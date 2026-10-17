// Batch 3: account filter (REST + sheet), logging streak, spacing/radius tokens.
const { BASE, BACKEND, FIXTURES, OUTPUT } = require('../lib');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SHOTS = OUTPUT;
require('fs').mkdirSync(SHOTS, { recursive: true });
const U = 'test_uxui_003';
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures++; };
async function api(path, o = {}) {
  const r = await fetch(`${BASE}/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...o });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function cleanup() {
  for (const t of ['transactions', 'accounts', 'categories', 'users']) await db.from(t).delete().eq('line_user_id', U);
}
// Local-noon timestamps N days back, so "today/yesterday" match the browser's local calendar.
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(12, 0, 0, 0); return d.toISOString(); };

async function seed() {
  await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: U, display_name: 'UX Test 3' }) });
  const [cat] = (await api(`/categories/${U}?type=expense`)).body.categories;
  const kbank = (await api(`/accounts/${U}`, { method: 'POST', body: JSON.stringify({ account_name: 'Kbank', account_type: 'bank', balance: 10000 }) })).body.account;
  const cash = (await api(`/accounts/${U}`, { method: 'POST', body: JSON.stringify({ account_name: 'Wallet Cash', account_type: 'cash', balance: 500 }) })).body.account;
  const tx = (body) => api(`/transactions/${U}`, { method: 'POST', body: JSON.stringify({ type: 'expense', category_id: cat.id, channel: 'liff', ...body }) });
  // current streak: today, 1, 2 days ago -> 3; earlier run 10..13 days ago -> 4 (best)
  await tx({ amount: 100, transaction_date: daysAgo(0), description: 'Kbank lunch', from_account_id: kbank.id });
  await tx({ amount: 50, transaction_date: daysAgo(1), description: 'Cash snack', from_account_id: cash.id });
  await tx({ amount: 70, transaction_date: daysAgo(2), description: 'No-account taxi' });
  await api(`/transactions/${U}`, { method: 'POST', body: JSON.stringify({ type: 'transfer', amount: 200, transaction_date: daysAgo(2), description: 'Top up wallet', from_account_id: kbank.id, to_account_id: cash.id }) });
  for (const n of [10, 11, 12, 13]) await tx({ amount: 10, transaction_date: daysAgo(n), description: `Old run ${n}` });
  return { kbank, cash };
}
const descs = (page) => page.$$eval('#txn-full-list .transaction-description', (els) => els.map((e) => e.textContent).sort());

(async () => {
  await cleanup();
  const { kbank, cash } = await seed();

  // ---- REST: account filter ----
  const onlyKbank = await api(`/transactions/${U}?account_id=${kbank.id}&limit=100`);
  const kd = onlyKbank.body.transactions.map((t) => t.description).sort();
  assert(JSON.stringify(kd) === '["Kbank lunch","Top up wallet"]', `account_id matches either side of a transfer (got ${JSON.stringify(kd)})`);
  const both = await api(`/transactions/${U}?account_id=${kbank.id},${cash.id}&limit=100`);
  assert(both.body.transactions.length === 3, `multiple account ids OR together (got ${both.body.transactions.length})`);
  const lunch = onlyKbank.body.transactions.find((t) => t.description === 'Kbank lunch');
  assert(lunch.from_account?.account_name === 'Kbank' && lunch.to_account === null, `list embeds from/to account names (got ${JSON.stringify([lunch.from_account, lunch.to_account])})`);
  const bad = await api(`/transactions/${U}?account_id=not-a-uuid`);
  assert(bad.status === 400, `non-UUID account_id -> 400 (got ${bad.status})`);
  const inject = await api(`/transactions/${U}?account_id=${encodeURIComponent(`${kbank.id},line_user_id.neq.x`)}`);
  assert(inject.status === 400, `filter-injection attempt -> 400 (got ${inject.status})`);
  const exportRes = await fetch(`${BASE}/api/transactions/${U}/export?account_id=${cash.id}`);
  const csv = await exportRes.text();
  assert(exportRes.status === 200 && csv.includes('Cash snack') && csv.includes('Top up wallet') && !csv.includes('Kbank lunch'), 'CSV export honours account_id');
  const fullRes = await fetch(`${BASE}/api/transactions/${U}/export`);
  const bytes = Buffer.from(await fullRes.arrayBuffer());
  assert(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf, 'CSV still starts with the UTF-8 BOM');
  const lines = bytes.toString('utf8').replace(/^\uFEFF/, '').split('\r\n');
  const header = lines[0].split(',');
  assert(JSON.stringify(header) === JSON.stringify(['Date', 'Type', 'Category', 'Description', 'Amount', 'Payment Method', 'Account']), `Account appended as last column, earlier columns unmoved (got ${lines[0]})`);
  const byDesc = Object.fromEntries(lines.slice(1).map((l) => { const c = l.split(','); return [c[3], c[6]]; }));
  assert(byDesc['Kbank lunch'] === 'Kbank', `account expense -> account name (got "${byDesc['Kbank lunch']}")`);
  assert(byDesc['Cash snack'] === 'Wallet Cash', `cash-account expense -> account name (got "${byDesc['Cash snack']}")`);
  assert(byDesc['Top up wallet'] === 'Kbank → Wallet Cash', `transfer -> From → To (got "${byDesc['Top up wallet']}")`);
  assert(byDesc['No-account taxi'] === '', `no account -> blank, payment method stays in its own column (got "${byDesc['No-account taxi']}")`);
  assert(lines.slice(1).every((l) => l.split(',').length === 7), 'every row has 7 columns');
  const exportBad = await fetch(`${BASE}/api/transactions/${U}/export?account_id=bad`);
  assert(exportBad.status === 400, `CSV export rejects a bad account_id (got ${exportBad.status})`);

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://static.line-scdn.net/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false,
      getProfile: async () => ({ userId: '${U}', displayName: 'UX Test 3', pictureUrl: '' }) };` }));
  await page.goto(`${BASE}/liff/`);
  await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });

  const homeLabel = await page.textContent('#period-label');
  const now = new Date(); const mon = now.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
  const lastDom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  assert(homeLabel === `This cycle · ${mon} 1 – ${mon} ${lastDom}`, `Home cycle label ends on the cycle's last day (got "${homeLabel}")`);

  // ---- Streak ----
  await page.waitForFunction(() => document.querySelector('#streak-count').textContent.length > 0);
  assert((await page.textContent('#streak-count')) === '3-day logging streak', `current streak (got "${await page.textContent('#streak-count')}")`);
  assert((await page.textContent('#streak-best')) === 'Best: 4 days (6 mo)', `best run in window (got "${await page.textContent('#streak-best')}")`);
  const dots = await page.$$eval('.streak-dot', (els) => els.map((e) => e.classList.contains('logged')));
  assert(JSON.stringify(dots) === '[false,false,false,false,true,true,true]', `7-day dots, oldest first (got ${JSON.stringify(dots)})`);
  assert((await page.textContent('#streak-hint')).startsWith('Logged today'), 'hint when today is logged');
  const hint2 = await page.evaluate(() => {
    const ts = [1, 2].map((n) => { const d = new Date(); d.setDate(d.getDate() - n); return { transaction_date: d.toISOString() }; });
    const r = computeStreak(ts); return { current: r.current, loggedToday: r.loggedToday };
  });
  assert(hint2.current === 2 && hint2.loggedToday === false, `streak stays alive when only yesterday is logged (got ${JSON.stringify(hint2)})`);
  const none = await page.evaluate(() => computeStreak([]).current);
  assert(none === 0, 'no transactions -> streak 0');
  await page.screenshot({ path: `${SHOTS}/b3_home_streak.png` });

  // ---- Radius tokens ----
  const radii = await page.evaluate(() => ({ card: getComputedStyle(document.querySelector('.summary-card')).borderRadius, space: getComputedStyle(document.documentElement).getPropertyValue('--space-page').trim() }));
  assert(radii.card === '16px', `cards use --radius-card 16px (got ${radii.card})`);

  // ---- Account filter sheet ----
  await page.click('.nav-tab[data-tab="transactions"]');
  await page.click('.range-pill[data-range="all"]');
  await page.waitForFunction(() => document.querySelectorAll('#txn-full-list .transaction-row').length === 8, null, { timeout: 8000 }).catch(() => {});
  assert((await page.textContent('#txn-account-button')) === 'All accounts', 'filter button starts as All accounts');
  const sourceLabels = await page.$$eval('#txn-full-list .transaction-row', (rows) =>
    Object.fromEntries(rows.map((r) => [r.querySelector('.transaction-description')?.textContent, r.querySelectorAll('.transaction-date')[0]?.textContent])));
  assert(sourceLabels['Kbank lunch'] === 'Kbank', `account expense shows its account, not CASH (got "${sourceLabels['Kbank lunch']}")`);
  assert(sourceLabels['Cash snack'] === 'Wallet Cash', `cash-account expense shows the account name (got "${sourceLabels['Cash snack']}")`);
  assert(sourceLabels['Top up wallet'] === 'Kbank → Wallet Cash', `transfer shows From → To (got "${sourceLabels['Top up wallet']}")`);
  assert(sourceLabels['No-account taxi'] && !['Kbank', 'Wallet Cash'].includes(sourceLabels['No-account taxi']), `no-account row falls back to payment_method (got "${sourceLabels['No-account taxi']}")`);
  await page.click('#txn-account-button');
  await page.waitForSelector('#account-filter-modal:not([hidden])');
  const names = await page.$$eval('.account-filter-name', (els) => els.map((e) => e.textContent).sort());
  assert(JSON.stringify(names) === '["Kbank","Wallet Cash"]', `sheet lists the user's accounts (got ${JSON.stringify(names)})`);
  const sheetRadius = await page.evaluate(() => getComputedStyle(document.querySelector('#account-filter-modal .modal-content')).borderTopLeftRadius);
  assert(sheetRadius === '24px', `sheets use --radius-modal 24px (got ${sheetRadius})`);
  await page.screenshot({ path: `${SHOTS}/b3_account_sheet.png` });
  // dismissing via backdrop changes nothing
  await page.check(`#account-filter-list input[value="${cash.id}"]`);
  await page.mouse.click(200, 60);
  assert(await page.isHidden('#account-filter-modal'), 'tapping the backdrop closes the sheet');
  assert((await page.textContent('#txn-account-button')) === 'All accounts', 'dismissed sheet does not apply its checkboxes');
  await page.click('#txn-account-button');
  await page.waitForSelector('#account-filter-modal:not([hidden])');
  assert(!(await page.isChecked(`#account-filter-list input[value="${cash.id}"]`)), 'reopened sheet reflects the applied (empty) filter');
  await page.check(`#account-filter-list input[value="${kbank.id}"]`);
  await page.click('#account-filter-apply');
  await page.waitForFunction(() => document.querySelectorAll('#txn-full-list .transaction-row').length === 2, null, { timeout: 8000 }).catch(() => {});
  assert(JSON.stringify(await descs(page)) === '["Kbank lunch","Top up wallet"]', `list filtered to Kbank (got ${JSON.stringify(await descs(page))})`);
  await page.waitForFunction(() => document.querySelector('#txn-account-button').textContent === 'Kbank', null, { timeout: 5000 }).catch(() => {});
  assert((await page.textContent('#txn-account-button')) === 'Kbank' && (await page.getAttribute('#txn-account-button', 'class')).includes('active'), 'button shows the selected account, highlighted');
  assert((await page.evaluate(() => buildTransactionFilterQuery().get('account_id'))) === kbank.id, 'CSV exports carry account_id');
  await page.screenshot({ path: `${SHOTS}/b3_filtered.png` });
  await page.click('#txn-account-button');
  await page.waitForSelector('#account-filter-modal:not([hidden])');
  await page.check(`#account-filter-list input[value="${cash.id}"]`);
  await page.click('#account-filter-apply');
  await page.waitForFunction(() => document.querySelector('#txn-account-button').textContent === '2 accounts', null, { timeout: 5000 }).catch(() => {});
  assert((await page.textContent('#txn-account-button')) === '2 accounts', 'two selections label as "2 accounts"');
  await page.click('#txn-account-button');
  await page.waitForSelector('#account-filter-modal:not([hidden])');
  await page.click('#account-filter-clear');
  await page.waitForFunction(() => document.querySelectorAll('#txn-full-list .transaction-row').length === 8, null, { timeout: 8000 }).catch(() => {});
  assert((await page.$$('#txn-full-list .transaction-row')).length === 8 && (await page.textContent('#txn-account-button')) === 'All accounts', '"All Accounts" clears the filter');

  const btnFont = await page.evaluate(() => getComputedStyle(document.querySelector('#txn-account-button')).fontSize);
  assert(btnFont === '16px', `account button matches 16px controls (got ${btnFont})`);
  assert(errors.length === 0, `no page JS errors (got ${JSON.stringify(errors)})`);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.click('.nav-tab[data-tab="home"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/b3_home_streak_dark.png` });
  await browser.close();
  await cleanup();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e.message.split('\n')[0]); await cleanup(); process.exit(1); });
