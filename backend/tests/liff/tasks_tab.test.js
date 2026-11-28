// Tasks tab (liff-app/tasks.js): week strip, timeline with the Now line,
// to-dos, notes, the add/edit sheet (presets, repeat, category, importance),
// the "Everything you've set" sheet, the month calendar and the Settings
// Google Calendar card (not connected; events are mocked at the route).
const { BASE, OUTPUT, openTab } = require('../lib');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

require('fs').mkdirSync(OUTPUT, { recursive: true });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const U = `test_tasks_${Date.now()}`;
const OFFSET = 7 * 3600000;
const bkkYmd = (d) => new Date(d.getTime() + OFFSET).toISOString().slice(0, 10);
const at = (ymd, hm) => new Date(`${ymd}T${hm}:00+07:00`).toISOString();
const today = bkkYmd(new Date());
const tomorrow = bkkYmd(new Date(Date.now() + 86400000));

(async () => {
  await db.from('users').insert({ line_user_id: U, display_name: 'Tasks Test' });
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    // Seed: a reminder later today (or tomorrow when it's late), a past one
    // today, a daily repeat, a to-do and a note.
    const later = new Date(Date.now() + 2 * 3600000);
    const laterYmd = bkkYmd(later);
    const ins = async (row) => (await db.from('reminders').insert({ line_user_id: U, ...row }).select().single()).data;
    const call = await ins({ title: 'Call the bank', remind_at: later.toISOString(), next_fire_at: later.toISOString(), importance: 1, category: 'finance' });
    // An hour ago, but never before today's Bangkok midnight (the test may run just after it).
    const todayStart = new Date(`${today}T00:00:00+07:00`).getTime();
    const past = new Date(Math.max(Date.now() - 3600000, todayStart + 60000));
    await ins({ title: 'Morning pills', remind_at: past.toISOString(), last_fired_at: past.toISOString(), fire_count: 1, category: 'health' });
    const dailyAt = at(tomorrow, '08:00');
    await ins({ title: 'Stand-up', repeat: 'daily', remind_at: dailyAt, anchor_at: dailyAt, next_fire_at: dailyAt, category: 'work' });
    await ins({ title: 'Buy milk' });
    await db.from('notes').insert({ line_user_id: U, body: 'Office wifi: ask reception', note_date: today });

    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://static.line-scdn.net/**', (route) => route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow(o) { window.__opened = o; }, isApiAvailable: () => false,
      getProfile: async () => ({ userId: '${U}', displayName: 'Tasks Test', pictureUrl: '' }) };` }));
    await page.goto(`${BASE}/liff/`);
    await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });

    // --- Nav: six tabs, Tasks second, labels on one line ---
    const nav = await page.$$eval('.nav-tab', (ts) => ts.map((x) => ({ tab: x.dataset.tab, label: x.textContent.trim(), over: x.scrollWidth > x.clientWidth + 1 })));
    assert(nav.length === 5 && nav[1].tab === 'tasks' && nav[1].label === 'Tasks' && nav.every((n) => !n.over), `five items, Tasks second, no overflow (got ${JSON.stringify(nav)})`);

    await page.click('.nav-tab[data-tab="tasks"]');
    await page.waitForSelector('#week-strip .week-day', { timeout: 15000 });
    await page.waitForFunction(() => document.querySelectorAll('#tasks-timeline .task-row').length > 0 || !document.getElementById('tasks-empty').hidden, null, { timeout: 15000 });
    assert((await page.textContent('#tasks-kicker')) === 'Today', 'opens on today');
    const days = await page.$$eval('#week-strip .week-day', (ds) => ds.map((d) => ({ name: d.querySelector('.week-day-name').textContent, sel: d.classList.contains('selected'), dot: !d.querySelector('.week-day-dot').hidden, h: d.getBoundingClientRect().height })));
    assert(days.length === 7 && days[0].name === 'Mon' && days.filter((d) => d.sel).length === 1, 'week strip Mon..Sun with today selected');
    assert(days.find((d) => d.sel).dot, 'today has a dot');

    // --- Timeline ---
    const rows = await page.$$eval('#tasks-timeline > li', (ls) => ls.map((l) => (l.classList.contains('now-line') ? 'NOW' : `${l.querySelector('.task-time').textContent} ${l.querySelector('.task-title').textContent} | ${l.querySelector('.task-meta').textContent.trim()}`)));
    const pillsIdx = rows.findIndex((r) => r.includes('Morning pills'));
    const nowIdx = rows.indexOf('NOW');
    assert(pillsIdx >= 0 && nowIdx > pillsIdx && rows[pillsIdx].includes('Reminded'), `past reminder before the Now line, marked Reminded (got ${JSON.stringify(rows)})`);
    if (laterYmd === today) assert(rows[nowIdx + 1] && rows[nowIdx + 1].includes('Call the bank') && rows[nowIdx + 1].includes('Important'), 'upcoming reminder after Now with its Important badge');
    const rowH = await page.$$eval('#tasks-timeline .task-row', (ls) => ls.map((l) => l.getBoundingClientRect().height));
    assert(rowH.every((h) => h >= 56 && h <= 57), `rows are 56px (got ${rowH})`);
    assert((await page.$$eval('#tasks-todos .task-title', (ts) => ts.map((x) => x.textContent))).join() === 'Buy milk', 'to-do list');
    assert((await page.textContent('#tasks-notes .note-text')) === 'Office wifi: ask reception' && (await page.isHidden('#tasks-notes-empty')), 'note for today');
    assert((await page.textContent('#tasks-summary')).replace(/\s+/g, ' ').includes('Repeating 1') && (await page.textContent('#tasks-summary')).includes('Upcoming 2'), 'summary: 1 repeating, 2 upcoming');
    await page.screenshot({ path: `${OUTPUT}/tasks_today_light.png`, fullPage: true });

    // --- Tick the to-do ---
    await Promise.all([page.waitForResponse((r) => r.url().includes('/done') && r.request().method() === 'POST'), page.click('#tasks-todos [data-check]')]);
    await page.waitForFunction(() => document.querySelector('#tasks-todos .task-row.is-done'), null, { timeout: 10000 }).catch(() => {});
    assert((await page.textContent('#tasks-todo-count')) === 'All done' && (await db.from('reminders').select('status').eq('title', 'Buy milk').eq('line_user_id', U).single()).data.status === 'done', 'to-do ticked (saved, struck through)');

    // --- Tomorrow: the daily repeat ---
    await page.click(`#week-strip [data-ymd="${tomorrow}"]`).catch(async () => { await page.evaluate((y) => selectDay(y), tomorrow); });
    await page.waitForFunction(() => document.getElementById('tasks-kicker').textContent === 'Tomorrow', null, { timeout: 10000 }).catch(() => {});
    const tmr = await page.$$eval('#tasks-timeline .task-row', (ls) => ls.map((l) => l.textContent.replace(/\s+/g, ' ').trim()));
    assert(tmr.some((r) => r.startsWith('08:00') && r.includes('Stand-up') && r.includes('Every day')), `tomorrow shows the 08:00 daily stand-up (got ${JSON.stringify(tmr)})`);
    assert(!(await page.$('#tasks-timeline .now-line')), 'no Now line on other days');

    // --- Add a reminder with a preset ---
    await page.click('#fab-add');
    await page.waitForSelector('#task-modal:not([hidden])');
    assert((await page.getAttribute('#fab-add', 'aria-label')) === 'Add reminder or note', 'the Add button adds reminders on this tab');
    await page.fill('#task-title', 'Pay rent');
    await page.click('#task-presets [data-preset="tomorrow"]');
    assert((await page.inputValue('#task-date')) === tomorrow && (await page.inputValue('#task-time')) === '09:00', 'Tomorrow 09:00 preset fills date and time');
    await page.click('#task-categories [data-category="finance"]');
    await page.click('#task-importance [data-importance="2"]');
    assert((await page.textContent('#task-importance-help')).includes('15, 45, 90 and 180 minutes'), 'importance help text');
    // Visible ones only: "This evening 18:00" hides itself after 17:30.
    const optH = await page.$$eval('.importance-option, .preset, .category-chip', (bs) => Math.min(...bs.filter((b) => b.offsetParent !== null).map((b) => b.getBoundingClientRect().height)));
    assert(optH >= 44, `controls are tappable: >= 44px (got ${optH})`);
    await Promise.all([page.waitForResponse((r) => r.url().includes(`/reminders/${U}`) && r.request().method() === 'POST'), page.click('#task-save')]);
    await page.waitForSelector('#task-modal', { state: 'hidden', timeout: 10000 });
    const rent = (await db.from('reminders').select('*').eq('line_user_id', U).eq('title', 'Pay rent').single()).data;
    assert(rent && rent.importance === 2 && rent.category === 'finance' && new Date(rent.remind_at).toISOString() === at(tomorrow, '09:00'), 'saved: must-not-miss, finance, tomorrow 09:00 Bangkok');
    await page.waitForFunction(() => [...document.querySelectorAll('#tasks-timeline .task-title')].some((x) => x.textContent === 'Pay rent'), null, { timeout: 10000 }).catch(() => {});
    assert(await page.isVisible('text=Pay rent'), 'shows on tomorrow');

    // --- Validation + repeat ---
    await page.click('#fab-add');
    await page.click('#task-save');
    assert((await page.textContent('#task-modal-error')) === 'Add what to remind you about.', 'title required');
    await page.fill('#task-title', 'Water plants');
    await page.click('#task-repeat-switch'); // v5: Repeat is a switch
    assert(await page.isHidden('#task-presets') && await page.isVisible('#task-repeat') && (await page.inputValue('#task-time')) === '09:00', 'repeat mode: presets hidden, repeat select shown, 09:00 default');
    await page.selectOption('#task-repeat', 'weekly');
    await Promise.all([page.waitForResponse((r) => r.url().includes(`/reminders/${U}`) && r.request().method() === 'POST'), page.click('#task-save')]);
    await page.waitForSelector('#task-modal', { state: 'hidden', timeout: 10000 });
    assert((await db.from('reminders').select('repeat').eq('line_user_id', U).eq('title', 'Water plants').single()).data.repeat === 'weekly', 'weekly repeat saved');

    // --- Edit, then delete ---
    await page.click('#tasks-timeline [data-open]:has-text("Pay rent")');
    await page.waitForSelector('#task-modal:not([hidden])');
    assert((await page.inputValue('#task-title')) === 'Pay rent' && await page.isHidden('#task-kind') && await page.isVisible('#task-delete'), 'edit sheet prefilled, with Delete');
    await page.fill('#task-title', 'Pay rent (condo)');
    await Promise.all([page.waitForResponse((r) => r.request().method() === 'PUT'), page.click('#task-save')]);
    await page.waitForSelector('#task-modal', { state: 'hidden', timeout: 10000 });
    assert((await db.from('reminders').select('title').eq('id', rent.id).single()).data.title === 'Pay rent (condo)', 'edit saved');

    // --- Notes ---
    await page.click('#tasks-add-note');
    await page.waitForSelector('#note-form:not([hidden])');
    assert((await page.inputValue('#note-date')) === tomorrow, 'a new note files under the selected day');
    await page.fill('#note-body', 'Bring the passport');
    await page.check('#note-pinned');
    await Promise.all([page.waitForResponse((r) => r.url().includes('/notes/') && r.request().method() === 'POST'), page.click('#note-save')]);
    await page.waitForSelector('#task-modal', { state: 'hidden', timeout: 10000 });
    await page.waitForFunction(() => [...document.querySelectorAll('#tasks-notes .note-text')].some((x) => x.textContent === 'Bring the passport'), null, { timeout: 10000 }).catch(() => {});
    assert(await page.isVisible('#tasks-notes >> text=Bring the passport'), 'pinned note shows');

    // --- Everything you've set ---
    await page.click('#tasks-summary-next');
    await page.waitForSelector('#tasks-list-modal:not([hidden])');
    const counts = await page.$$eval('#tasks-list-tabs [data-count]', (s) => s.map((x) => `${x.dataset.count}:${x.textContent}`));
    assert(counts.join() === 'next:3,repeat:2,todo:0', `list counts (got ${counts})`);
    await page.click('#tasks-list-tabs [data-list="repeat"]');
    const reps = await page.$$eval('#tasks-list .task-title', (ts) => ts.map((x) => x.textContent));
    assert(reps.includes('Stand-up') && reps.includes('Water plants'), 'repeating tab');
    assert((await page.textContent('#tasks-done-toggle')).includes('Done recently'), 'done section toggle');
    await page.click('#close-tasks-list');

    // --- Month calendar ---
    await page.click('#tasks-month-button');
    await page.waitForSelector('#month-grid .month-cell');
    assert((await page.$$('#month-grid .month-cell')).length === 42, '6-week grid');
    assert(await page.$(`#month-grid [data-ymd="${tomorrow}"] .dot-reminder`) && await page.$(`#month-grid [data-ymd="${today}"] .dot-note`), 'dots for reminders and notes');
    await page.click('#month-today');
    await page.waitForFunction(() => document.getElementById('tasks-kicker').textContent === 'Today', null, { timeout: 10000 }).catch(() => {});
    assert((await page.textContent('#tasks-kicker')) === 'Today', 'Today jumps back');

    // --- Dark mode screenshot + overflow ---
    await page.evaluate(() => setTheme('dark'));
    await page.screenshot({ path: `${OUTPUT}/tasks_today_dark.png`, fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal scroll');

    // --- Settings: Google Calendar card ---
    await openTab(page, 'settings');
    await page.waitForFunction(() => document.getElementById('gcal-status-text').textContent.length > 20, null, { timeout: 10000 });
    const gtext = await page.textContent('#gcal-status-text');
    const configured = !(await page.isHidden('#gcal-connect'));
    assert(configured ? gtext.includes('Read-only') : gtext.includes('not set up'), `calendar card explains its state (got "${gtext}")`);
    assert(await page.isHidden('#gcal-disconnect'), 'no Disconnect when not connected');
    assert(errors.length === 0, `no page errors (got ${JSON.stringify(errors)})`);
    await page.context().close();
  } finally {
    await browser.close();
    await db.from('users').delete().eq('line_user_id', U);
  }
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); console.log('FAIL: crashed'); await db.from('users').delete().eq('line_user_id', U); process.exit(1); });
