// Turns parsed statement rows (services/statementParser.js) into an import
// preview, and imports the rows the user kept.
//
// - row_key: 'stmt:' + sha256(user | bank | account | date | time | amount |
//   balance-after). Stored in transactions.slip_hash, whose UNIQUE constraint
//   makes re-importing the same (or an overlapping) statement a no-op. The
//   running balance makes the key unique even for two identical payments in
//   the same minute.
// - Status per row: 'imported' (row_key already stored), 'own_transfer'
//   (to/from the account holder's own name: a move between own accounts, not
//   spending), 'bank_transfer' (Bangkok Bank "TRF TO/FR OTH BK": no name is
//   printed, so it may be the holder's own account), 'possible_duplicate'
//   (a manually logged transaction on the same
//   Bangkok day with the same amount and type), 'transfer_match' (the other
//   side of a transfer already imported from another statement; see
//   statementTransfers.js), else 'new'. Own transfers, bank transfers and
//   matches default to importing as a Transfer (transfer_default), never as
//   spending or income; everything else imports with a category.
// - Categories: one gpt-4o-mini call per batch of unique merchant names (a
//   1,000-row statement has a few hundred), picking from the user's own
//   categories; anything unmatched falls back to Others / the first income
//   category.
const crypto = require('crypto');
const OpenAI = require('openai');
const supabase = require('../config/supabase');
const { getBangkokYmd } = require('./bangkokDay');
const { sideLabel, fetchTransferPool, matchTransfer } = require('./statementTransfers');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45000, maxRetries: 1 });
const CATEGORY_BATCH = 60;
const IN_CHUNK = 150;

const TITLES = /^(MR\.?|MRS\.?|MS\.?|MISS|DR\.?|นาย|นาง|นางสาว|น\.ส\.)\s*/i;
const bareName = (s) => String(s || '').toUpperCase().replace(TITLES, '').replace(/[^A-Z฀-๿ ]/g, '').replace(/\s+/g, ' ').trim();

// KBank truncates counterparty names ("SOMCHAI JAIDE"), so a counterparty is
// the holder when it's a prefix of the holder's full name (titles ignored).
function isOwnTransfer(row, holderName) {
  const m = row.merchant_key.match(/^(From|To)\s+(.+)$/);
  if (!m || !holderName) return false;
  const counterparty = bareName(m[2]);
  const holder = bareName(holderName);
  return counterparty.length >= 6 && holder.startsWith(counterparty);
}

function rowKey(lineUserId, parsed, row) {
  const parts = [lineUserId, parsed.bank, parsed.summary.account_number || '', row.date, row.time || '', row.amount_cents, row.balance_cents];
  return `stmt:${crypto.createHash('sha256').update(parts.join('|')).digest('hex')}`;
}

const transactionDate = (row) => `${row.date}T${row.time || '12:00'}:00+07:00`;

// Well-known Thai merchants, matched before any LLM call (free, and steadier
// than gpt-4o-mini on brand names). `null` = deliberately uncategorized: a
// wallet top-up moves money rather than buying something. Each rule only
// applies when the user still has a category with that preset name.
const MERCHANT_RULES = [
  // Order matters: brands (food, shops) before places ("LAWSON ... MRT", "KFC ... PTT").
  // Bank codes with no merchant in them (Bangkok Bank): nothing to infer, skip the LLM.
  { category: null, re: /^(PMT\.? (PROMPTPAY|FOR GOODS|BILL)|ATM\b|ATW\b|CASH W|TRF\.? (TO|FR)|CHQ|DEP\b|DEPOSIT|INT(EREST)?\b|WHT|FEE|CHARGE)/i },
  { category: null, re: /GRABPAY WALLET|TRUEMONEY(?! SHOP)|\bLINE PAY\b(?! MERCHANT)|RABBIT LINE PAY|SHOPEEPAY|G-WALL|YOUTRIP/i },
  { category: 'Food', re: /LINE MAN|WONGNAI|GRAB ?FOOD|FOODPANDA|ROBINHOOD|AMAZON|อเมซอน|STARBUCKS|CAFE|คาเฟ่|COFFEE|กาแฟ|RESTAURANT|ติ่มซำ|ก๋วยเตี๋ยว|บะหมี่|ข้าว|ชาบู|หมูกระทะ|FOOD ?COURT|ฟู้ด ?คอร์ท|KFC|MCDONALD|SWENSEN|MK RESTAURANT|BAR B Q|AFTER YOU/i },
  { category: 'Shopping', re: /7-ELEVEN|SEVEN ELEVEN|เซเว่น|LAWSON|FAMILYMART|CP AXTRA|LOTUS|โลตัส|MAKRO|แม็คโคร|\bTOPS\b|BIG ?C|GOURMET MARKET|VILLA MARKET|THE MALL|CENTRAL|ROBINSON|WATSONS|BOOTS|EVEANDBOY|SHOPEE|LAZADA|UNIQLO|IKEA|HOMEPRO/i },
  { category: 'Transport', re: /\bPTTST\b|\bPTT\b|MCP-PT|พีที|BANGCHAK|บางจาก|\bSHELL\b|\bESSO\b|CALTEX|SUSCO|\bBTS\b|\bMRT\b|AIRPORT RAIL|แอร์พอร์ต เรล|รถไฟฟ้า|การรถไฟ|ทางด่วน|EXPRESSWAY|แกร็บแท็กซี่|GRABTAXI|PARKING|CAR PARK|\bAIR\b|AIRWAYS|AIRASIA/i },
  { category: 'Utilities', re: /\bMEA\b|\bPEA\b|\bMWA\b|\bPWA\b|การไฟฟ้า|การประปา|แก๊สหุงต้ม|ก๊าซ/i },
  { category: 'Telecom', re: /\bAIS\b|ADVANCED INFO|TRUE MOVE|TRUEMOVE|\bDTAC\b|\b3BB\b|TRUE ONLINE|\bNT\b|NATIONAL TELECOM/i },
];

