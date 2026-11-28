// Regressions from the exploratory QA run of 2026-11-23 (docs/QA.md), on the
// synthetic QA seed (scripts/qa-seed.js) for a throwaway test_ user:
//   B2 repeat-payment Undo brings the suggestion back (also for "Not a repeat")
//   B3 Budgets category bars are drawn (the fill <span> was inline: 0x0)
//   B4 History keeps its totals line on 3 Months / All
//   B5 a transfer gets a toast with Undo that also puts both balances back
//   B6 Income with a single category saves without tapping the chip
//   B7 pausing a rule updates Subscriptions & bills without a reload
//   B8 History filter chips and range pills are at least 44px tall
// The voice fix (B1) is in liff/voice_entry; the Typhoon WAV fix in api/voice_wav.
const { BASE, BACKEND, OUTPUT } = require('../lib');
const { chromium } = require('playwright-core');
const { execFileSync } = require('child_process');
const path = require('path');

require('fs').mkdirSync(OUTPUT, { recursive: true });
const U = `test_qafix_${Date.now().toString(36)}`;
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const api = (p, o = {}) => fetch(`${BASE}/api${p}`, { headers: { 'Content-Type': 'application/json' }, ...o }).then((r) => r.json());
const seed = (...extra) => execFileSync(process.execPath, [path.join(BACKEND, 'scripts/qa-seed.js'), '--user', U, '--base', BASE, ...extra], { stdio: 'ignore', timeout: 360000 });

async function waitToast(page, title) {
  await page.waitForFunction((t) => { const n = document.getElementById('toast'); return n && !n.hidden && n.innerText.includes(t); }, title, { timeout: 15000 });
}

