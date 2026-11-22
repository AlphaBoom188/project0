#!/usr/bin/env node
// Synthetic data for exploratory QA (docs/QA.md). Everything is made up.
//
//   npm run qa:seed                     seed test_qa
//   npm run qa:seed -- --user test_abc  another test_ user
//   npm run qa:reset                    erase that user (DELETE /api/users/:u)
//   --base http://localhost:3100        use a running server instead of a temporary one
//
// Writes go through the REST API (same validation as the app), on a temporary
// server instance (DISABLE_CRON=1) unless --base is given, using the loopback
// test_ auth bypass. Holdings are the one exception: creating them over REST
// fetches the USD->THB rate from Yahoo, so they're inserted directly with
// hand-set prices. Nothing here calls OpenAI, LINE or Yahoo: every expense has
// an explicit category_id (no auto-categorise) and channel 'liff' (budget
// alerts come back in the response instead of a LINE push).
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), quiet: true });
const path = require('path');
const { spawn } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const { bangkokParts, bangkokMidnight, getBangkokYmd } = require('../services/bangkokDay');

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const USER = flag('--user') || 'test_qa';
const RESET = args.includes('--reset');
if (!/^test_[a-z0-9_]{1,40}$/.test(USER)) {
  console.error(`Refusing "${USER}": QA users must look like test_xxx (lowercase letters, digits, _).`);
  process.exit(1);
}

let BASE = flag('--base');
let server = null;
async function ensureServer() {
  if (BASE) return;
  const port = 3199;
  BASE = `http://127.0.0.1:${port}`;
  const env = { ...process.env, PORT: String(port), DISABLE_CRON: '1' };
  delete env.DEV_LIFF_STUB;
  server = spawn(process.execPath, ['index.js'], { cwd: path.join(__dirname, '..'), env, stdio: 'ignore' });
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(`${BASE}/health`)).ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('temporary server did not start on port 3199');
}
function stopServer() { if (server) server.kill('SIGTERM'); }

async function api(method, p, body) {
  const res = await fetch(`${BASE}/api${p}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${json.error || ''}`);
  return json;
}

// Deterministic "random" so every seed looks the same.
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

