// LIFF Settings layout: five sections in order with explanations, jump
// links that scroll to each, and every control in its section.
const { BASE, OUTPUT } = require('../lib');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

require('fs').mkdirSync(OUTPUT, { recursive: true });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const U = `test_setlay_${Date.now()}`;

(async () => {
  await db.from('users').insert({ line_user_id: U, display_name: 'Settings Layout' });
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await (await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://static.line-scdn.net/**', (route) => route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false,
      getProfile: async () => ({ userId: '${U}', displayName: 'Settings Layout', pictureUrl: '' }) };` }));
    await page.goto(`${BASE}/liff/`);
    await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });
    await page.click('.nav-tab[data-tab="settings"]');
    await page.waitForSelector('#settings-general', { state: 'visible' });
    const sections = await page.$$eval('#tab-settings .settings-section', (hs) => hs.map((h) => h.textContent));
    assert(sections.join('|') === 'General|Notifications|LINE groups|Connected services|Privacy & data', `five sections in order (got ${sections.join('|')})`);
    const inSection = async (control, sectionId) => page.evaluate(([c, s]) => {
      const heads = [...document.querySelectorAll('#tab-settings .settings-section')];
      const el = document.getElementById(c);
      const idx = heads.findIndex((h) => h.id === s);
      const after = heads[idx].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING;
      const beforeNext = !heads[idx + 1] || (heads[idx + 1].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING);
      return !!(after && beforeNext);
    }, [control, sectionId]);
    const placements = [
      ['theme-option-dark', 'settings-general'], ['setting-cycle-day', 'settings-general'],
      ['setting-notifications', 'settings-notifications'], ['setting-morning-briefing', 'settings-notifications'],
      ['setting-group-copies', 'settings-groups'], ['setting-promptpay', 'settings-groups'],
      ['gcal-connect', 'settings-connections'], ['setting-email', 'settings-connections'],
      ['setting-thumbnails', 'settings-privacy'], ['delete-account-button', 'settings-privacy'],
    ];
    for (const [c, sec] of placements) assert(await inSection(c, sec), `${c} is under ${sec}`);
    assert((await page.$$('#tab-settings .settings-hint')).length === 5, 'each section explains itself');
    assert(await page.evaluate(() => [...document.querySelectorAll('#tab-settings .settings-section, #tab-settings .settings-subtitle')].every((h) => !h.closest('.settings-card'))), 'no heading sits inside a card (cards are closed properly)');
    await page.click('.settings-jump a[href="#settings-privacy"]');
    await page.waitForTimeout(400);
    const top = await page.$eval('#settings-privacy', (h) => h.getBoundingClientRect().top);
    assert(top >= 0 && top < 200, `jump link scrolls to the section (top ${Math.round(top)})`);
    await page.click('.nav-tab[data-tab="settings"]');
    await page.screenshot({ path: `${OUTPUT}/settings_layout.png`, fullPage: true });
    // controls still work: toggle the briefing
    await Promise.all([page.waitForResponse((r) => r.url().includes('/preferences')), page.check('#setting-morning-briefing')]);
    assert((await db.from('users').select('morning_briefing').eq('line_user_id', U).single()).data.morning_briefing === true, 'controls still save');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal scroll at 360px');
    assert(errors.length === 0, `no page errors (got ${JSON.stringify(errors)})`);
  } finally {
    await browser.close();
    await db.from('users').delete().eq('line_user_id', U);
  }
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); console.log('FAIL: crashed'); process.exit(1); });
