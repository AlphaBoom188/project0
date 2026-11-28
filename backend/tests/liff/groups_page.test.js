// The Groups page (tab-groups) and the group sheet's Members section, on the
// synthetic group seed (tests/fixtures/groupSeed.js): Cee owes 200 (rice, to
// Ann) and is owed 45 (taxi, by Bo).
const { BASE, OUTPUT } = require('../lib');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');
const { seedGroups } = require('../fixtures/groupSeed.js');

require('fs').mkdirSync(OUTPUT, { recursive: true });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };

async function openApp(browser, userId, query = '') {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://static.line-scdn.net/**', (route) => route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false, getIDToken: () => null,
    getProfile: async () => ({ userId: '${userId}', displayName: 'Groups Page Test', pictureUrl: '' }) };` }));
  await page.goto(`${BASE}/liff/${query}`);
  await page.waitForSelector('#app:not([hidden])', { timeout: 20000 });
  return { page, errors };
}
const shown = (page) => page.evaluate(() => [...document.querySelectorAll('[id^="tab-"]')].find((p) => !p.hidden)?.id);

let seed;
(async () => {
  seed = await seedGroups(db);
  const { ids } = seed;
  const browser = await chromium.launch({ channel: 'chrome' });

  // --- Cee: More > LINE groups ---
  const { page, errors } = await openApp(browser, ids.C);
  await page.evaluate(() => switchTab('more'));
  await page.click('#more-groups');
  await page.waitForSelector('#groups-page-list .group-row', { timeout: 15000 });
  assert((await shown(page)) === 'tab-groups', 'More > LINE groups opens the Groups page');
  assert(await page.evaluate(() => document.querySelector('.nav-tab.active')?.dataset.tab) === 'more' && await page.isHidden('#fab-add'), 'nav shows More; no Add button');
  const hero = await page.evaluate(() => ({ amount: document.getElementById('groups-hero-amount').textContent, sub: document.getElementById('groups-hero-sub').textContent, owe: document.getElementById('groups-owe').textContent, owed: document.getElementById('groups-owed').textContent }));
  assert(hero.amount === '−฿155' && hero.owe === '฿200' && hero.owed === '฿45' && hero.sub.startsWith('You owe overall · 2 open bills'), `hero: net, you owe, owed to you (got ${JSON.stringify(hero)})`);
  const rows = await page.$$eval('#groups-page-list .group-row', (rs) => rs.map((r) => r.querySelector('.category-name').textContent));
  assert(rows.length === 1 && rows[0] === 'Test Trip' && await page.isHidden('#groups-empty'), `one group row (got ${JSON.stringify(rows)})`);
  await page.screenshot({ path: `${OUTPUT}/groups_page.png` });

  // --- Group sheet: Members ---
  await page.click('#groups-page-list .group-row >> nth=0');
  await page.waitForSelector('#group-detail-members .member-row', { timeout: 10000 });
  const members = await page.$$eval('#group-detail-members .member-row', (rs) => rs.map((r) => [r.querySelector('.row-title').textContent, r.querySelector('.row-meta').textContent, r.querySelector('.bill-status-pill')?.textContent || '']));
  assert(members.length === 3 && members[0][0] === 'Cee (you)' && members[0][1].startsWith('Owes ฿200 · 1 bill') && members[0][2] === '', `me first, my unpaid total, no pill (got ${JSON.stringify(members[0])})`);
  assert(members[1][0] === 'Bo' && members[1][1].startsWith('Owes ฿45 · 1 bill') && members[1][2] === 'Owes you ฿45', `Bo owes me 45 (got ${JSON.stringify(members[1])})`);
  assert(members[2][0] === 'Ann' && members[2][1].startsWith('All paid up') && members[2][2] === 'You owe ฿200', `I owe Ann 200 (got ${JSON.stringify(members[2])})`);
  assert(members.some((m) => /fastest|Fastest payer/.test(m[1])), 'paying speed this month shows on members who paid');
  assert(await page.isVisible('#group-detail-host') && (await page.textContent('#group-detail-host')).includes('Top host this month: '), 'top host line');
  const tall = await page.$$eval('#group-detail-members .member-row', (rs) => Math.min(...rs.map((r) => r.getBoundingClientRect().height)));
  assert(tall >= 44, `member rows are at least 44px (got ${tall})`);
  await page.screenshot({ path: `${OUTPUT}/groups_sheet_members.png` });
  await page.click('#close-group-detail');

  // --- Back, Home "See all", deep link ---
  await page.click('#groups-back');
  assert((await shown(page)) === 'tab-more', 'Back returns to More');
  await page.evaluate(() => switchTab('home'));
  await page.waitForSelector('#home-groups:not([hidden])', { timeout: 15000 });
  await page.click('#home-groups-all');
  assert((await shown(page)) === 'tab-groups', 'Home "See all" opens the Groups page');
  const deep = await openApp(browser, ids.C, '?tab=groups');
  await deep.page.waitForTimeout(1500);
  assert((await shown(deep.page)) === 'tab-groups', '?tab=groups opens the Groups page');

  // --- Someone in no groups: empty state ---
  const NOBODY = `test_grp_nobody_${Date.now().toString(36)}`;
  const nobody = await openApp(browser, NOBODY, '?tab=groups');
  await nobody.page.waitForSelector('#groups-empty:not([hidden])', { timeout: 15000 }).catch(() => {});
  assert(await nobody.page.isVisible('#groups-empty') && await nobody.page.isHidden('#groups-page-list') && (await nobody.page.textContent('#groups-hero-sub')) === 'No groups yet', 'no groups: how-to empty state');

  // --- Load failure: error state with Try again ---
  const broken = await openApp(browser, ids.C);
  await broken.page.route(/\/api\/groups\//, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"down"}' }));
  await broken.page.evaluate(() => { getCache.clear(); switchTab('groups'); });
  await broken.page.waitForSelector('#groups-error:not([hidden])', { timeout: 10000 }).catch(() => {});
  assert(await broken.page.isVisible('#groups-error') && await broken.page.isVisible('#groups-retry'), 'load failure: error card with Try again');
  await broken.page.unroute(/\/api\/groups\//);
  await broken.page.click('#groups-retry');
  await broken.page.waitForSelector('#groups-page-list .group-row', { timeout: 15000 }).catch(() => {});
  assert(await broken.page.isHidden('#groups-error') && await broken.page.isVisible('#groups-page-list'), 'Try again recovers');

  const all = [...errors, ...deep.errors, ...nobody.errors];
  assert(all.length === 0, `no page JS errors (got ${JSON.stringify(all)})`);
  await browser.close();
  await fetch(`${BASE}/api/users/${NOBODY}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE' }) });
  await seed.cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e.message.split('\n')[0]); if (seed) await seed.cleanup(); process.exit(1); });