async function reset() {
  const r = await fetch(`${BASE}/api/users/${USER}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE' }) });
  // The erase path covers transactions, accounts, budgets, investments, bills,
  // reminders, notes, tax and goals.
  console.log(r.ok || r.status === 404 ? `Reset: erased ${USER}.` : `Reset failed: HTTP ${r.status}`);
  return r.ok || r.status === 404;
}

async function seedUser() {
  const counts = {};
  const bump = (k, n = 1) => { counts[k] = (counts[k] || 0) + n; };

  await api('POST', '/users', { line_user_id: USER, display_name: 'QA User' });
  const expense = (await api('GET', `/categories/${USER}?type=expense`)).categories;
  const income = (await api('GET', `/categories/${USER}?type=income`)).categories;
  const cat = (name) => expense.find((c) => c.name === name) || expense[0];
  const incomeCat = income[0];

  // Budgets on 5 categories: Food over, Transport at ~85%, the rest under.
  const BUDGETS = { Food: 3000, Transport: 2000, Shopping: 5000, Utilities: 3000, Telecom: 1000 };
  for (const [name, amount] of Object.entries(BUDGETS)) {
    await api('PUT', `/categories/${USER}/${cat(name).id}`, { budget_amount: amount, budget_period: 'monthly' });
    bump('budgets');
  }

  // Accounts (made-up names and numbers).
  const acc = {};
  for (const [key, a] of Object.entries({
    bank: { account_name: 'QA Savings', account_type: 'bank', balance: 48250 },
    card: { account_name: 'QA Card', account_type: 'credit_card', balance: 0 },
    wallet: { account_name: 'QA Wallet', account_type: 'e_wallet', balance: 1500 },
    cash: { account_name: 'Cash', account_type: 'cash', balance: 2000 },
  })) {
    acc[key] = (await api('POST', `/accounts/${USER}`, a)).account;
    bump('accounts');
  }

  // ~60 transactions over the last 3 billing cycles (default cycle: calendar month, Bangkok).
  const { year, month, day } = bangkokParts();
  const now = Date.now();
  const tx = async (t) => { await api('POST', `/transactions/${USER}`, { channel: 'liff', ...t }); bump('transactions'); };
  const at = (y, m, d, hour = 12) => new Date(Math.min(bangkokMidnight(y, m, d).getTime() + hour * 3600000, now - 60000)).toISOString();
  // This cycle: totals chosen so Food is over (3,400 of 3,000) and Transport at 85% (1,700 of 2,000).
  const thisCycle = [
    ['Food', [450, 380, 520, 610, 440, 500, 500], ['Lunch', 'Dinner', 'Groceries', 'Noodles', 'Coffee and cake', 'Street food', 'Family dinner']],
    ['Transport', [400, 350, 300, 650], ['Taxi', 'BTS top-up', 'Fuel', 'Airport ride']],
    ['Shopping', [690, 510], ['T-shirt', 'Phone case']],
    ['Utilities', [620, 280], ['Electricity', 'Water']],
    ['Telecom', [399], ['Mobile plan']],
  ];
  const span = Math.max(1, day - 1);
  let i = 0;
  for (const [name, amounts, descs] of thisCycle) {
    for (let k = 0; k < amounts.length; k += 1) {
      const d = 1 + Math.floor(((i * 7) % (span * 10)) / 10);
      await tx({ type: 'expense', amount: amounts[k], category_id: cat(name).id, description: descs[k], transaction_date: at(year, month, Math.min(d, day), 9 + (i % 10)), from_account_id: pick([acc.bank.id, acc.card.id, acc.wallet.id, acc.cash.id]) });
      i += 1;
    }
  }
  await tx({ type: 'expense', amount: 120, category_id: cat('Others').id, description: '=SUM(1)', transaction_date: at(year, month, 1, 10), from_account_id: acc.cash.id });
  await tx({ type: 'income', amount: 42000, category_id: incomeCat.id, description: 'Salary', transaction_date: at(year, month, 1, 8), to_account_id: acc.bank.id });
  await tx({ type: 'transfer', amount: 3000, description: 'Top up wallet', transaction_date: at(year, month, Math.min(2, day), 18), from_account_id: acc.bank.id, to_account_id: acc.wallet.id });
  // The two cycles before: everyday spending.
  const pool = [['Food', 'Lunch', 80, 450], ['Food', 'Groceries', 300, 900], ['Transport', 'Taxi', 90, 350], ['Shopping', 'Household', 150, 1200], ['Utilities', 'Electricity', 500, 900], ['Accommodation', 'Rent share', 4000, 4000], ['Others', 'Gift', 200, 800]];
  for (const back of [1, 2]) {
    const y = month - back <= 0 ? year - 1 : year;
    const m = ((month - back - 1 + 12) % 12) + 1;
    for (let k = 0; k < 20; k += 1) {
      const [name, desc, lo, hi] = pick(pool);
      await tx({ type: 'expense', amount: Math.round(lo + rand() * (hi - lo)), category_id: cat(name).id, description: desc, transaction_date: at(y, m, 1 + Math.floor(rand() * 27), 9 + k % 10), from_account_id: pick([acc.bank.id, acc.card.id, acc.cash.id]) });
    }
    if (back === 1) {
      await tx({ type: 'income', amount: 42000, category_id: incomeCat.id, description: 'Salary', transaction_date: at(y, m, 1, 8), to_account_id: acc.bank.id });
      await tx({ type: 'transfer', amount: 2000, description: 'Pay the card', transaction_date: at(y, m, 25, 19), from_account_id: acc.bank.id, to_account_id: acc.card.id });
    }
  }

  // Recurring rules (one with a pay window), a savings goal, the emergency fund.
  const nextMonth = getBangkokYmd(bangkokMidnight(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1));
  await api('POST', `/recurring/${USER}`, { category_id: cat('Accommodation').id, amount: 8000, type: 'expense', description: 'Room rent', frequency: 'monthly', start_date: `${nextMonth}T12:00:00Z`, pay_start_day: 1, pay_end_day: 5 });
  await api('POST', `/recurring/${USER}`, { category_id: cat('Telecom').id, amount: 399, type: 'expense', description: 'Mobile plan', frequency: 'monthly', start_date: `${nextMonth}T12:00:00Z` });
  await api('POST', `/recurring/${USER}`, { category_id: incomeCat.id, amount: 42000, type: 'income', description: 'Salary', frequency: 'monthly', start_date: `${nextMonth}T12:00:00Z` });
  bump('recurring rules', 3);
  await api('POST', `/goals/${USER}`, { name: 'Trip to Chiang Mai', target_amount: 20000, target_date: `${year + 1}-03-31`, saved_amount: 6500 });
  bump('savings goals');
  await api('PUT', `/users/${USER}/emergency-fund`, { goal_amount: 90000, account_id: acc.bank.id });

  // Holdings: inserted directly with hand-set prices (REST create would fetch the FX rate).
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const holdings = [
    { asset_type: 'gold', symbol: 'GOLD-BAHT', name: 'Gold bar', currency: 'THB', quantity: 1, average_cost: 38000, current_price: 41500, trade_date: `${year - 1}-06-03` },
    { asset_type: 'mutual_fund', symbol: 'QAGLOBAL', name: 'QA Global Index Fund', currency: 'USD', quantity: 50, average_cost: 20, current_price: 23.4, trade_date: `${year - 1}-09-15` },
  ];
  for (const h of holdings) {
    const { trade_date: tradeDate, ...row } = h;
    const { data: hold, error } = await db.from('asset_holdings').insert({ ...row, line_user_id: USER, priced_at: new Date().toISOString() }).select('id').single();
    if (error) throw new Error(`holding ${h.symbol}: ${error.message}`);
    const { error: lotError } = await db.from('asset_lots').insert({ line_user_id: USER, holding_id: hold.id, side: 'buy', quantity: h.quantity, price: h.average_cost, fee: 0, trade_date: tradeDate });
    if (lotError) throw new Error(`lot ${h.symbol}: ${lotError.message}`);
    bump('holdings');
  }

  // Reminders (one Important), to-dos, a note.
  const inHours = (h) => new Date(now + h * 3600000).toISOString();
  await api('POST', `/reminders/${USER}`, { title: 'Pay the room rent', remind_at: inHours(26), repeat: 'none', importance: 1, category: 'finance' });
  await api('POST', `/reminders/${USER}`, { title: 'Team stand-up', remind_at: inHours(3), repeat: 'weekdays', category: 'work' });
  await api('POST', `/reminders/${USER}`, { title: 'Call the dentist', remind_at: inHours(50), repeat: 'none' });
  bump('reminders', 3);
  await api('POST', `/reminders/${USER}`, { title: 'Buy a phone charger' });
  await api('POST', `/reminders/${USER}`, { title: 'Renew the passport' });
  bump('to-dos', 2);
  await api('POST', `/notes/${USER}`, { body: 'Wi-Fi name at the co-working space: QA-Guest' });
  bump('notes');

  // Tax 2569: profile + one salary income.
  await api('PUT', `/tax/${USER}/2569/profile`, { maritalStatus: 'single' });
  await api('POST', `/tax/${USER}/2569/incomes`, { kind: 'salary', amount: 504000, withheld: 9000, payer: 'QA Example Co.' });
  bump('tax incomes');

  return counts;
}

(async () => {
  try {
    await ensureServer();
    if (RESET) {
      const ok = await reset();
      process.exitCode = ok ? 0 : 1;
      return;
    }
    const counts = await seedUser();
    console.log(`Seeded ${USER}:`);
    for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
    console.log('  emergency fund: ฿90,000 on QA Savings');
    console.log(`Open: http://localhost:3100/liff/?devuser=${USER} (npm run qa:serve)`);
  } catch (error) {
    console.error(`qa-seed failed: ${error.message}`);
    console.error(`Run "npm run qa:reset${USER === 'test_qa' ? '' : ` -- --user ${USER}`}" to clean up a half-seeded user.`);
    process.exitCode = 1;
  } finally {
    stopServer();
  }
})();
