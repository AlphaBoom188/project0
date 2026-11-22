// LIFF: Budgets -> Subscriptions & bills "what's due next": header card
// (next, due in 7 days, left this cycle, totals), row due labels (overdue,
// today, paid), meta line, the Next due / Cost sort, and inline Mark paid.
// The overview is stubbed so the labels don't depend on today's date.
const { BASE, OUTPUT, openTab } = require('../lib');
const fs = require('fs');
const { chromium } = require('playwright-core');

fs.mkdirSync(OUTPUT, { recursive: true });
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const U = `test_subsdue_${Date.now()}`;

const item = (o) => ({ tracked: false, auto: true, category: 'Bills', amount: o.next_amount, frequency: 'monthly', yearly: o.monthly * 12, increase: null, pay_window: false, account: null, ...o });
const base = {
  today: '2026-11-24', cycleEnd: '2026-12-01', increases: 1,
  monthlyTotal: 9719, yearlyTotal: 116628,
  items: [
    item({ id: 'w', description: 'Water', next_amount: 300, monthly: 300, next_due: '2026-11-10', days_until: -14, status: 'overdue', pay_window: true }),
    item({ id: 'g', description: 'Gym', next_amount: 1000, monthly: 1000, next_due: '2026-11-24', days_until: 0, status: 'due_soon', tracked: true, auto: false }),
    item({ id: 'n', description: 'Netflix', category: 'Fun', next_amount: 459, monthly: 419, next_due: '2026-11-27', days_until: 3, status: 'due_soon', increase: { from: 419, to: 459, date: '2026-10-27' }, account: { id: 'a', name: 'KBank', masked: 'xxx-x-x1234-x' } }),
    item({ id: 'r', description: 'Rent', next_amount: 8000, monthly: 8000, next_due: '2026-12-25', days_until: 31, status: 'paid', pay_window: true }),
  ],
  next: { id: 'w', description: 'Water', amount: 300, next_due: '2026-11-10', days_until: -14, status: 'overdue' },
  due_7d: { count: 3, total: 1759 },
  left_this_cycle: { count: 3, total: 1759 },
};
const paidWater = JSON.parse(JSON.stringify(base));
paidWater.items[0] = { ...paidWater.items[0], status: 'paid', next_due: '2026-12-10', days_until: 16 };
paidWater.items = [paidWater.items[1], paidWater.items[2], paidWater.items[0], paidWater.items[3]];
paidWater.next = { id: 'g', description: 'Gym', amount: 1000, next_due: '2026-11-24', days_until: 0, status: 'due_soon' };
paidWater.due_7d = { count: 2, total: 1459 };
paidWater.left_this_cycle = { count: 2, total: 1459 };

