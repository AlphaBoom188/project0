// Home -> Groups section, the group sheet and the group bill sheet (pay with
// PromptPay QR / bank details, send a slip; owner confirms or cancels), plus
// Settings -> Get Paid, on data seeded by tests/fixtures/groupSeed.js.
// qrcode-generator (cdnjs) is stubbed so the QR check runs offline.
const { BASE, FIXTURES, OUTPUT } = require('../lib');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');
const { seedGroups } = require(`${FIXTURES}/groupSeed.js`);

require('fs').mkdirSync(OUTPUT, { recursive: true });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const LONER = `test_grp_loner_${Date.now()}`;
const QR_STUB = `window.qrcode = function () { let d = ''; return { addData(x) { d = x; }, make() {}, createSvgTag() { return '<svg data-qr="' + d + '" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'; } }; };`;

async function openApp(browser, userId, { path = '', blockQr = false } = {}) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  const errors = [];
  const userPosts = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/api/users')) userPosts.push(JSON.parse(r.postData() || '{}')); });
  await page.route('https://static.line-scdn.net/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false,
      getProfile: async () => ({ userId: '${userId}', displayName: 'Group Card Test', pictureUrl: '' }) };` }));
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/**', (route) => (blockQr ? route.abort() : route.fulfill({ contentType: 'application/javascript', body: QR_STUB })));
  await page.goto(`${BASE}/liff/${path}`);
  await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });
  return { page, errors, userPosts };
}

const parts = (page, sel) => page.$$eval(sel, (ls) => ls.map((l) => [...l.querySelectorAll('.category-name, .category-row-top > span:last-child, .bill-status-pill')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));

let seed;
(async () => {
  seed = await seedGroups(db);
  const { ids, G, bills } = seed;
  const browser = await chromium.launch({ channel: 'chrome' });

  // --- Ann: Home card and group sheet ---
  const ann = await openApp(browser, ids.A);
  let page = ann.page;
  await page.waitForSelector('#home-groups:not([hidden])', { timeout: 30000 }).catch(() => {});
  const rows = await page.$$eval('#groups-list .group-row', (rs) => rs.map((r) => ({
    name: r.querySelector('.category-name').textContent, pill: r.querySelector('.bill-status-pill').textContent,
    cls: r.querySelector('.bill-status-pill').className, sub: r.querySelector('.category-bar-label-row').textContent.trim(), h: r.getBoundingClientRect().height,
  })));
  assert(rows.length === 2 && rows[0].name === 'Test Trip' && rows[1].name === 'LINE chat', `two rows, newest first; an unnamed room shows "LINE chat" (got ${JSON.stringify(rows.map((r) => r.name))})`);
  assert(rows[0].pill === 'Owed to you ฿200.00' && rows[0].cls.includes('paid') && rows[0].sub === '2 open bills · 3 members', `Test Trip: owed 200, 2 open bills (got ${JSON.stringify(rows[0])})`);
  assert(rows[1].pill === 'All paid' && rows[1].cls.includes('settled') && rows[1].sub === '0 open bills · 2 members', 'room: all paid');
  assert(rows.every((r) => r.h >= 56), 'rows use the shared 56px row height');
  assert(ann.userPosts[0] && ann.userPosts[0].via === undefined, 'a normal app open is not marked as a group-bill visit');

  await page.click('#groups-list .group-row >> nth=0');
  await page.waitForFunction(() => document.getElementById('group-detail-title').textContent === 'Test Trip', null, { timeout: 10000 }).catch(() => {});
  assert((await page.textContent('#group-detail-meta')) === '3 members' && (await page.textContent('#group-detail-mine')) === 'Owed to you ฿200.00', 'group sheet: members and my total');
  const open = await parts(page, '#group-detail-open li');
  assert(JSON.stringify(open) === JSON.stringify(['taxi | 0 of 1 paid', 'ข้าว | 1 of 2 paid']), `open bills with status pills (got ${JSON.stringify(open)})`);
  const closed = await parts(page, '#group-detail-closed li');
  assert(JSON.stringify(closed) === JSON.stringify(['เค้ก | Fully paid']), `closed bills (got ${JSON.stringify(closed)})`);
  assert((await page.textContent('#group-detail-open li >> nth=1 >> .category-bar-label-row')).startsWith('You paid ฿600.00'), 'my own bill says "You paid"');
  assert((await page.textContent('.group-hint')).includes('+ข้าว 600'), 'the sheet explains bills start in the chat');
  await page.context().close();

  // --- Cee arrives from the card's Pay button (deep link) ---
  const cee = await openApp(browser, ids.C, { path: `?groupbill=${bills.rice}` });
  page = cee.page;
  assert(cee.userPosts[0] && cee.userPosts[0].via === 'group_bill', 'opening from a group bill marks the login as a group-bill visit (no ledger copies)');
  await page.waitForSelector('#group-bill-modal:not([hidden])', { timeout: 15000 }).catch(() => {});
  await page.waitForFunction(() => document.getElementById('gbill-title').textContent === 'ข้าว', null, { timeout: 10000 }).catch(() => {});
  assert((await page.textContent('#gbill-amount')) === '฿600.00' && (await page.textContent('#gbill-meta')).startsWith('Ann paid ·') && (await page.textContent('#gbill-progress')) === '1 of 2 paid · ฿200.00 to go', 'bill sheet: title, amount, who paid, progress');
  assert(!(await page.isHidden('#gbill-pay')) && (await page.textContent('#gbill-pay-title')) === 'Pay ฿200.00 to Ann', 'pay section for what I owe');
  await page.waitForSelector('#gbill-qr svg', { timeout: 5000 }).catch(() => {});
  const qr = await page.getAttribute('#gbill-qr svg', 'data-qr').catch(() => null);
  assert(qr && qr.startsWith('000201010212') && qr.includes('5406200.00'), 'PromptPay QR for exactly ฿200.00');
  assert((await page.textContent('#gbill-promptpay')) === '081-234-5678' && (await page.textContent('#gbill-bank-no')) === '1234567890' && (await page.textContent('#gbill-bank-holder')) === 'Ann Example', 'PromptPay number and bank details');
  const shares = await parts(page, '#gbill-shares li');
  assert(JSON.stringify(shares) === JSON.stringify(['Ann | ฿200.00 | Paid the bill', 'Bo | ฿200.00 | Paid · 1st', 'Cee (you) | ฿200.00 | Unpaid']), `who paid (got ${JSON.stringify(shares)})`);
  await page.screenshot({ path: `${OUTPUT}/group_bill_pay_light.png`, fullPage: true });

  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/slip') && r.request().method() === 'POST', { timeout: 20000 }),
    page.setInputFiles('#gbill-slip-input', `${FIXTURES}/receipt.jpg`),
  ]);
  await page.waitForFunction(() => document.getElementById('gbill-slip-status').dataset.state === 'done', null, { timeout: 15000 }).catch(() => {});
  assert((await page.textContent('#gbill-slip-status')).startsWith('Slip sent.'), `slip sent status (got "${await page.textContent('#gbill-slip-status')}")`);
  const afterSlip = await parts(page, '#gbill-shares li');
  assert(afterSlip[2] === 'Cee (you) | ฿200.00 | Slip sent' && (await page.textContent('#gbill-slip-label')) === 'Replace slip', 'my row says "Slip sent"; the button offers to replace it');
  assert((await page.$('#gbill-shares a.link-button')) !== null, 'I can view my own slip');
  await page.evaluate(() => setTheme('dark'));
  await page.screenshot({ path: `${OUTPUT}/group_bill_pay_dark.png`, fullPage: true });
  await page.evaluate(() => setTheme('system'));
  assert(cee.errors.length === 0, `no page JS errors (got ${JSON.stringify(cee.errors)})`);
  await page.context().close();

  // --- Ann (owner) confirms ---
  const owner = await openApp(browser, ids.A, { path: `?groupbill=${bills.rice}` });
  page = owner.page;
  await page.waitForSelector('#gbill-shares button[data-act="confirm"]', { timeout: 15000 }).catch(() => {});
  assert(await page.isHidden('#gbill-pay'), 'the owner has nothing to pay');
  const ceeActions = await page.$$eval('#gbill-shares li:nth-child(3) .gbill-actions > *', (els) => els.map((e) => e.textContent));
  assert(JSON.stringify(ceeActions) === JSON.stringify(['View slip', 'Confirm', 'Reject']), `owner sees View slip / Confirm / Reject on Cee's row (got ${JSON.stringify(ceeActions)})`);
  assert(!(await page.isHidden('#gbill-cancel')), 'owner can cancel the collection');
  await page.screenshot({ path: `${OUTPUT}/group_bill_owner.png`, fullPage: true });
  await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/confirm'), { timeout: 20000 }),
    page.click('#gbill-shares button[data-act="confirm"]'),
  ]);
  await page.waitForFunction(() => document.getElementById('gbill-progress').textContent === 'Fully paid', null, { timeout: 15000 }).catch(() => {});
  assert((await page.textContent('#gbill-progress')) === 'Fully paid' && (await page.isHidden('#gbill-cancel')), 'confirmed: fully paid, no cancel button');
  assert((await parts(page, '#gbill-shares li'))[2] === 'Cee | ฿200.00 | Paid · 2nd', 'Cee paid 2nd');
  await page.click('#close-group-bill');
  assert(await page.isHidden('#group-bill-modal'), 'Close hides the bill sheet');

  // --- Settings: get paid ---
  await page.click('[data-tab="settings"]');
  await page.waitForFunction(() => document.getElementById('setting-promptpay').value === '0812345678', null, { timeout: 10000 }).catch(() => {});
  assert((await page.inputValue('#setting-promptpay')) === '0812345678' && (await page.inputValue('#setting-bank-no')) === '1234567890', 'Settings shows my saved payment details');
  await page.fill('#setting-promptpay', '12345');
  await page.click('#save-payment-details');
  await page.waitForSelector('#payment-details-status[data-state="error"]', { timeout: 10000 }).catch(() => {});
  assert((await page.textContent('#payment-details-status')).startsWith('PromptPay ID must be'), 'a bad PromptPay ID shows the error');
  await page.fill('#setting-promptpay', '089-999-0000');
  await page.click('#save-payment-details');
  await page.waitForFunction(() => document.getElementById('payment-details-status').textContent === 'Saved.', null, { timeout: 10000 }).catch(() => {});
  assert((await page.inputValue('#setting-promptpay')) === '0899990000', 'saved and normalized');
  assert(owner.errors.length === 0, `no page JS errors (got ${JSON.stringify(owner.errors)})`);
  await page.context().close();

  // --- Cee cancels the taxi bill; the QR CDN is blocked for Bo ---
  const bo = await openApp(browser, ids.B, { path: `?groupbill=${bills.taxi}`, blockQr: true });
  await bo.page.waitForFunction(() => document.getElementById('gbill-title').textContent === 'taxi', null, { timeout: 15000 }).catch(() => {});
  assert(!(await bo.page.isHidden('#gbill-no-details')) && (await bo.page.textContent('#gbill-no-details')).startsWith("Cee hasn't added PromptPay or bank details"), 'no payment details: a clear hint, slip upload still offered');
  await bo.page.context().close();

  await db.from('users').update({ promptpay_id: '0812345678' }).eq('line_user_id', ids.C);
  const bo2 = await openApp(browser, ids.B, { path: `?groupbill=${bills.taxi}`, blockQr: true });
  await bo2.page.waitForFunction(() => document.querySelector('#gbill-qr p'), null, { timeout: 15000 }).catch(() => {});
  assert((await bo2.page.textContent('#gbill-qr')).startsWith('QR unavailable') && (await bo2.page.textContent('#gbill-promptpay')) === '081-234-5678' && bo2.errors.length === 0, 'QR library blocked: "QR unavailable", the number still shows');
  await bo2.page.context().close();

  const ceeOwner = await openApp(browser, ids.C, { path: `?group=${G}` });
  page = ceeOwner.page;
  await page.waitForFunction(() => document.getElementById('group-detail-title').textContent === 'Test Trip', null, { timeout: 15000 }).catch(() => {});
  assert(!(await page.isHidden('#group-detail-modal')), '?group= opens the group sheet');
  await page.click('#group-detail-open .gbill-row >> nth=0');
  await page.waitForSelector('#gbill-cancel:not([hidden])', { timeout: 10000 }).catch(() => {});
  await page.click('#gbill-cancel');
  await page.waitForSelector('#confirm-modal:not([hidden])');
  assert((await page.textContent('#confirm-message')).includes('Cancel this collection'), 'cancel asks first');
  await Promise.all([page.waitForResponse((r) => r.url().endsWith('/cancel'), { timeout: 20000 }), page.click('#confirm-ok')]);
  await page.waitForFunction(() => document.getElementById('gbill-progress').textContent === 'Collection cancelled', null, { timeout: 15000 }).catch(() => {});
  assert((await page.textContent('#gbill-progress')) === 'Collection cancelled', 'cancelled');
  assert(ceeOwner.errors.length === 0, `no page JS errors (got ${JSON.stringify(ceeOwner.errors)})`);
  await page.context().close();

  // --- A user in no groups: no section ---
  await fetch(`${BASE}/api/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ line_user_id: LONER, display_name: 'Loner' }) });
  const loner = await openApp(browser, LONER);
  await loner.page.waitForResponse((r) => r.url().includes(`/api/groups/${LONER}`), { timeout: 15000 }).catch(() => {});
  await loner.page.waitForTimeout(300);
  assert(await loner.page.isHidden('#home-groups'), 'no groups -> no Groups section');
  await loner.page.context().close();

  await browser.close();
  for (const t of ['categories', 'users']) await db.from(t).delete().eq('line_user_id', LONER);
  await seed.cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e.message.split('\n')[0]); if (seed) await seed.cleanup(); process.exit(1); });
