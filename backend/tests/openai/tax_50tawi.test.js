// Paid (a fraction of a cent): reading a synthetic 50 ทวิ with OpenAI
// Vision, directly and through POST /api/tax/:u/:year/documents/scan-50tawi.
const { BASE, BACKEND, FIXTURES } = require('../lib');
const fs = require('fs');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { read50Tawi } = require(`${BACKEND}/services/tax/taxDocuments.js`);
const { build50Tawi } = require(`${FIXTURES}/tawi50.js`);

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const U = `test_tawi_${crypto.randomBytes(4).toString('hex')}`;

(async () => {
  const image = await build50Tawi();
  const x = await read50Tawi(image);
  assert(x.is50Tawi && x.kind === 'salary' && x.amount === 600000 && x.withheld === 18500, `amounts and type (got ${JSON.stringify(x)})`);
  assert(x.socialSecurity === 9000 && x.providentFund === 30000 && x.yearBE === 2568 && /ตัวอย่าง/.test(x.payer || ''), 'social security, provident fund, year, payer');
  const receipt = await read50Tawi(fs.readFileSync(`${FIXTURES}/receipt.jpg`).toString('base64'));
  assert(!receipt.is50Tawi, 'a shop receipt is not a 50 ทวิ');

  await db.from('users').insert({ line_user_id: U, display_name: 'Tawi Test' });
  try {
    const post = (p, body) => fetch(`${BASE}/api${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
    let r = await post(`/tax/${U}/2568/documents/scan-50tawi`, { image, fileName: 'tawi.jpg' });
    assert(r.status === 201 && r.body.extracted.amount === 600000 && r.body.document.kind === '50tawi' && r.body.warnings.length === 0, `scan endpoint saves the document (got ${r.status})`);
    r = await post(`/tax/${U}/2569/documents/scan-50tawi`, { image });
    assert(r.status === 201 && r.body.warnings.some((w) => w.includes('2568, not 2569')), 'wrong-year warning');
    r = await post(`/tax/${U}/2568/documents/scan-50tawi`, { image: fs.readFileSync(`${FIXTURES}/receipt.jpg`).toString('base64') });
    assert(r.status === 422 && r.body.error.includes("doesn't look like a 50 ทวิ"), 'a receipt -> 422, nothing saved');
    assert((await db.from('tax_documents').select('id').eq('line_user_id', U)).data.length === 2, 'two documents saved');
  } finally {
    const { data: left } = await db.storage.from('tax-documents').list(U);
    if (left && left.length) await db.storage.from('tax-documents').remove(left.map((f) => `${U}/${f.name}`));
    await db.from('users').delete().eq('line_user_id', U);
  }
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); console.log('FAIL: crashed'); process.exit(1); });
