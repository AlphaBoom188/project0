// Tax tab -> "Half-year return (PND 94)" (Phase 6): shown for 40(5)-(8)
// income, Jan-Jun amounts (estimate by default), the PND 94 tax, and the
// tax paid with it credited on the annual return. Also the endpoint's checks.
const { BASE, OUTPUT } = require('../lib');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

require('fs').mkdirSync(OUTPUT, { recursive: true });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const U = `test_taxhalf_${Date.now()}`;
const call = (method, p, body) => fetch(`${BASE}/api${p}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }).then(async (r) => ({ status: r.status, body: await r.json() }));

(async () => {
  await db.from('users').insert({ line_user_id: U, display_name: 'Tax Half UI' });
  const shop = (await call('POST', `/tax/${U}/2569/incomes`, { kind: 'biz_27', amount: 1000000 })).body.income;
  // --- API checks ---
  let r = await call('GET', `/tax/${U}/2569`);
  assert(r.body.halfYear.applicable && r.body.halfYear.tax === 1000 && r.body.halfYear.lines[0].estimated && !('_pnd94' in r.body.profile), 'state includes the PND 94 estimate (1,000); bookkeeping hidden');
  assert((await call('PUT', `/tax/${U}/2569/half-year`, { amounts: { [shop.id]: 2000000 } })).body.error.includes("can't be more than the year's"), 'Jan-Jun above the year -> 400');
  assert((await call('PUT', `/tax/${U}/2569/half-year`, { amounts: { '00000000-0000-0000-0000-000000000000': 1 } })).status === 400, 'unknown income -> 400');
  assert((await call('PUT', `/tax/${U}/2569/half-year`, { prepaid: -5 })).status === 400 && (await call('PUT', `/tax/${U}/2569/half-year`, { amounts: [1] })).status === 400, 'bad prepaid / amounts -> 400');

  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://static.line-scdn.net/**', (route) => route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false,
      getProfile: async () => ({ userId: '${U}', displayName: 'Tax Half UI', pictureUrl: '' }) };` }));
    await page.goto(`${BASE}/liff/`);
    await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });
    await page.click('.nav-tab[data-tab="tax"]');
    await page.waitForSelector('#tax-years .segment', { timeout: 15000 });
    if (!(await page.$('#tax-years .segment.active[data-year="2569"]'))) await page.click('#tax-years [data-year="2569"]');
    await page.waitForSelector('#tax-half:not([hidden])', { timeout: 15000 });

    const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    const expected = today > '2026-09-30' ? 'has closed' : today >= '2026-07-01' ? 'filed' : 'filed';
    assert((await page.textContent('#tax-half-summary')).includes(expected) && (await page.textContent('#tax-half-summary')).includes('1 Jul 2569 to 30 Sep 2569'), 'summary with the 1 Jul - 30 Sep 2569 window');
    assert((await page.textContent('#tax-half-tax')) === '฿1,000' && (await page.innerText('#tax-half-lines')).includes('Estimate: half the year'), 'estimate shown: tax ฿1,000');
    assert((await page.getAttribute('#tax-half-lines [data-half]', 'placeholder')) === '500000', 'placeholder is the half-year estimate');

    await page.fill(`#tax-half-lines [data-half="${shop.id}"]`, '400000');
    await page.fill('#tax-half-prepaid', '1000');
    await Promise.all([page.waitForResponse((x) => x.url().includes('/half-year')), page.click('#tax-half-save')]);
    await page.waitForFunction(() => document.getElementById('tax-half-status').dataset.state === 'done', null, { timeout: 10000 });
    assert((await page.textContent('#tax-half-tax')) === '฿0' && !(await page.innerText('#tax-half-lines')).includes('Estimate'), 'entered amount: 400k - 60% - 30k = 130k -> ฿0');
    const brk = (await page.innerText('#tax-breakdown')).replace(/\s+/g, ' ');
    assert(brk.includes('Paid with PND 94 - ฿1,000') && (await page.textContent('#tax-hero-sub')).includes('paid with PND 94 ฿1,000'), 'credited on the annual return (breakdown and hero)');
    await page.screenshot({ path: `${OUTPUT}/tax_halfyear.png`, fullPage: true });

    // salary only -> no card
    await call('DELETE', `/tax/${U}/2569/incomes/${shop.id}`);
    await call('POST', `/tax/${U}/2569/incomes`, { kind: 'salary', amount: 500000 });
    await page.reload();
    await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });
    await page.click('.nav-tab[data-tab="tax"]');
    await page.waitForSelector('#tax-incomes .tax-income-row', { timeout: 15000 });
    if (!(await page.$('#tax-years .segment.active[data-year="2569"]'))) { await page.click('#tax-years [data-year="2569"]'); await page.waitForTimeout(1500); }
    assert(await page.isHidden('#tax-half'), 'salary only: no PND 94 card');
    assert(errors.length === 0, `no page errors (got ${JSON.stringify(errors)})`);
  } finally {
    await browser.close();
    await db.from('users').delete().eq('line_user_id', U);
  }
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); console.log('FAIL: crashed'); await db.from('users').delete().eq('line_user_id', U); process.exit(1); });
