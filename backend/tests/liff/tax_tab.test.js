// Tax tab (liff-app/tax.js): year switch, the pay/refund hero, income sheet
// (shortcuts, expense method, dividend credit), profile sheet, deduction
// checklist with limits, and the breakdown. Figures come from the API
// (services/tax/taxMath.js); this checks the app shows them.
const { BASE, OUTPUT } = require('../lib');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

require('fs').mkdirSync(OUTPUT, { recursive: true });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const U = `test_taxui_${Date.now()}`;
const text = (page, sel) => page.textContent(sel).then((t) => t.replace(/\s+/g, ' ').trim());

(async () => {
  await db.from('users').insert({ line_user_id: U, display_name: 'Tax UI Test' });
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await (await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://static.line-scdn.net/**', (route) => route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false,
      getProfile: async () => ({ userId: '${U}', displayName: 'Tax UI Test', pictureUrl: '' }) };` }));
    await page.goto(`${BASE}/liff/`);
    await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });

    // --- Nav: seven tabs fit at 360px ---
    const nav = await page.$$eval('.nav-tab', (ts) => ts.map((t) => ({ tab: t.dataset.tab, label: t.textContent.trim(), over: t.scrollWidth > t.clientWidth + 1 })));
    assert(nav.length === 7 && nav[5].tab === 'tax' && nav[4].label === 'Wealth' && nav.every((n) => !n.over), `seven tabs, Tax sixth, no overflow at 360px (got ${JSON.stringify(nav.map((n) => n.label))})`);

    await page.click('.nav-tab[data-tab="tax"]');
    await page.waitForSelector('#tax-years .segment', { timeout: 15000 });
    const years = await page.$$eval('#tax-years .segment', (bs) => bs.map((b) => `${b.textContent}${b.classList.contains('active') ? '*' : ''}`));
    assert(years.join() === 'Tax year 2568,Tax year 2569*', `years, the current one selected in November (got ${years})`);
    assert((await text(page, '#tax-hero-label')) === 'Your tax' && (await text(page, '#tax-hero-sub')).startsWith('Add your income'), 'empty state hero');
    assert(await page.isVisible('#tax-incomes-empty') && (await text(page, '#tax-profile-text')) === 'Single · no children', 'empty income, default profile');
    assert(await page.isVisible('#tax-warnings') && (await text(page, '#tax-warnings')).includes('uses the 2568 rules'), '2569 says it uses the 2568 rules');

    // --- Add salary through the shortcut (iTAX example + personal allowance) ---
    await page.click('#fab-add');
    await page.waitForSelector('#tax-income-modal:not([hidden])');
    assert((await page.$$('#tax-shortcuts .tax-shortcut')).length === 6, 'six shortcuts');
    await page.click('#tax-shortcuts [data-kind="salary"]');
    assert((await page.inputValue('#tax-income-kind')) === 'salary' && (await text(page, '#tax-income-kind-help')).includes('40(1)') && await page.isHidden('#tax-expense-block'), 'salary: type help, no expense choice');
    await page.fill('#tax-income-amount', '500,000');
    await page.fill('#tax-income-withheld', '5000');
    await page.fill('#tax-income-payer', 'Acme Co');
    await Promise.all([page.waitForResponse((r) => r.url().includes('/incomes') && r.request().method() === 'POST'), page.click('#tax-income-save')]);
    await page.waitForSelector('#tax-income-modal', { state: 'hidden' });
    assert((await text(page, '#tax-hero-label')) === 'Tax to pay' && (await text(page, '#tax-hero-amount')) === '฿6,500', `hero: pay 6,500 (got ${await text(page, '#tax-hero-amount')})`);
    assert((await text(page, '#tax-hero-sub')) === 'Tax ฿11,500 · withheld ฿5,000', 'hero sub line');
    assert((await text(page, '#tax-hero-filing')).startsWith('File PND 91') && (await text(page, '#tax-hero-filing')).includes('You can pay in 3 instalments'), 'filing line: PND 91, instalments');
    const inc = await text(page, '#tax-incomes .tax-income-row');
    assert(inc.includes('40(1) · Acme Co') && inc.includes('Salary') && inc.includes('Acme Co') && inc.includes('฿500,000') && (await text(page, '#tax-incomes .tax-total-row')).includes('฿500,000'), `income row and total (got ${inc})`);
    const brk = (await page.innerText('#tax-breakdown')).replace(/\s+/g, ' ');
    assert(brk.includes('Net income ฿340,000') && brk.includes('5% on ฿150,000 ฿7,500') && brk.includes('10% on ฿40,000 ฿4,000') && brk.includes('To pay ฿6,500'), `breakdown (got ${brk})`);

    // --- Deductions checklist ---
    const personal = await text(page, '[data-deduction="personal"]');
    assert(personal.includes('Everyone gets this'), 'personal allowance row');
    assert(!(await page.$('[data-deduction="spouse"]')), 'spouse row hidden while single');
    await page.click('[data-deduction="rmf"]');
    await page.waitForSelector('#tax-deduction-modal:not([hidden])');
    assert((await text(page, '#tax-deduction-help')).includes('Up to 30% of your income') && (await text(page, '#tax-deduction-help')).includes('up to ฿150,000'), 'RMF help shows the personal limit');
    await page.fill('#tax-deduction-amount', '200000');
    await Promise.all([page.waitForResponse((r) => r.url().includes('/claims')), page.click('#tax-deduction-save')]);
    await page.waitForSelector('#tax-deduction-modal', { state: 'hidden' });
    const rmf = await text(page, '.tax-ded-row:has([data-deduction="rmf"])');
    assert(rmf.includes('paid ฿200,000 · capped') && rmf.includes('฿150,000'), `RMF capped at 150,000 (got ${rmf})`);
    assert((await text(page, '#tax-hero-amount')) === '฿3,000' && (await text(page, '#tax-hero-label')) === 'Refund', `refund 3,000 after RMF (190k net -> 2,000 tax, 5,000 withheld) (got ${await text(page, '#tax-hero-label')} ${await text(page, '#tax-hero-amount')})`);
    // count input
    await page.click('[data-deduction="parents"]');
    await page.fill('#tax-deduction-amount', '2');
    await Promise.all([page.waitForResponse((r) => r.url().includes('/claims')), page.click('#tax-deduction-save')]);
    await page.waitForSelector('#tax-deduction-modal', { state: 'hidden' });
    assert((await text(page, '.tax-ded-row:has([data-deduction="parents"])')).includes('2 people'), 'parents: 2 people');
    // remove
    await page.click('[data-deduction="parents"]');
    await Promise.all([page.waitForResponse((r) => r.url().includes('/claims')), page.click('#tax-deduction-remove')]);
    await page.waitForSelector('#tax-deduction-modal', { state: 'hidden' });
    assert((await text(page, '.tax-ded-row:has([data-deduction="parents"])')).includes('Up to ฿120,000'), 'removed claim shows its limit again');
    // bad input
    await page.click('[data-deduction="parents"]');
    await page.fill('#tax-deduction-amount', '9');
    await page.click('#tax-deduction-save');
    await page.waitForSelector('#tax-deduction-error:not([hidden])');
    assert((await text(page, '#tax-deduction-error')).includes('whole number up to 4'), 'server validation shown in the sheet');
    await page.click('#tax-deduction-cancel');

    // --- Profile: married, spouse no income, 2 children ---
    await page.click('#tax-profile-summary');
    await page.waitForSelector('#tax-profile-modal:not([hidden])');
    assert(await page.isHidden('#tax-spouse-row'), 'spouse question hidden while single');
    await page.selectOption('#tax-marital', 'married');
    await page.uncheck('#tax-spouse-income');
    await page.click('#tax-add-child');
    await page.click('#tax-add-child');
    const kids = await page.$$('.tax-child-year');
    await kids[0].fill('2560');
    await kids[1].fill('2563');
    await Promise.all([page.waitForResponse((r) => r.url().includes('/profile')), page.click('#tax-profile-save')]);
    await page.waitForSelector('#tax-profile-modal', { state: 'hidden' });
    assert((await text(page, '#tax-profile-text')) === 'Married · spouse has no income · 2 children', 'profile summary');
    assert((await text(page, '.tax-ded-row:has([data-deduction="spouse"])')).includes('฿60,000') && (await text(page, '.tax-ded-row:has([data-deduction="children"])')).includes('฿90,000'), 'spouse 60k and children 90k from the profile');

    // --- Freelance with actual expenses on a 40(8) line -> PND 90 ---
    await page.click('#tax-add-income');
    await page.selectOption('#tax-income-kind', 'biz_17');
    assert(await page.isVisible('#tax-expense-block') && (await text(page, '#tax-expense-flat')) === 'Flat 60%', 'Grab line offers flat 60% or actual');
    await page.click('#tax-expense-method [data-method="actual"]');
    await page.fill('#tax-income-amount', '200000');
    await page.fill('#tax-income-actual', '50000');
    await Promise.all([page.waitForResponse((r) => r.url().includes('/incomes') && r.request().method() === 'POST'), page.click('#tax-income-save')]);
    await page.waitForSelector('#tax-income-modal', { state: 'hidden' });
    assert((await text(page, '#tax-hero-filing')).startsWith('File PND 90'), 'mixed income -> PND 90');
    assert((await page.$$eval('#tax-incomes .tax-income-row', (rs) => rs.length)) === 2 && (await text(page, '#tax-incomes .tax-income-row >> nth=1')).includes('expenses ฿50,000'), 'actual expenses used');

    // --- Edit + validation + delete ---
    await page.click('#tax-incomes [data-income] >> nth=1');
    await page.waitForSelector('#tax-income-modal:not([hidden])');
    assert(await page.isHidden('#tax-shortcuts') && (await page.inputValue('#tax-income-actual')) === '50000', 'edit sheet prefilled, no shortcuts');
    await page.fill('#tax-income-withheld', '999999');
    await page.click('#tax-income-save');
    await page.waitForSelector('#tax-income-error:not([hidden])');
    assert((await text(page, '#tax-income-error')).includes("can't be more than the income"), 'withheld above income refused');
    await page.click('#tax-income-delete');
    await page.click('#confirm-ok');
    await page.waitForSelector('#tax-income-modal', { state: 'hidden' });
    assert((await page.$$eval('#tax-incomes .tax-income-row', (rs) => rs.length)) === 1, 'deleted');

    // --- Dividends: credit select ---
    await page.click('#tax-add-income');
    await page.click('#tax-shortcuts [data-kind="dividend_th"]');
    assert(await page.isVisible('#tax-credit-field') && (await page.inputValue('#tax-income-credit')) === '0.2' && await page.isVisible('#tax-credit-help'), 'dividends: 20% credit preselected, with the 10%-final note');
    await page.click('#tax-income-cancel');

    await page.screenshot({ path: `${OUTPUT}/tax_light.png`, fullPage: true });
    await page.evaluate(() => setTheme('dark'));
    await page.screenshot({ path: `${OUTPUT}/tax_dark.png`, fullPage: true });

    // --- Year switch: 2568 is separate and its deadline has passed ---
    await page.click('#tax-years [data-year="2568"]');
    await page.waitForFunction(() => document.querySelector('#tax-years .segment.active').dataset.year === '2568', null, { timeout: 10000 });
    await page.waitForSelector('#tax-incomes-empty:not([hidden])', { timeout: 10000 });
    assert(!(await page.isVisible('#tax-warnings')) || !(await text(page, '#tax-warnings')).includes('uses the 2568 rules'), '2568 has no carried-over warning');
    assert(await page.$('[data-deduction="easy_ereceipt"]'), '2568 shows Easy E-Receipt');
    await page.click('#tax-add-income');
    await page.click('#tax-shortcuts [data-kind="salary"]');
    await page.fill('#tax-income-amount', '600000');
    await Promise.all([page.waitForResponse((r) => r.url().includes('/2568/incomes')), page.click('#tax-income-save')]);
    await page.waitForSelector('#tax-income-modal', { state: 'hidden' });
    assert((await text(page, '#tax-hero-filing')).startsWith('The PND 91 deadline was 8 Apr 2569'), `2568: deadline passed message (got ${await text(page, '#tax-hero-filing')})`);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal scroll at 360px');
    assert(errors.length === 0, `no page errors (got ${JSON.stringify(errors)})`);
    await page.context().close();
  } finally {
    await browser.close();
    await db.from('users').delete().eq('line_user_id', U);
  }
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); console.log('FAIL: crashed'); await db.from('users').delete().eq('line_user_id', U); process.exit(1); });
