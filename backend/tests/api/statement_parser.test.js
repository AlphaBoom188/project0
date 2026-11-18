// Pure: services/statementParser.js against a synthetic KBank-layout statement
// (tests/fixtures/kbankStatement.js). The real-statement check (1,022 rows,
// all totals matching) was done by hand and isn't committed.
const { BACKEND, FIXTURES } = require('../lib');
const { parseStatement, cleanDetails, UnsupportedStatementError } = require(`${BACKEND}/services/statementParser.js`);
const { buildStatement, SAMPLE } = require(`${FIXTURES}/kbankStatement.js`);

let failures = 0;
function assert(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) failures += 1;
}

const opening = 1000000; // ฿10,000.00
const { pages, totals } = buildStatement(SAMPLE, { opening, perPage: 4 });
const r = parseStatement(pages);

assert(r.bank === 'kbank', 'detects a KBank statement');
assert(pages.length === 3 && r.rows.length === SAMPLE.length, `all ${SAMPLE.length} rows across 3 pages (got ${r.rows.length})`);
assert(r.ok && r.warnings.length === 0 && r.checks.length === 5 && r.checks.every((c) => c.ok), `verified: counts, totals and ending balance all match (${JSON.stringify(r.checks.filter((c) => !c.ok))})`);
assert(r.summary.account_last4 === '7890' && r.summary.period_start === '2026-06-01' && r.summary.period_end === '2026-06-30', 'summary: account last 4 and period');
assert(r.summary.holder_name === 'MR. TEST STATEMENTUSER' && r.summary.opening_balance_cents === opening, 'summary: holder name and opening balance');
assert(r.summary.ending_balance_cents === totals.endingCents && r.summary.withdrawal_count === totals.withdrawals, 'summary: ending balance and withdrawal count read from page 1');

const types = r.rows.map((x) => x.type).join(',');
assert(types === SAMPLE.map((s) => (s.sign < 0 ? 'expense' : 'income')).join(','), 'every sign comes from the balance change');
assert(r.rows[3].page === undefined && r.rows[3].amount === 544.58 && r.rows[3].date === '2026-06-02' && r.rows[3].time === '09:27', 'the last row of a full page (on the footer line) is kept');
assert(r.rows[6].amount === 9250 && r.rows[6].balance_cents === 642, 'a small balance right-aligned into the Channel column is still read as the balance');
assert(r.rows[9].time === null && r.rows[9].description === 'Interest Deposit', 'a row with no time; "Ref Code ..." details fall back to the bank description');

assert(r.rows[0].description === 'CP AXTRA PUBLIC COMPANY LIMITED (HEAD', 'wrapped details joined; "Paid for Ref X2222" stripped');
assert(r.rows[2].description === 'แกร็บแท็กซี่ (ประเทศไทย)' && r.rows[2].merchant_key.includes('A/C Name: GRABTAXI'), 'Thai merchant: "(A/C Name: ...)" dropped from the description, kept in the merchant key');
assert(r.rows[1].description === 'From MS. SUDA RAKDEE' && r.rows[8].description === 'From MR TEST STATEMENTU', '"From X1111" / "From BBL X8888" stripped, "++" removed');

// cleanDetails edge cases
assert(cleanDetails('To PromptPay X9999 MANEE MEEJAI++').description === 'To MANEE MEEJAI', '"To PromptPay X9999" stripped');
assert(cleanDetails('From SMART BBL X0101 LINE PAY ( THAILAND').description === 'From LINE PAY ( THAILAND', 'two words before the X-ref stripped');

// Tampering: a balance that doesn't follow the amounts is flagged, not hidden.
const tampered = JSON.parse(JSON.stringify(pages));
const target = tampered[0].find((it) => it.y === tampered[0].find((x) => x.s.trim() === '675.00').y && it.x > 300 && it.x < 330);
target.s = '99,999.99 ';
const t = parseStatement(tampered);
assert(!t.ok && t.warnings.some((w) => /doesn't match the balance change/.test(w)), `a broken running balance makes the statement unverified, with a warning (${t.warnings.length} warnings)`);

// Not a KBank statement
let threw = null;
try { parseStatement([[{ x: 10, y: 10, s: 'Some other bank' }]]); } catch (e) { threw = e; }
assert(threw instanceof UnsupportedStatementError && /KBank/.test(threw.message), 'an unknown format throws UnsupportedStatementError naming what is supported');

// Line grouping tolerates pdf.js-style jitter and split pieces
const jitter = pages.map((pg) => pg.flatMap((it) => {
  const y = it.y + (it.x % 2 ? 0.6 : -0.6);
  if (it.x === 404 && it.s.length > 12) return [{ ...it, y, s: it.s.slice(0, 8) }, { x: it.x + 30, y, s: it.s.slice(8) }];
  return [{ ...it, y }];
}));
const j = parseStatement(jitter);
assert(j.ok && j.rows.length === SAMPLE.length && j.rows[0].merchant_key.replace(/\s+/g, '') === r.rows[0].merchant_key.replace(/\s+/g, ''), 'sub-point y jitter and details split into several pieces still parse and verify');

// pdf.js-style merging (seen with real pdf.js output): pieces close together
// on a line arrive as one item with a measured width w, sometimes with no
// space between them ("9,975.00K PLUS").
const CW = 3.6; // pt per character at 6.5pt Helvetica, roughly
const merged = pages.map((pg) => {
  const lines = new Map();
  for (const it of pg) { const k = it.y; if (!lines.has(k)) lines.set(k, []); lines.get(k).push(it); }
  const out = [];
  for (const line of lines.values()) {
    line.sort((a, b) => a.x - b.x);
    const date = line.find((it) => /^\d{2}-\d{2}-\d{2}\s*$/.test(it.s));
    if (!date || line.some((it) => /Beginning Balance/.test(it.s))) { out.push(...line); continue; }
    const left = line.filter((it) => it.x < 200);
    const bal = line.find((it) => it.x >= 300 && it.x < 330);
    const chan = line.find((it) => it.x >= 330 && it.x < 400);
    const leftText = left.map((it) => it.s.trim()).join(' ');
    out.push({ x: left[0].x, y: date.y, w: leftText.length * CW, s: leftText });
    out.push(...line.filter((it) => it.x >= 200 && it.x < 300));
    const bc = bal.s.trim() + chan.s; // no space between balance and channel
    out.push({ x: bal.x, y: bal.y, w: chan.x + chan.s.length * CW - bal.x, s: bc });
    out.push(...line.filter((it) => it.x >= 400));
  }
  return out;
});
const mg = parseStatement(merged);
assert(merged[0].some((it) => /^\d{2}-\d{2}-\d{2} \d{2}:\d{2} Payment$/.test(it.s)) && merged[0].some((it) => /^[\d,]+\.\d{2}K PLUS$/.test(it.s)), 'merge simulation produces "date time desc" and "balanceK PLUS" items');
assert(mg.ok && mg.rows.length === SAMPLE.length && mg.rows.every((x, i) => x.amount === r.rows[i].amount && x.type === r.rows[i].type && x.channel === r.rows[i].channel && x.time === r.rows[i].time),
  `pdf.js-merged pieces split back into the same rows, amounts, signs, times and channels (ok=${mg.ok}, ${mg.rows.length} rows)`);

process.exit(failures ? 1 : 0);