(async () => {
  seed();
  const browser = await chromium.launch({ channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://static.line-scdn.net/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false, getIDToken: () => null,
      getProfile: async () => ({ userId: '${U}', displayName: 'QA Fixes', pictureUrl: '' }) };` }));
  await page.goto(`${BASE}/liff/`);
  await page.waitForSelector('#app:not([hidden])', { timeout: 20000 });

  // --- B3: bars on Budgets ---
  await page.evaluate(() => switchTab('budgets'));
  await page.waitForSelector('#categories-list .category-budget-fill.over', { timeout: 15000 });
  const bar = await page.$eval('#categories-list .category-budget-fill.over', (f) => { const r = f.getBoundingClientRect(); return { w: r.width, h: r.height, track: f.parentElement.getBoundingClientRect().width }; });
  assert(bar.h >= 3 && bar.w > 0 && Math.abs(bar.w - bar.track) < 1, `the over-budget bar is drawn at full width (got ${JSON.stringify(bar)})`);
  const warn = await page.$eval('#categories-list .category-budget-fill.warn', (f) => f.getBoundingClientRect().width / f.parentElement.getBoundingClientRect().width);
  assert(warn > 0.8 && warn < 0.9, `the 85% bar fills 85% of its track (got ${warn.toFixed(2)})`);

  // --- B7: pausing a rule updates Subscriptions ---
  const { recurring } = await api(`/recurring/${U}`);
  const mobile = recurring.find((r) => r.description === 'Mobile plan');
  await page.waitForFunction(() => document.getElementById('tab-budgets').innerText.includes('Monthly · QA Wallet · Logs automatically'), null, { timeout: 15000 });
  await page.evaluate((id) => handleToggleRecurringActive(id, false), mobile.id);
  await page.waitForFunction(() => !document.getElementById('tab-budgets').innerText.includes('Monthly · QA Wallet · Logs automatically'), null, { timeout: 10000 }).catch(() => {});
  assert(!(await page.innerText('#tab-budgets')).includes('Monthly · QA Wallet · Logs automatically'), 'pausing a rule drops it from Subscriptions without a reload');
  await page.evaluate((id) => handleToggleRecurringActive(id, true), mobile.id);

  // --- B2: repeat-payment Undo ---
  await page.waitForSelector('[data-repeat]', { timeout: 15000 });
  const key = await page.getAttribute('[data-repeat]', 'data-repeat');
  // B9 (QA re-run): Undo after "Log it automatically" also refreshes the
  // Subscriptions total (it kept counting the removed rule).
  // Anchor to the API's own figure and wait for the screen to show it at each step.
  const apiTotal = async () => Math.round((await api(`/recurring/${U}/overview`)).monthlyTotal);
  const shown = (n) => page.waitForFunction((t) => document.getElementById('tab-budgets').innerText.includes(t), `฿${n.toLocaleString('en-US')} a month`, { timeout: 10000 }).then(() => true, () => false);
  const totalBefore = await apiTotal();
  const beforeShown = await shown(totalBefore);
  await page.click('[data-repeat] [data-repeat-action="accept"]'); // default: Log it automatically
  await waitToast(page, 'Logs itself each month');
  const totalWithRule = await apiTotal();
  const withShown = await shown(totalWithRule);
  await page.click('#toast .toast-undo');
  await page.waitForSelector(`[data-repeat="${key}"]`, { timeout: 15000 }).catch(() => {});
  const afterShown = await shown(totalBefore);
  assert(totalWithRule > totalBefore && beforeShown && withShown && afterShown, `Undo after "Log it" puts the Subscriptions total back (฿${totalBefore} -> ฿${totalWithRule} -> shown again: ${afterShown})`);
  await page.click('[data-repeat] label:has(input[value="remind"])');
  await page.click('[data-repeat] [data-repeat-action="accept"]');
  await waitToast(page, 'Monthly reminder set');
  await page.click('#toast .toast-undo');
  await page.waitForSelector(`[data-repeat="${key}"]`, { timeout: 15000 }).catch(() => {});
  assert(await page.isVisible(`[data-repeat="${key}"]`), 'Undo after "Remind me" brings the suggestion back');
  const ymd = (d) => new Date(d).toISOString().slice(0, 10);
  const { reminders } = await api(`/reminders/${U}?from=${ymd(Date.now())}&to=${ymd(Date.now() + 60 * 86400000)}`);
  assert(Array.isArray(reminders) && !reminders.some((r) => /Electricity/.test(r.title)), 'and the reminder is gone');
  await page.click(`[data-repeat="${key}"] [data-repeat-action="dismiss"]`);
  await waitToast(page, 'Marked as not a repeat');
  assert(await page.isVisible('#toast .toast-undo'), '"Not a repeat" offers Undo');
  await page.click('#toast .toast-undo');
  await page.waitForSelector(`[data-repeat="${key}"]`, { timeout: 15000 }).catch(() => {});
  assert(await page.isVisible(`[data-repeat="${key}"]`), 'Undo after "Not a repeat" brings the suggestion back');
  const { suggestions } = await api(`/recurring/${U}/suggestions`);
  assert(suggestions.some((s) => s.key === key), 'the API lists it again too');

  // --- B4 + B8: History totals and tap sizes ---
  await page.evaluate(() => switchTab('transactions'));
  await page.waitForFunction(() => /entr(y|ies)/.test(document.getElementById('txn-period-sub').textContent), null, { timeout: 15000 });
  for (const range of ['3months', 'all']) {
    await page.click(`.range-pill[data-range="${range}"]`);
    await page.waitForFunction(() => /entr(y|ies)/.test(document.getElementById('txn-period-sub').textContent), null, { timeout: 15000 }).catch(() => {});
    const s = await page.evaluate(() => ({ sub: document.getElementById('txn-period-sub').textContent, visible: document.getElementById('txn-period-sub').offsetParent !== null, label: document.getElementById('txn-period-label').textContent, arrows: getComputedStyle(document.getElementById('txn-period-prev')).visibility }));
    assert(s.visible && /^Spent ฿[\d,]+ · Income ฿[\d,]+ · \d+ entr/.test(s.sub) && s.arrows === 'hidden' && s.label, `${range}: totals stay, arrows hide (got ${JSON.stringify(s)})`);
  }
  await page.click('.range-pill[data-range="cycle"]');
  await page.waitForFunction(() => document.getElementById('txn-period-label').textContent.startsWith('This cycle'), null, { timeout: 10000 });
  assert((await page.$eval('#txn-period-prev', (b) => getComputedStyle(b).visibility)) === 'visible', 'Cycle shows the arrows again');
  const small = await page.$$eval('#tab-transactions .chip, #tab-transactions .range-pill', (els) => els.filter((e) => e.offsetParent).map((e) => [e.id || e.textContent.trim(), Math.round(e.getBoundingClientRect().height)]).filter(([, h]) => h < 44));
  assert(small.length === 0, `History chips and pills are >= 44px (too small: ${JSON.stringify(small)})`);

  // --- B6: Income with its only category ---
  await page.evaluate(() => switchTab('home'));
  // Slow expense categories + an immediate tap on Income: the late expense
  // reply must not replace the income chips (stale guard; found by this suite under load).
  const slowExpense = async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); };
  await page.route(/\/api\/categories\/[^/?]+\?type=expense/, slowExpense);
  await page.evaluate(() => getCache.clear());
  await page.click('#fab-add');
  await page.waitForSelector('#add-expense-modal:not([hidden])');
  await page.click('[data-entry-type="income"]');
  await page.waitForTimeout(2000);
  await page.unroute(/\/api\/categories\/[^/?]+\?type=expense/, slowExpense);
  await page.waitForSelector('#category-chips .chip[aria-pressed="true"]', { timeout: 10000 }).catch(() => {});
  assert((await page.$$eval('#category-chips .chip[aria-pressed="true"]', (c) => c.map((x) => x.textContent.trim()))).join() === 'Income', 'the only income category is pre-selected');
  await page.fill('#field-amount', '777');
  await page.fill('#field-description', 'QA fixes income');
  await page.click('#add-entry-save');
  await waitToast(page, 'Saved ฿777 to Income');
  assert(true, 'income saves without tapping the chip');

  // --- B5: transfer toast with Undo ---
  const before = Object.fromEntries((await api(`/accounts/${U}`)).accounts.map((a) => [a.account_name, Number(a.balance)]));
  await page.evaluate(() => openTransferModal());
  await page.waitForSelector('#transfer-modal:not([hidden])');
  await page.selectOption('#transfer-field-from', { label: 'QA Savings' });
  await page.selectOption('#transfer-field-to', { label: 'QA Wallet' });
  await page.fill('#transfer-field-amount', '321');
  await page.click('#transfer-form button[type="submit"]');
  await waitToast(page, 'Moved ฿321');
  assert((await page.innerText('#toast')).includes('QA Savings → QA Wallet') && (await page.isVisible('#toast .toast-undo')), 'transfer toast names both accounts and offers Undo');
  const mid = Object.fromEntries((await api(`/accounts/${U}`)).accounts.map((a) => [a.account_name, Number(a.balance)]));
  assert(mid['QA Savings'] === before['QA Savings'] - 321 && mid['QA Wallet'] === before['QA Wallet'] + 321, 'the transfer moved both balances');
  await page.click('#toast .toast-undo');
  await waitToast(page, 'Transfer removed');
  const after = Object.fromEntries((await api(`/accounts/${U}`)).accounts.map((a) => [a.account_name, Number(a.balance)]));
  assert(after['QA Savings'] === before['QA Savings'] && after['QA Wallet'] === before['QA Wallet'], `Undo puts both balances back (got ${JSON.stringify(after)})`);
  const { transactions } = await api(`/transactions/${U}?type=transfer&limit=200`);
  assert(!transactions.some((t) => Number(t.amount) === 321), 'and deletes the transfer');

  await page.screenshot({ path: `${OUTPUT}/qa_fixes_2026_11_23.png` });
  assert(errors.length === 0, `no page JS errors (got ${JSON.stringify(errors)})`);
  await browser.close();
  seed('--reset');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e.message.split('\n')[0]); try { seed('--reset'); } catch {} process.exit(1); });
