// LIFF: History -> Import CSV (preview, column change, import), Wealth ->
// Savings goals (add, add money, reminder), Budgets -> Subscriptions & bills.
const { BASE, OUTPUT } = require('../lib');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

fs.mkdirSync(OUTPUT, { recursive: true });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const U = `test_moneyui_${Date.now()}`;
const CSV = path.join(OUTPUT, 'money_import.csv');
fs.writeFileSync(CSV, 'Date;Category;Amount;Note\n25/10/2026;Food;-120;Coffee\n26/10/2026;Salary;45000;October\n27/10/2026;Pets;-500;Cat food\n');

(async () => {
  await fetch(`${BASE}/api/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ line_user_id: U, display_name: 'Money UI' }) });
  const { data: others } = await db.from('categories').select('id').eq('line_user_id', U).eq('name', 'Others').single();
  await db.from('recurring_transactions').insert({ line_user_id: U, category_id: others.id, amount: 419, type: 'expense', description: 'Netflix', frequency: 'monthly', next_run_date: new Date(Date.now() + 5 * 86400000).toISOString() });
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://static.line-scdn.net/**', (route) => route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false,
      getProfile: async () => ({ userId: '${U}', displayName: 'Money UI', pictureUrl: '' }) };` }));
    await page.goto(`${BASE}/liff/`);
    await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });

    // --- CSV import ---
    await page.click('.nav-tab[data-tab="transactions"]');
    await page.click('#import-csv-button');
    await page.waitForSelector('#csv-modal:not([hidden])');
    await page.setInputFiles('#csv-file', CSV);
    await page.waitForSelector('#csv-review:not([hidden])', { timeout: 10000 });
    await page.waitForFunction(() => document.getElementById('csv-status').dataset.state === 'done', null, { timeout: 10000 });
    assert((await page.textContent('#csv-status')) === '3 of 3 rows ready to import.' && (await page.inputValue('[data-map="date"]')) === '0' && (await page.inputValue('[data-map="amount"]')) === '2', 'preview: columns detected, 3 rows');
    assert((await page.innerText('#csv-categories')).includes('Pets · 1 · new') && await page.isVisible('#csv-create-row'), 'new categories flagged with the create option');
    assert((await page.$$('#csv-preview tr')).length === 4, 'first rows shown');
    // change a column and back
    await page.selectOption('[data-map="description"]', '');
    await page.waitForFunction(() => document.getElementById('csv-status').dataset.state === 'done', null, { timeout: 10000 });
    assert(!(await page.innerText('#csv-preview')).includes('Coffee'), 'changing a column re-previews');
    await page.selectOption('[data-map="description"]', '3');
    await page.waitForFunction(() => document.getElementById('csv-preview').textContent.includes('Coffee'), null, { timeout: 10000 });
    await page.screenshot({ path: `${OUTPUT}/csv_import.png`, fullPage: true });
    await Promise.all([page.waitForResponse((r) => r.url().endsWith('/import-csv')), page.click('#csv-import')]);
    await page.waitForFunction(() => document.getElementById('csv-status').textContent.startsWith('Imported'), null, { timeout: 10000 });
    assert((await page.textContent('#csv-status')).startsWith('Imported 3 transactions') && (await db.from('transactions').select('id').eq('line_user_id', U)).data.length === 3, 'imported 3');
    await page.click('#csv-close');

    // --- Savings goals ---
    await page.click('.nav-tab[data-tab="networth"]');
    await page.waitForSelector('#goals-empty:not([hidden])', { timeout: 10000 });
    await page.click('#add-goal-button');
    await page.waitForSelector('#sgoal-modal:not([hidden])');
    await page.fill('#sgoal-name', 'Japan trip');
    await page.fill('#sgoal-target', '50,000');
    await page.fill('#sgoal-date', '2027-06-30');
    await page.fill('#sgoal-saved', '10000');
    await page.selectOption('#sgoal-remind', '25');
    await Promise.all([page.waitForResponse((r) => r.url().includes('/goals/') && r.request().method() === 'POST'), page.click('#sgoal-save')]);
    await page.waitForSelector('#goals-list [data-goal]', { timeout: 10000 });
    const card = await page.innerText('#goals-list [data-goal]');
    assert(card.includes('Japan trip') && card.includes('฿10,000') && card.includes('of ฿50,000') && card.includes('20%') && card.includes('Put aside') && card.includes('Monthly reminder'), `goal card (got ${card.replace(/\s+/g, ' ')})`);
    await page.click('[data-goal-open]');
    await page.waitForSelector('#sgoal-add-row:not([hidden])');
    assert((await page.inputValue('#sgoal-remind')) === 'keep', 'edit keeps the reminder by default');
    await page.fill('#sgoal-add-amount', '5000');
    await Promise.all([page.waitForResponse((r) => r.url().endsWith('/add')), page.click('#sgoal-add')]);
    await page.waitForFunction(() => document.getElementById('goals-list').textContent.includes('฿15,000'), null, { timeout: 10000 });
    assert((await page.innerText('#goals-list')).includes('30%'), 'add money updates progress');
    await page.screenshot({ path: `${OUTPUT}/savings_goals.png` });

    // --- Subscriptions ---
    await page.click('.nav-tab[data-tab="budgets"]');
    await page.waitForSelector('#subs-list:not([hidden]) .task-row', { timeout: 15000 });
    assert((await page.textContent('#subs-total')) === '฿419 a month · ฿5,028 a year' && (await page.innerText('#subs-list')).includes('Netflix'), 'subscriptions total and list');
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
