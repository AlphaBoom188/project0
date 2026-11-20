// Tax tab -> "Lower your tax" planner and the "Filing" guide (Phase 4):
// ranked options, tap-through to the deduction sheet, documents checklist
// (kept on the phone), steps, figures to enter, and LINE reminders.
const { BASE, OUTPUT } = require('../lib');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

require('fs').mkdirSync(OUTPUT, { recursive: true });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const U = `test_taxplan_${Date.now()}`;
const call = (method, p, body) => fetch(`${BASE}/api${p}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }).then((r) => r.json());

(async () => {
  await db.from('users').insert({ line_user_id: U, display_name: 'Tax Plan UI' });
  await call('POST', `/tax/${U}/2569/incomes`, { kind: 'salary', amount: 1000000, withheld: 50000 });
  await call('PUT', `/tax/${U}/2569/claims`, { life_insurance: 20000 });
  await call('POST', `/tax/${U}/2568/incomes`, { kind: 'salary', amount: 500000 });
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://static.line-scdn.net/**', (route) => route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false,
      getProfile: async () => ({ userId: '${U}', displayName: 'Tax Plan UI', pictureUrl: '' }) };` }));
    const open2569 = async () => {
      await page.goto(`${BASE}/liff/`);
      await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });
      await page.click('.nav-tab[data-tab="tax"]');
      await page.waitForSelector('#tax-years .segment', { timeout: 15000 });
      if (!(await page.$('#tax-years .segment.active[data-year="2569"]'))) await page.click('#tax-years [data-year="2569"]');
      await page.waitForSelector('#tax-incomes .tax-income-row', { timeout: 15000 });
    };
    await open2569();

    // --- Planner ---
    const rows = await page.$$eval('#tax-plan .tax-plan-row', (rs) => rs.map((r) => r.innerText.replace(/\s+/g, ' ')));
    assert(rows.length >= 5 && rows[0].includes('Donations counted twice') && rows[0].includes('back per ฿1,000'), `ranked options, x2 donations first (got ${rows[0]})`);
    const esg = rows.find((r) => r.startsWith('ThaiESG'));
    assert(esg && esg.includes('Put in up to ฿300,000') && esg.includes('Save ฿'), 'ThaiESG: room and saving');
    const life = rows.find((r) => r.startsWith('Life insurance'));
    assert(life && life.includes('Put in up to ฿80,000'), 'life insurance room accounts for the 20,000 claimed');
    assert(/\d+ days? left to 31 Dec/.test(await page.textContent('#tax-plan-days')), 'days left to 31 Dec');
    assert((await page.textContent('#tax-plan-combined')).startsWith('Doing all of these together'), 'all-together line');
    await page.click('#tax-plan [data-deduction="thai_esg"]');
    await page.waitForSelector('#tax-deduction-modal:not([hidden])');
    assert((await page.textContent('#tax-deduction-title')).startsWith('ThaiESG'), 'tapping an option opens its deduction sheet');
    await page.click('#tax-deduction-cancel');

    // --- Filing guide ---
    const summary = await page.textContent('#tax-filing-summary');
    assert(summary.startsWith('File PND 91 between 1 Jan 2570 and 31 Mar 2570 on paper'), `2569 summary (got ${summary})`);
    const docs = await page.$$eval('#tax-docs .tax-doc', (ds) => ds.map((d) => d.textContent.trim()));
    assert(docs.length === 2 && docs[0].includes('50 ทวิ') && docs[1].includes('Life insurance'), `documents (got ${JSON.stringify(docs)})`);
    await page.check('#tax-docs [data-doc="salary"]');
    assert((await page.$$('#tax-steps li')).length === 5, 'five steps');
    await page.click('#tax-enter-details summary');
    const enter = await page.innerText('#tax-enter');
    assert(enter.includes('Salary, wages, bonus') && enter.includes('฿1,000,000') && enter.includes('withheld ฿50,000') && enter.includes('Personal allowance'), 'figures to enter');

    // --- LINE reminders ---
    await Promise.all([page.waitForResponse((r) => r.url().endsWith('/2569/reminders') && r.request().method() === 'POST'), page.click('#tax-remind')]);
    await page.waitForSelector('#tax-remind-list:not([hidden]) li', { timeout: 10000 });
    const rem = await page.$$eval('#tax-remind-list li', (ls) => ls.map((l) => l.innerText.replace(/\s+/g, ' ')));
    assert(rem.length >= 2 && rem.some((r) => r.includes('Last day to file your PND 91') && r.includes('31 Mar 2570')), `reminders listed with Thai-year dates (got ${JSON.stringify(rem)})`);
    assert((await page.textContent('#tax-remind')) === 'Update LINE reminders' && (await page.textContent('#tax-remind-status')).startsWith('Done.'), 'button and status update');
    assert((await db.from('reminders').select('id').eq('line_user_id', U)).data.length === rem.length, 'they are real reminders');
    await page.screenshot({ path: `${OUTPUT}/tax_plan_filing.png`, fullPage: true });

    // documents ticks survive a reload (kept on the phone)
    await open2569();
    assert(await page.isChecked('#tax-docs [data-doc="salary"]') && !(await page.isChecked('#tax-docs [data-doc="life_insurance"]')), 'document ticks kept on the phone');
    await Promise.all([page.waitForResponse((r) => r.url().endsWith('/2569/reminders') && r.request().method() === 'DELETE'), page.click('#tax-remind-clear')]);
    await page.waitForSelector('#tax-remind-list', { state: 'hidden', timeout: 10000 });
    assert((await db.from('reminders').select('id').eq('line_user_id', U)).data.length === 0, 'Remove reminders deletes them');

    // --- 2568: over ---
    await page.click('#tax-years [data-year="2568"]');
    await page.waitForFunction(() => document.querySelector('#tax-years .segment.active').dataset.year === '2568' && document.getElementById('tax-filing-summary').textContent.length > 0, null, { timeout: 10000 });
    assert((await page.textContent('#tax-plan-reason')).includes('has ended') && await page.isHidden('#tax-plan'), '2568 planner: over');
    assert((await page.textContent('#tax-filing-summary')).startsWith('The PND 91 deadline was 8 Apr 2569') && await page.isHidden('#tax-remind') && (await page.textContent('#tax-filing-when')) === 'Deadline passed', '2568 filing: late, no reminder button');
    assert(errors.length === 0, `no page errors (got ${JSON.stringify(errors)})`);
    await ctx.close();
  } finally {
    await browser.close();
    await db.from('users').delete().eq('line_user_id', U);
  }
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); console.log('FAIL: crashed'); await db.from('users').delete().eq('line_user_id', U); process.exit(1); });
