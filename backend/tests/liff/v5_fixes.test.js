// LIFF_V5_FIXES.md: the review fixes on top of the v5 refresh.
// A1 Recurring rules card + action sheet, A2 hero error states when the
// monthly report fails, A3 Tasks chips; B1 Goals and income, B2 holdings
// in THB, B3 sheet close buttons, B4 Home tax row, B5 Recent meta, B6 Shared
// bills, B7 field heights. Real API; /api/reports/** is routed
// to 500 for A2 only.
const { BASE, OUTPUT, openTab } = require('../lib');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

require('fs').mkdirSync(OUTPUT, { recursive: true });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const stamp = Date.now();
const U = `test_v5fix_${stamp}`;

const api = (path, opts = {}) => fetch(`${BASE}/api${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

async function cleanup() {
  await db.from('tax_incomes').delete().eq('line_user_id', U);
  await db.from('tax_profiles').delete().eq('line_user_id', U);
  await db.from('asset_lots').delete().eq('line_user_id', U);
  for (const t of ['recurring_transactions', 'reminders', 'transactions', 'asset_holdings', 'accounts', 'categories', 'users']) await db.from(t).delete().eq('line_user_id', U);
}

async function openApp(browser, userId, { colorScheme = 'light', setup } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://static.line-scdn.net/**', (route) => route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false,
    getIDToken: () => null, getProfile: async () => ({ userId: '${userId}', displayName: 'Fix Tester', pictureUrl: '' }) };` }));
  if (setup) await setup(page);
  await page.goto(`${BASE}/liff/`);
  await page.waitForSelector('#app:not([hidden])', { timeout: 20000 });
  return { page, errors, ctx };
}
const shot = (page, name) => page.screenshot({ path: `${OUTPUT}/v5fix_${name}.png`, fullPage: true });

