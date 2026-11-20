// Tax documents over REST (migration 022): attach photos to incomes and
// deductions, list with signed URLs, filing-checklist ticks, move/detach,
// delete, validation, account deletion; plus interpret50Tawi (pure). The
// real 50 ทวิ reading is in tests/openai/tax_50tawi (paid).
const { BASE, BACKEND, FIXTURES } = require('../lib');
const fs = require('fs');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { interpret50Tawi, kindForClaim } = require(`${BACKEND}/services/tax/taxDocuments.js`);

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const call = (method, p, body) => fetch(`${BASE}/api${p}`, {
  method, headers: { 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const U = `test_taxdoc_${crypto.randomBytes(4).toString('hex')}`;
const OTHER = `test_taxdoc_o_${crypto.randomBytes(4).toString('hex')}`;
const IMG = fs.readFileSync(`${FIXTURES}/receipt.jpg`).toString('base64');

// --- interpret50Tawi (pure) ---
let x = interpret50Tawi({ is_50tawi: true, payer_name: ' Acme Co ', income_type: '40(1)', amount_paid: '600,000.00', tax_withheld: 18500, social_security: '9,000', provident_fund: null, tax_year_be: 2568 });
assert(x.is50Tawi && x.payer === 'Acme Co' && x.kind === 'salary' && x.amount === 600000 && x.withheld === 18500 && x.socialSecurity === 9000 && x.providentFund === null && x.yearBE === 2568, 'reads amounts with commas, maps 40(1) to salary');
x = interpret50Tawi({ is_50tawi: true, income_type: '40(6)', amount_paid: 100, tax_withheld: 500 });
assert(x.kind === null && x.incomeType === '40(6)' && x.withheld === null, '40(6) needs the user to pick; withheld above the amount is dropped');
assert(!interpret50Tawi({ is_50tawi: true }).is50Tawi && !interpret50Tawi({ is_50tawi: false, amount_paid: 5 }).is50Tawi, 'no amount or not a 50 ทวิ');
assert(interpret50Tawi({ is_50tawi: true, amount_paid: -5 }).amount === null && interpret50Tawi({ is_50tawi: true, income_type: '41(1)', amount_paid: 1 }).incomeType === null, 'negatives and junk types rejected');
assert(kindForClaim('life_insurance') === 'insurance' && kindForClaim('thai_esg') === 'fund' && kindForClaim('donation_double') === 'donation' && kindForClaim('home_loan_interest') === 'other', 'document kind from the deduction');

(async () => {
  for (const id of [U, OTHER]) await db.from('users').insert({ line_user_id: id, display_name: 'Tax Doc Test' });
  try {
    let r = await call('POST', `/tax/${U}/2568/incomes`, { kind: 'salary', amount: 500000, withheld: 5000 });
    const incomeId = r.body.income.id;
    await call('PUT', `/tax/${U}/2568/claims`, { life_insurance: 20000 });

    // --- Attach ---
    r = await call('POST', `/tax/${U}/2568/documents`, { image: IMG, incomeId, fileName: '50tawi.jpg' });
    assert(r.status === 201 && r.body.document.kind === '50tawi' && r.body.document.income_id === incomeId, `attach to an income -> kind 50tawi (got ${r.status} ${r.body.error || ''})`);
    const incDoc = r.body.document;
    assert(r.body.documents.length === 1 && /^https?:\/\//.test(r.body.documents[0].url) && !('storage_path' in r.body.documents[0]), 'listed with a signed URL, no storage path');
    assert(r.body.guide.documents.find((d) => d.key === 'salary').attached && !r.body.guide.documents.find((d) => d.key === 'life_insurance').attached, 'filing checklist: salary ticked, life insurance not yet');
    const img = await fetch(r.body.documents[0].url);
    assert(img.ok && (img.headers.get('content-type') || '').includes('image/jpeg'), 'the signed URL serves the JPEG');
    r = await call('POST', `/tax/${U}/2568/documents`, { image: IMG, claimKey: 'life_insurance' });
    assert(r.status === 201 && r.body.document.kind === 'insurance' && r.body.guide.documents.find((d) => d.key === 'life_insurance').attached, 'attach to a deduction -> insurance, ticked');
    const lifeDoc = r.body.document;
    r = await call('POST', `/tax/${U}/2568/documents`, { image: IMG });
    assert(r.status === 201 && r.body.document.kind === 'other' && r.body.document.income_id === null, 'unattached document');
    const looseDoc = r.body.document;
    const { data: files } = await db.storage.from('tax-documents').list(U);
    assert(files.length === 3, 'three files in the private bucket, in the user\'s folder');

    // --- Validation ---
    for (const [body, label] of [
      [{ image: 'not-base64-image' }, "isn't an image"], [{}, 'under 6 MB'], [{ image: IMG, kind: 'selfie' }, 'kind must be'],
      [{ image: IMG, incomeId: '00000000-0000-0000-0000-000000000000' }, 'Income not found'], [{ image: IMG, claimKey: 'solar_rooftop' }, "isn't a deduction in tax year 2568"],
      [{ image: IMG, incomeId, claimKey: 'life_insurance' }, 'not both'],
    ]) {
      const res = await call('POST', `/tax/${U}/2568/documents`, body);
      assert(res.status === 400 && res.body.error.includes(label), `400: ${label}`);
    }
    r = await call('POST', `/tax/${U}/2568/documents/scan-50tawi`, { image: 'nope' });
    assert(r.status === 400 && r.body.error.includes("isn't an image"), 'scan: a non-image is refused before any OCR call');
    assert((await call('POST', `/tax/${OTHER}/2568/documents`, { image: IMG, incomeId })).status === 400, "can't attach to someone else's income");

    // --- Move, detach, income deleted ---
    r = await call('PUT', `/tax/${U}/2568/documents/${looseDoc.id}`, { claimKey: 'life_insurance' });
    assert(r.status === 200 && r.body.documents.find((d) => d.id === looseDoc.id).claim_key === 'life_insurance', 'attach a loose document later');
    r = await call('PUT', `/tax/${U}/2568/documents/${looseDoc.id}`, { claimKey: null });
    assert(r.body.documents.find((d) => d.id === looseDoc.id).claim_key === null, 'detach');
    assert((await call('PUT', `/tax/${OTHER}/2568/documents/${looseDoc.id}`, {})).status === 404, "someone else's document -> 404");
    assert((await call('PUT', `/tax/${U}/2568/documents/nope`, {})).status === 400, 'malformed id -> 400');
    r = await call('DELETE', `/tax/${U}/2568/incomes/${incomeId}`);
    assert(r.body.documents.find((d) => d.id === incDoc.id).income_id === null, 'deleting the income keeps the document, detached');

    // --- Link through the income endpoints ---
    r = await call('POST', `/tax/${U}/2568/incomes`, { kind: 'salary', amount: 600000, documentId: incDoc.id });
    assert(r.body.documents.find((d) => d.id === incDoc.id).income_id === r.body.income.id, 'POST income with documentId links it');

    // --- Delete ---
    r = await call('DELETE', `/tax/${U}/2568/documents/${lifeDoc.id}`);
    assert(r.status === 200 && !r.body.documents.some((d) => d.id === lifeDoc.id), 'delete');
    assert((await db.storage.from('tax-documents').list(U)).data.length === 2, 'its file is gone');
    await call('DELETE', `/tax/${OTHER}/2568/documents/${incDoc.id}`);
    assert((await db.from('tax_documents').select('id').eq('id', incDoc.id)).data.length === 1, "another user's delete does nothing");

    // --- Account deletion ---
    assert((await call('DELETE', `/users/${U}`, { confirm: 'DELETE' })).status === 200, 'delete the account');
    assert((await db.storage.from('tax-documents').list(U)).data.length === 0 && (await db.from('tax_documents').select('id').eq('line_user_id', U)).data.length === 0, 'files and rows gone');
  } finally {
    const { data: left } = await db.storage.from('tax-documents').list(U);
    if (left && left.length) await db.storage.from('tax-documents').remove(left.map((f) => `${U}/${f.name}`));
    for (const id of [U, OTHER]) await db.from('users').delete().eq('line_user_id', id);
  }
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); console.log('FAIL: crashed'); process.exit(1); });
