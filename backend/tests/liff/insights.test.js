// LIFF: Budgets -> "Repeat payments we found" (Remind / Log / Dismiss) and
// Home -> last period's report card and the report sheet, plus ?report=last.
const { BASE, OUTPUT, openTab } = require('../lib');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

require('fs').mkdirSync(OUTPUT, { recursive: true });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const U = `test_insui_${Date.now()}`;
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().replace(/T.*/, 'T05:00:00Z');
// The 10th of last calendar month (the default billing cycle starts on the 1st).
const lastMonth = (day) => { const d = new Date(Date.now() + 7 * 3600000); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, day, 5)).toISOString(); };

(async () => {
  await fetch(`${BASE}/api/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ line_user_id: U, display_name: 'Insights UI' }) });
  const { data: cats } = await db.from('categories').select('id, name, type').eq('line_user_id', U);
  const food = cats.find((c) => c.name === 'Food');
  const other = cats.find((c) => c.name === 'Others');
  const income = cats.find((c) => c.type === 'income');
  await db.from('categories').update({ budget_amount: 3000, budget_period: 'monthly' }).eq('id', food.id);
  await db.from('transactions').insert([
    ...[0, 30, 60, 90].map((d) => ({ line_user_id: U, amount: 419, type: 'expense', category_id: other.id, description: 'NETFLIX.COM', transaction_date: daysAgo(d + 1) })),
    ...[0, 30, 60].map((d) => ({ line_user_id: U, amount: 799, type: 'expense', category_id: other.id, description: 'TRUEMOVE H', transaction_date: daysAgo(d + 2) })),
    { line_user_id: U, amount: 40000, type: 'income', category_id: income.id, description: 'Salary', transaction_date: lastMonth(3) },
    { line_user_id: U, amount: 3500, type: 'expense', category_id: food.id, description: 'Groceries', transaction_date: lastMonth(10) },
    { line_user_id: U, amount: 6000, type: 'expense', category_id: other.id, description: 'New phone case', transaction_date: lastMonth(12) },
  ]);
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://static.line-scdn.net/**', (route) => route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false,
      getProfile: async () => ({ userId: '${U}', displayName: 'Insights UI', pictureUrl: '' }) };` }));
    await page.goto(`${BASE}/liff/`);
    await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });

    // --- Home report card ---
    await page.waitForSelector('#home-report-card:not([hidden])', { timeout: 15000 });
    const meta = await page.textContent('#home-report-meta');
    assert((await page.textContent('#home-report-title')).startsWith('Last period:') && meta.includes('Spent ฿') && meta.includes('over budget: 1'), `Home card (got ${meta})`);
    await page.click('#home-report-card');
    await page.waitForFunction(() => document.querySelector('#report-body .report-totals'), null, { timeout: 10000 });
    const body = await page.innerText('#report-body');
    assert(body.includes('Income') && body.includes('Food') && body.includes('117% of ฿3,000 budget') && body.includes('Largest expenses') && body.includes('New phone case'), 'report sheet: totals, budget %, largest expenses');
    assert(await page.isDisabled('#report-next') === false, 'can step forward to the current period');
    await page.click('#report-prev');
    await page.waitForFunction(() => document.getElementById('report-status').hidden, null, { timeout: 10000 });
    assert((await page.textContent('#report-body')).includes('Nothing was logged') || (await page.textContent('#report-body')).length > 0, 'previous period loads');
    await page.screenshot({ path: `${OUTPUT}/insights_report.png`, fullPage: true });
    await page.click('#close-report');

    // --- Budgets: repeat payments ---
    await openTab(page, 'budgets');
    await page.waitForSelector('#repeat-list:not([hidden]) [data-repeat]', { timeout: 15000 });
    const cards = await page.$$eval('#repeat-list [data-repeat] .tax-sg-title', (ts) => ts.map((t) => t.textContent));
    assert(cards.includes('NETFLIX.COM') && cards.includes('TRUEMOVE H'), `repeat payments listed (got ${JSON.stringify(cards)})`);
    await Promise.all([page.waitForResponse((r) => r.url().includes('/accept')), page.click('[data-repeat]:has-text("TRUEMOVE") [data-repeat-action="remind"]')]);
    await page.waitForFunction(() => document.getElementById('repeat-status').dataset.state === 'done', null, { timeout: 10000 });
    assert((await page.textContent('#repeat-status')).includes('Monthly reminder set') && (await db.from('reminders').select('id').eq('line_user_id', U)).data.length === 1, 'Remind me monthly -> a reminder');
    await Promise.all([page.waitForResponse((r) => r.url().includes('/accept')), page.click('[data-repeat]:has-text("NETFLIX") [data-repeat-action="log"]')]);
    await page.waitForFunction(() => document.getElementById('repeat-status').textContent.includes('recurring rules'), null, { timeout: 10000 });
    assert((await db.from('recurring_transactions').select('id').eq('line_user_id', U)).data.length === 1 && await page.isHidden('#repeat-list'), 'Log automatically -> a recurring rule; nothing left to suggest');

    // --- ?report=last ---
    await page.goto(`${BASE}/liff/?report=last`);
    await page.waitForSelector('#report-modal:not([hidden])', { timeout: 15000 });
    await page.waitForFunction(() => document.getElementById('report-title').textContent.length > 0, null, { timeout: 10000 }).catch(() => {});
    assert((await page.textContent('#report-title')).length > 0, '?report=last opens the report');
    assert(errors.length === 0, `no page errors (got ${JSON.stringify(errors)})`);
  } finally {
    await browser.close();
    await db.from('reminders').delete().eq('line_user_id', U);
    await db.from('recurring_transactions').delete().eq('line_user_id', U);
    await db.from('transactions').delete().eq('line_user_id', U);
    await db.from('categories').delete().eq('line_user_id', U);
    await db.from('users').delete().eq('line_user_id', U);
  }
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); console.log('FAIL: crashed'); process.exit(1); });