(async () => {
  await cleanup();
  await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: U, display_name: 'Fix Tester' }) });
  const cats = (await api(`/categories/${U}?type=expense`)).body.categories;
  const food = cats.find((c) => /food/i.test(c.name)) || cats[0];
  await api(`/categories/${U}/${food.id}`, { method: 'PUT', body: JSON.stringify({ budget_amount: 5000, budget_period: 'monthly' }) });
  const inc = (await api(`/categories/${U}?type=income`)).body.categories[0];
  await api(`/recurring/${U}`, { method: 'POST', body: JSON.stringify({ category_id: food.id, amount: 15000, type: 'expense', frequency: 'monthly', start_date: '2030-01-01', description: 'Condo rent with a long name that should truncate', pay_start_day: 1, pay_end_day: 5 }) });
  await api(`/recurring/${U}`, { method: 'POST', body: JSON.stringify({ category_id: inc.id, amount: 42000, type: 'income', frequency: 'monthly', start_date: '2030-01-25', description: 'Salary' }) });
  await api(`/recurring/${U}`, { method: 'POST', body: JSON.stringify({ category_id: food.id, amount: 300, type: 'expense', frequency: 'weekly', start_date: '2030-01-01', description: 'Gym' }) });
  for (const [title, repeat] of [['Stand-up', 'daily'], ['Pay rent', 'monthly']]) {
    const at = new Date(Date.now() + 3 * 86400000).toISOString();
    await api(`/reminders/${U}`, { method: 'POST', body: JSON.stringify({ title, remind_at: at, repeat }) });
  }
  await api(`/reminders/${U}`, { method: 'POST', body: JSON.stringify({ title: 'Dentist', remind_at: new Date(Date.now() + 2 * 86400000).toISOString(), repeat: 'none' }) });

  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    // ---------- A1: Recurring rules ----------
    const { page, errors } = await openApp(browser, U);
    await openTab(page, 'budgets');
    await page.waitForSelector('#recurring-list .recurring-row', { timeout: 15000 });
    const geo = await page.evaluate(() => {
      const card = document.getElementById('recurring-list').getBoundingClientRect();
      const overflow = [];
      for (const n of document.querySelectorAll('#recurring-list *')) {
        const r = n.getBoundingClientRect();
        if (r.width && (r.left < card.left - 0.5 || r.right > card.right + 0.5)) overflow.push(n.className || n.tagName);
      }
      return { left: card.left, right: window.innerWidth - card.right, overflow, rowsText: document.getElementById('recurring-list').innerText };
    });
    assert(Math.round(geo.left) === 16 && Math.round(geo.right) === 16, `Recurring card has 16px side margins (got ${geo.left}/${geo.right})`);
    assert(geo.overflow.length === 0, `nothing in the card runs past it (got ${JSON.stringify(geo.overflow.slice(0, 5))})`);
    assert(!/\bDelete\b/.test(geo.rowsText), 'no "Delete" text on rows');
    const rowInfo = await page.$$eval('#recurring-list .recurring-row', (rows) => rows.map((r) => ({ h: r.getBoundingClientRect().height, tile: !!r.querySelector('.cat-tile'), more: r.querySelector('.recurring-more')?.getAttribute('aria-label'), mh: r.querySelector('.recurring-more')?.getBoundingClientRect().height })));
    assert(rowInfo.length === 3 && rowInfo.every((r) => r.h >= 56 && r.tile && r.more && r.mh >= 44), `3 rows >= 56px with a tile and a 44px ⋯ (got ${JSON.stringify(rowInfo)})`);
    const salaryAmt = await page.locator('.recurring-row', { hasText: 'Salary' }).locator('.recurring-amount');
    const incomeColor = await page.evaluate(() => { const d = document.createElement('span'); d.style.color = 'var(--income)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; });
    assert((await salaryAmt.textContent()).startsWith('+') && (await salaryAmt.evaluate((n) => getComputedStyle(n).color)) === incomeColor, 'income amount: + in --income');
    const rentMeta = await page.locator('.recurring-row', { hasText: 'Condo' }).locator('.recurring-meta').textContent();
    assert(/^Expense · Monthly · next .+ · pay [A-Z][a-z]+ \d/.test(rentMeta), `meta "Expense · Monthly · next … · pay …" (got "${rentMeta}")`);
    await page.locator('#recurring-list').screenshot({ path: `${OUTPUT}/v5fix_recurring.png` });

    // ⋯ -> sheet -> pause
    const gym = page.locator('.recurring-row', { hasText: 'Gym' });
    await gym.locator('.recurring-more').click();
    await page.waitForSelector('#recurring-actions-modal:not([hidden])');
    assert((await page.textContent('#recurring-actions-title')) === 'Gym' && (await page.isChecked('#recurring-active-switch')), 'sheet: title = rule name, switch on');
    await page.locator('#recurring-actions-modal').screenshot({ path: `${OUTPUT}/v5fix_recurring_sheet.png` });
    await page.click('.recurring-active-row');
    await page.waitForFunction(() => [...document.querySelectorAll('.recurring-row')].some((r) => r.textContent.includes('Gym') && r.classList.contains('inactive')), null, { timeout: 8000 }).catch(() => {});
    assert((await gym.getAttribute('class')).includes('inactive') && (await gym.locator('.recurring-meta').textContent()).includes('Paused')
      && (await gym.evaluate((n) => getComputedStyle(n).opacity)) === '0.5', 'Active off -> row dimmed and "Paused"');
    assert(!(await page.isChecked('#recurring-active-switch')), 'switch follows the row');
    const { data: gymRow } = await db.from('recurring_transactions').select('is_active').eq('line_user_id', U).eq('description', 'Gym').single();
    assert(gymRow.is_active === false, 'paused in the database');

    // Delete -> confirm -> toast -> Undo re-creates it (still paused)
    await page.click('#recurring-delete-button');
    await page.waitForSelector('#confirm-modal:not([hidden])');
    await page.click('#confirm-ok');
    await page.waitForFunction(() => !document.getElementById('recurring-list').textContent.includes('Gym'), null, { timeout: 8000 }).catch(() => {});
    assert(await page.isHidden('#recurring-actions-modal') && (await page.textContent('#toast .toast-title')) === 'Rule deleted', 'delete: sheet closes, "Rule deleted" toast');
    await page.click('#toast .toast-undo');
    await page.waitForFunction(() => document.getElementById('recurring-list').textContent.includes('Gym'), null, { timeout: 8000 }).catch(() => {});
    const { data: back } = await db.from('recurring_transactions').select('amount, frequency, is_active').eq('line_user_id', U).eq('description', 'Gym');
    assert(back.length === 1 && Number(back[0].amount) === 300 && back[0].frequency === 'weekly' && back[0].is_active === false, `Undo re-creates the rule (got ${JSON.stringify(back)})`);

    // Mark paid still PATCHes and toasts
    const rent = page.locator('.recurring-row', { hasText: 'Condo' });
    const [patch] = await Promise.all([page.waitForResponse((r) => r.url().includes('/paid') && r.request().method() === 'PATCH'), rent.locator('.recurring-paid-toggle').click()]);
    assert(patch.status() === 200, 'Mark paid -> PATCH /paid');
    await page.waitForSelector('.recurring-paid-label', { timeout: 8000 });
    assert((await page.textContent('#toast .toast-title')) === 'Marked paid', 'Mark paid toast');

    // ---------- A3: Tasks chips ----------
    await openTab(page, 'tasks');
    await page.waitForFunction(() => document.getElementById('tasks-summary-repeat').textContent.includes('Repeating'), null, { timeout: 15000 });
    const chips = await page.$$eval('#tasks-summary .tasks-filter-chip', (bs) => bs.map((b) => ({ t: b.textContent.trim(), h: b.getBoundingClientRect().height, tag: b.tagName })));
    assert(chips.length === 3 && chips.every((c) => c.h === 36 && c.tag === 'BUTTON'), `three 36px chip buttons (got ${JSON.stringify(chips)})`);
    assert(chips[0].t === 'Repeating 2' && chips[1].t.startsWith('Upcoming') && chips[2].t.startsWith('Done'), `chip labels (got ${chips.map((c) => c.t)})`);
    assert(!(await page.textContent('#tab-tasks')).includes('Set\n') && (await page.$('.tasks-summary-label')) === null, 'no "Set" label');
    for (const [id, list] of [['repeat', 'repeat'], ['next', 'next'], ['done', 'done']]) {
      await page.click(`#tasks-summary-${id}`);
      await page.waitForSelector('#tasks-list-modal:not([hidden])');
      const ok = list === 'done'
        ? (await page.getAttribute('#tasks-done-toggle', 'aria-expanded')) === 'true'
        : (await page.getAttribute(`#tasks-list-tabs [data-list="${list}"]`, 'class')).includes('active');
      assert(ok, `${id} chip opens its list`);
      await page.click('#close-tasks-list');
    }
    await page.locator('#tab-tasks').screenshot({ path: `${OUTPUT}/v5fix_tasks_chips.png` });
    await openTab(page, 'tax');
    await page.waitForSelector('#tax-profile-summary', { state: 'visible', timeout: 15000 });
    const taxRow = await page.$eval('#tax-profile-summary', (b) => { const s = getComputedStyle(b); return { cls: b.className, border: s.borderTopWidth, minH: s.minHeight, display: s.display }; });
    assert(taxRow.cls.includes('tasks-summary') && taxRow.border === '1px' && taxRow.minH === '56px' && taxRow.display === 'flex', `Tax "You" row unchanged (got ${JSON.stringify(taxRow)})`);
    assert(errors.length === 0, `no page errors (got ${JSON.stringify(errors)})`);
    await page.context().close();

    // ---------- A2: monthly report fails ----------
    let failReports = true;
    const { page: p2, errors: e2 } = await openApp(browser, U, {
      setup: (p) => p.route('**/api/reports/**', (route) => (failReports ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }) : route.continue())),
    });
    await p2.waitForSelector('#home-hero-sub .hero-retry', { timeout: 15000 });
    assert((await p2.textContent('#home-hero-sub')).includes("Couldn't load your budget.") && !(await p2.textContent('#home-hero-sub')).includes('No budget set yet'), 'Home: "Couldn\'t load your budget."');
    assert(/^฿[\d,]+/.test(await p2.textContent('#summary-expense')), 'Home keeps the spent amount from transactions');
    await openTab(p2, 'budgets');
    await p2.waitForSelector('#budget-hero-sub .hero-retry', { timeout: 15000 });
    assert((await p2.textContent('#budget-hero-amount')) === '—' && (await p2.textContent('#budget-hero-sub')).includes("Couldn't load this cycle's totals.") && await p2.isHidden('#budget-hero-bar'), 'Budgets: "—" and "Couldn\'t load…", no bar');
    assert(!(await p2.textContent('#budget-hero')).includes('฿0'), 'no "฿0" in the Budgets hero');
    const retryH = await p2.$eval('#budget-hero-sub .hero-retry', (b) => b.getBoundingClientRect().height);
    assert(retryH >= 44, `Try again is 44px tall (got ${retryH})`);
    await shot(p2, 'budgets_error');
    failReports = false;
    await p2.click('#budget-hero-sub .hero-retry');
    await p2.waitForFunction(() => document.getElementById('budget-hero-amount').textContent.startsWith('฿'), null, { timeout: 10000 }).catch(() => {});
    assert((await p2.textContent('#budget-hero-label')) === 'Left to spend' && (await p2.textContent('#budget-hero-amount')).startsWith('฿') && await p2.isVisible('#budget-hero-bar'), 'Budgets: Try again recovers');
    await openTab(p2, 'home');
    failReports = true;
    await p2.evaluate(() => { getCache.clear(); return loadHomeTab(); });
    await p2.waitForSelector('#home-hero-sub .hero-retry', { timeout: 10000 }).catch(() => {});
    failReports = false;
    await p2.click('#home-hero-sub .hero-retry');
    await p2.waitForFunction(() => document.getElementById('home-hero-sub').textContent.includes('budget ·'), null, { timeout: 10000 }).catch(() => {});
    assert((await p2.textContent('#home-hero-sub')).startsWith('of ฿5,000 budget'), `Home: Try again recovers (got "${await p2.textContent('#home-hero-sub')}")`);
    assert(e2.length === 0, `no page errors (got ${JSON.stringify(e2)})`);
    await p2.context().close();

    // ---------- B: Wealth, Home, sheets, field sizes ----------
    // A fresh user for the Goals and income set-up state, then seed for B2/B4/B5.
    const { page: p3, errors: e3 } = await openApp(browser, U);
    await openTab(p3, 'networth');
    await p3.waitForSelector('#goals-income-list [data-goal-row="ef"]', { timeout: 15000 });
    const goalRows = await p3.$$eval('#goals-income-list [data-goal-row]', (bs) => bs.map((b) => ({ k: b.dataset.goalRow, t: b.innerText.replace(/\s+/g, ' ') })));
    assert((await p3.$$('#tab-networth .goals-income-list')).length === 1 && goalRows.length === 2 && goalRows[0].k === 'ef' && goalRows[0].t.includes('Set up') && goalRows[1].k === 'investment' && goalRows[1].t.includes('Set up'),
      `B1: one Goals and income card, Emergency fund + Investment goal in Set up (got ${JSON.stringify(goalRows)})`);
    assert((await p3.$('#goals-empty')) === null && (await p3.$('#tab-networth #goal-card')) === null && (await p3.$('#tab-networth #div-card')) === null, 'B1: the standalone cards and the dashed empty card are gone');
    // Add goal -> chooser with all three while unset
    await p3.click('#add-goal-button');
    await p3.waitForSelector('#add-goal-modal:not([hidden])');
    assert((await p3.$$eval('#add-goal-modal [data-add-goal]', (bs) => bs.filter((b) => !b.hidden).map((b) => b.dataset.addGoal))).join() === 'savings,investment,ef', 'B1: Add goal offers Savings, Investment, Emergency fund');
    await p3.click('#add-goal-modal .sheet-close');
    // Emergency fund sheet: set it up
    const acct = (await api(`/accounts/${U}`, { method: 'POST', body: JSON.stringify({ account_name: 'Savings', account_type: 'bank', balance: 84251 }) })).body.account;
    await p3.evaluate(() => { getCache.clear(); return loadNetWorthTab(); });
    await p3.click('#goals-income-list [data-goal-row="ef"]');
    await p3.waitForSelector('#ef-modal:not([hidden])');
    await p3.fill('#setting-ef-goal', '150000');
    await p3.selectOption('#setting-ef-account', acct.id);
    await Promise.all([p3.waitForResponse((r) => r.url().includes('/emergency-fund')), p3.click('#save-emergency-fund')]);
    await p3.waitForSelector('#ef-modal', { state: 'hidden', timeout: 8000 });
    const efRow = await p3.innerText('#goals-income-list [data-goal-row="ef"]');
    assert(efRow.includes('฿84,251 of ฿150,000 · Savings') && efRow.includes('56%') && (await p3.$('#goals-income-list [data-goal-row="ef"] .bar')) !== null, `B1: Emergency fund row after saving (got ${efRow.replace(/\s+/g, ' ')})`);
    assert((await p3.textContent('#toast .toast-title')) === 'Emergency fund saved', 'B1: saved toast');
    await p3.click('#add-goal-button');
    await p3.waitForSelector('#add-goal-modal:not([hidden])');
    assert(await p3.isHidden('[data-add-goal="ef"]'), 'B1: chooser drops Emergency fund once it is set');
    await p3.keyboard.press('Escape');
    await p3.waitForSelector('#add-goal-modal', { state: 'hidden', timeout: 5000 }).catch(() => {});
    assert(await p3.isHidden('#add-goal-modal'), 'B3: Escape closes a sheet');

    // B2: holdings in THB
    const voo = (await api(`/portfolio/${U}`, { method: 'POST', body: JSON.stringify({ asset_type: 'mutual_fund', symbol: 'GOLDFUND', name: 'A very long fund name that should never squeeze the value column', quantity: 100, average_cost: 10, current_price: 12, trade_date: '2025-01-02' }) })).body.holding;
    await p3.evaluate(() => { getCache.clear(); return loadNetWorthTab(); });
    await p3.waitForSelector('#holdings-list .holding-row', { timeout: 15000 });
    const hold = await p3.$$eval('#holdings-list .holding-row', (rows) => rows.map((r) => {
      const end = r.querySelector('.row-end');
      const lh = parseFloat(getComputedStyle(end.firstElementChild).lineHeight) || 20;
      return { value: r.querySelector('.holding-value').textContent, lines: end.children.length, h: end.getBoundingClientRect().height, lh, meta: r.querySelector('.row-meta').textContent };
    }));
    assert(hold.length >= 1 && hold.every((x) => x.value.startsWith('฿') && x.lines <= 2 && x.h <= 44), `B2: every holding value starts with ฿, right column <= 2 lines (got ${JSON.stringify(hold)})`);
    assert(voo && hold[0].meta.includes('% of portfolio'), 'B2: meta "{Type} · x% of portfolio"');
    await p3.locator('#tab-networth').screenshot({ path: `${OUTPUT}/v5fix_wealth_light.png` });

    // B3: every sheet header has a close button
    const sheets = await p3.$$eval('.modal', (ms) => ms.map((m) => ({ id: m.id, close: !!m.querySelector(':scope > .modal-content > .sheet-close[aria-label="Close"]') })));
    const missing = sheets.filter((x) => x.id !== 'confirm-modal' && !x.close).map((x) => x.id);
    assert(missing.length === 0 && sheets.length > 25, `B3: every .modal has a header Close button (missing ${JSON.stringify(missing)})`);
    await openTab(p3, 'home');
    await p3.click('#fab-add');
    await p3.waitForSelector('#add-expense-modal:not([hidden])');
    await p3.locator('#add-expense-modal .modal-content').screenshot({ path: `${OUTPUT}/v5fix_add_entry_sheet.png` });
    const close = await p3.$eval('#add-expense-modal .sheet-close', (b) => { const r = b.getBoundingClientRect(); const t = document.getElementById('add-entry-title').getBoundingClientRect(); return { w: r.width, h: r.height, right: window.innerWidth - r.right, sameRow: Math.abs((r.top + r.bottom) / 2 - (t.top + t.bottom) / 2) < 12 }; });
    assert(close.w === 44 && close.h === 44 && close.sameRow, `B3: Add entry has a 44px close beside the title (got ${JSON.stringify(close)})`);
    await p3.click('#add-expense-modal .sheet-close');
    assert(await p3.isHidden('#add-expense-modal'), 'B3: the close button closes it');
    await p3.click('#fab-add');
    await p3.waitForSelector('#add-expense-modal:not([hidden])');
    await p3.mouse.click(195, 10); // backdrop above the sheet
    await p3.waitForSelector('#add-expense-modal', { state: 'hidden', timeout: 5000 }).catch(() => {});
    assert(await p3.isHidden('#add-expense-modal'), 'B3: a backdrop tap closes it');

    // B6: Shared bills empty state + New bill
    assert(await p3.isVisible('#bills-empty-state') && (await p3.getAttribute('#bills-empty-state', 'class')).includes('empty-dashed') && (await p3.textContent('#bills-empty-state')).startsWith('No shared bills yet.'), 'B6: dashed empty state');
    await p3.click('#new-bill-button');
    await p3.waitForSelector('#bill-modal:not([hidden])');
    assert(true, 'B6: New bill opens the bill sheet');
    await p3.click('#bill-modal .sheet-close');

    // B4 + B5: tax row and Recent meta
    const taxYear = (() => { const d = new Date(Date.now() + 7 * 3600000); const m = d.getUTCMonth() + 1; return (m >= 10 ? d.getUTCFullYear() : d.getUTCFullYear() - 1) + 543; })();
    const inSeason = (() => { const m = new Date(Date.now() + 7 * 3600000).getUTCMonth() + 1; return m >= 10 || m <= 3; })();
    await api(`/tax/${U}/${taxYear}/incomes`, { method: 'POST', body: JSON.stringify({ kind: 'salary', amount: 900000, withheld: 20000, payer: 'Acme' }) });
    await api(`/transactions/${U}`, { method: 'POST', body: JSON.stringify({ type: 'expense', amount: 120, category_id: food.id, description: 'Lunch on account', from_account_id: acct.id, transaction_date: new Date().toISOString() }) });
    await p3.evaluate(() => { getCache.clear(); return loadHomeTab(); });
    await p3.waitForSelector('#transaction-list .transaction-row', { timeout: 15000 });
    if (inSeason) {
      await p3.waitForSelector('#home-tax:not([hidden])', { timeout: 15000 });
      await p3.waitForFunction(() => /^File PND 9[01] by 31 Mar$/.test(document.getElementById('home-tax-meta').textContent), null, { timeout: 15000 }).catch(() => {});
      const taxRow = await p3.$eval('#home-tax-row', (row) => [...row.querySelectorAll('.row-title, .row-meta, .row-value, .row-sub')].filter((n) => n.offsetParent).map((n) => ({ t: n.textContent, over: n.scrollWidth > n.clientWidth })));
      assert(taxRow.every((x) => !x.over) && taxRow.some((x) => /^File PND 9[01] by 31 Mar$/.test(x.t)), `B4: nothing in the tax row is cut off (got ${JSON.stringify(taxRow)})`);
      await p3.locator('#home-tax').screenshot({ path: `${OUTPUT}/v5fix_home_tax.png` });
      const save = await p3.isVisible('#home-tax-save');
      assert(!save || ((await p3.textContent('#home-tax-save')) === `Save up to${await p3.textContent('#home-tax-save-amount')}` && /^฿[\d,]+$/.test(await p3.textContent('#home-tax-save-amount'))), 'B4: "Save up to ฿x" sits on the right');
    } else {
      assert(true, 'B4: tax row is out of season today (skipped)');
    }
    const homeMeta = await p3.$eval('#transaction-list .transaction-row .row-meta', (n) => n.textContent);
    await openTab(p3, 'transactions');
    await p3.waitForSelector('#txn-full-list .transaction-row', { timeout: 15000 });
    const histMeta = await p3.$eval('#txn-full-list .transaction-row .row-meta', (n) => n.textContent);
    assert(homeMeta === histMeta && homeMeta.includes('Savings'), `B5: Home Recent meta = History meta (got "${homeMeta}" / "${histMeta}")`);

    // B7: field size audit, every tab and every sheet
    const small = [];
    for (const tab of ['home', 'tasks', 'transactions', 'budgets', 'networth', 'tax', 'settings', 'more']) {
      await openTab(p3, tab);
      await p3.waitForTimeout(400);
      small.push(...await p3.$$eval(`#tab-${tab} input, #tab-${tab} select`, (els) => els.filter((e) => e.offsetParent && !e.classList.contains('chip') && !['checkbox', 'radio', 'hidden', 'file', 'range'].includes(e.type)).map((e) => ({ id: e.id || e.name || e.className, h: e.getBoundingClientRect().height })).filter((x) => x.h < 44)));
    }
    small.push(...await p3.evaluate(() => {
      const out = [];
      for (const m of document.querySelectorAll('.modal')) {
        const was = m.hidden;
        m.hidden = false;
        for (const e of m.querySelectorAll('input, select')) {
          if (!e.offsetParent || e.classList.contains('chip') || ['checkbox', 'radio', 'hidden', 'file', 'range'].includes(e.type)) continue;
          const h = e.getBoundingClientRect().height;
          if (h < 44) out.push({ id: `${m.id} ${e.id || e.name || e.className}`, h });
        }
        m.hidden = was;
      }
      return out;
    }));
    assert(small.length === 0, `B7: every visible input/select is >= 44px (under: ${JSON.stringify(small)})`);

    // Screenshots: Budgets, Wealth, Tasks, Home in light and dark
    for (const scheme of ['light', 'dark']) {
      await p3.emulateMedia({ colorScheme: scheme });
      for (const tab of ['home', 'budgets', 'networth', 'tasks']) {
        await openTab(p3, tab);
        await p3.waitForTimeout(600);
        await shot(p3, `${tab}_${scheme}`);
      }
    }
    assert(e3.length === 0, `B: no page errors (got ${JSON.stringify(e3)})`);
    await p3.context().close();

    // Skeletons in the markup, never ฿0
    const html = await (await fetch(`${BASE}/liff/`)).text();
    const heroHtml = (id) => html.slice(html.indexOf(`id="${id}"`), html.indexOf('</section>', html.indexOf(`id="${id}"`)));
    assert(!heroHtml('home-hero').includes('฿0') && !heroHtml('budget-hero').includes('฿0') && heroHtml('budget-hero').includes('skeleton-amount'), 'hero markup has skeletons, no literal ฿0');
  } finally {
    await browser.close();
    await cleanup();
  }
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); console.log('FAIL: crashed'); await cleanup(); process.exit(1); });
