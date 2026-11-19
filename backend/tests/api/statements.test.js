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
  for (const u of [U, OTHER]) {
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
  assert(JSON.stringify(p.body.counts) === JSON.stringify({ total: 10, new: 7, imported: 0, own_transfer: 2, bank_transfer: 0, possible_duplicate: 1 }), `counts (got ${JSON.stringify(p.body.counts)})`);
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
  assert(JSON.stringify(b.body.counts) === JSON.stringify({ total: 7, new: 5, imported: 0, own_transfer: 0, bank_transfer: 2, possible_duplicate: 0 }), `BBL counts: the two TRF OTH BK rows are bank_transfer (got ${JSON.stringify(b.body.counts)})`);
  const out = b.body.rows.find((r) => r.status === 'bank_transfer' && r.type === 'expense');
  assert(out && out.description === 'Transfer to another bank' && /Tick it if it wasn't your own account/.test(out.note), 'a bank transfer explains why it starts unticked');
  assert(b.body.rows.every((r) => r.transaction_date.endsWith('T12:00:00+07:00')), 'BBL rows have no time: noon Bangkok');
  assert(b.body.rows.filter((r) => r.type === 'expense').every((r) => r.category_name === 'Others'), 'generic bank codes go to Others without an AI call');
  const bImp = await post(`/statements/${U}/import`, { rows: b.body.rows.filter((r) => r.status === 'new' || r === out).map((r) => asImport(r)) });
  assert(bImp.status === 200 && bImp.body.imported === 6, `importing the new rows plus one ticked bank transfer (got ${JSON.stringify(bImp.body)})`);
  const b2 = await post(`/statements/${U}/parse`, { pages: bblPages });
  assert(b2.body.counts.imported === 6 && b2.body.counts.bank_transfer === 1, 'BBL re-parse: 6 already imported, the unticked transfer still flagged');

  await cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); await cleanup(); process.exit(1); });
