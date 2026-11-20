// Tax tab documents (Phase 5): "Scan a 50 ทวิ" fills the income sheet (the
// scan endpoint is mocked here so this stays free; tests/openai/tax_50tawi
// reads a real image), attachments on incomes and deductions (a PDF is
// turned into an image on the phone), and the filing checklist ticks.
const { BASE, FIXTURES, OUTPUT, openTab } = require('../lib');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');
const { statementPdf } = require(`${FIXTURES}/kbankStatement.js`);

fs.mkdirSync(OUTPUT, { recursive: true });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const U = `test_taxdocui_${Date.now()}`;
const IMG_PATH = `${FIXTURES}/receipt.jpg`;
const PDF_PATH = path.join(OUTPUT, 'tax_doc_test.pdf');
fs.writeFileSync(PDF_PATH, statementPdf([[{ x: 60, y: 780, s: 'INSURANCE CERTIFICATE (synthetic)' }, { x: 60, y: 760, s: 'Premium paid 2569: 24,000.00 THB' }]]));

(async () => {
  await db.from('users').insert({ line_user_id: U, display_name: 'Tax Doc UI' });
  // A real document to stand in for what the mocked scan would have saved.
  const pre = await fetch(`${BASE}/api/tax/${U}/2569/documents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: fs.readFileSync(IMG_PATH).toString('base64'), kind: '50tawi', fileName: 'tawi.jpg' }) }).then((r) => r.json());
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://static.line-scdn.net/**', (route) => route.fulfill({ contentType: 'application/javascript', body: `window.liff = { init: async () => {}, isLoggedIn: () => true, login() {}, openWindow() {}, isApiAvailable: () => false,
      getProfile: async () => ({ userId: '${U}', displayName: 'Tax Doc UI', pictureUrl: '' }) };` }));
    let scanBody = null;
    await page.route('**/documents/scan-50tawi', async (route) => {
      scanBody = JSON.parse(route.request().postData());
      await new Promise((r) => setTimeout(r, 300));
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
        document: pre.document,
        extracted: { is50Tawi: true, payer: 'บริษัท ตัวอย่าง จำกัด', incomeType: '40(1)', kind: 'salary', amount: 600000, withheld: 18500, socialSecurity: 9000, providentFund: 30000, yearBE: 2569 },
        warnings: [],
      }) });
    });
    await page.goto(`${BASE}/liff/`);
    await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });
    await openTab(page, 'tax');
    // v5: unclaimed deductions sit behind "Browse all"
    await page.waitForFunction(() => document.getElementById('tax-ded-browse').textContent.startsWith('Browse all'), null, { timeout: 15000 });
    await page.click('#tax-ded-browse');
    await page.waitForSelector('#tax-years .segment', { timeout: 15000 });
    if (!(await page.$('#tax-years .segment.active[data-year="2569"]'))) await page.click('#tax-years [data-year="2569"]');
    await page.waitForSelector('#tax-incomes-empty:not([hidden])', { timeout: 15000 });

    // --- Scan a 50 ทวิ ---
    await page.click('#tax-add-income');
    await page.waitForSelector('#tax-income-modal:not([hidden])');
    assert(await page.isVisible('#tax-scan-label'), 'scan button on a new income');
    await page.setInputFiles('#tax-scan-input', IMG_PATH);
    await page.waitForFunction(() => document.getElementById('tax-scan-status').dataset.state === 'done', null, { timeout: 15000 });
    assert(scanBody && scanBody.image.length > 1000 && scanBody.fileName === 'receipt.jpg', 'the photo is sent as JPEG base64');
    assert((await page.inputValue('#tax-income-kind')) === 'salary' && (await page.inputValue('#tax-income-amount')) === '600000' && (await page.inputValue('#tax-income-withheld')) === '18500' && (await page.inputValue('#tax-income-payer')) === 'บริษัท ตัวอย่าง จำกัด', 'fields filled from the certificate');
    assert((await page.$$('#tax-income-modal .ai-tag')).length === 4, 'AI tags on the filled fields');
    assert(await page.isVisible('#tax-also-row') && (await page.textContent('#tax-also-text')).includes('social security ฿9,000 and provident fund ฿30,000'), 'offers social security and provident fund too');
    assert((await page.textContent('#tax-scan-status')).startsWith('Filled from your 50 ทวิ'), 'done status');
    await Promise.all([page.waitForResponse((r) => r.url().includes('/claims') && r.request().method() === 'PUT'), page.click('#tax-income-save')]);
    await page.waitForSelector('#tax-income-modal', { state: 'hidden' });
    const ded = await page.innerText('#tax-deductions');
    assert(ded.includes('Social security contributions') && ded.includes('paid ฿9,000') && ded.includes('paid ฿30,000'), 'social security and provident fund claimed');
    assert((await db.from('tax_documents').select('income_id').eq('id', pre.document.id).single()).data.income_id, 'the scanned document is linked to the new income');
    assert(await page.isVisible('#tax-docs [data-doc="salary"] ~ .tax-doc-attached'), 'filing checklist: 50 ทวิ attached');

    // --- Attachments on the income ---
    await page.click('#tax-incomes [data-income]');
    await page.waitForSelector('#tax-income-modal:not([hidden])');
    assert(await page.isHidden('#tax-scan-label') && (await page.$$('#tax-income-docs .tax-doc-item')).length === 1, 'edit: no scan button, one document listed');
    await page.click('#tax-income-cancel');

    // --- Attach a PDF to a deduction (first page -> image on the phone) ---
    await page.click('#tax-deductions [data-deduction="life_insurance"]');
    await page.waitForSelector('#tax-deduction-modal:not([hidden])');
    assert((await page.textContent('#tax-ded-docs')).includes('Nothing attached yet'), 'deduction: nothing attached');
    await Promise.all([page.waitForResponse((r) => r.url().endsWith('/2569/documents') && r.request().method() === 'POST', { timeout: 30000 }), page.setInputFiles('#tax-ded-attach', PDF_PATH)]);
    await page.waitForSelector('#tax-ded-docs .tax-doc-item', { timeout: 10000 });
    assert((await page.textContent('#tax-ded-docs')).includes('tax_doc_test.pdf') && (await page.textContent('#tax-attach-status')) === 'Attached.', 'PDF attached');
    const row = (await db.from('tax_documents').select('kind, claim_key').eq('line_user_id', U).eq('claim_key', 'life_insurance').single()).data;
    assert(row && row.kind === 'insurance', 'saved as an insurance certificate on life insurance');
    const thumb = await page.waitForFunction(() => { const img = document.querySelector('#tax-ded-docs img'); return img && img.complete && img.naturalWidth > 0; }, null, { timeout: 15000 }).then(() => true).catch(() => false);
    assert(thumb, 'thumbnail loads from the signed URL');
    await page.screenshot({ path: `${OUTPUT}/tax_documents.png` });
    // Remove it
    await page.click('#tax-ded-docs [data-doc-delete]');
    await Promise.all([page.waitForResponse((r) => r.url().includes('/documents/') && r.request().method() === 'DELETE'), page.click('#confirm-ok')]);
    await page.waitForFunction(() => document.getElementById('tax-ded-docs').textContent.includes('Nothing attached yet'), null, { timeout: 10000 });
    assert((await db.from('tax_documents').select('id').eq('line_user_id', U).eq('claim_key', 'life_insurance')).data.length === 0, 'removed');
    assert(errors.length === 0, `no page errors (got ${JSON.stringify(errors)})`);
  } finally {
    await browser.close();
    const { data: left } = await db.storage.from('tax-documents').list(U);
    if (left && left.length) await db.storage.from('tax-documents').remove(left.map((f) => `${U}/${f.name}`));
    await db.from('users').delete().eq('line_user_id', U);
  }
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); console.log('FAIL: crashed'); process.exit(1); });
