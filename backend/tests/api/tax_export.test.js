// Tax summary export: POST /api/tax/:u/:year/export-link and GET .../export
// (printable page and CSV), plus the pure builders' escaping.
const { BASE, BACKEND } = require('../lib');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { buildSummaryCsv, buildSummaryHtml } = require(`${BACKEND}/services/tax/taxSummary.js`);

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const U = `test_taxexp_${crypto.randomBytes(4).toString('hex')}`;
const call = (method, p, body) => fetch(`${BASE}/api${p}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });

(async () => {
  await db.from('users').insert({ line_user_id: U, display_name: 'Export <Test>' });
  try {
    await call('POST', `/tax/${U}/2569/incomes`, { kind: 'salary', amount: 1000000, withheld: 50000, payer: '=HYPERLINK("x")' });
    await call('PUT', `/tax/${U}/2569/claims`, { life_insurance: 20000, nsf: 10000 });

    let r = await call('POST', `/tax/${U}/2569/export-link`, { format: 'csv' });
    const { url } = await r.json();
    assert(r.status === 200 && url.startsWith(`/api/tax/${U}/2569/export?`) && /kind=tax/.test(url) && /format=csv/.test(url) && /sig=[0-9a-f]{64}/.test(url), 'export-link returns a signed URL');
    r = await fetch(`${BASE}${url}`);
    const bytes = Buffer.from(await r.arrayBuffer());
    const csv = bytes.toString('utf8'); // keeps the BOM (fetch's text() would strip it)
    assert(r.status === 200 && r.headers.get('content-type').includes('text/csv') && r.headers.get('content-disposition').includes('tax-summary-2569.csv'), 'CSV download');
    assert(csv.startsWith('﻿') && csv.includes('Tax year 2569') && csv.includes('Salary, wages, bonus') && csv.includes("'=HYPERLINK"), 'CSV: BOM, contents, formula text neutralised');
    assert(csv.includes('Life insurance (10+ years),20000,20000') && csv.includes('National Savings Fund (NSF),10000,10000,,no'), 'CSV: deductions with the verified flag');

    r = await call('POST', `/tax/${U}/2569/export-link`, { format: 'html' });
    const page = await fetch(`${BASE}${(await r.json()).url}`);
    const html = await page.text();
    assert(page.status === 200 && page.headers.get('content-type').includes('text/html') && page.headers.get('cache-control') === 'no-store', 'printable page, not cached');
    assert(html.includes('Tax summary, tax year 2569') && html.includes('Export &lt;Test&gt;') && !html.includes('Export <Test>'), 'page escapes the name');
    assert(html.includes('Print or save as PDF') && /href="\/api\/tax\/[^"]+format=csv[^"]*"/.test(html), 'print button and a CSV link');
    assert(html.includes('Unverified rule') && html.includes('How it') && html.includes('To pay'), 'unverified tag and the calculation');
  } finally {
    await db.from('users').delete().eq('line_user_id', U);
  }
  // Pure builders on a minimal state
  const state = {
    year: 2568, rules: { incomeKinds: [{ key: 'salary', label: 'Salary' }], deductions: [] }, incomes: [], documents: [],
    result: { incomes: [], allowances: [], donations: [], totals: { gross: 0, exempt: 0, expenses: 0, allowances: 0, donations: 0, netIncome: 0 }, brackets: [], minimumTax: { base: 0, tax: 0, applies: false }, taxDue: 0, withheld: 0, dividendCredit: 0, prepaid: 0, balance: 0, result: 'none', effectiveRate: 0, filing: { form: 'PND91', mustFile: false, threshold: 120000, paperDeadline: '2569-03-31', onlineDeadline: '2569-04-08' }, warnings: [] },
  };
  assert(buildSummaryHtml(state).includes('No income entered.') && buildSummaryCsv(state).includes('Nothing to pay'), 'empty year renders');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); console.log('FAIL: crashed'); process.exit(1); });
