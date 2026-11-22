// v5 "Claude style" refresh (LIFF_UXUI_REFRESH_SPEC.md section 8): nav
// highlight per panel, Money switch memory, Add button visibility, More,
// the Export and import sheet, Add entry (error, toast + Undo, budget
// toast, AI tags and trace), repeat-payment cards, the Tasks timeline,
// the first-week checklist, the History error state, and screenshots of
// every tab and the main sheets in light and dark.
// The OCR scan and repeat-payment suggestions are stubbed with page.route
// (free); everything else goes through the real API.
const { BASE, OUTPUT, openTab } = require('../lib');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

require('fs').mkdirSync(OUTPUT, { recursive: true });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const stamp = Date.now();
const U = `test_uxui_${stamp}`; // has data
const N = `test_uxuinew_${stamp}`; // brand-new user (first week)

const api = (path, opts = {}) => fetch(`${BASE}/api${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

async function cleanup() {
  for (const u of [U, N]) {
    await db.from('transactions').delete().eq('line_user_id', u);
    await db.from('reminders').delete().eq('line_user_id', u);
    await db.from('categories').delete().eq('line_user_id', u);
    await db.from('users').delete().eq('line_user_id', u);
  }
}

async function openApp(browser, userId, { colorScheme = 'light', setup } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://static.line-scdn.net/**', (route) => route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false,
    getIDToken: () => null, getProfile: async () => ({ userId: '${userId}', displayName: 'Uxui Tester', pictureUrl: '' }) };` }));
  if (setup) await setup(page);
  await page.goto(`${BASE}/liff/`);
  await page.waitForSelector('#app:not([hidden])', { timeout: 20000 });
  return { page, errors, ctx };
}

const shot = (page, name) => page.screenshot({ path: `${OUTPUT}/uxui_${name}.png`, fullPage: true });
const navActive = (page) => page.$eval('.nav-tab.active', (b) => b.dataset.tab);
const toastText = (page) => page.textContent('#toast');

