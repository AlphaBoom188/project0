// Batch 2: search, floating Add, breakdown total + toggle, Share to LINE, tap-to-assign chips.
const { BASE, BACKEND, FIXTURES, OUTPUT } = require('../lib');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SHOTS = OUTPUT;
require('fs').mkdirSync(SHOTS, { recursive: true });
const U = 'test_uxui_002';
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures++; };
async function api(path, o = {}) {
  const r = await fetch(`${BASE}/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...o });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function cleanup() {
  for (const t of ['shared_bills', 'transactions', 'categories', 'users']) await db.from(t).delete().eq('line_user_id', U);
}
async function seed() {
  await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: U, display_name: 'UX Test 2' }) });
  const [a, b] = (await api(`/categories/${U}?type=expense`)).body.categories;
  const inc = (await api(`/categories/${U}?type=income`)).body.categories[0];
  const now = new Date().toISOString();
  const tx = (category_id, amount, type, description) =>
    api(`/transactions/${U}`, { method: 'POST', body: JSON.stringify({ category_id, amount, type, transaction_date: now, description, channel: 'liff' }) });
  await tx(a.id, 120, 'expense', 'Groceries at Lotus');
  await tx(a.id, 80, 'expense', 'Coffee 50% off');
  await tx(b.id, 300, 'expense', 'Taxi home');
  await tx(inc.id, 5000, 'income', 'Salary');
  const bill = (await api(`/bills/${U}`, { method: 'POST', body: JSON.stringify({ title: 'Dinner', total_amount: 300, split_type: 'equal', participants: [{ display_name: 'Ann' }, { display_name: 'Bo' }] }) })).body.bill;
  return { bill };
}
const descs = (page) => page.$$eval('#txn-full-list .transaction-description', (els) => els.map((e) => e.textContent).sort());

(async () => {
  await cleanup();
  const { bill } = await seed();
  // REST-level check of the escaping, independent of the UI
  const pct = await api(`/transactions/${U}?q=${encodeURIComponent('%')}`);
  assert(pct.body.transactions.length === 1 && pct.body.transactions[0].description === 'Coffee 50% off', `q="%" is a literal percent, not a wildcard (got ${pct.body.transactions.map((t) => t.description)})`);
  const under = await api(`/transactions/${U}?q=_`);
  assert(under.body.transactions.length === 0, `q="_" is a literal underscore (got ${under.body.transactions.length})`);

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://static.line-scdn.net/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: `
      window.__shared = []; window.__shareAvailable = true;
      window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {},
        getProfile: async () => ({ userId: '${U}', displayName: 'UX Test 2', pictureUrl: '' }),
        isApiAvailable: (name) => name === 'shareTargetPicker' && window.__shareAvailable,
        shareTargetPicker: async (messages) => { window.__shared.push(messages); return { status: 'success' }; } };` })
  );
  await page.goto(`${BASE}/liff/`);
  await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });

  // --- Floating Add ---
  assert(await page.isVisible('#fab-add'), 'FAB visible on Home');
  assert((await page.$$('#add-expense-button')).length === 0, 'duplicate Home "Add Expense" button removed');
  const fabBox = await page.locator('#fab-add').boundingBox();
  const navBox = await page.locator('.bottom-nav').boundingBox();
  assert(fabBox.y + fabBox.height <= navBox.y, `FAB sits above the bottom nav (fab bottom ${fabBox.y + fabBox.height}, nav top ${navBox.y})`);
  for (const tab of ['transactions', 'budgets', 'networth']) {
    await page.click(`.nav-tab[data-tab="${tab}"]`);
    assert(await page.isVisible('#fab-add'), `FAB visible on ${tab}`);
  }
  await page.click('.nav-tab[data-tab="settings"]');
  assert(await page.isHidden('#fab-add'), 'FAB hidden on Settings');
  await page.click('.nav-tab[data-tab="transactions"]');
  await page.click('#fab-add');
  assert(await page.isVisible('#add-expense-modal'), 'FAB opens the Add Expense sheet');
  await page.click('#cancel-add-expense');

  // --- Search ---
  await page.waitForSelector('#txn-full-list .transaction-row');
  await page.fill('#txn-search', 'groc');
  await page.waitForFunction(() => document.querySelectorAll('#txn-full-list .transaction-row').length === 1, null, { timeout: 8000 }).catch(() => {});
  assert(JSON.stringify(await descs(page)) === '["Groceries at Lotus"]', `search "groc" is case-insensitive substring (got ${JSON.stringify(await descs(page))})`);
  const exportQ = await page.evaluate(() => buildTransactionFilterQuery().get('q'));
  assert(exportQ === 'groc', `CSV exports carry the same search (got ${exportQ})`);
  await page.fill('#txn-search', 'zzzz');
  await page.waitForSelector('#txn-empty-state:not([hidden])', { timeout: 8000 }).catch(() => {});
  const emptyText = await page.textContent('#txn-empty-state');
  assert(emptyText.includes('"zzzz"'), `no-match empty state names the search (got "${emptyText}")`);
  await page.screenshot({ path: `${SHOTS}/b2_search_empty.png` });
  await page.fill('#txn-search', '');
  await page.waitForFunction(() => document.querySelectorAll('#txn-full-list .transaction-row').length === 4, null, { timeout: 8000 }).catch(() => {});
  assert((await page.$$('#txn-full-list .transaction-row')).length === 4, 'clearing search restores the full list');
  await page.fill('#txn-search', 'taxi');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/b2_search.png` });

  // --- Breakdown total follows the Expense/Income toggle ---
  await page.click('.nav-tab[data-tab="budgets"]');
  await page.waitForFunction(() => document.querySelector('#breakdown-total-value').textContent !== '0.00', null, { timeout: 8000 }).catch(() => {});
  assert((await page.textContent('#breakdown-total-label')) === 'Spent this cycle' && (await page.textContent('#breakdown-total-value')) === '500.00',
    `expense breakdown total (got ${await page.textContent('#breakdown-total-label')} ${await page.textContent('#breakdown-total-value')})`);
  await page.screenshot({ path: `${SHOTS}/b2_breakdown.png`, fullPage: true });
  await page.click('#categories-type-income');
  await page.waitForFunction(() => document.querySelector('#breakdown-total-label').textContent === 'Earned this cycle', null, { timeout: 8000 }).catch(() => {});
  assert((await page.textContent('#breakdown-total-value')) === '5000.00', `income toggle switches the breakdown (got ${await page.textContent('#breakdown-total-value')})`);
  await page.click('#categories-type-expense');

  // --- Share to LINE ---
  await page.click('.nav-tab[data-tab="home"]');
  await page.click('#bills-list .category-row');
  await page.waitForFunction(() => document.querySelector('#bill-progress-outstanding').textContent.length > 0);
  await page.screenshot({ path: `${SHOTS}/b2_bill_share.png` });
  await page.click('#bill-share-line');
  await page.waitForFunction(() => window.__shared.length === 1, null, { timeout: 5000 }).catch(() => {});
  const shared = await page.evaluate(() => window.__shared);
  const text = shared[0]?.[0]?.text || '';
  assert(shared.length === 1 && shared[0][0].type === 'text', 'shareTargetPicker called once with a text message');
  assert(text.startsWith('Dinner: ') && text.includes('outstanding') && text.includes(`/liff/bill.html?id=${bill.id}`), `message has title, outstanding and the public bill link (got ${JSON.stringify(text)})`);
  await page.evaluate(() => { window.__shareAvailable = false; });
  await page.click('#bill-share-line');
  await page.waitForSelector('#bill-detail-error:not([hidden])', { timeout: 5000 }).catch(() => {});
  const fallbackMsg = await page.textContent('#bill-detail-error');
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  assert(fallbackMsg.includes('link was copied') && clip.includes(`bill.html?id=${bill.id}`), `outside LINE it falls back to copying the link (msg "${fallbackMsg}", clipboard "${clip}")`);
  assert((await page.evaluate(() => window.__shared.length)) === 1, 'fallback path does not call shareTargetPicker');
  await page.click('#close-bill-detail');

  // --- Tap-to-assign chips (itemized split) ---
  await page.click('#add-bill-button');
  await page.click('#bill-split-itemized');
  const nameInputs = () => page.$$('#bill-participants-list .bill-participant-name');
  if ((await nameInputs()).length === 0) await page.click('#bill-add-participant');
  while ((await nameInputs()).length < 2) await page.click('#bill-add-participant');
  const [n1, n2] = await nameInputs();
  await n1.fill('Ann');
  await n2.fill('Bo');
  if ((await page.$$('#bill-items-list .bill-item-row')).length === 0) await page.click('#bill-add-item');
  const row = page.locator('#bill-items-list .bill-item-row').first();
  const chipLabels = () => row.locator('.assign-chip').allTextContents();
  assert(JSON.stringify(await chipLabels()) === '["Shared","Ann","Bo"]', `chips list Shared + participants (got ${JSON.stringify(await chipLabels())})`);
  assert((await row.locator('.assign-chip.active').textContent()) === 'Shared', 'new item defaults to Shared');
  await row.locator('.assign-chip', { hasText: 'Bo' }).click();
  assert((await row.locator('.assign-chip.active').textContent()) === 'Bo', 'tapping a chip assigns the item');
  await n2.fill('Bob');
  assert((await row.locator('.assign-chip.active').textContent()) === 'Bob', 'renaming a participant keeps the assignment and relabels the chip');
  let items = await page.evaluate(() => collectItems());
  assert(items[0].participant_index === 1, `collectItems sends participant_index 1 (got ${JSON.stringify(items)})`);
  await page.screenshot({ path: `${SHOTS}/b2_assign_chips.png` });
  await page.locator('#bill-participants-list .bill-participant-row').nth(1).locator('.bill-row-remove').click();
  assert((await row.locator('.assign-chip.active').textContent()) === 'Shared', 'removing the assigned participant falls back to Shared');
  items = await page.evaluate(() => collectItems());
  assert(items[0].participant_index === null, `collectItems sends null for Shared (got ${JSON.stringify(items)})`);

  const sizes = await page.$$eval('input:not([type=file]):not([type=checkbox]), select', (els) => [...new Set(els.map((e) => getComputedStyle(e).fontSize))]);
  assert(sizes.length === 1 && sizes[0] === '16px', `all inputs still 16px incl. search (got ${JSON.stringify(sizes)})`);
  assert(errors.length === 0, `no page JS errors (got ${JSON.stringify(errors)})`);

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: `${SHOTS}/b2_assign_chips_dark.png` });
  await browser.close();
  await cleanup();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e.message.split('\n')[0]); await cleanup(); process.exit(1); });
