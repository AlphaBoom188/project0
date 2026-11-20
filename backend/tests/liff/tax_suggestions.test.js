// Tax tab -> "Found in your data" (Phase 3): suggestion cards from seeded
// transactions and an RMF lot, with Add / Dismiss / Show again.
const { BASE, OUTPUT } = require('../lib');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

require('fs').mkdirSync(OUTPUT, { recursive: true });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const U = `test_taxsgui_${Date.now()}`;
const post = (p, body) => fetch(`${BASE}/api${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const year = new Date(Date.now() + 7 * 3600000).getUTCFullYear(); // this calendar year -> tax year year+543
const at = (m, d) => `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T05:00:00Z`;

(async () => {
  await post('/users', { line_user_id: U, display_name: 'Tax Suggest UI' });
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const { data: cats } = await db.from('categories').select('id, name, type').eq('line_user_id', U);
    const income = cats.find((c) => c.type === 'income');
    const other = cats.find((c) => c.name === 'Others');
    await db.from('transactions').insert([
      ...[1, 2, 3].map((m) => ({ line_user_id: U, amount: 60000, type: 'income', category_id: income.id, description: 'Salary ACME', transaction_date: at(m, 25) })),
      { line_user_id: U, amount: 20000, type: 'expense', category_id: other.id, description: 'Life insurance AIA', transaction_date: at(2, 1) },
    ]);
    const { data: h } = await db.from('asset_holdings').insert({ line_user_id: U, asset_type: 'mutual_fund', symbol: 'UIRMF', quantity: 100, average_cost: 10, currency: 'THB' }).select().single();
    await db.from('asset_lots').insert({ line_user_id: U, holding_id: h.id, side: 'buy', quantity: 1500, price: 10, fee: 0, trade_date: `${year}-03-10` });

    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://static.line-scdn.net/**', (route) => route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false,
      getProfile: async () => ({ userId: '${U}', displayName: 'Tax Suggest UI', pictureUrl: '' }) };` }));
    await page.goto(`${BASE}/liff/`);
    await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });
    await page.click('.nav-tab[data-tab="tax"]');
    // In Jan-Apr the tab opens on last year: switch to this one.
    await page.waitForSelector('#tax-years .segment', { timeout: 15000 });
    await page.click(`#tax-years [data-year="${year + 543}"]`).catch(() => {});
    await page.waitForSelector('#tax-suggestions .tax-sg', { timeout: 30000 });
    const cards = await page.$$eval('#tax-suggestions .tax-sg', (cs) => cs.map((c) => c.querySelector('.tax-sg-title').textContent));
    assert(cards.includes('Salary from your deposits') && cards.includes('Life insurance (10+ years)') && cards.includes('RMF'), `three cards (got ${JSON.stringify(cards)})`);
    const rmf = await page.innerText('.tax-sg:has-text("RMF")');
    assert(rmf.includes('฿15,000') && rmf.includes('From your portfolio') && rmf.includes('UIRMF'), 'RMF card: amount, source, fund');
    const salary = await page.innerText('.tax-sg:has-text("Salary from your deposits")');
    assert(salary.includes('Likely') && /Raises your tax|No change/.test(salary) && salary.includes('50 ทวิ'), 'salary card: confidence, tax effect, note');
    await page.click('.tax-sg:has-text("Salary from your deposits") summary');
    assert((await page.$$('.tax-sg:has-text("Salary from your deposits") .tax-sg-sources li')).length === 3, 'sources expand: 3 deposits');
    await page.screenshot({ path: `${OUTPUT}/tax_suggestions.png`, fullPage: true });

    // --- Add salary ---
    await Promise.all([page.waitForResponse((r) => r.url().includes('/accept')), page.click('.tax-sg:has-text("Salary from your deposits") [data-sg-action="accept"]')]);
    await page.waitForFunction(() => document.querySelectorAll('#tax-incomes .tax-income-row').length === 1, null, { timeout: 10000 });
    assert((await page.innerText('#tax-incomes')).includes('Salary from your deposits'), 'income line added (payer = the suggestion)');
    assert(!(await page.$('.tax-sg:has-text("Salary from your deposits")')), 'the card goes away once added');
    // the RMF card now shows a tax effect against the new income
    const rmfAfter = await page.innerText('.tax-sg:has-text("RMF")');
    assert(/Lowers your tax by|No change to your tax/.test(rmfAfter), `RMF effect recomputed (got ${rmfAfter.split('\n')[1]})`);

    // --- Dismiss and show again ---
    await Promise.all([page.waitForResponse((r) => r.url().includes('/dismiss')), page.click('.tax-sg:has-text("Life insurance") [data-sg-action="dismiss"]')]);
    await page.waitForFunction(() => !document.querySelector('.tax-sg[data-sg-card] .tax-sg-title') || ![...document.querySelectorAll('.tax-sg .tax-sg-title')].some((t) => t.textContent.startsWith('Life insurance')), null, { timeout: 10000 });
    assert((await page.textContent('#tax-sg-toggle')) === 'Show 2 added or dismissed', 'toggle counts added and dismissed');
    await page.click('#tax-sg-toggle');
    assert(await page.isVisible('.tax-sg:has-text("Life insurance") [data-sg-action="restore"]') && await page.isVisible('.tax-sg:has-text("Salary") .tax-sg-added'), 'hidden ones shown: Show again / Added');
    await Promise.all([page.waitForResponse((r) => r.url().includes('/restore')), page.click('.tax-sg:has-text("Life insurance") [data-sg-action="restore"]')]);
    await page.waitForSelector('.tax-sg:has-text("Life insurance") [data-sg-action="accept"]', { timeout: 10000 });
    // --- Accept a claim ---
    await Promise.all([page.waitForResponse((r) => r.url().includes('/accept')), page.click('.tax-sg:has-text("RMF") [data-sg-action="accept"]')]);
    await page.waitForFunction(() => document.querySelector('[data-deduction="rmf"]') && document.querySelector('.tax-ded-row:has([data-deduction="rmf"])').textContent.includes('15,000'), null, { timeout: 10000 });
    assert((await page.innerText('.tax-ded-row:has([data-deduction="rmf"])')).includes('paid ฿15,000'), 'RMF claim set in the checklist');
    assert(errors.length === 0, `no page errors (got ${JSON.stringify(errors)})`);
    await page.context().close();
  } finally {
    await browser.close();
    await db.from('transactions').delete().eq('line_user_id', U);
    await db.from('categories').delete().eq('line_user_id', U);
    await db.from('users').delete().eq('line_user_id', U);
  }
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); console.log('FAIL: crashed'); process.exit(1); });
