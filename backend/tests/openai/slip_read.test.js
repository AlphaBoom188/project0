// Paid (a fraction of a cent per image): reading a synthetic e-slip with
// OpenAI Vision directly, then through POST /api/slips/:u/read with the
// user's own account registered (direction, Bangkok time, account match),
// and a shop receipt coming back as not a slip.
const { BASE, BACKEND, FIXTURES } = require('../lib');
const fs = require('fs');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { extractSlipFromImage } = require(`${BACKEND}/services/receiptExtraction.js`);
const { buildSlip } = require(`${FIXTURES}/slip.js`);

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const U = `test_slipread_${crypto.randomBytes(4).toString('hex')}`;
const post = (p, body) => fetch(`${BASE}/api${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));

(async () => {
  const image = await buildSlip();
  const x = await extractSlipFromImage(image);
  assert(x.is_slip && x.amount === 1250 && x.date === '2026-11-20' && x.time === '18:45', `amount, Gregorian date from the Buddhist year, time (got ${JSON.stringify({ a: x.amount, d: x.date, t: x.time })})`);
  assert(/ทดสอบ/.test(x.from_name || '') && /ตัวอย่าง/.test(x.to_name || '') && /6789/.test(x.from_account || ''), 'names and the masked account');

  await post('/users', { line_user_id: U, display_name: 'Slip read' });
  try {
    await db.from('accounts').insert({ line_user_id: U, account_name: 'Test bank', account_type: 'bank', balance: 0, account_number_masked: '123-4-56789-0' });
    const sha = crypto.createHash('sha256').update(Buffer.from(image, 'base64')).digest('hex');
    let r = await post(`/slips/${U}/read`, { image_base64: image, image_sha256: sha, qr: null });
    const row = r.body.row || {};
    assert(r.status === 200 && r.body.status === 'new' && row.type === 'expense' && row.amount === 1250 && row.from_account_id && !row.needs_review, `read: an expense from the registered account (got ${r.status} ${r.body.status} ${row.type})`);
    assert(row.transaction_date === '2026-11-20T11:45:00.000Z' && /ตัวอย่าง/.test(row.description) && row.category_id && /^slip:[0-9a-f]{64}$/.test(row.slip_key), 'Bangkok time, payee as description, a category, image key');
    const receipt = fs.readFileSync(`${FIXTURES}/receipt.jpg`);
    r = await post(`/slips/${U}/read`, { image_base64: receipt.toString('base64'), image_sha256: crypto.createHash('sha256').update(receipt).digest('hex') });
    assert(r.body.status === 'not_slip', 'a shop receipt is not a slip');
  } finally {
    await db.from('accounts').delete().eq('line_user_id', U);
    await db.from('categories').delete().eq('line_user_id', U);
    await db.from('users').delete().eq('line_user_id', U);
  }
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); console.log('FAIL: crashed'); process.exit(1); });
