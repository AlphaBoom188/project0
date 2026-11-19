// Transactions tab -> Import Statement, end to end in headless Chrome: a real
// PDF (generated from the synthetic KBank layout) is opened by pdf.js from
// cdnjs, its text pieces go to /statements/:u/parse, the review list starts
// with only the new rows ticked, and Import writes them. Also: an unsupported
// PDF, and the pdf.js CDN blocked. (Password-protected PDFs aren't covered:
// generating an encrypted PDF needs a library; the PasswordException path
// was checked against a real K PLUS statement by hand.)
const { BASE, FIXTURES, OUTPUT } = require('../lib');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');
const { buildStatement, SAMPLE, statementPdf } = require(`${FIXTURES}/kbankStatement.js`);
const { buildBblStatement, BBL_SAMPLE, bblStatementPdf } = require(`${FIXTURES}/bblStatement.js`);

require('fs').mkdirSync(OUTPUT, { recursive: true });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const U = `test_stmt_liff_${Date.now()}`;
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures++; };
const api = (p, o = {}) =>
  fetch(`${BASE}/api${p}`, { headers: { 'Content-Type': 'application/json' }, ...o }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

const ascii = SAMPLE.filter((r) => !/[^\x00-\x7f]/.test(r.details.join(''))); // Helvetica can't draw Thai
const PDF = statementPdf(buildStatement(ascii, { perPage: 4 }).pages);
const OTHER_PDF = statementPdf([[{ x: 72, y: 700, s: 'Some Other Bank - Account Statement' }]]);

async function cleanup() {
  for (const t of ['transactions', 'accounts', 'categories', 'users']) await db.from(t).delete().eq('line_user_id', U);
}

async function openApp(browser, { blockPdfJs = false } = {}) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://static.line-scdn.net/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false,
      getProfile: async () => ({ userId: '${U}', displayName: 'Statement Import Test', pictureUrl: '' }) };` }));
  if (blockPdfJs) await page.route('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/**', (route) => route.abort());
  await page.goto(`${BASE}/liff/`);
  await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });
  await page.click('.nav-tab[data-tab="transactions"]');
  await page.click('#import-statement-button');
  await page.waitForSelector('#statement-modal:not([hidden])');
  return { page, errors };
}

async function readStatement(page, buffer, name = 'statement.pdf') {
  await page.setInputFiles('#stmt-file', { name, mimeType: 'application/pdf', buffer });
  await page.click('#stmt-read');
}

(async () => {
  await cleanup();
  await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: U, display_name: 'Statement Import Test' }) });
  const { body: acct } = await api(`/accounts/${U}`, { method: 'POST', body: JSON.stringify({ account_name: 'KBank Savings', account_type: 'bank', balance: 1000 }) });
  const browser = await chromium.launch({ channel: 'chrome' });

  const { page, errors } = await openApp(browser);
  assert(await page.$eval('#stmt-account', (s) => [...s.options].some((o) => o.textContent === 'KBank Savings')), 'the account picker lists the user\'s accounts');
  await page.selectOption('#stmt-account', acct.account.id);
  await readStatement(page, PDF);
  await page.waitForSelector('#stmt-review:not([hidden])', { timeout: 30000 }).catch(() => {});
  assert(!(await page.isHidden('#stmt-review')), `the review step opens (error: ${await page.textContent('#stmt-pick-error')})`);
  assert((await page.textContent('#stmt-summary')).startsWith('KBank •••7890 · Jun 1, 2026 – Jun 30, 2026'), `summary line (got "${await page.textContent('#stmt-summary')}")`);
  assert((await page.textContent('#stmt-verify')) === `All ${ascii.length} rows match the statement's totals.`, 'pdf.js text verified against the statement totals');
  assert((await page.textContent('#stmt-counts')) === '7 new · 2 own transfers', `counts line (got "${await page.textContent('#stmt-counts')}")`);
  const rowCount = await page.$$eval('#stmt-rows .stmt-row', (r) => r.length);
  const checked = await page.$$eval('#stmt-rows input:checked', (r) => r.length);
  assert(rowCount === ascii.length && checked === 7, `${ascii.length} rows listed, 7 ticked (got ${rowCount}, ${checked})`);
  const ownUnticked = await page.$$eval('#stmt-rows .stmt-row', (rows) => rows.filter((r) => r.textContent.includes('Own transfer')).every((r) => !r.querySelector('input').checked));
  assert(ownUnticked, 'own transfers start unticked and say so');
  assert((await page.textContent('#stmt-import')) === 'Import 7 transactions', 'Import button shows the ticked count');
  const fontSize = await page.$eval('.stmt-cat', (s) => getComputedStyle(s).fontSize);
  const box = await page.$eval('.stmt-check', (c) => c.getBoundingClientRect().width);
  assert(fontSize === '16px' && box >= 44, `category selects are 16px and checkboxes have a 44px target (got ${fontSize}, ${box})`);

  await page.click('#stmt-select-none');
  assert((await page.$$eval('#stmt-rows input:checked', (r) => r.length)) === 0 && (await page.isDisabled('#stmt-import')), 'Select none clears every row and disables Import');
  await page.click('#stmt-select-new');
  assert((await page.$$eval('#stmt-rows input:checked', (r) => r.length)) === 7, 'Select new ticks the 7 new rows again');

  // Untick one, re-categorize another, import.
  const lineManIndex = await page.$$eval('#stmt-rows .stmt-row', (rows) => rows.findIndex((r) => r.textContent.includes('LINE MAN')));
  const btsIndex = await page.$$eval('#stmt-rows .stmt-row', (rows) => rows.findIndex((r) => r.textContent.includes('BTS TIM TVM')));
  await page.locator('#stmt-rows .stmt-row').nth(btsIndex).locator('input').uncheck();
  const { body: cats } = await api(`/categories/${U}`);
  const shopping = cats.categories.find((c) => c.name === 'Shopping');
  await page.locator('#stmt-rows .stmt-row').nth(lineManIndex).locator('select').selectOption(shopping.id);
  assert((await page.textContent('#stmt-import')) === 'Import 6 transactions', 'unticking a row updates the count');
  await page.screenshot({ path: `${OUTPUT}/statement_review.png` });
  // The tab shows the current billing cycle, so June rows needn't appear in it; check it re-fetches.
  const relist = page.waitForRequest((r) => r.url().includes(`/api/transactions/${U}?`) && r.method() === 'GET', { timeout: 20000 }).then(() => true).catch(() => false);
  await Promise.all([page.waitForResponse((r) => r.url().includes('/import') && r.request().method() === 'POST', { timeout: 20000 }), page.click('#stmt-import')]);
  await page.waitForSelector('#statement-modal', { state: 'hidden', timeout: 10000 }).catch(() => {});
  assert(await page.isHidden('#statement-modal'), 'the sheet closes after importing');
  assert((await page.textContent('#export-status')) === 'Imported 6 transactions.', `status message (got "${await page.textContent('#export-status')}")`);
  const { data: stored } = await db.from('transactions').select('description, category_id, from_account_id, to_account_id, type').eq('line_user_id', U);
  assert(stored.length === 6 && !stored.some((t) => t.description === 'BTS TIM TVM'), 'exactly the 6 ticked rows were saved');
  assert(stored.find((t) => t.description === 'LINE MAN (QR by ttb)').category_id === shopping.id, 'the changed category was saved');
  assert(stored.every((t) => (t.type === 'expense' ? t.from_account_id : t.to_account_id) === acct.account.id), 'rows are linked to the chosen account');
  assert(await relist, 'the Transactions list is re-fetched after importing');

  // Same statement again: the imported rows come back as already imported.
  await page.click('#import-statement-button');
  await readStatement(page, PDF);
  await page.waitForSelector('#stmt-review:not([hidden])', { timeout: 30000 }).catch(() => {});
  assert((await page.textContent('#stmt-counts')) === '1 new · 2 own transfers · 6 already imported', `re-reading: 6 already imported (got "${await page.textContent('#stmt-counts')}")`);
  assert((await page.$$eval('#stmt-rows input:disabled', (r) => r.length)) === 6, 'already-imported rows are disabled');
  await page.click('#stmt-back');

  // Bangkok Bank PDF through real pdf.js.
  await readStatement(page, bblStatementPdf(buildBblStatement(BBL_SAMPLE).pages), 'bbl.pdf');
  await page.waitForSelector('#stmt-review:not([hidden])', { timeout: 30000 }).catch(() => {});
  assert((await page.textContent('#stmt-summary')).startsWith('Bangkok Bank •••3456 · Nov 1, 2026 – Nov 18, 2026'), `BBL summary line (got "${await page.textContent('#stmt-summary')}" / ${await page.textContent('#stmt-pick-error')})`);
  assert((await page.textContent('#stmt-verify')) === `All ${BBL_SAMPLE.length} rows match the statement's totals.` && (await page.textContent('#stmt-counts')) === '5 new · 2 bank transfers', `BBL verified, counts (got "${await page.textContent('#stmt-verify')}" / "${await page.textContent('#stmt-counts')}")`);
  const transferRows = await page.$$eval('#stmt-rows .stmt-row', (rows) => rows.filter((r) => r.textContent.includes('Bank transfer')).map((r) => ({ checked: r.querySelector('input').checked, note: r.textContent.includes("Tick it if it wasn't your own account") })));
  assert(transferRows.length === 2 && transferRows.every((t) => !t.checked && t.note), 'bank transfers start unticked, with the explanation');
  await page.click('#stmt-back');

  // Unsupported PDF -> inline error from the server.
  await readStatement(page, OTHER_PDF, 'other.pdf');
  await page.waitForSelector('#stmt-pick-error:not([hidden])', { timeout: 20000 }).catch(() => {});
  assert((await page.textContent('#stmt-pick-error')).startsWith("This statement format isn't supported yet"), `unsupported PDF shows the server's message (got "${await page.textContent('#stmt-pick-error')}")`);
  assert(errors.length === 0, `no page JS errors (got ${JSON.stringify(errors)})`);
  await page.context().close();

  // pdf.js blocked -> a clear message, no crash.
  const blocked = await openApp(browser, { blockPdfJs: true });
  await readStatement(blocked.page, PDF);
  await blocked.page.waitForSelector('#stmt-pick-error:not([hidden])', { timeout: 15000 }).catch(() => {});
  assert((await blocked.page.textContent('#stmt-pick-error')).startsWith("Couldn't load the PDF reader"), 'pdf.js CDN blocked -> "Couldn\'t load the PDF reader"');
  assert(blocked.errors.length === 0, `no page JS errors with pdf.js blocked (got ${JSON.stringify(blocked.errors)})`);

  await browser.close();
  await cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e.message.split('\n')[0]); await cleanup(); process.exit(1); });
