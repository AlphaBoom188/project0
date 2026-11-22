// Bulk slip import: pure row building (direction, account match, dates,
// combined alerts), then REST: auth, duplicate reads that never reach
// OpenAI, import validation, re-import no-op, transfer balances, one combined
// budget alert, undo (only slip rows, edited rows stay, balances restored),
// the single scan sharing the key, and the rate limit. test_ users only.
const { BASE, BACKEND } = require('../lib');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { buildRow, matchAccount, slipDate, combineAlerts, validateRow } = require(`${BACKEND}/services/slipImport.js`);
const { slipKey, buildSlipQr, parseSlipQr } = require(`${BACKEND}/services/slipQr.js`);

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };

// --- Pure ---
const accts = [
  { id: 'k', account_name: 'KBank', account_number_masked: '123-4-56789-0' },
  { id: 'b', account_name: 'BBL', account_number_masked: '•••4321' },
];
assert(matchAccount('xxx-x-x6789-x', accts).id === 'k' && matchAccount('XXX-X-XX432-1', accts).id === 'b' && matchAccount('xxx-x-x1111-x', accts) === null && matchAccount('x12', accts) === null, 'account match from masked slip numbers');
assert(matchAccount('xxx-x-x6789-x', [...accts, { id: 'k2', account_name: 'K2', account_number_masked: '999-9-56789-0' }]) === null, 'ambiguous match counts as none');
const ex = (o) => ({ is_slip: true, amount: 250, date: '2026-11-20', time: '18:45', from_name: 'Test User', from_account: null, to_name: 'นาย ทดสอบ ร้านค้า', to_account: null, ...o });
let r = buildRow(ex({ from_account: 'xxx-x-x6789-x' }), accts);
assert(r.type === 'expense' && r.from_account_id === 'k' && r.description === 'ทดสอบ ร้านค้า' && !r.needs_review && r.transaction_date === '2026-11-20T11:45:00.000Z', 'paid from own account: expense, title stripped, Bangkok time');
r = buildRow(ex({ to_account: 'xxx-x-x6789-x', from_name: 'MR. SOMEONE ELSE' }), accts);
assert(r.type === 'income' && r.to_account_id === 'k' && r.description === 'SOMEONE ELSE', 'paid into own account: income from the payer');
r = buildRow(ex({ from_account: 'xxx-x-x6789-x', to_account: 'xxx4321' }), accts);
assert(r.type === 'transfer' && r.from_account_id === 'k' && r.to_account_id === 'b' && r.description === 'KBank → BBL', 'both own accounts: one transfer');
r = buildRow(ex({}), accts);
assert(r.type === 'expense' && r.needs_review && r.reason.includes("Couldn't tell"), 'no account match: needs a look, defaults to expense');
r = buildRow(ex({ from_account: 'xxx-x-x6789-x', time: null }), accts);
assert(r.transaction_date === '2026-11-20T12:00:00.000Z', 'no time: date stamped T12:00:00Z');
r = buildRow(ex({ from_account: 'xxx-x-x6789-x', date: null, amount: null }), accts, new Date('2026-11-24T20:00:00Z'));
assert(r.needs_review && r.reason.includes('amount') && r.reason.includes('date') && r.transaction_date === '2026-11-25T12:00:00.000Z', 'unreadable date and amount: needs a look, today (Bangkok)');
assert(slipDate({ date: '2026-11-20', time: '00:30' }) === '2026-11-19T17:30:00.000Z', 'Bangkok 00:30 is 17:30 UTC the day before');
const combined = combineAlerts([{ budget_alert: { categoryName: 'Food', totalSpent: 900 } }, { budget_alert: { categoryName: 'Food', totalSpent: 1200 } }, { event_budget_alerts: [{ title: 'Trip', level: 'warning' }] }, {}]);
assert(combined.budget_alerts.length === 1 && combined.budget_alerts[0].totalSpent === 1200 && combined.event_budget_alerts.length === 1, 'alerts combined: the latest per category');
const key = 'slipqr:' + 'a'.repeat(64);
assert(validateRow({ slip_key: 'stmt:' + 'a'.repeat(64), type: 'expense', amount: 1, transaction_date: '2026-11-20', category_id: 'c' }).includes('slip_key') && validateRow({ slip_key: key, type: 'expense', amount: 0, transaction_date: '2026-11-20', category_id: 'c' }).includes('amount') && validateRow({ slip_key: key, type: 'expense', amount: 5, transaction_date: '2026-11-20' }).includes('category') && validateRow({ slip_key: key, type: 'transfer', amount: 5, transaction_date: '2026-11-20' }) === null, 'row validation');

