// CSV import: services/csvImport.js (pure) on synthetic exports shaped like
// Money Lover, Wallet (BudgetBakers) and a Thai spreadsheet, then the REST
// preview / import (dedupe on re-import, categories).
const { BASE, BACKEND } = require('../lib');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const c = require(`${BACKEND}/services/csvImport.js`);

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (cond, l) => { console.log(`${cond ? 'PASS' : 'FAIL'}: ${l}`); if (!cond) failures += 1; };
const run = (text) => { const p = c.parseCsv(text); const m = c.guessMapping(p.headers, p.rows); m.signed = c.guessSign(p.rows, m); return { p, m, rows: c.normalizeRows(p.rows, m, { today: '2026-11-20' }) }; };

// --- Amounts and dates ---
assert(c.parseAmount('1,234.50') === 1234.5 && c.parseAmount('-120') === -120 && c.parseAmount('(120)') === -120 && c.parseAmount('฿1,200') === 1200 && c.parseAmount('1.234,50') === 1234.5 && c.parseAmount('120-') === -120 && c.parseAmount('abc') === null && c.parseAmount('') === null, 'amount formats');
assert(c.parseDate('2026-10-05') === '2026-10-05' && c.parseDate('05/10/2026', 'dmy') === '2026-10-05' && c.parseDate('10/05/2026', 'mdy') === '2026-10-05' && c.parseDate('05/10/2569', 'dmy') === '2026-10-05' && c.parseDate('5.10.26', 'dmy') === '2026-10-05', 'date formats incl. Buddhist era');
assert(c.parseDate('31/02/2026', 'dmy') === null && c.parseDate('nope') === null, 'impossible dates rejected');

// --- Money Lover style: semicolons, signed amounts, day first ---
let r = run('﻿Id;Date;Category;Amount;Currency;Note;Wallet\n1;25/10/2026;Food & Beverage;-120;THB;"Coffee; large";Cash\n2;26/10/2026;Salary;45000;THB;October;Bank\n3;27/10/2026;Food & Beverage;-120;THB;"Coffee; large";Cash\n');
assert(r.p.delimiter === ';' && r.p.headers[1] === 'Date' && r.m.date === 1 && r.m.amount === 3 && r.m.category === 2 && r.m.description === 5 && r.m.dateOrder === 'dmy', 'Money Lover: delimiter, BOM, columns');
assert(r.rows[0].type === 'expense' && r.rows[0].amount === 120 && r.rows[0].description === 'Coffee; large' && r.rows[1].type === 'income' && r.rows[1].amount === 45000, 'signed amounts -> type; quoted field with a semicolon');

// --- Wallet style: type column, positive amounts, ISO dates ---
r = run('account,category,currency,amount,type,payment_type,note,date\nKBank,Groceries,THB,850,Expenses,TRANSFER,Big C,2026-10-01 10:22:00\nKBank,Salary,THB,50000,Income,TRANSFER,,2026-10-25\nKBank,,THB,5000,Transfer,TRANSFER,to savings,2026-10-26\n');
assert(r.m.type === 4 && r.m.dateOrder === 'ymd' && r.rows[0].type === 'expense' && r.rows[1].type === 'income' && r.rows[0].date === '2026-10-01', 'Wallet: type column, ISO dates with times');
assert(r.rows[2].error === 'Transfers are skipped', 'transfers skipped');

// --- Thai spreadsheet: separate in/out columns, BE years, a future row ---
r = run('วันที่,รายละเอียด,รายรับ,รายจ่าย,หมวดหมู่\n01/10/2569,ค่าข้าว,,85,อาหาร\n02/10/2569,เงินเดือน,"30,000",,รายได้\n03/10/2569,ไม่มีเงิน,,,\n15/12/2569,future,,50,อาหาร\n');
assert(r.m.date === 0 && r.m.income === 2 && r.m.expense === 3 && r.m.description === 1 && r.m.category === 4, 'Thai headers');
assert(r.rows[0].type === 'expense' && r.rows[0].amount === 85 && r.rows[0].date === '2026-10-01' && r.rows[1].type === 'income' && r.rows[1].amount === 30000, 'in/out columns, Buddhist-era dates');
assert(r.rows[2].error === 'No amount' && r.rows[3].error === 'Date is in the future', 'empty and future rows flagged');

