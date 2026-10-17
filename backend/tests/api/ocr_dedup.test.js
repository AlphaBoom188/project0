// Re-scanning an already-recorded receipt must be rejected as a duplicate
// (HTTP 409) before any OpenAI call is made -- so this suite costs nothing.
const { BASE, FIXTURES } = require('../lib');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const U = 'test_ocr_dedup';
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures++; };
const api = (p, o = {}) =>
  fetch(`${BASE}/api${p}`, { headers: { 'Content-Type': 'application/json' }, ...o }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

async function cleanup() {
  for (const t of ['transactions', 'categories', 'users']) await db.from(t).delete().eq('line_user_id', U);
}

(async () => {
  await cleanup();
  const imageBuffer = fs.readFileSync(path.join(FIXTURES, 'receipt.jpg'));
  // Salted so this suite's hash can never collide with the same fixture used by
  // the openai/ suites (slip_hash is UNIQUE across the whole table).
  const slipHash = crypto.createHash('sha256').update(imageBuffer).update('ocr_dedup_suite').digest('hex');

  await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: U, display_name: 'OCR Dedup Test' }) });
  const [category] = (await api(`/categories/${U}?type=expense`)).body.categories;
  const { error } = await db.from('transactions').insert({
    line_user_id: U, category_id: category.id, amount: 320, type: 'expense',
    description: 'Greenleaf Cafe', slip_hash: slipHash, transaction_date: '2026-01-15T12:34:00Z',
  });
  assert(!error, `seeded an already-recorded receipt (${error ? error.message : 'ok'})`);

  const res = await api(`/ocr/scan/${U}`, {
    method: 'POST',
    body: JSON.stringify({ image_base64: imageBuffer.toString('base64'), slip_hash: slipHash }),
  });
  assert(res.status === 409 && res.body.duplicate === true, `re-scan of a recorded receipt -> 409 duplicate (got ${res.status} ${JSON.stringify(res.body).slice(0, 120)})`);

  await cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); await cleanup(); process.exit(1); });