(async () => {
  await cleanup();
  await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: U, display_name: 'Uxui Tester' }) });
  await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: N, display_name: 'Uxui New' }) });
  const { body: catBody } = await api(`/categories/${U}?type=expense`);
  const food = catBody.categories.find((c) => /food/i.test(c.name)) || catBody.categories[0];
  // Seed 8 days with entries so U is past the first week.
  const rows = [];
  for (let d = 1; d <= 8; d += 1) rows.push({ line_user_id: U, type: 'expense', amount: 50 + d, category_id: food.id, description: `Seed ${d}`, transaction_date: new Date(Date.now() - d * 86400000).toISOString() });
  await db.from('transactions').insert(rows);
  // A reminder later today (Bangkok) for the timeline.
  const later = new Date(Math.min(Date.now() + 3 * 3600000, new Date(`${new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)}T23:30:00+07:00`).getTime()));
  await api(`/reminders/${U}`, { method: 'POST', body: JSON.stringify({ title: 'Pay the rent', remind_at: later.toISOString(), repeat: 'none', importance: 1 }) });

  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const { page, errors } = await openApp(browser, U, {
      setup: async (p) => {
        // Stub OCR (paid) and the repeat-payment suggestions.
        await p.route('**/api/ocr/scan/**', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, duplicate: false, data: { amount: 245, merchant: 'Uniqlo Siam', date: null, suggested_category_id: food.id, suggested_category_name: food.name, thumbnail_path: null } }) }));
        let dismissed = false;
        await p.route('**/api/recurring/*/suggestions', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ suggestions: dismissed ? [] : [{ key: 'spotify', description: 'SPOTIFY', amount: 149, dayOfMonth: 12, months: 5, confidence: 'high', type: 'expense', variable: false, categoryName: 'Entertainment', lastDate: '2026-11-12', nextDate: '2026-12-12' }] }) }));
        await p.route('**/api/recurring/*/suggestions/spotify/dismiss', (route) => { dismissed = true; return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, suggestions: [] }) }); });
      },
    });

    // --- Nav: highlight for every panel ---
    const expected = { home: 'home', tasks: 'tasks', transactions: 'transactions', budgets: 'money', networth: 'money', tax: 'more', settings: 'more', more: 'more' };
    const lit = {};
    for (const tab of Object.keys(expected)) { await openTab(page, tab); lit[tab] = await navActive(page); }
    assert(Object.entries(expected).every(([tab, nav]) => lit[tab] === nav), `nav highlight per panel (got ${JSON.stringify(lit)})`);
    assert((await page.$$('.nav-tab')).length === 5 && (await page.getAttribute('.nav-tab.active', 'aria-current')) === 'page', 'five nav items; the active one has aria-current');

    // --- Add button only where it belongs ---
    const fab = {};
    for (const tab of ['home', 'transactions', 'tasks', 'tax', 'budgets', 'networth', 'more', 'settings']) { await openTab(page, tab); fab[tab] = await page.isVisible('#fab-add'); }
    assert(fab.home && fab.transactions && fab.tasks && fab.tax && !fab.budgets && !fab.networth && !fab.more && !fab.settings, `Add button visibility (got ${JSON.stringify(fab)})`);

    // --- More: no header avatar; profile card opens Settings ---
    await openTab(page, 'more');
    assert((await page.$$('#tab-more .page-head [data-avatar]')).length === 0 && (await page.$$('#more-profile [data-avatar]')).length === 1, 'More has no header avatar; the profile card has it');
    await page.click('#more-profile');
    assert(await page.isVisible('#tab-settings'), 'profile card opens Settings');
    await page.click('#settings-back');
    assert(await page.isVisible('#tab-more'), 'Settings back goes to More');

    // --- Money switch memory ---
    await openTab(page, 'budgets');
    await page.click('#tab-budgets .money-switch [data-money="networth"]');
    assert(await page.isVisible('#tab-networth'), 'the switch opens Wealth');
    await openTab(page, 'home');
    await page.click('.nav-tab[data-tab="money"]');
    assert(await page.isVisible('#tab-networth'), 'Money reopens the last view (Wealth)');
    await page.reload();
    await page.waitForSelector('#app:not([hidden])', { timeout: 20000 });
    await page.click('.nav-tab[data-tab="money"]');
    assert(await page.isVisible('#tab-networth') && (await page.evaluate(() => localStorage.getItem('moneyView'))) === 'networth', 'remembered across reloads (localStorage moneyView)');
    await page.click('#tab-networth .money-switch [data-money="budgets"]');

    // --- Repeat-payment card: Not a repeat -> toast, then the dashed card ---
    await page.waitForSelector('#repeat-list [data-repeat="spotify"]', { timeout: 15000 });
    assert((await page.textContent('#repeat-list .rec-card')).includes('SPOTIFY') && (await page.$$('#repeat-list .rec-option')).length === 3 && (await page.$$('#repeat-list .rec-card .confidence, #repeat-list meter')).length === 0, 'recommendation card: three options, no confidence meter');
    await page.click('#repeat-list .rec-option:has-text("Remind")');
    assert(await page.$eval('#repeat-list .rec-option:has-text("Remind") input', (i) => i.checked), 'tapping an option selects it');
    await page.click('#repeat-list [data-repeat-action="dismiss"]');
    await page.waitForSelector('#toast:not([hidden])', { timeout: 10000 });
    assert((await toastText(page)).includes('Marked as not a repeat') && await page.isVisible('#repeat-empty'), 'Not a repeat -> toast, then "No new repeat payments"');

    // --- Export and import sheet from History and More ---
    await openTab(page, 'transactions');
    await page.click('#txn-data-button');
    assert(await page.isVisible('#data-modal') && (await page.textContent('#data-scope')).startsWith('Uses your current filters:'), 'History pill opens the sheet with the scope line');
    const [link] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/export-link') && r.method() === 'POST', { timeout: 15000 }),
      page.click('#export-csv-button'),
    ]);
    assert(!!link && await page.isHidden('#data-modal'), 'Download CSV calls export-link and closes the sheet');
    await openTab(page, 'more');
    await page.click('#more-import');
    assert(await page.isVisible('#data-modal'), 'More -> Import opens the same sheet');
    await shot(page, 'sheet_data_light');
    await page.click('#data-close');

    // --- Add entry: empty amount, save toast with Undo, budget toast ---
    await openTab(page, 'home');
    await page.click('#fab-add');
    await page.waitForSelector('#add-expense-modal:not([hidden])');
    await page.click('#add-entry-save');
    assert(await page.isVisible('#amount-error') && (await page.textContent('#amount-error')) === 'Enter an amount above ฿0.' && await page.isVisible('#add-expense-modal'), 'empty amount: inline error, nothing saved');
    await shot(page, 'sheet_add_light');
    await page.fill('#field-amount', '77');
    await page.fill('#field-description', 'Undo me');
    await page.waitForSelector(`#category-chips [data-cat="${food.id}"]`);
    await page.click(`#category-chips [data-cat="${food.id}"]`);
    await Promise.all([page.waitForResponse((r) => r.url().includes(`/transactions/${U}`) && r.request().method() === 'POST'), page.click('#add-entry-save')]);
    await page.waitForSelector('#toast:not([hidden]) .toast-undo', { timeout: 10000 });
    assert((await page.textContent('#toast .toast-title')) === `Saved ฿77 to ${food.name}`, `save toast (got ${await page.textContent('#toast .toast-title')})`);
    await Promise.all([page.waitForResponse((r) => r.request().method() === 'DELETE'), page.click('#toast .toast-undo')]);
    await page.waitForTimeout(400);
    assert((await db.from('transactions').select('id').eq('line_user_id', U).eq('description', 'Undo me')).data.length === 0, 'Undo deletes the entry');

    // A monthly budget ฿100 above what's already spent this Bangkok month, so ฿150 crosses it.
    const b = new Date(Date.now() + 7 * 3600000);
    const monthStart = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 1) - 7 * 3600000).toISOString();
    const { data: spentRows } = await db.from('transactions').select('amount').eq('line_user_id', U).eq('category_id', food.id).eq('type', 'expense').gte('transaction_date', monthStart);
    const spent = spentRows.reduce((sum, r) => sum + Number(r.amount), 0);
    await api(`/categories/${U}/${food.id}`, { method: 'PUT', body: JSON.stringify({ budget_amount: spent + 100, budget_period: 'monthly' }) });
    await page.click('#fab-add');
    await page.waitForSelector(`#category-chips [data-cat="${food.id}"]`);
    await page.fill('#field-amount', '150');
    await page.click(`#category-chips [data-cat="${food.id}"]`);
    await Promise.all([page.waitForResponse((r) => r.url().includes(`/transactions/${U}`) && r.request().method() === 'POST'), page.click('#add-entry-save')]);
    await page.waitForSelector('#toast:not([hidden])', { timeout: 10000 });
    assert((await page.getAttribute('#toast', 'class')).includes('toast-bad') && (await toastText(page)).includes('budget') && await page.isVisible('#toast .toast-undo'), 'budget crossing -> a red toast with Undo');

    // --- AI fill: tags AI -> Edited, the trace opens ---
    await page.click('#fab-add');
    await page.waitForSelector('#add-expense-modal:not([hidden])');
    await page.setInputFiles('#field-receipt-image', { name: 'r.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
    await page.waitForSelector('#ai-block:not([hidden])', { timeout: 15000 });
    const chips = await page.$$eval('#ai-chips .tool-chip', (cs) => cs.map((c) => c.textContent));
    assert(chips.join('|') === 'Receipt OCR|Duplicate check: none|Category match', `tool chips (got ${chips.join('|')})`);
    assert((await page.textContent('.amount-field .ai-tag')) === 'AI', 'amount tagged AI');
    await page.fill('#field-amount', '250');
    assert((await page.textContent('.amount-field .ai-tag')) === 'Edited', 'editing flips it to Edited');
    await page.click('#ai-trace summary');
    const steps = await page.$$eval('#ai-trace-steps li', (ls) => ls.map((l) => l.textContent.replace(/\s+/g, ' ').trim()));
    assert(await page.$eval('#ai-trace', (d) => d.open) && steps.some((x) => x.startsWith('Total ฿245')) && steps.some((x) => x.startsWith('Shop Uniqlo Siam')), `the trace opens with its steps (got ${JSON.stringify(steps)})`);
    await shot(page, 'sheet_add_ai_light');
    await page.click('#cancel-add-expense');

    // --- Tasks timeline: the time is outside the card ---
    await openTab(page, 'tasks');
    await page.waitForSelector('#tasks-timeline .tl-row', { timeout: 15000 });
    const outside = await page.$$eval('#tasks-timeline .tl-row', (rs) => rs.every((r) => { const time = r.querySelector('.task-time'); const card = r.querySelector('.tl-card'); return time && card && !card.contains(time); }));
    assert(outside, 'timeline: the time column is not inside the item card');
    assert(await page.$('#tasks-timeline .now-line .now-time') !== null, 'the Now row shows the current time');

    // --- History error state ---
    await page.route(`**/api/transactions/${U}?*`, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }));
    await page.evaluate(() => getCache.clear());
    await openTab(page, 'transactions');
    await page.click('.range-pill[data-range="all"]');
    await page.waitForSelector('#txn-error:not([hidden])', { timeout: 15000 });
    assert((await page.textContent('#txn-error .alert-title')) === "Couldn't load your entries" && (await page.$$('#txn-error .skeleton-row')).length === 5 && await page.isVisible('#txn-retry'), 'History error: alert, Try again, 5 skeleton rows');
    await page.unroute(`**/api/transactions/${U}?*`);
    await page.click('#txn-retry');
    await page.waitForSelector('#txn-error', { state: 'hidden', timeout: 15000 });
    assert(await page.isVisible('#txn-full-list'), 'Try again loads the list');

    // --- Screenshots: every tab, light and dark ---
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const tab of ['home', 'tasks', 'transactions', 'budgets', 'networth', 'tax', 'more', 'settings']) {
        await openTab(page, tab);
        await page.waitForTimeout(600);
        await shot(page, `${tab}_${scheme}`);
      }
    }
    // Dark mode keeps the tokens: the page background follows --background.
    const darkBg = await page.evaluate(() => [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.documentElement).getPropertyValue('--background').trim()]);
    assert(darkBg[0] === 'rgb(31, 30, 29)' && darkBg[1].toUpperCase() === '#1F1E1D', `dark background token in use (got ${darkBg})`);
    assert(errors.length === 0, `no page JS errors (got ${JSON.stringify(errors)})`);

    // --- First week: a new user sees Get set up ---
    const fresh = await openApp(browser, N);
    await fresh.page.waitForSelector('#home-setup-list .setup-row', { timeout: 15000 });
    const setup = await fresh.page.$$eval('#home-setup-list .setup-row', (rs) => rs.map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
    assert(setup.length === 4 && (await fresh.page.textContent('#home-setup-count')) === '0 of 4', `checklist with 4 steps, none done (got ${JSON.stringify(setup)})`);
    assert(await fresh.page.isVisible('#home-import') && await fresh.page.isHidden('#add-bill-button') && await fresh.page.isVisible('#home-pulse-note') && await fresh.page.isHidden('#home-pulse'), 'first week: Scan / Speak / Import, a note instead of the pulse');
    await shot(fresh.page, 'home_firstweek_light');
    assert(fresh.errors.length === 0, `no page JS errors for the new user (got ${JSON.stringify(fresh.errors)})`);
  } finally {
    await browser.close();
    await cleanup();
  }
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); console.log('FAIL: crashed'); await cleanup(); process.exit(1); });