function ruleMatch(key, categories) {
  for (const rule of MERCHANT_RULES) {
    if (!rule.re.test(key)) continue;
    if (rule.category === null) return { matched: true, category: null };
    const cat = categories.find((c) => c.name.toLowerCase() === rule.category.toLowerCase());
    if (cat) return { matched: true, category: cat };
  }
  return { matched: false };
}

async function categorizeKeys(allKeys, categories) {
  const names = categories.map((c) => c.name);
  const result = new Map();
  if (!allKeys.length || !names.length) return result;
  const keys = [];
  for (const k of allKeys) {
    const m = ruleMatch(k, categories);
    if (!m.matched) keys.push(k);
    else if (m.category) result.set(k, m.category);
  }
  const batches = [];
  for (let i = 0; i < keys.length; i += CATEGORY_BATCH) batches.push(keys.slice(i, i + CATEGORY_BATCH));
  await Promise.all(batches.map(async (batch) => {
    const list = batch.map((k, i) => `${i + 1}. ${k}`).join('\n');
    const prompt = `These are payees/payers from a Thai bank statement (merchant names, people, wallets; Thai or English):
${list}

For each number, pick the single best category from this list: [${names.join(', ')}].
Thai merchant hints (use the closest category the list actually has):
- E-wallet top-ups (GrabPay Wallet, TrueMoney / TrueMoney Wallet, LINE Pay, Rabbit LINE Pay, ShopeePay, G-Wallet / KTB G-WALL, YouTrip) are moving money, not a purchase: null.
- Fuel stations (PTT, PTTST, PT / พีที, Bangchak, Shell, Esso, Caltex, Susco), BTS, MRT, Airport Rail Link, expressway tolls, Grab taxi, parking, airlines: transport.
- Food delivery (LINE MAN, Wongnai, Grab Food, foodpanda, Robinhood), restaurants, cafes (Cafe Amazon / คาเฟ่อเมซอน, Starbucks), dim sum, noodle shops: food.
- Convenience stores and supermarkets (7-Eleven / CS 7-Eleven, Lawson, FamilyMart, CP Axtra = Lotus's / Makro, Tops, Big C, Gourmet Market), malls, Watsons, cosmetics: shopping.
- Electricity (MEA, PEA), water (MWA, PWA), cooking gas (แก๊สหุงต้ม, ก๊าซ): utilities. Telecom is only mobile/internet operators' bills (AIS, True Move H, dtac, 3BB, NT, True Online).
- "To <person name>" / "From <person name>" with no other hint: null.
Return ONLY a JSON object mapping each number (as a string) to a category name or null.`;
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      });
      const map = JSON.parse(completion.choices[0].message.content);
      batch.forEach((k, i) => {
        const name = map[String(i + 1)];
        const cat = typeof name === 'string' && categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
        if (cat) result.set(k, cat);
      });
    } catch (error) {
      console.error('[statement] categorize batch failed:', error.message); // rows fall back below
    }
  }));
  return result;
}

async function fetchExisting(lineUserId, keys, parsed) {
  const imported = new Set();
  for (let i = 0; i < keys.length; i += IN_CHUNK) {
    const { data, error } = await supabase.from('transactions').select('slip_hash').eq('line_user_id', lineUserId).in('slip_hash', keys.slice(i, i + IN_CHUNK));
    if (error) throw error;
    data.forEach((t) => imported.add(t.slip_hash));
  }
  // Manually logged transactions in the statement period, for duplicate hints.
  const dates = parsed.rows.map((r) => r.date).sort();
  let manual = [];
  if (dates.length) {
    const { data, error } = await supabase
      .from('transactions')
      .select('id, transaction_date, amount, type, description, slip_hash')
      .eq('line_user_id', lineUserId)
      .in('type', ['income', 'expense'])
      .gte('transaction_date', `${dates[0]}T00:00:00+07:00`)
      .lte('transaction_date', `${dates[dates.length - 1]}T23:59:59+07:00`)
      .limit(5000);
    if (error) throw error;
    manual = data.filter((t) => !(t.slip_hash || '').startsWith('stmt:'));
  }
  return { imported, manual };
}

