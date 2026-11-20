// Fixes from the 2026-11-21 security review: the tax summary accepts only
// its own signed link, open reminders are capped (each one becomes LINE
// pushes), and reminder creation is rate limited.
const { BASE } = require('../lib');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const U = `test_secrev_${crypto.randomBytes(4).toString('hex')}`;
const call = (method, p, body) => fetch(`${BASE}/api${p}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const later = () => new Date(Date.now() + 86400000).toISOString();

(async () => {
  await db.from('users').insert({ line_user_id: U, display_name: 'Sec Review' });
  try {
    // A transactions export link (signed, same user) on the tax export path
    const { query } = (await call('POST', `/transactions/${U}/export-link`, { query: 'type=expense' })).body;
    let r = await fetch(`${BASE}/api/tax/${U}/2569/export?${query}`);
    assert(r.status === 401 && (await r.json()).code === 'link_invalid', 'a transactions link is refused by the tax export');
    const { url } = (await call('POST', `/tax/${U}/2569/export-link`, { format: 'csv' })).body;
    assert((await fetch(`${BASE}${url}`)).status === 200, 'the tax link itself still works');

    // Open-reminder cap
    const rows = Array.from({ length: 500 }, (_, i) => ({ line_user_id: U, title: `R${i}` }));
    for (let i = 0; i < rows.length; i += 250) await db.from('reminders').insert(rows.slice(i, i + 250));
    r = await call('POST', `/reminders/${U}`, { title: 'one more', remind_at: later() });
    assert(r.status === 400 && r.body.error.includes('500 open reminders'), 'open reminders capped at 500');
    await db.from('reminders').delete().eq('line_user_id', U);

    // Creation rate limit (60 per 10 minutes)
    let limited = null;
    for (let i = 0; i < 61; i += 1) {
      const x = await call('POST', `/reminders/${U}`, { title: `T${i}` });
      if (x.status === 429) { limited = i; break; }
    }
    assert(limited === 59, `the 61st create in 10 minutes gets 429 (the capped one above counted too) (got ${limited})`);
  } finally {
    await db.from('reminders').delete().eq('line_user_id', U);
    await db.from('users').delete().eq('line_user_id', U);
  }
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); console.log('FAIL: crashed'); process.exit(1); });
