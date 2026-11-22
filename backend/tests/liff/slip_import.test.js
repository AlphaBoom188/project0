// LIFF: bulk slip import. Home › Scan › Several slips at once, 6 images with
// stubbed /slips/:u/read answers (new, needs a look, possible duplicate,
// already recorded, not a slip, a 500 then Try again), the review groups and
// counts, type change, the duplicate left unticked, Import (rows sent, toast,
// one budget banner), Undo; jsQR blocked (the CDN-blocked path: image hash).
const { BASE, OUTPUT } = require('../lib');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

fs.mkdirSync(OUTPUT, { recursive: true });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const U = `test_slipui_${Date.now()}`;
const key = (n) => `slipqr:${String(n).repeat(64).slice(0, 64)}`;

(async () => {
  await fetch(`${BASE}/api/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ line_user_id: U, display_name: 'Slip UI' }) });
  const { data: cats } = await db.from('categories').select('id, name, type').eq('line_user_id', U);
  const food = cats.find((c) => c.name === 'Food');
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://static.line-scdn.net/**', (route) => route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false,
      getProfile: async () => ({ userId: '${U}', displayName: 'Slip UI', pictureUrl: '' }) };` }));
    let jsqrRequested = false;
    await page.route('https://cdn.jsdelivr.net/**', (route) => { jsqrRequested = true; route.abort(); }); // CDN blocked

    await page.goto(`${BASE}/liff/`);
    await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });

    // Six synthetic "slips": plain coloured images rendered by the browser itself
    const files = [];
    for (let i = 0; i < 6; i += 1) {
      const p = path.join(OUTPUT, `slip_fixture_${i}.png`);
      const b64 = await page.evaluate((hue) => { const c = document.createElement('canvas'); c.width = 120; c.height = 200; const x = c.getContext('2d'); x.fillStyle = `hsl(${hue},60%,70%)`; x.fillRect(0, 0, 120, 200); x.fillStyle = '#000'; x.fillText(`Test slip ${hue}`, 10, 100); return c.toDataURL('image/png').split(',')[1]; }, i * 50);
      fs.writeFileSync(p, Buffer.from(b64, 'base64'));
      files.push({ p, sha: crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') });
    }
    const today = new Date().toISOString();
    const row = (n, o) => ({ slip_key: key(n), type: 'expense', amount: 100 + n, transaction_date: today, description: `Shop ${n}`, from_account_id: null, to_account_id: null, category_id: food.id, needs_review: false, reason: null, possible_duplicate: null, ...o });
    let failOnce = true;
    const answers = {
      [files[0].sha]: () => ({ status: 'new', row: row(1, {}) }),
      [files[1].sha]: () => ({ status: 'new', row: row(2, { needs_review: true, reason: "Couldn't tell if you paid or received this" }) }),
      [files[2].sha]: () => ({ status: 'new', row: row(3, { amount: 250, description: 'Grab', possible_duplicate: { id: 'x', date: '2026-11-12', description: 'Grab' } }) }),
      [files[3].sha]: () => ({ status: 'duplicate', existing: { id: 'y', date: '2026-11-10', amount: 80 } }),
      [files[4].sha]: () => ({ status: 'not_slip' }),
      [files[5].sha]: () => (failOnce ? ((failOnce = false), null) : { status: 'new', row: row(6, {}) }),
    };
    const readBodies = [];
    await page.route(`**/api/slips/${U}/read`, (route) => {
      const body = JSON.parse(route.request().postData());
      readBodies.push(body);
      const a = answers[body.image_sha256] && answers[body.image_sha256]();
      if (!a) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: "Couldn't read this slip. Please try again." }) });
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(a) });
    });
    let importBody = null;
    let undoBody = null;
    await page.route(`**/api/slips/${U}/import`, (route) => {
      importBody = JSON.parse(route.request().postData());
      route.fulfill({ contentType: 'application/json', body: JSON.stringify({ imported: importBody.rows.map((r, i) => ({ id: `id${i}`, amount: r.amount, type: r.type, from_account_id: null, to_account_id: null })), skipped: 0, errors: [], budget_alerts: [{ categoryName: 'Food', budgetPeriod: 'monthly', budgetAmount: 300, totalSpent: 412 }], event_budget_alerts: [] }) });
    });
    await page.route(`**/api/slips/${U}/undo`, (route) => { undoBody = JSON.parse(route.request().postData()); route.fulfill({ contentType: 'application/json', body: JSON.stringify({ removed: undoBody.rows.length, kept: 0 }) }); });

    // Home › Scan › Several slips at once
    await page.click('#home-scan');
    await page.waitForSelector('#scan-choice-modal:not([hidden])');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#scan-choice-many')]);
    assert(chooser.isMultiple(), 'the picker allows several images');
    await chooser.setFiles(files.map((f) => f.p));
    await page.waitForSelector('#slip-modal:not([hidden]) #slip-review:not([hidden])', { timeout: 20000 });
    assert(readBodies.length === 6 && readBodies.every((b) => /^[0-9a-f]{64}$/.test(b.image_sha256) && b.image_base64 && b.qr === null), 'one read per image, image hash sent, no QR (CDN blocked: hash fallback)');
    assert(jsqrRequested, 'jsQR was tried and its failure ignored');
    assert((await page.textContent('#slip-progress')) === 'Read 6 slips', 'progress header');

    // Groups
    assert(await page.locator('#slip-look .slip-card').count() === 2 && await page.locator('#slip-ready .slip-row').count() === 1, 'Needs a look: 2 cards; Ready: 1 row');
    assert((await page.textContent('#slip-skipped-sum')) === "Skipped: 1 already recorded, 1 photo wasn't a bank slip, 1 couldn't be read", `skipped summary (got ${await page.textContent('#slip-skipped-sum')})`);
    const dupCard = page.locator('.slip-card[data-n="2"]');
    assert(!(await dupCard.locator('.slip-check').isChecked()) && (await dupCard.innerText()).includes('Matches ฿250 · Grab · Nov 12'), 'possible duplicate unticked, with what it matches');
    assert((await page.textContent('#slip-import')) === 'Import 2', 'Import counts the ticked rows');

    // Try again on the failed one
    await page.click('[data-slip-retry="5"]');
    await page.waitForFunction(() => document.querySelectorAll('#slip-ready .slip-row').length === 2, null, { timeout: 10000 });
    assert((await page.textContent('#slip-import')) === 'Import 3' && (await page.textContent('#slip-skipped-sum')) === "Skipped: 1 already recorded, 1 photo wasn't a bank slip", 'Try again reads it; now 3 to import');

    // Needs a look: mark it Income -> an income category
    await page.click('.slip-card[data-n="1"] [data-slip-type="income"]');
    assert((await page.getAttribute('.slip-card[data-n="1"] [data-slip-type="income"]', 'aria-pressed')) === 'true', 'type chips switch to Income');
    // Edit the ready row's description inline
    await page.click('[data-slip-edit="0"]');
    await page.fill('.slip-editor[data-n="0"] [data-slip-field="description"]', 'Noodle shop');
    await page.press('.slip-editor[data-n="0"] [data-slip-field="description"]', 'Tab');
    await page.click('[data-slip-done="0"]');
    assert((await page.textContent('.slip-row[data-n="0"] .row-title')) === 'Noodle shop', 'edit a row before importing');
    const tapOk = await page.$$eval('#slip-modal button:not([hidden]), #slip-modal input[type="checkbox"]', (els) => els.filter((e) => e.offsetParent).every((e) => e.getBoundingClientRect().height >= 24 && (e.type === 'checkbox' || e.getBoundingClientRect().height >= 36)));
    assert(tapOk, 'buttons are tap-sized');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= 390), 'no horizontal overflow');
    await page.screenshot({ path: `${OUTPUT}/slip_import_review.png`, fullPage: true });
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    await page.screenshot({ path: `${OUTPUT}/slip_import_review_dark.png`, fullPage: true });
    await page.evaluate(() => { delete document.documentElement.dataset.theme; });

    // Import
    await page.click('#slip-import');
    await page.waitForSelector('#slip-modal[hidden]', { state: 'attached', timeout: 10000 });
    const sent = importBody.rows;
    const income = sent.find((r) => r.slip_key === key(2));
    const incomeCat = cats.find((c) => c.id === income.category_id);
    assert(sent.length === 3 && !sent.some((r) => r.slip_key === key(3)) && sent.find((r) => r.slip_key === key(1)).description === 'Noodle shop', 'the 3 ticked rows are sent (not the duplicate), with the edit');
    assert(income.type === 'income' && incomeCat && incomeCat.type === 'income', 'the re-typed row goes as income with an income category');
    assert((await page.textContent('.toast')).includes('Imported 3 slips'), 'toast');
    assert(!(await page.isHidden('#budget-alert-banner')) && (await page.textContent('#budget-alert-banner')).includes('"Food" monthly budget'), 'one budget banner');
    await Promise.all([page.waitForRequest((r) => r.url().endsWith('/undo')), page.click('.toast-undo')]);
    assert(undoBody && undoBody.rows.length === 3 && undoBody.rows[0].id === 'id0', 'Undo sends the imported rows back');

    assert(errors.length === 0, `no page errors (${errors.join('; ')})`);
  } finally {
    await browser.close();
    await fetch(`${BASE}/api/users/${U}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE' }) });
  }
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); console.log('FAIL: crashed'); process.exit(1); });
