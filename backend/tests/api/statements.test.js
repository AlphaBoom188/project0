// POST /api/statements/:u/parse and /import, with a synthetic KBank-layout
// statement (tests/fixtures/kbankStatement.js). Free: every merchant in the
// sample is caught by the keyword rules and the user has one income
// category, so no OpenAI call is made.
const { BASE, FIXTURES } = require('../lib');
const { createClient } = require('@supabase/supabase-js');
const { buildStatement, SAMPLE } = require(`${FIXTURES}/kbankStatement.js`);
const { buildBblStatement, BBL_SAMPLE } = require(`${FIXTURES}/bblStatement.js`);

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const U = `test_stmt_${Date.now()}`;
const OTHER = `test_stmt_other_${Date.now()}`;
const U2 = `test_stmt_xfer_${Date.now()}`;

let failures = 0;
function assert(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) failures += 1;
}
async function api(path, options = {}) {
  const res = await fetch(`${BASE}/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });

async function cleanup() {
  for (const u of [U, OTHER, U2]) {
    await db.from('transactions').delete().eq('line_user_id', u);
    await db.from('accounts').delete().eq('line_user_id', u);
    await db.from('categories').delete().eq('line_user_id', u);
    await db.from('users').delete().eq('line_user_id', u);
  }
}

(async () => {
  await post('/users', { line_user_id: U, display_name: 'Statement Test' });
  await post('/users', { line_user_id: OTHER, display_name: 'Statement Other' });
  const { pages } = buildStatement(SAMPLE, { perPage: 4 });

  // A manually logged BTS fare on the same Bangkok day -> possible duplicate.
  const { body: cats } = await api(`/categories/${U}`);
  const cat = (name) => cats.categories.find((c) => c.name === name);
  await post(`/transactions/${U}`, { type: 'expense', amount: 35, category_id: cat('Transport').id, description: 'bts', transaction_date: '2026-06-04T12:00:00Z' });

  // --- Validation ---
  assert((await post(`/statements/${U}/parse`, { pages: 'nope' })).status === 400, 'parse: malformed pages -> 400');
  assert((await post(`/statements/test_stmt_nobody_${Date.now()}/parse`, { pages })).status === 404, 'parse: unknown user -> 404');
  const other = await post(`/statements/${U}/parse`, { pages: [[{ x: 10, y: 10, s: 'Some other bank statement' }]] });
  assert(other.status === 422 && /KBank/.test(other.body.error), 'parse: unsupported format -> 422 naming KBank');

  // --- Preview ---
  const p = await post(`/statements/${U}/parse`, { pages });
  assert(p.status === 200 && p.body.verified === true && p.body.rows.length === SAMPLE.length, `parse: ${SAMPLE.length} rows, verified (got ${p.status} ${p.body.rows && p.body.rows.length})`);
  assert(p.body.account_last4 === '7890' && p.body.period_start === '2026-06-01' && p.body.period_end === '2026-06-30', 'parse: account last 4 and period');
  assert(!('summary' in p.body) && !JSON.stringify(p.body).includes('STATEMENTUSER'), "parse: the response doesn't echo the holder's full name or account number");
  const rows = p.body.rows;
  const byDesc = (d) => rows.find((r) => r.description === d);
  const own = rows.filter((r) => r.status === 'own_transfer');
  assert(own.length === 2 && own.some((r) => r.type === 'expense') && own.some((r) => r.type === 'income'), 'own-account transfers both ways are marked own_transfer');
  const dup = rows.find((r) => r.status === 'possible_duplicate');
  assert(dup && dup.description === 'BTS TIM TVM' && /bts/.test(dup.note), `the BTS fare already logged by hand is a possible duplicate (${dup && dup.note})`);
  assert(JSON.stringify(p.body.counts) === JSON.stringify({ total: 10, new: 7, imported: 0, own_transfer: 2, bank_transfer: 0, transfer_match: 0, possible_duplicate: 1 }), `counts (got ${JSON.stringify(p.body.counts)})`);
  assert(byDesc('LINE MAN (QR by ttb)').category_name === 'Food' && byDesc('CS 7-Eleven Vending MPQ 00016').category_name === 'Shopping' && byDesc('แกร็บแท็กซี่ (ประเทศไทย)').category_name === 'Transport',
    'keyword rules: LINE MAN -> Food, 7-Eleven -> Shopping, Thai Grab taxi -> Transport');
  assert(byDesc('GRABPAY WALLET').category_name === 'Others', 'a wallet top-up is left uncategorized (Others)');
  assert(rows.filter((r) => r.type === 'income').every((r) => r.category_name === 'Income'), 'deposits go to the Income category');
  assert(rows[0].transaction_date === '2026-06-01T00:27:00+07:00' && byDesc('Interest Deposit').transaction_date === '2026-06-19T12:00:00+07:00', 'transaction_date is the Bangkok date and time (noon when there is no time)');
  assert(rows.every((r) => /^stmt:[0-9a-f]{64}$/.test(r.row_key)) && new Set(rows.map((r) => r.row_key)).size === rows.length, 'each row has a unique stmt: row_key');

  // --- Import validation ---
  const newRows = rows.filter((r) => r.status === 'new');
  const asImport = (r, extra = {}) => ({ row_key: r.row_key, transaction_date: r.transaction_date, description: r.description, amount: r.amount, type: r.type, category_id: r.category_id, ...extra });
  const bad = async (label, rowsBody, extra = {}) => {
    const res = await post(`/statements/${U}/import`, { rows: rowsBody, ...extra });
    assert(res.status === 400, `import: ${label} -> 400 (got ${res.status} ${res.body.error || ''})`);
  };
  await bad('empty rows', []);
  await bad('bad row_key', [asImport(newRows[0], { row_key: 'stmt:abc' })]);
  await bad('bad transaction_date', [asImport(newRows[0], { transaction_date: '2026-06-01' })]);
  await bad('negative amount', [asImport(newRows[0], { amount: -5 })]);
  await bad('income category on an expense', [asImport(newRows[0], { category_id: cat('Income').id })]);
  const { body: otherCats } = await api(`/categories/${OTHER}`);
  await bad("another user's category", [asImport(newRows[0], { category_id: otherCats.categories.find((c) => c.name === 'Food').id })]);
  await bad('malformed account id', [asImport(newRows[0])], { account_id: 'nope' });
  const { body: otherAcct } = await post(`/accounts/${OTHER}`, { account_name: 'Other KBank', account_type: 'bank', balance: 0 });
  await bad("another user's account", [asImport(newRows[0])], { account_id: otherAcct.account.id });
  const { count: afterBad } = await db.from('transactions').select('*', { count: 'exact', head: true }).eq('line_user_id', U);
  assert(afterBad === 1, 'nothing written by any rejected import');

  // --- Import, linked to an account ---
  const { body: acct } = await post(`/accounts/${U}`, { account_name: 'KBank', account_type: 'bank', balance: 500 });
  const picked = newRows.map((r) => asImport(r));
  picked[0].category_id = cat('Food').id; // user re-categorized one row
  const imp = await post(`/statements/${U}/import`, { rows: picked, account_id: acct.account.id });
  assert(imp.status === 200 && imp.body.imported === newRows.length && imp.body.skipped === 0, `import: ${newRows.length} imported (got ${JSON.stringify(imp.body)})`);
  const { data: stored } = await db.from('transactions').select('*').eq('line_user_id', U).like('slip_hash', 'stmt:%').order('transaction_date');
  assert(stored.length === newRows.length && stored.every((t) => t.payment_method === 'BANK'), 'stored with payment_method BANK');
  assert(stored[0].category_id === cat('Food').id && stored[0].transaction_date.startsWith('2026-05-31T17:27:00'), 'the edited category is kept; 00:27 Bangkok stored as 17:27 UTC the day before');
  assert(stored.filter((t) => t.type === 'expense').every((t) => t.from_account_id === acct.account.id && !t.to_account_id)
    && stored.filter((t) => t.type === 'income').every((t) => t.to_account_id === acct.account.id && !t.from_account_id), 'expenses linked as from_account, income as to_account');
  const { data: acctAfter } = await db.from('accounts').select('balance').eq('id', acct.account.id).single();
  assert(Number(acctAfter.balance) === 500, `the linked account's balance is unchanged (got ${acctAfter.balance})`);

  // --- Re-import and re-parse ---
  const again = await post(`/statements/${U}/import`, { rows: picked, account_id: acct.account.id });
  assert(again.status === 200 && again.body.imported === 0 && again.body.skipped === newRows.length, 're-importing the same rows inserts nothing');
  const p2 = await post(`/statements/${U}/parse`, { pages });
  assert(p2.body.counts.imported === newRows.length && p2.body.counts.new === 0, `re-parsing shows them as already imported (${JSON.stringify(p2.body.counts)})`);
  const pOther = await post(`/statements/${OTHER}/parse`, { pages });
  assert(pOther.body.counts.imported === 0 && pOther.body.rows[0].row_key !== rows[0].row_key, "another user's preview of the same statement isn't affected (keys are per user)");

  // --- Bangkok Bank ---
  const { pages: bblPages } = buildBblStatement(BBL_SAMPLE);
  const b = await post(`/statements/${U}/parse`, { pages: bblPages });
  assert(b.status === 200 && b.body.bank === 'bbl' && b.body.verified && b.body.account_last4 === '3456', `BBL parse: bank, verified, account (got ${b.status} ${b.body.bank})`);
  assert(JSON.stringify(b.body.counts) === JSON.stringify({ total: 7, new: 5, imported: 0, own_transfer: 0, bank_transfer: 2, transfer_match: 0, possible_duplicate: 0 }), `BBL counts: the two TRF OTH BK rows are bank_transfer (got ${JSON.stringify(b.body.counts)})`);
  const out = b.body.rows.find((r) => r.status === 'bank_transfer' && r.type === 'expense');
  assert(out && out.description === 'Transfer to another bank' && out.transfer_default && /imported as a Transfer/.test(out.note), 'a bank transfer defaults to a Transfer and says so');
  assert(b.body.rows.every((r) => r.transaction_date.endsWith('T12:00:00+07:00')), 'BBL rows have no time: noon Bangkok');
  assert(b.body.rows.filter((r) => r.type === 'expense').every((r) => r.category_name === 'Others'), 'generic bank codes go to Others without an AI call');
  const bImp = await post(`/statements/${U}/import`, { rows: b.body.rows.filter((r) => r.status === 'new' || r === out).map((r) => asImport(r)) });
  assert(bImp.status === 200 && bImp.body.imported === 6, `importing the new rows plus one ticked bank transfer (got ${JSON.stringify(bImp.body)})`);
  const b2 = await post(`/statements/${U}/parse`, { pages: bblPages });
  assert(b2.body.counts.imported === 6 && b2.body.counts.bank_transfer === 1, 'BBL re-parse: 6 already imported, the unticked transfer still flagged');

  // --- Own transfers across two statements (statementTransfers.js) ---
  await post('/users', { line_user_id: U2, display_name: 'Transfer Test' });
  const { body: kAcct } = await post(`/accounts/${U2}`, { account_name: 'KBank', account_type: 'bank', balance: 1000 });
  const { body: bAcct } = await post(`/accounts/${U2}`, { account_name: 'Bangkok Bank', account_type: 'bank', balance: 2000 });
  const kb = await post(`/statements/${U2}/parse`, { pages });
  const kOwn = kb.body.rows.filter((r) => r.status === 'own_transfer');
  assert(kOwn.length === 2 && kOwn.every((r) => r.transfer_default), 'KBank own transfers default to importing as a Transfer');
  assert(kb.body.rows.filter((r) => r.status === 'new').every((r) => !r.transfer_default), 'ordinary rows default to a category');
  const asTransfer = (r) => ({ row_key: r.row_key, transaction_date: r.transaction_date, description: r.description, amount: r.amount, type: 'transfer', direction: r.type === 'expense' ? 'out' : 'in' });
  const noStatement = await post(`/statements/${U2}/import`, { rows: kOwn.map(asTransfer) });
  assert(noStatement.status === 400 && /statement/.test(noStatement.body.error), 'importing transfers without { statement } -> 400');
  const badDir = await post(`/statements/${U2}/import`, { rows: [{ ...asTransfer(kOwn[0]), direction: 'sideways' }], statement: { bank: 'kbank', account_last4: '7890' } });
  assert(badDir.status === 400 && /direction/.test(badDir.body.error), 'a transfer with a bad direction -> 400');
  const kImp = await post(`/statements/${U2}/import`, { rows: kOwn.map(asTransfer), account_id: kAcct.account.id, statement: { bank: 'kbank', account_last4: '7890' } });
  assert(kImp.status === 200 && kImp.body.imported === 2 && kImp.body.merged === 0, `KBank transfers inserted (got ${JSON.stringify(kImp.body)})`);
  let { data: xfers } = await db.from('transactions').select('*').eq('line_user_id', U2).eq('type', 'transfer').order('transaction_date');
  assert(xfers.length === 2 && xfers[0].description === 'KBank •••7890 → another account' && xfers[0].from_account_id === kAcct.account.id && !xfers[0].to_account_id && !xfers[0].category_id,
    `outgoing own transfer: "KBank •••7890 → another account", from the KBank account, no category (got ${xfers[0] && xfers[0].description})`);
  assert(xfers[1].description === 'another account → KBank •••7890' && xfers[1].to_account_id === kAcct.account.id, 'incoming own transfer: "another account → KBank •••7890"');

  const { pages: bPages } = buildBblStatement([
    { date: '2026-06-02', particulars: 'PMT FOR GOODS', amount: 544.58, sign: -1 },     // same amount and day, but a payment
    { date: '2026-06-03', particulars: 'TRF FR OTH BK', amount: 544.58, sign: 1 },      // the KBank transfer out, a day later
    { date: '2026-06-05', particulars: 'TRF TO OTH BK', amount: 26936.67, sign: -1 },   // the KBank transfer in
  ], { opening: 3000000, period: ['01/06/2026', '30/06/2026'] });
  const bb = await post(`/statements/${U2}/parse`, { pages: bPages });
  assert(bb.body.verified && JSON.stringify(bb.body.counts) === JSON.stringify({ total: 3, new: 1, imported: 0, own_transfer: 0, bank_transfer: 0, transfer_match: 2, possible_duplicate: 0 }), `BBL: both transfers match KBank's, the payment doesn't (got ${JSON.stringify(bb.body.counts)})`);
  const bIn = bb.body.rows.find((r) => r.type === 'income');
  assert(bIn.status === 'transfer_match' && bIn.transfer_default && bIn.note.includes('KBank •••7890 → another account') && bIn.note.includes('2026-06-02'), `a match names the other side and its date (got ${bIn.note})`);
  assert(bb.body.rows.find((r) => r.description === 'Payment for goods').status === 'new', 'a payment with the same amount and day is not treated as a transfer');
  const bImp2 = await post(`/statements/${U2}/import`, { rows: bb.body.rows.filter((r) => r.status === 'transfer_match').map(asTransfer), account_id: bAcct.account.id, statement: { bank: 'bbl', account_last4: '3456' } });
  assert(bImp2.status === 200 && bImp2.body.imported === 2 && bImp2.body.merged === 2, `both joined, nothing new inserted (got ${JSON.stringify(bImp2.body)})`);
  ({ data: xfers } = await db.from('transactions').select('*').eq('line_user_id', U2).eq('type', 'transfer').order('transaction_date'));
  assert(xfers.length === 2, `still one entry per move (got ${xfers.length})`);
  assert(xfers[0].description === 'KBank •••7890 → Bangkok Bank •••3456' && xfers[0].from_account_id === kAcct.account.id && xfers[0].to_account_id === bAcct.account.id && xfers[0].transaction_date.startsWith('2026-06-02'),
    `merged: "KBank •••7890 → Bangkok Bank •••3456" between both accounts, keeping the first side's date (got ${xfers[0].description})`);
  assert(xfers[1].description === 'Bangkok Bank •••3456 → KBank •••7890' && xfers[1].from_account_id === bAcct.account.id && xfers[1].to_account_id === kAcct.account.id, 'merged the other way too');
  const accts = (await db.from('accounts').select('id, balance').eq('line_user_id', U2)).data;
  assert(accts.every((a) => Number(a.balance) === (a.id === kAcct.account.id ? 1000 : 2000)), 'account balances are untouched');

  const bb2 = await post(`/statements/${U2}/parse`, { pages: bPages });
  assert(bb2.body.counts.imported === 2 && bb2.body.rows.find((r) => r.type === 'income').note === 'Already recorded: KBank •••7890 → Bangkok Bank •••3456', 'BBL re-parse: the transfers are already recorded');
  const kb2 = await post(`/statements/${U2}/parse`, { pages });
  assert(kb2.body.counts.imported === 2 && kb2.body.counts.own_transfer === 0, 'KBank re-parse: its transfers are already recorded too');
  const again2 = await post(`/statements/${U2}/import`, { rows: bb.body.rows.filter((r) => r.status === 'transfer_match').map(asTransfer), account_id: bAcct.account.id, statement: { bank: 'bbl', account_last4: '3456' } });
  assert(again2.body.imported === 0 && again2.body.skipped === 2 && (await db.from('transactions').select('id').eq('line_user_id', U2).eq('type', 'transfer')).data.length === 2, 're-importing the BBL transfers changes nothing');

  await cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); await cleanup(); process.exit(1); });