// --- REST ---
const U = `test_slips_${crypto.randomBytes(4).toString('hex')}`;
const call = (method, p, body) => fetch(`${BASE}/api${p}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }).then(async (res) => ({ status: res.status, body: await res.json().catch(() => ({})) }));
const balance = async (id) => Number((await db.from('accounts').select('balance').eq('id', id).single()).data.balance);
const hex = () => crypto.randomBytes(32).toString('hex');

(async () => {
  await call('POST', '/users', { line_user_id: U, display_name: 'Slips' });
  try {
    assert((await call('POST', '/slips/Uabc123/read', {})).status === 401, 'another user without a token: 401');
    assert((await call('POST', `/slips/${U}/read`, { image_base64: 'x' })).status === 400, 'no key material: 400');

    const { data: cats } = await db.from('categories').select('id, name, type').eq('line_user_id', U);
    const food = cats.find((c) => c.name === 'Food');
    const salary = cats.find((c) => c.type === 'income');
    await db.from('categories').update({ budget_amount: 300, budget_period: 'monthly' }).eq('id', food.id);
    const { data: [k, b] } = await db.from('accounts').insert([
      { line_user_id: U, account_name: 'KBank', account_type: 'bank', balance: 10000, account_number_masked: '123-4-56789-0' },
      { line_user_id: U, account_name: 'BBL', account_type: 'bank', balance: 5000, account_number_masked: '•••4321' },
    ]).select();

    // Duplicate reads never reach OpenAI (no image sent: a non-duplicate would 400)
    const qr = parseSlipQr(buildSlipQr('004', 'TESTREF000001'));
    const qrKey = slipKey(U, { qr });
    await db.from('transactions').insert({ line_user_id: U, category_id: food.id, amount: 99, type: 'expense', description: 'known', slip_hash: qrKey, transaction_date: new Date().toISOString() });
    let res = await call('POST', `/slips/${U}/read`, { image_sha256: hex(), qr });
    assert(res.status === 200 && res.body.status === 'duplicate' && res.body.existing.amount === 99, 'known QR key: duplicate, no OCR');
    const raw = hex();
    await db.from('transactions').insert({ line_user_id: U, category_id: food.id, amount: 77, type: 'expense', description: 'bot photo', slip_hash: raw, transaction_date: new Date().toISOString() });
    res = await call('POST', `/slips/${U}/read`, { image_sha256: raw });
    assert(res.body.status === 'duplicate' && res.body.existing.amount === 77, 'legacy raw image hash (bot photos) still counts as a duplicate');
    const imgOnly = hex();
    await db.from('transactions').insert({ line_user_id: U, category_id: food.id, amount: 55, type: 'expense', description: 'no qr', slip_hash: slipKey(U, { imageSha256: imgOnly }), transaction_date: new Date().toISOString() });
    res = await call('POST', `/slips/${U}/read`, { image_sha256: imgOnly, qr: parseSlipQr(buildSlipQr('014', 'OTHERREF0002')) });
    assert(res.body.status === 'duplicate', 'a slip first saved by image hash still matches when its QR decodes later');

    // The single scan shares the key: a known slip is a 409 before OCR
    res = await call('POST', `/ocr/scan/${U}`, { image_base64: 'x', slip_hash: hex(), qr });
    assert(res.status === 409 && res.body.duplicate, 'single scan: same slip QR -> duplicate (bulk and single share keys)');

    // Import validation
    const k1 = slipKey(U, { qr: parseSlipQr(buildSlipQr('004', 'IMPORT00001')) });
    const k2 = slipKey(U, { qr: parseSlipQr(buildSlipQr('004', 'IMPORT00002')) });
    const k3 = slipKey(U, { qr: parseSlipQr(buildSlipQr('004', 'IMPORT00003')) });
    const k4 = slipKey(U, { imageSha256: hex() });
    assert((await call('POST', `/slips/${U}/import`, { rows: [{ slip_key: 'bad', type: 'expense', amount: 5, transaction_date: '2026-11-20', category_id: food.id }] })).status === 400, 'bad key: 400');
    assert((await call('POST', `/slips/${U}/import`, { rows: Array.from({ length: 51 }, () => ({})) })).status === 400, 'more than 50 rows: 400');
    res = await call('POST', `/slips/${U}/import`, { rows: [{ slip_key: k4, type: 'expense', amount: 5, transaction_date: '2026-11-20T12:00:00Z', category_id: '00000000-0000-0000-0000-000000000000' }] });
    assert(res.status === 200 && res.body.imported.length === 0 && res.body.errors.length === 1, "someone else's category: not saved, reported");

    // Import: 2 expenses (Food over budget twice -> one alert), an income, a transfer
    const today = new Date().toISOString();
    const rows = [
      { slip_key: k1, type: 'expense', amount: 200, transaction_date: today, description: 'Noodles', category_id: food.id, from_account_id: k.id },
      { slip_key: k2, type: 'expense', amount: 150, transaction_date: today, description: 'Coffee', category_id: food.id, from_account_id: k.id },
      { slip_key: k3, type: 'income', amount: 1000, transaction_date: today, description: 'Test Payer', category_id: salary.id, to_account_id: b.id },
      { slip_key: k4, type: 'transfer', amount: 500, transaction_date: today, description: 'KBank → BBL', from_account_id: k.id, to_account_id: b.id },
    ];
    res = await call('POST', `/slips/${U}/import`, { rows });
    assert(res.status === 200 && res.body.imported.length === 4 && res.body.skipped === 0, `imported 4 (got ${res.status} ${JSON.stringify(res.body).slice(0, 200)})`);
    assert(res.body.budget_alerts.length === 1 && res.body.budget_alerts[0].categoryName === 'Food', 'one combined budget alert for the category (no LINE push: channel liff)');
    assert(await balance(k.id) === 10000 - 200 - 150 - 500 && await balance(b.id) === 5000 + 1000 + 500, 'balances move like manual entries; the transfer moves both');
    const imported = res.body.imported;
    res = await call('POST', `/slips/${U}/import`, { rows });
    assert(res.body.imported.length === 0 && res.body.skipped === 4, 're-import is a no-op');
    assert(await balance(k.id) === 9150, 'balances unchanged by the re-import');

    // Undo: the user edits one row first; that one stays
    const edited = imported.find((i) => i.amount === 150);
    await db.from('transactions').update({ amount: 160 }).eq('id', edited.id);
    const manual = (await db.from('transactions').select('id').eq('line_user_id', U).eq('description', 'bot photo').single()).data; // raw hash: not a slip-import row
    res = await call('POST', `/slips/${U}/undo`, { rows: [...imported, { id: manual.id, amount: 77, type: 'expense', from_account_id: null, to_account_id: null }] });
    assert(res.status === 200 && res.body.removed === 3 && res.body.kept === 2, `undo removes the 3 unchanged slip rows (got ${JSON.stringify(res.body)})`);
    const left = (await db.from('transactions').select('id').in('id', [...imported.map((i) => i.id), manual.id])).data.map((t) => t.id).sort();
    assert(left.join() === [edited.id, manual.id].sort().join(), 'the edited slip row and the non-slip row stay');
    assert(await balance(k.id) === 10000 - 150 && await balance(b.id) === 5000, 'balances restored for the removed rows');

    // Rate limit on import (20 / 10 min)
    let last;
    for (let i = 0; i < 21; i += 1) last = await call('POST', `/slips/${U}/import`, {});
    assert(last.status === 429 && last.body.code === 'rate_limited', 'import is rate limited (429 after 20)');
  } finally {
    await db.from('transactions').delete().eq('line_user_id', U);
    await db.from('accounts').delete().eq('line_user_id', U);
    await db.from('categories').delete().eq('line_user_id', U);
    await db.from('users').delete().eq('line_user_id', U);
  }
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); console.log('FAIL: crashed'); process.exit(1); });
