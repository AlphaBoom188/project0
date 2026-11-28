// Rich menu deep links (config/richmenu.js -> app.js openDeepLink): each
// ?action= / ?tab= / ?open= opens the right tab or sheet, in both the plain
// query and the liff.state form liff.line.me first delivers.
const { BASE } = require('../lib');
const { chromium } = require('playwright-core');

const U = `test_dl_${Date.now().toString(36)}`;
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const api = (p, opts = {}) => fetch(`${BASE}/api${p}`, { ...opts, headers: { 'Content-Type': 'application/json' } });

(async () => {
  await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: U, display_name: 'Deep Links' }) });
  const browser = await chromium.launch({ channel: 'chrome' });
  const errors = [];
  const open = async (query) => {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://static.line-scdn.net/**', (route) => route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false, getIDToken: () => null,
      getProfile: async () => ({ userId: '${U}', displayName: 'Deep Links', pictureUrl: '' }) };` }));
    await page.goto(`${BASE}/liff/${query}`);
    await page.waitForSelector('#app:not([hidden])', { timeout: 20000 });
    await page.waitForTimeout(1500);
    return page;
  };
  const visible = (page, sel) => page.isVisible(sel);
  const activeTab = (page) => page.evaluate(() => [...document.querySelectorAll('[id^="tab-"]')].find((p) => !p.hidden)?.id);

  let page = await open('?action=add');
  assert(await visible(page, '#add-expense-modal') && (await page.getAttribute('[data-entry-type="expense"]', 'aria-selected')) === 'true', 'action=add: Add entry sheet with Expense');
  await page.context().close();

  page = await open('?action=voice');
  const voice = await page.evaluate(() => ({ sheet: !document.getElementById('add-expense-modal').hidden, recording: document.getElementById('voice-button').getAttribute('aria-pressed') }));
  assert(voice.sheet && voice.recording === 'false', `action=voice: Add entry sheet open, mic waiting for a tap (${JSON.stringify(voice)})`);
  await page.context().close();

  page = await open('?action=slips');
  assert(await visible(page, '#slip-modal, .modal:has(#slip-files)') || (await page.evaluate(() => [...document.querySelectorAll('.modal')].some((m) => !m.hidden && m.querySelector('input[type=file]')))), 'action=slips: the bulk slip picker');
  await page.context().close();

  page = await open('?liff.state=%3Ftab%3Dtasks%26action%3Dadd');
  assert((await activeTab(page)) === 'tab-tasks' && await visible(page, '#task-modal'), 'liff.state tab=tasks&action=add: Tasks with the reminder sheet');
  await page.context().close();

  page = await open('?tab=tasks&action=note');
  assert((await activeTab(page)) === 'tab-tasks' && await visible(page, '#task-modal') && await visible(page, '#note-body'), 'tab=tasks&action=note: Tasks with the note sheet');
  await page.context().close();

  page = await open('?tab=tasks');
  assert((await activeTab(page)) === 'tab-tasks' && !(await page.evaluate(() => [...document.querySelectorAll('.modal')].some((m) => !m.hidden))), 'tab=tasks: Tasks, no sheet');
  await page.context().close();

  page = await open('?tab=groups');
  assert((await activeTab(page)) === 'tab-groups', `tab=groups (rich menu Bills and groups): the Groups page (got ${await activeTab(page)})`);
  await page.context().close();

  page = await open('?tab=more&open=groups');
  assert((await activeTab(page)) === 'tab-groups', `older tab=more&open=groups links: the Groups page too (got ${await activeTab(page)})`);
  await page.context().close();

  page = await open('?action=bogus&open=nothing');
  assert((await activeTab(page)) === 'tab-home' && !(await page.evaluate(() => [...document.querySelectorAll('.modal')].some((m) => !m.hidden))), 'unknown params are ignored');
  await page.context().close();

  assert(errors.length === 0, `no page JS errors (got ${JSON.stringify(errors)})`);
  await browser.close();
  await api(`/users/${U}`, { method: 'DELETE', body: JSON.stringify({ confirm: 'DELETE' }) });
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e.message.split('\n')[0]); await api(`/users/${U}`, { method: 'DELETE', body: JSON.stringify({ confirm: 'DELETE' }) }).catch(() => {}); process.exit(1); });