// --- Expense-only list (all positive, no type) ---
r = run('Date,Amount,Note\n10/31/2026,100,Lunch\n11/01/2026,250,Taxi\n');
assert(r.m.dateOrder === 'mdy' && r.m.signed === 'positive-expense' && r.rows.every((x) => x.type === 'expense') && r.rows[0].date === '2026-10-31', 'month-first dates; all-positive amounts are expenses');

// --- Hashes ---
const rows = [{ date: '2026-10-25', amount: 120, type: 'expense', description: 'Coffee' }, { date: '2026-10-25', amount: 120, type: 'expense', description: 'Coffee' }];
const h = c.rowHashes('U1', rows);
assert(h[0] !== h[1] && h[0].startsWith('csv:') && c.rowHashes('U1', rows)[0] === h[0] && c.rowHashes('U2', rows)[0] !== h[0], 'identical rows numbered; stable; per user');

// --- REST ---
const U = `test_csv_${crypto.randomBytes(4).toString('hex')}`;
const call = (p, body) => fetch(`${BASE}/api${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (x) => ({ status: x.status, body: await x.json() }));
const FILE = 'Date;Category;Amount;Note\n25/10/2026;Food;-120;Coffee\n25/10/2026;Food;-120;Coffee\n26/10/2026;Salary;45000;October\n27/10/2026;Pets;-500;Cat food\n28/10/2026;Food;oops;bad row\n';
(async () => {
  await fetch(`${BASE}/api/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ line_user_id: U, display_name: 'CSV' }) });
  try {
    let res = await call(`/transactions/${U}/import-csv/preview`, { csv: FILE });
    assert(res.status === 200 && res.body.total === 5 && res.body.valid === 4 && res.body.toImport === 4 && res.body.errorCount === 1 && res.body.errors[0].line === 6, `preview counts (got ${JSON.stringify({ t: res.body.total, v: res.body.valid })})`);
    const cats = Object.fromEntries(res.body.categories.map((x) => [x.name, x.matched]));
    assert(cats.Food === 'Food' && cats.Pets === null && res.body.income === 1 && res.body.expense === 3, 'categories matched by name; new ones flagged');
    assert((await db.from('transactions').select('id').eq('line_user_id', U)).data.length === 0, 'preview writes nothing');
    res = await call(`/transactions/${U}/import-csv`, { csv: FILE, createCategories: true });
    assert(res.status === 200 && res.body.imported === 4 && res.body.skipped === 1 && [...res.body.createdCategories].sort().join() === 'Pets,Salary', `import (got ${JSON.stringify(res.body)})`);
    const tx = (await db.from('transactions').select('amount, type, description, transaction_date, categories ( name )').eq('line_user_id', U).order('transaction_date')).data;
    assert(tx.length === 4 && tx.filter((t) => t.description === 'Coffee').length === 2 && tx.find((t) => t.description === 'Cat food').categories.name === 'Pets' && tx[0].transaction_date.startsWith('2026-10-25T12:00'), 'rows saved with categories, both coffees, noon UTC dates');
    res = await call(`/transactions/${U}/import-csv`, { csv: FILE });
    assert(res.body.imported === 0 && res.body.duplicates === 4, 're-importing the same file adds nothing');
    res = await call(`/transactions/${U}/import-csv/preview`, { csv: 'just one line' });
    assert(res.status === 400 && res.body.error.includes('no rows'), 'no rows -> 400');
    res = await call(`/transactions/${U}/import-csv/preview`, { csv: 'A,B\nx,y\n' });
    assert(res.status === 200 && res.body.problem === 'Choose the date column' && res.body.headers.join() === 'A,B', 'unknown columns -> asks for the mapping');
    res = await call(`/transactions/${U}/import-csv/preview`, { csv: 'When,How much\n01/10/2026,50\n', mapping: { date: 0, amount: 1 } });
    assert(res.body.valid === 1 && res.body.mapping.date === 0, 'mapping override');
  } finally {
    await db.from('transactions').delete().eq('line_user_id', U);
    await db.from('categories').delete().eq('line_user_id', U);
    await db.from('users').delete().eq('line_user_id', U);
  }
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); console.log('FAIL: crashed'); process.exit(1); });
