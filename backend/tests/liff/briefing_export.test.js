// LIFF: Settings -> Morning briefing toggle, the ?tab=tasks deep link (the
// briefing's "Open Tasks"), and Tax -> Filing -> Summary / CSV export, which
// open a signed link in the phone's browser (liff.openWindow external).
const { BASE } = require('../lib');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const U = `test_brexp_${Date.now()}`;

(async () => {
  await db.from('users').insert({ line_user_id: U, display_name: 'Brief Export UI' });
  await fetch(`${BASE}/api/tax/${U}/2569/incomes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'salary', amount: 800000 }) });
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://static.line-scdn.net/**', (route) => route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow(o) { (window.__opened ||= []).push(o); }, isApiAvailable: () => false,
      getProfile: async () => ({ userId: '${U}', displayName: 'Brief Export UI', pictureUrl: '' }) };` }));

    // --- Deep link ?tab=tasks ---
    await page.goto(`${BASE}/liff/?tab=tasks`);
    await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });
    await page.waitForSelector('#tab-tasks:not([hidden])', { timeout: 10000 });
    await page.waitForSelector('#week-strip .week-day', { timeout: 10000 }).catch(() => {});
    assert(await page.isVisible('#week-strip .week-day') && (await page.getAttribute('.nav-tab[data-tab="tasks"]', 'class')).includes('active'), '?tab=tasks opens the Tasks tab');

    // --- Settings toggle ---
    await page.click('.nav-tab[data-tab="settings"]');
    await page.waitForSelector('#setting-morning-briefing', { state: 'visible' });
    assert(!(await page.isChecked('#setting-morning-briefing')), 'off by default');
    await Promise.all([page.waitForResponse((r) => r.url().includes('/preferences') && r.request().method() === 'PATCH'), page.check('#setting-morning-briefing')]);
    const row = (await db.from('users').select('morning_briefing').eq('line_user_id', U).single()).data;
    assert(row.morning_briefing === true, 'turned on and saved');

    // --- Tax export ---
    await page.click('.nav-tab[data-tab="tax"]');
    await page.waitForSelector('#tax-years .segment', { timeout: 15000 });
    if (!(await page.$('#tax-years .segment.active[data-year="2569"]'))) await page.click('#tax-years [data-year="2569"]');
    await page.waitForSelector('#tax-incomes .tax-income-row', { timeout: 15000 });
    await Promise.all([page.waitForResponse((r) => r.url().includes('/export-link')), page.click('#tax-export-pdf')]);
    await page.waitForFunction(() => (window.__opened || []).length === 1, null, { timeout: 5000 });
    const opened = await page.evaluate(() => window.__opened[0]);
    assert(opened.external === true && opened.url.includes(`/api/tax/${U}/2569/export?`) && /sig=[0-9a-f]{64}/.test(opened.url), 'opens the signed summary link in the phone\'s browser');
    const html = await (await fetch(opened.url)).text();
    assert(html.includes('Tax summary, tax year 2569') && html.includes('฿800,000'), 'the opened page is the summary');
    assert((await page.textContent('#tax-export-status')).includes('Print or Share'), 'status explains how to save a PDF');
    await page.click('#tax-export-csv');
    await page.waitForFunction(() => (window.__opened || []).length === 2, null, { timeout: 5000 });
    assert((await page.evaluate(() => window.__opened[1].url)).includes('format=csv'), 'CSV opens too');
    assert(errors.length === 0, `no page errors (got ${JSON.stringify(errors)})`);
    await ctx.close();
  } finally {
    await browser.close();
    await db.from('users').delete().eq('line_user_id', U);
  }
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); console.log('FAIL: crashed'); await db.from('users').delete().eq('line_user_id', U); process.exit(1); });