(async () => {
  await fetch(`${BASE}/api/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ line_user_id: U, display_name: 'Subs due' }) });
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://static.line-scdn.net/**', (route) => route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false,
      getProfile: async () => ({ userId: '${U}', displayName: 'Subs due', pictureUrl: '' }) };` }));
    let overview = base;
    const paidCalls = [];
    await page.route(`**/api/recurring/${U}/overview`, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(overview) }));
    await page.route(`**/api/recurring/${U}/*/paid`, (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      paidCalls.push(body.paid);
      overview = body.paid ? paidWater : base;
      route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });
    await page.goto(`${BASE}/liff/`);
    await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });
    // Home: "Next bill" row, tapping it opens Budgets at Subscriptions & bills
    await page.waitForSelector('#home-bill:not([hidden])', { timeout: 15000 });
    assert((await page.textContent('#home-bill-title')) === 'Next bill: Water' && (await page.textContent('#home-bill-meta')) === 'Overdue 14 days · Tue 10 Nov' && (await page.textContent('#home-bill-amount')) === '฿300', 'Home next bill row');
    await page.click('#home-bill-row');
    await page.waitForSelector('#tab-budgets:not([hidden]) #subs-hero:not([hidden])', { timeout: 15000 });
    assert(await page.evaluate(() => { const r = document.getElementById('subs-header').getBoundingClientRect(); return r.top >= 0 && r.top < 844; }), 'Home row opens Budgets scrolled to Subscriptions & bills');

    // header card, from the API's own figures
    assert((await page.textContent('#subs-next')) === 'Water ฿300 · overdue 14 days (Tue 10 Nov)', `next line (got "${await page.textContent('#subs-next')}")`);
    assert((await page.textContent('#subs-due7')) === `฿1,759 (${base.due_7d.count})` && (await page.textContent('#subs-left')) === '฿1,759 (3)', 'due in 7 days and left this cycle');
    assert((await page.textContent('#subs-total')) === '฿9,719 a month · ฿116,628 a year', 'monthly/yearly totals kept in a smaller row');

    // rows
    const rows = page.locator('#subs-list .subs-row');
    const titles = await rows.locator('.row-title').allTextContents();
    assert(titles.join(',') === 'Water,Gym,Netflix,Rent', `default sort is next due (got ${titles})`);
    const water = page.locator('.subs-row[data-subs-id="w"]');
    assert((await water.locator('[data-subs-due]').textContent()) === 'Overdue 14 days' && await water.locator('[data-subs-due]').evaluate((n) => n.classList.contains('amount-over')), 'overdue label, red');
    assert((await page.locator('.subs-row[data-subs-id="g"] [data-subs-due]').textContent()) === 'Today' && (await page.locator('.subs-row[data-subs-id="g"] .row-meta').first().textContent()).includes('Track only'), 'today label; track-only meta');
    const nf = page.locator('.subs-row[data-subs-id="n"]');
    assert((await nf.locator('[data-subs-due]').textContent()) === 'in 3 days' && (await nf.locator('.row-value').textContent()) === '฿459', 'in 3 days, next amount after the price rise');
    const nfMeta = await nf.innerText();
    assert(nfMeta.includes('Monthly · KBank •••1234 · Logs automatically') && nfMeta.includes('Logs automatically') && nfMeta.includes('Went up'), 'meta: frequency · account · logs automatically; price-rise note kept');
    assert((await page.locator('.subs-row[data-subs-id="r"] .subs-paid').textContent()).trim() === 'Paid' && (await page.locator('.subs-row[data-subs-id="r"] .subs-mark-paid').count()) === 0, 'paid pay-window row shows Paid, no button');
    assert((await water.locator('.subs-mark-paid').count()) === 1 && (await page.locator('.subs-row[data-subs-id="n"] .subs-mark-paid').count()) === 0, 'Mark paid only on unpaid pay-window rows');
    const tapOk = await page.$$eval('#subs-sort .chip, #subs-list .subs-mark-paid', (els) => els.every((e) => e.getBoundingClientRect().height >= 44));
    assert(tapOk, 'sort chips and Mark paid are at least 44px tall');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= 390), 'no horizontal overflow');

    // sort
    await page.click('[data-subs-sort="cost"]');
    assert((await rows.locator('.row-title').allTextContents()).join(',') === 'Rent,Gym,Netflix,Water' && (await page.getAttribute('[data-subs-sort="cost"]', 'aria-pressed')) === 'true', 'Cost sort');
    await page.click('[data-subs-sort="due"]');
    assert((await rows.locator('.row-title').first().textContent()) === 'Water', 'back to Next due');

    // mark paid -> row shows Paid, header updates; Undo reverts
    await water.locator('.subs-mark-paid').click();
    await page.waitForFunction(() => document.querySelector('.subs-row[data-subs-id="w"]')?.dataset.status === 'paid', null, { timeout: 10000 });
    assert(paidCalls[0] === true && (await page.textContent('#subs-next')).startsWith('Gym ฿1,000 · today') && (await page.textContent('#subs-due7')) === '฿1,459 (2)', 'Mark paid: row Paid, header updated');
    assert((await page.textContent('.toast')).includes('Marked paid'), 'toast');
    await page.screenshot({ path: `${OUTPUT}/subs_next_due.png`, fullPage: true });
    await page.click('.toast-undo');
    await page.waitForFunction(() => document.querySelector('.subs-row[data-subs-id="w"]')?.dataset.status === 'overdue', null, { timeout: 10000 });
    assert(paidCalls[1] === false, 'Undo marks it unpaid again');

    // dark mode screenshot
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    await page.screenshot({ path: `${OUTPUT}/subs_next_due_dark.png`, fullPage: true });
    assert(errors.length === 0, `no page errors (${errors.join('; ')})`);
  } finally {
    await browser.close();
    await fetch(`${BASE}/api/users/${U}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE' }) });
  }
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); console.log('FAIL: crashed'); process.exit(1); });
