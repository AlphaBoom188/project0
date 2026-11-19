// Home -> Groups section and the group detail sheet, on data seeded by
// tests/fixtures/groupSeed.js (Ann: owed 300 in "Test Trip", settled in an
// unnamed room).
const { BASE, FIXTURES, OUTPUT } = require('../lib');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');
const { seedGroups } = require(`${FIXTURES}/groupSeed.js`);

require('fs').mkdirSync(OUTPUT, { recursive: true });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const LONER = `test_grp_loner_${Date.now()}`;

async function openApp(browser, userId, { failDetail = false } = {}) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://static.line-scdn.net/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false,
      getProfile: async () => ({ userId: '${userId}', displayName: 'Group Card Test', pictureUrl: '' }) };` }));
  if (failDetail) await page.route(/\/api\/groups\/[^/]+\/[CR][0-9a-f]{32}$/, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }));
  await page.goto(`${BASE}/liff/`);
  await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });
  return { page, errors };
}

let seed;
(async () => {
  seed = await seedGroups(db);
  const { ids } = seed;
  const browser = await chromium.launch({ channel: 'chrome' });

  const { page, errors } = await openApp(browser, ids.A);
  await page.waitForSelector('#home-groups:not([hidden])', { timeout: 30000 }).catch(() => {});
  assert(!(await page.isHidden('#home-groups')), 'Groups section shows on Home for a group member');
  const rows = await page.$$eval('#groups-list .group-row', (rs) => rs.map((r) => ({
    name: r.querySelector('.category-name').textContent, pill: r.querySelector('.bill-status-pill').textContent,
    cls: r.querySelector('.bill-status-pill').className, sub: r.querySelector('.category-bar-label-row').textContent.trim(), h: r.getBoundingClientRect().height,
  })));
  assert(rows.length === 2 && rows[0].name === 'Test Trip' && rows[1].name === 'LINE chat', `two rows, newest first; an unnamed room shows "LINE chat" (got ${JSON.stringify(rows.map((r) => r.name))})`);
  assert(rows[0].pill === "You're owed ฿300.00" && rows[0].cls.includes('paid') && rows[0].sub === 'Cee pays you ฿155.00 · Bo pays you ฿145.00', `Test Trip row: owed 300, who pays you (got ${JSON.stringify(rows[0])})`);
  assert(rows[1].pill === 'Settled up' && rows[1].cls.includes('settled') && rows[1].sub === '2 members', 'settled row: "Settled up" and member count');
  assert(rows.every((r) => r.h >= 44), 'rows are at least 44px tall');

  await page.click('#groups-list .group-row >> nth=0');
  await page.waitForFunction(() => document.getElementById('group-detail-title').textContent === 'Test Trip', null, { timeout: 10000 }).catch(() => {});
  assert((await page.textContent('#group-detail-title')) === 'Test Trip' && (await page.textContent('#group-detail-meta')) === '3 members', 'detail sheet: title and member count');
  assert((await page.textContent('#group-detail-mine')) === "You're owed ฿300.00: Cee pays you ฿155.00, Bo pays you ฿145.00", `detail: my summary (got "${await page.textContent('#group-detail-mine')}")`);
  // Each row's text pieces joined with " | " (they sit side by side, with no space between them in the DOM).
  const parts = (sel) => page.$$eval(sel, (ls) => ls.map((l) => [...l.querySelectorAll('span')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
  const payments = await parts('#group-detail-payments li');
  assert(JSON.stringify(payments) === JSON.stringify(['Cee → Ann | ฿155.00', 'Bo → Ann | ฿145.00']), `who pays whom (got ${JSON.stringify(payments)})`);
  const members = await parts('#group-detail-members li');
  assert(JSON.stringify(members) === JSON.stringify(['Ann (you) | +฿300.00', 'Bo | -฿145.00', 'Cee | -฿155.00']), `members with nets (got ${JSON.stringify(members)})`);
  const recent = await parts('#group-detail-recent li');
  assert(recent.length === 3 && recent[0].startsWith('Bo paid Ann | ฿100.00 |') && recent[0].endsWith('· Settle up')
    && recent[1].startsWith('taxi · paid by Cee | ฿90.00') && recent[2].startsWith('ข้าว · paid by you | ฿600.00') && recent[2].endsWith('Split 3 ways · your share ฿200.00'), `recent entries (got ${JSON.stringify(recent)})`);
  assert((await page.textContent('.group-hint')).includes('settle @name'), 'the sheet explains that logging and settling happen in the chat');
  await page.screenshot({ path: `${OUTPUT}/group_detail_light.png` });
  await page.evaluate(() => setTheme('dark'));
  await page.screenshot({ path: `${OUTPUT}/group_detail_dark.png` });
  await page.evaluate(() => setTheme('system'));
  await page.click('#close-group-detail');
  assert(await page.isHidden('#group-detail-modal'), 'Close hides the sheet');
  assert(errors.length === 0, `no page JS errors (got ${JSON.stringify(errors)})`);
  await page.context().close();

  // A user in no groups: no section.
  await fetch(`${BASE}/api/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ line_user_id: LONER, display_name: 'Loner' }) });

  const loner = await openApp(browser, LONER);
  await loner.page.waitForResponse((r) => r.url().includes(`/api/groups/${LONER}`), { timeout: 15000 }).catch(() => {});
  await loner.page.waitForTimeout(300);
  assert(await loner.page.isHidden('#home-groups'), 'no groups -> no Groups section');
  await loner.page.context().close();

  // Detail fetch fails: inline error, no crash.

  const failing = await openApp(browser, ids.B, { failDetail: true });
  await failing.page.waitForSelector('#home-groups:not([hidden])', { timeout: 30000 });
  const boPill = await failing.page.textContent('#groups-list .group-row >> nth=0 >> .bill-status-pill');
  assert(boPill === 'You owe ฿145.00', `Bo's row says "You owe ฿145.00" (got ${boPill})`);
  await failing.page.click('#groups-list .group-row >> nth=0');
  await failing.page.waitForSelector('#group-detail-error:not([hidden])', { timeout: 10000 }).catch(() => {});
  assert((await failing.page.textContent('#group-detail-error')) === 'boom' && failing.errors.length === 0, 'a failed detail fetch shows the error inline');

  await browser.close();
  for (const t of ['categories', 'users']) await db.from(t).delete().eq('line_user_id', LONER);
  await seed.cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e.message.split('\n')[0]); if (seed) await seed.cleanup(); process.exit(1); });
