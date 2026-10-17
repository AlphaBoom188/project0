// A transaction's thumbnail_url must be a path inside the caller's own folder,
// in the exact shape the scan endpoint issues -- the server signs whatever path
// is stored, so otherwise a client could read another user's receipt thumbnail.
const { BASE } = require('../lib');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const U = 'test_thumb_path';
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures++; };
const api = (p, o = {}) =>
  fetch(`${BASE}/api${p}`, { headers: { 'Content-Type': 'application/json' }, ...o }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

async function cleanup() {
  for (const t of ['transactions', 'categories', 'users']) await db.from(t).delete().eq('line_user_id', U);
}

(async () => {
  await cleanup();
  await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: U, display_name: 'Thumb Path Test' }) });
  const [cat] = (await api(`/categories/${U}?type=expense`)).body.categories;
  const create = (thumbnail_url) => api(`/transactions/${U}`, { method: 'POST', body: JSON.stringify({ category_id: cat.id, amount: 10, type: 'expense', transaction_date: new Date().toISOString(), thumbnail_url, channel: 'liff' }) });

  for (const [label, path] of [
    ["another user's folder", 'Uabcdef0123456789abcdef0123456789/1792052834326-96d93cdf.jpg'],
    ['path traversal', `${U}/../Uabcdef0123456789abcdef0123456789/1792052834326-96d93cdf.jpg`],
    ['wrong file name shape', `${U}/receipt.jpg`],
    ['leading slash', `/${U}/1792052834326-96d93cdf.jpg`],
  ]) {
    const r = await create(path);
    assert(r.status === 400 && /thumbnail_url/.test(r.body.error), `create with ${label} -> 400 (got ${r.status} ${JSON.stringify(r.body)})`);
  }
  const own = await create(`${U}/1792052834326-96d93cdf.jpg`);
  assert(own.status === 201, `create with a path in the user's own folder -> 201 (got ${own.status})`);
  const none = await create(undefined);
  assert(none.status === 201, 'create with no thumbnail still works');

  const id = none.body.transaction.id;
  const putOther = await api(`/transactions/${U}/${id}`, { method: 'PUT', body: JSON.stringify({ thumbnail_url: 'Uabcdef0123456789abcdef0123456789/1792052834326-96d93cdf.jpg' }) });
  assert(putOther.status === 400, `update to another user's path -> 400 (got ${putOther.status})`);
  const putNull = await api(`/transactions/${U}/${own.body.transaction.id}`, { method: 'PUT', body: JSON.stringify({ thumbnail_url: null }) });
  assert(putNull.status === 200 && putNull.body.transaction.thumbnail_url === null, `update can clear the thumbnail (got ${putNull.status})`);

  await cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); await cleanup(); process.exit(1); });