async function buildPreview(lineUserId, parsed, holderName) {
  const { data: categories, error } = await supabase.from('categories').select('id, name, type').eq('line_user_id', lineUserId);
  if (error) throw error;
  const byType = { expense: categories.filter((c) => c.type === 'expense'), income: categories.filter((c) => c.type === 'income') };
  const fallback = {
    expense: byType.expense.find((c) => c.name.toLowerCase() === 'others') || byType.expense[0] || null,
    income: byType.income.find((c) => c.name.toLowerCase() === 'income') || byType.income[0] || null,
  };

  const rows = parsed.rows.map((r) => ({ ...r, row_key: rowKey(lineUserId, parsed, r), own: isOwnTransfer(r, holderName) }));
  const { imported, manual } = await fetchExisting(lineUserId, rows.map((r) => r.row_key), parsed);
  const myLabel = sideLabel(parsed.bank, parsed.summary.account_last4);
  const transferPool = await fetchTransferPool(lineUserId, rows.map((r) => r.date));
  // Only transfer-like rows are matched: a payment that happens to share an
  // amount and day with a transfer elsewhere isn't one.
  const transferLike = (r) => r.own || r.is_bank_transfer || /transfer|^TRF/i.test(r.bank_description);
  const transferMatches = new Map();
  for (const r of rows) {
    if (imported.has(r.row_key) || !transferLike(r)) continue;
    const m = matchTransfer(transferPool, r, myLabel);
    if (m) transferMatches.set(r.row_key, m);
  }

  // One-to-one duplicate matching against manual entries.
  const pool = new Map();
  for (const t of manual) {
    const k = `${getBangkokYmd(new Date(t.transaction_date))}|${t.type}|${Math.round(parseFloat(t.amount) * 100)}`;
    if (!pool.has(k)) pool.set(k, []);
    pool.get(k).push(t);
  }

  const toCategorize = { expense: new Set(), income: new Set() };
  for (const r of rows) if (!imported.has(r.row_key) && !r.own && !r.is_bank_transfer && !transferMatches.has(r.row_key)) toCategorize[r.type].add(r.merchant_key);
  const [expCats, incCats] = await Promise.all([
    categorizeKeys([...toCategorize.expense], byType.expense),
    byType.income.length > 1 ? categorizeKeys([...toCategorize.income], byType.income) : Promise.resolve(new Map()),
  ]);
  const picked = { expense: expCats, income: incCats };

  const preview = rows.map((r) => {
    let status = 'new';
    let note = null;
    const tm = transferMatches.get(r.row_key);
    if (imported.has(r.row_key)) status = 'imported';
    else if (tm && tm.kind === 'recorded') { status = 'imported'; note = `Already recorded: ${tm.transfer.description}`; }
    else if (tm) {
      status = 'transfer_match';
      note = `Matches your transfer "${tm.transfer.description}" on ${tm.transfer.ymd}. Importing joins them into one.`;
    } else if (r.own) { status = 'own_transfer'; note = 'Transfer between your own accounts. Imported as a Transfer, not spending.'; }
    else if (r.is_bank_transfer) {
      status = 'bank_transfer';
      note = `Transfer ${r.type === 'expense' ? 'to' : 'from'} another bank, likely your own account, so it's imported as a Transfer. Pick a category if it paid someone.`;
    }
    else {
      const match = (pool.get(`${r.date}|${r.type}|${r.amount_cents}`) || []).shift();
      if (match) { status = 'possible_duplicate'; note = `Already logged: ${match.description || 'same amount, same day'}`; }
    }
    const category = picked[r.type].get(r.merchant_key) || fallback[r.type];
    return {
      row_key: r.row_key,
      date: r.date,
      time: r.time,
      transaction_date: transactionDate(r),
      description: r.description,
      bank_description: r.bank_description,
      amount: r.amount,
      type: r.type,
      category_id: category ? category.id : null,
      category_name: category ? category.name : null,
      transfer_default: ['own_transfer', 'bank_transfer', 'transfer_match'].includes(status),
      status,
      note,
    };
  });

  const count = (s) => preview.filter((r) => r.status === s).length;
  return {
    bank: parsed.bank,
    account_last4: parsed.summary.account_last4,
    period_start: parsed.summary.period_start,
    period_end: parsed.summary.period_end,
    verified: parsed.ok,
    checks: parsed.checks,
    warnings: parsed.warnings,
    counts: { total: preview.length, new: count('new'), imported: count('imported'), own_transfer: count('own_transfer'), bank_transfer: count('bank_transfer'), transfer_match: count('transfer_match'), possible_duplicate: count('possible_duplicate') },
    rows: preview,
  };
}

module.exports = { buildPreview, isOwnTransfer, rowKey, bareName };
