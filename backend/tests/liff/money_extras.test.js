// Money extras: Edit a recurring rule from its action sheet, "Track as a
// subscription only" on repeat-payment cards (migration 026), and the Home
// first-week checklist for a user who already has entries.
const { BASE, OUTPUT, openTab } = require('../lib');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

require('fs').mkdirSync(OUTPUT, { recursive: true });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const U = `test_moneyx_${Date.now()}`;

const api = (path, opts = {}) => fetch(`${BASE}/api${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

async function cleanup() {
  for (const t of ['recurring_transactions', 'reminders', 'transactions', 'categories', 'users']) await db.from(t).delete().eq('line_user_id', U);
}

async function openApp(browser, setup) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://static.line-scdn.net/**', (route) => route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false,
    getIDToken: () => null, getProfile: async () => ({ userId: '${U}', displayName: 'Money Extras', pictureUrl: '' }) };` }));
  if (setup) await setup(page);
  await page.goto(`${BASE}/liff/`);
  await page.waitForSelector('#app:not([hidden])', { timeout: 20000 });
  return { page, errors };
}

(async () => {
  await cleanup();
  await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: U, display_name: 'Money Extras' }) });
  const cats = (await api(`/categories/${U}?type=expense`)).body.categories;
  const food = cats.find((c) => /food/i.test(c.name)) || cats[0];
  const other = cats.find((c) => c.id !== food.id);
  await api(`/transactions/${U}`, { method: 'POST', body: JSON.stringify({ type: 'expense', amount: 80, category_id: food.id, description: 'Noodles', transaction_date: new Date().toISOString() }) });
  await api(`/recurring/${U}`, { method: 'POST', body: JSON.stringify({ category_id: food.id, amount: 300, type: 'expense', frequency: 'weekly', start_date: '2030-01-01', description: 'Gym' }) });
  // Three monthly NETFLIX payments -> a real repeat-payment suggestion.
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().replace(/T.*/, 'T05:00:00Z');
  await db.from('transactions').insert([1, 31, 61].map((d) => ({ line_user_id: U, type: 'expense', amount: 419, category_id: food.id, description: 'NETFLIX.COM', transaction_date: daysAgo(d) })));

  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const { page, errors } = await openApp(browser);

    // --- First week with one entry: the checklist renders and ticks "Log your first entry" ---
    await page.waitForSelector('#home-setup-list .setup-row', { timeout: 15000 });
    const first = await page.$eval('#home-setup-list [data-step="entry"]', (b) => ({ done: b.classList.contains('is-done'), text: b.textContent.replace(/\s+/g, ' ').trim() }));
    assert(first.done && (await page.textContent('#home-setup-count')) === '1 of 4', `first week with an entry: "Log your first entry" done, 1 of 4 (got ${JSON.stringify(first)})`);

    // --- Edit a recurring rule ---
    await openTab(page, 'budgets');
    const gym = page.locator('.recurring-row', { hasText: 'Gym' });
    await gym.waitFor({ timeout: 15000 });
    await gym.locator('.recurring-more').click();
    await page.waitForSelector('#recurring-actions-modal:not([hidden])');
    await page.click('#recurring-edit-button');
    await page.waitForSelector('#recurring-modal:not([hidden])');
    await page.waitForFunction(() => document.getElementById('recurring-field-category').options.length > 0);
    assert(await page.isHidden('#recurring-actions-modal'), 'Edit closes the action sheet');
    assert((await page.textContent('#recurring-modal-title')) === 'Edit rule' && (await page.textContent('#recurring-date-label')) === 'Next date', 'sheet says "Edit rule" and "Next date"');
    assert((await page.inputValue('#recurring-field-amount')) === '300' && (await page.inputValue('#recurring-field-description')) === 'Gym' && (await page.inputValue('#recurring-field-frequency')) === 'weekly'
      && (await page.inputValue('#recurring-field-start-date')) === '2030-01-01' && (await page.inputValue('#recurring-field-category')) === food.id, 'prefilled with the rule');
    assert(await page.isDisabled('#recurring-field-type'), 'type is locked on an existing rule');
    await page.fill('#recurring-field-amount', '350');
    await page.selectOption('#recurring-field-category', other.id);
    await page.selectOption('#recurring-field-frequency', 'monthly');
    await page.fill('#recurring-field-start-date', '2030-02-01');
    await page.fill('#recurring-field-pay-start-day', '1');
    await page.fill('#recurring-field-pay-end-day', '5');
    const [put] = await Promise.all([page.waitForResponse((r) => r.url().includes('/recurring/') && r.request().method() === 'PUT'), page.click('#recurring-form button[type="submit"]')]);
    assert(put.status() === 200, `Save -> PUT 200 (got ${put.status()})`);
    await page.waitForSelector('#recurring-modal', { state: 'hidden', timeout: 8000 });
    const { data: rules } = await db.from('recurring_transactions').select('*').eq('line_user_id', U).eq('description', 'Gym');
    const r = rules[0];
    assert(rules.length === 1 && Number(r.amount) === 350 && r.category_id === other.id && r.frequency === 'monthly' && r.next_run_date.startsWith('2030-02-01') && r.pay_start_day === 1 && r.pay_end_day === 5,
      `rule updated in place (got ${JSON.stringify(rules.map((x) => [x.amount, x.frequency, x.next_run_date, x.pay_start_day, x.pay_end_day]))})`);
    assert((await page.textContent('#toast .toast-title')) === 'Rule updated', '"Rule updated" toast');
    await page.waitForFunction(() => document.getElementById('recurring-list').textContent.includes('Monthly'), null, { timeout: 8000 }).catch(() => {});
    assert((await gym.locator('.recurring-meta').textContent()).includes('Monthly') && (await gym.locator('.recurring-amount').textContent()).includes('350'), 'row shows the new figures');
    // Clearing the pay window
    await gym.locator('.recurring-more').click();
    await page.click('#recurring-edit-button');
    await page.waitForSelector('#recurring-modal:not([hidden])');
    await page.fill('#recurring-field-pay-start-day', '');
    await page.fill('#recurring-field-pay-end-day', '');
    await Promise.all([page.waitForResponse((x) => x.request().method() === 'PUT'), page.click('#recurring-form button[type="submit"]')]);
    const { data: cleared } = await db.from('recurring_transactions').select('pay_start_day, pay_end_day').eq('line_user_id', U).eq('description', 'Gym').single();
    assert(cleared.pay_start_day === null && cleared.pay_end_day === null, 'empty pay days clear the window');
    // Add rule still creates (type unlocked, "Add rule")
    await page.click('#add-recurring-button');
    await page.waitForSelector('#recurring-modal:not([hidden])');
    assert((await page.textContent('#recurring-modal-title')) === 'Add rule' && !(await page.isDisabled('#recurring-field-type')) && (await page.inputValue('#recurring-field-amount')) === '', 'Add rule starts empty with type unlocked');
    await page.click('#recurring-modal .sheet-close');
    await page.locator('#recurring-list').screenshot({ path: `${OUTPUT}/moneyx_recurring.png` });

    // --- Track as a subscription only ---
    const card = page.locator('.rec-card', { hasText: 'NETFLIX.COM' });
    await card.waitFor({ timeout: 15000 });
    const opts = await card.locator('.rec-option').allTextContents();
    assert(opts.map((t) => t.trim()).join('|') === 'Log it automatically|Remind me to log it|Track as a subscription only', `three options (got ${JSON.stringify(opts)})`);
    await card.locator('.rec-option', { hasText: 'Track as a subscription only' }).click();
    await card.screenshot({ path: `${OUTPUT}/moneyx_rec_card.png` });
    const [acc] = await Promise.all([page.waitForResponse((x) => x.url().includes('/accept')), card.locator('[data-repeat-action="accept"]').click()]);
    assert(acc.status() === 200 && JSON.parse(acc.request().postData()).mode === 'track', `Accept sends mode "track" (got ${acc.status()})`);
    assert((await page.textContent('#toast .toast-title')) === 'Tracked as a subscription', 'toast "Tracked as a subscription"');
    const nf = page.locator('.recurring-row', { hasText: 'NETFLIX.COM' });
    await nf.waitFor({ timeout: 10000 });
    assert((await nf.locator('.recurring-meta').textContent()).includes('tracked only'), 'recurring row says "tracked only"');
    await page.waitForFunction(() => document.getElementById('subs-list').textContent.includes('NETFLIX.COM'), null, { timeout: 10000 }).catch(() => {});
    assert((await page.locator('#subs-list .row', { hasText: 'NETFLIX.COM' }).textContent()).includes('Track only'), 'Subscriptions row says "Track only"');
    await nf.locator('.recurring-more').click();
    await page.waitForSelector('#recurring-actions-modal:not([hidden])');
    assert(!(await page.isChecked('#recurring-active-switch')) && (await page.textContent('#recurring-active-meta')).startsWith('Off. Listed under Subscriptions'), 'sheet: switch off, "Listed under Subscriptions"');
    await page.click('.recurring-active-row');
    await page.waitForFunction(() => [...document.querySelectorAll('.recurring-row')].some((r) => r.textContent.includes('NETFLIX') && r.textContent.includes('next ')), null, { timeout: 8000 }).catch(() => {});
    const { data: nrule } = await db.from('recurring_transactions').select('track_only, is_active').eq('line_user_id', U).eq('description', 'NETFLIX.COM').single();
    assert(nrule.track_only === false && nrule.is_active === true && (await nf.locator('.recurring-meta').textContent()).includes('next '), 'switching on makes it a logging rule');

    assert(errors.length === 0, `no page errors (got ${JSON.stringify(errors)})`);
  } finally {
    await browser.close();
    await cleanup();
  }
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); console.log('FAIL: crashed'); await cleanup(); process.exit(1); });
