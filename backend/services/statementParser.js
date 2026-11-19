// Pure parser for bank statement PDFs, from positioned text pieces.
//
// The LIFF app opens the PDF in the browser with pdf.js (including the
// password, which never leaves the phone), and sends each page's text pieces
// as { x, y, s } (PDF points, y measured from the bottom). This module rebuilds
// the table rows from those positions. No AI involved: a 1,000-row statement
// parses exactly, in milliseconds.
//
// Supported:
// - KBank savings/current statements ("KBPDF (FM702-CA_SA-...)"), parsed by
//   column positions (below).
// - Bangkok Bank savings statements ("STATEMENT OF SAVING ACCOUNT"), parsed
//   by line text (parseBbl): every row fits on one line, and PDFKit returns
//   it as a single piece anyway, so columns can't be relied on.
// Layout per page: a header row (Date, Time/Eff.Date, Descriptions,
// Withdrawal / Deposit, Outstanding Balance (THB), Channel, Details), then one
// row per transaction starting with a dd-mm-yy date at the left; long Details
// wrap onto continuation lines without a date. Every page starts with a
// "Beginning Balance" carry-over row. The amount column doesn't say which side
// it's on, so the sign comes from the running balance: balance - previous
// balance = +amount (deposit) or -amount (withdrawal).

const LINE_TOLERANCE = 3; // points: pieces within this y distance are one line
const RE_DATE = /^\d{2}-\d{2}-\d{2}$/;
const RE_TIME = /^\d{2}:\d{2}$/;
const RE_MONEY = /^-?[\d,]+\.\d{2}$/;
// Footer text. Matched by content, not position: on a full page the last
// row shares a line with "KBPDF (FM702-...)".
const RE_FOOTER = /^(KBPDF|For more information|Issued by K PLUS|PAGE\/OF)/;

const cents = (s) => Math.round(parseFloat(String(s).replace(/,/g, '')) * 100);
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

class UnsupportedStatementError extends Error {}

function detectFormat(pages) {
  const all = pages.flat().map((it) => it.s).join('\n');
  if (/Bangkok Bank/i.test(all) && /STATEMENT OF SAVING ACCOUNT/i.test(all)) return 'bbl';
  if (/KBPDF/.test(all) || (/Withdrawal \/ Deposit/.test(all) && /Outstanding Balance/.test(all) && /K PLUS|KBank/.test(all))) return 'kbank';
  return null;
}

// pdf.js merges pieces that sit close together on a line into one item
// ("01-06-26 00:27 Payment", "25.00 13,207.83"). Split such items at dates,
// times and money amounts, estimating each part's x from the item's width
// (w, sent by the browser; ~4.4pt per character when missing). Only items
// starting left of the Details column are split: details text is free-form.
// No space is guaranteed between merged parts ("9,975.00K PLUS"), so tokens
// end at "not another digit" rather than at whitespace.
const RE_TOKEN = /(?<![\d.,])\d{2}-\d{2}-\d{2}(?![\d-])|(?<![\d:])\d{2}:\d{2}(?![\d:])|(?<![\d.,])-?\d{1,3}(?:,\d{3})*\.\d{2}(?![\d.])/g;
const widthOf = (it) => (Number.isFinite(it.w) && it.w > 0 ? it.w : String(it.s).length * 4.4);

// A long Channel value ("Internet/Mobile BBL") can merge with the Details
// text after it. Details are left-aligned, so their start x is the smallest x
// among this page's details pieces; split the merged item at the space
// nearest that x. Needs the item's measured width.
function splitAtDetails(items, channelMinX, detailsMinX) {
  const detailXs = items.filter((it) => it.x >= detailsMinX).map((it) => it.x);
  if (!detailXs.length) return items;
  const detailsX = Math.min(...detailXs);
  return items.flatMap((it) => {
    const text = String(it.s);
    // Only with a measured width (pdf.js sends one): a character-count guess
    // would split a long channel name that isn't merged at all.
    if (!(Number.isFinite(it.w) && it.w > 0)) return [it];
    const width = it.w;
    if (it.x < channelMinX || it.x >= detailsMinX || it.x + width < detailsX + 5) return [it];
    const target = ((detailsX - it.x) / width) * text.length;
    let best = -1;
    for (let i = 0; i < text.length; i += 1) if (text[i] === ' ' && (best < 0 || Math.abs(i - target) < Math.abs(best - target))) best = i;
    if (best <= 0 || !text.slice(best).trim()) return [it];
    return [{ x: it.x, y: it.y, s: text.slice(0, best) }, { x: detailsX, y: it.y, s: text.slice(best + 1) }];
  });
}

function splitMerged(items, detailsMinX) {
  const out = [];
  for (const it of items) {
    const text = String(it.s);
    if (it.x >= detailsMinX) { out.push(it); continue; }
    const width = widthOf(it);
    const xAt = (i) => it.x + (width * i) / Math.max(1, text.length);
    const parts = [];
    let last = 0;
    for (const m of text.matchAll(RE_TOKEN)) {
      if (text.slice(last, m.index).trim()) parts.push({ i: last, s: text.slice(last, m.index) });
      parts.push({ i: m.index, s: m[0] });
      last = m.index + m[0].length;
    }
    if (text.slice(last).trim()) parts.push({ i: last, s: text.slice(last) });
    if (parts.length <= 1) { out.push(it); continue; }
    for (const part of parts) {
      const lead = part.s.length - part.s.trimStart().length;
      out.push({ x: Math.round(xAt(part.i + lead) * 10) / 10, y: it.y, s: part.s.trim() });
    }
  }
  return out;
}

// Group pieces into lines (top to bottom), each line's pieces left to right.
function toLines(items) {
  const sorted = items
    .filter((it) => it && typeof it.s === 'string' && it.s.trim() && Number.isFinite(it.x) && Number.isFinite(it.y))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line.y - it.y) <= LINE_TOLERANCE) line.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  for (const line of lines) line.items.sort((a, b) => a.x - b.x);
  return lines;
}

const findItem = (items, re) => items.find((it) => re.test(norm(it.s)));

// Value printed to the right of a label on the same line (first page summary).
// The value may be a separate piece or glued onto the label's piece by a
// pdf.js merge ("Account Number 123-4-56789-0"). labelRe has no anchors;
// it's matched at the start of a piece.
function valueRightOf(items, labelRe) {
  const re = new RegExp(`^(${labelRe.source})(?:\\s*(.+))?$`);
  const label = items.find((it) => re.test(norm(it.s)));
  if (!label) return null;
  const [, labelText, glued] = norm(label.s).match(re);
  const sameLine = items.filter((it) => it !== label && Math.abs(it.y - label.y) <= LINE_TOLERANCE && it.x > label.x).sort((a, b) => a.x - b.x);
  const value = norm([glued || '', ...sameLine.map((it) => it.s)].join(' '));
  return value ? { label: labelText, value } : null;
}

function parseSummary(firstPage) {
  const account = valueRightOf(firstPage, /Account Number/);
  const period = valueRightOf(firstPage, /Period/);
  const ending = valueRightOf(firstPage, /Ending Balance/);
  const wd = valueRightOf(firstPage, /Total Withdrawal \d+ Items/);
  const dep = valueRightOf(firstPage, /Total Deposit \d+ Items/);
  const count = (x) => (x ? parseInt(x.label.match(/(\d+) Items/)[1], 10) : null);
  const periodMatch = period && period.value.match(/(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})/);
  const digits = account ? account.value.replace(/\D/g, '') : '';
  const holder = findItem(firstPage, /^Account (?!Number)\S/);
  return {
    holder_name: holder ? norm(holder.s).replace(/^Account\s+/, '') : null, // to spot transfers to/from own accounts
    account_number: digits || null,
    account_last4: digits ? digits.slice(-4) : null,
    period_start: periodMatch ? `${periodMatch[3]}-${periodMatch[2]}-${periodMatch[1]}` : null,
    period_end: periodMatch ? `${periodMatch[6]}-${periodMatch[5]}-${periodMatch[4]}` : null,
    ending_balance_cents: ending && RE_MONEY.test(ending.value) ? cents(ending.value) : null,
    withdrawal_count: count(wd),
    withdrawal_total_cents: wd && RE_MONEY.test(wd.value) ? cents(wd.value) : null,
    deposit_count: count(dep),
    deposit_total_cents: dep && RE_MONEY.test(dep.value) ? cents(dep.value) : null,
  };
}

// Column boundaries from this page's header labels (they're centred over
// their columns; data is left-aligned, so boundaries sit left of each label).
function pageColumns(items) {
  const x = (re, fallback) => (findItem(items, re) || { x: fallback }).x;
  const header = findItem(items, /^Descriptions$/);
  return {
    top: header ? header.y - LINE_TOLERANCE * 2 : Infinity, // below the header block
    balanceMinX: x(/^Outstanding Balance/, 274) - 5,
    channelMinX: x(/^Channel$/, 357) - 40,
    detailsMinX: x(/^Details$/, 460) - 75,
  };
}

// "Paid for Ref X2222 CP AXTRA ..." -> "CP AXTRA ...", strip "(A/C Name: ...)",
// "From X1111 MS. A++" -> "From MS. A". `key` keeps the A/C name, as extra
// context for categorizing.
function cleanDetails(raw) {
  let s = norm(raw).replace(/\(A \/C/g, '(A/C').replace(/\+\+/g, '');
  const key = norm(s.replace(/^Paid for Ref X\w+\s*/i, '').replace(/^(From|To)\s+(?:[A-Za-z]{2,12}\s+){0,2}X\w+\s*/, '$1 ').replace(/^Ref Code \S+$/i, ''));
  s = key.replace(/\s*\(A\/C\s*Name:.*$/i, '').replace(/\s*\(A\/C$/i, '');
  return { description: norm(s), key };
}

function parseKbank(pages) {
  const summary = parseSummary(pages[0] || []);
  const rows = [];
  const warnings = [];
  let openingCents = null;
  let prevBalance = null;

  pages.forEach((items, pageIndex) => {
    const cols = pageColumns(items);
    // Drop footer text, but keep anything a merge glued after "KBPDF (...) (...)".
    const table = items
      .filter((it) => it.y < cols.top)
      .map((it) => {
        const rest = norm(it.s).match(/^KBPDF \([^)]*\) \([^)]*\)\s*(.+)$/);
        return rest ? { x: it.x + (widthOf(it) * (norm(it.s).length - rest[1].length)) / norm(it.s).length, y: it.y, s: rest[1] } : it;
      })
      .filter((it) => !RE_FOOTER.test(norm(it.s)));
    const lines = toLines(splitAtDetails(splitMerged(table, cols.detailsMinX), cols.channelMinX, cols.detailsMinX));
    let current = null;

    const finish = () => {
      if (!current) return;
      if (current.isBeginning) {
        if (openingCents === null) openingCents = current.balance;
        else if (prevBalance !== null && current.balance !== prevBalance) {
          warnings.push(`Page ${pageIndex + 1}: carried balance ${current.balance / 100} doesn't match the previous page's ${prevBalance / 100}`);
        }
        prevBalance = current.balance;
      } else {
        rows.push(current);
        if (current.balance !== null) prevBalance = current.balance;
      }
      current = null;
    };

    for (const line of lines) {
      const date = line.items.find((it) => RE_DATE.test(norm(it.s)) && it.x < cols.balanceMinX);
      if (date) {
        finish();
        const parts = { time: null, desc: [], amount: null, balance: null, channel: [], details: [] };
        for (const it of line.items) {
          const s = norm(it.s);
          if (it === date) continue;
          // Money first: amounts and balances are right-aligned, so a short
          // balance like "4.79" can reach into the Channel column's x range.
          if (it.x >= cols.detailsMinX) parts.details.push(s);
          else if (RE_MONEY.test(s)) {
            if (it.x >= cols.balanceMinX) parts.balance = cents(s);
            else parts.amount = cents(s);
          } else if (it.x >= cols.channelMinX) parts.channel.push(s);
          else if (RE_TIME.test(s) && !parts.time) parts.time = s;
          else parts.desc.push(s);
        }
        const [dd, mm, yy] = norm(date.s).split('-');
        const desc = norm(parts.desc.join(' '));
        current = {
          page: pageIndex + 1,
          date: `20${yy}-${mm}-${dd}`,
          time: parts.time,
          bank_description: desc,
          amount: parts.amount,
          balance: parts.balance,
          channel: norm(parts.channel.join(' ')) || null,
          details: parts.details,
          isBeginning: /^Beginning Balance$/i.test(desc),
        };
      } else if (current) {
        // Continuation line: more Details text.
        for (const it of line.items) if (it.x >= cols.detailsMinX) current.details.push(norm(it.s));
      }
    }
    finish();
  });

  // Signs from the running balance.
  let balance = openingCents;
  const out = [];
  for (const r of rows) {
    if (r.amount === null || r.balance === null) {
      warnings.push(`Page ${r.page}: a ${r.date} row has no ${r.amount === null ? 'amount' : 'balance'}; skipped`);
      continue;
    }
    const delta = balance === null ? null : r.balance - balance;
    let type;
    if (delta !== null && Math.abs(delta) === r.amount) type = delta < 0 ? 'expense' : 'income';
    else {
      type = /deposit/i.test(r.bank_description) ? 'income' : 'expense';
      warnings.push(`Page ${r.page}: ${r.date} ${r.time || ''} ${r.amount / 100} doesn't match the balance change; guessed ${type === 'income' ? 'deposit' : 'withdrawal'} from "${r.bank_description}"`);
    }
    balance = r.balance;
    const { description, key } = cleanDetails(r.details.join(' '));
    out.push({
      date: r.date,
      time: r.time,
      bank_description: r.bank_description,
      channel: r.channel,
      description: description || r.bank_description,
      merchant_key: key || r.bank_description,
      amount: r.amount / 100,
      amount_cents: r.amount,
      balance_cents: r.balance,
      type,
    });
  }

  // Cross-checks against the first page's totals.
  const sum = (type) => out.filter((r) => r.type === type).reduce((n, r) => n + r.amount_cents, 0);
  const n = (type) => out.filter((r) => r.type === type).length;
  const checks = [];
  const check = (label, expected, actual) => {
    if (expected === null || expected === undefined) return;
    checks.push({ label, expected, actual, ok: expected === actual });
  };
  check('withdrawal_count', summary.withdrawal_count, n('expense'));
  check('withdrawal_total_cents', summary.withdrawal_total_cents, sum('expense'));
  check('deposit_count', summary.deposit_count, n('income'));
  check('deposit_total_cents', summary.deposit_total_cents, sum('income'));
  check('ending_balance_cents', summary.ending_balance_cents, out.length ? out[out.length - 1].balance_cents : openingCents);

  return {
    bank: 'kbank',
    summary: { ...summary, opening_balance_cents: openingCents },
    rows: out,
    checks,
    ok: warnings.length === 0 && checks.every((c) => c.ok),
    warnings,
  };
}

// ---- Bangkok Bank savings ----
//
// Row: "01/11/26 PMT. PROMPTPAY 20.00 28,035.67 mPhone" -- date, particulars,
// optional cheque number, amount (in the Withdrawal or Deposit column),
// balance, channel ("Via"). "B/F" rows carry the balance forward (opening
// balance, and possibly each page). Particulars are bank codes with no
// counterparty ("PMT FOR GOODS", "TRF TO OTH BK"), so descriptions are a
// readable version of the code.
const RE_BBL_ROW = /^(\d{2})\/(\d{2})\/(\d{2})\s+(.+?)\s+(?:(\d{4,10})\s+)?(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})(?:\s+(.*))?$/;
const RE_BBL_BF = /^(\d{2})\/(\d{2})\/(\d{2})\s+(?:B\/F|C\/F|BALANCE B\/F)\s+(-?[\d,]+\.\d{2})\s*$/i;
const BBL_CODES = [
  [/^PMT\.? PROMPTPAY/i, 'PromptPay payment'],
  [/^PMT\.? FOR GOODS/i, 'Payment for goods'],
  [/^PMT\.? BILL/i, 'Bill payment'],
  [/^TRF\.? TO OTH\.? BK/i, 'Transfer to another bank'],
  [/^TRF\.? FR(OM)?\.? OTH\.? BK/i, 'Transfer from another bank'],
  [/^TRF\.? TO/i, 'Transfer out'],
  [/^TRF\.? FR/i, 'Transfer in'],
  [/^PROMPTPAY IN|^RECV\.? PROMPTPAY/i, 'PromptPay received'],
  [/^ATM\b|^ATW\b|^CASH W/i, 'Cash withdrawal'],
  [/^DEP\b|^DEPOSIT|^CASH DEP/i, 'Deposit'],
  [/^INT(EREST)?\b/i, 'Interest'],
  [/^WHT|^W\/H TAX|^TAX/i, 'Withholding tax'],
  [/^FEE|^CHARGE|^SERVICE CHG/i, 'Bank fee'],
];
const bblDescription = (particulars) => (BBL_CODES.find(([re]) => re.test(particulars)) || [null, particulars])[1];
// Capped: a real statement row is well under 300 characters.
const lineText = (line) => norm(line.items.map((it) => it.s).join(' ')).slice(0, 1000);

function parseBbl(pages) {
  // Header fields are on page 1; the debit/credit totals follow the last row,
  // so they're on the last page.
  const firstLines = toLines(pages[0] || []);
  const allLines = pages.flatMap((items) => toLines(items));
  const find = (lines, re) => { const l = lines.find((x) => re.test(lineText(x))); return l ? lineText(l) : ''; };
  const textOf = (re) => find(firstLines, re);
  const account = textOf(/Account No\./).match(/(\d{3}-\d-\d{5}-\d|\d{10})/);
  const period = textOf(/Statement Period/).match(/(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})/);
  const holder = textOf(/Name\s/).match(/Name\s+(.+?)(?:\s+เลขที่บัญชี.*|\s+Account No\..*)?$/);
  const totals = (re) => {
    const t = find(allLines, re);
    if (!t) return { count: null, cents: null };
    const rest = t.replace(/^.*?Total No\. of (Debits|Credits)/i, '');
    const count = rest.match(/(?<![\d.,])(\d+)(?![\d.,])/);
    const money = rest.match(/-?[\d,]+\.\d{2}/);
    return { count: count ? parseInt(count[1], 10) : null, cents: money ? cents(money[0]) : null };
  };
  const debits = totals(/Total No\. of Debits/i);
  const credits = totals(/Total No\. of Credits/i);
  const digits = account ? account[1].replace(/\D/g, '') : '';
  const summary = {
    holder_name: holder ? norm(holder[1]) : null,
    account_number: digits || null,
    account_last4: digits ? digits.slice(-4) : null,
    period_start: period ? `${period[3]}-${period[2]}-${period[1]}` : null,
    period_end: period ? `${period[6]}-${period[5]}-${period[4]}` : null,
    ending_balance_cents: null, // not printed on BBL statements
    withdrawal_count: debits.count,
    withdrawal_total_cents: debits.cents,
    deposit_count: credits.count,
    deposit_total_cents: credits.cents,
  };

  const out = [];
  const warnings = [];
  let openingCents = null;
  let balance = null;
  pages.forEach((items, pageIndex) => {
    for (const line of toLines(items)) {
      const text = lineText(line);
      const bf = text.match(RE_BBL_BF);
      if (bf) {
        const carried = cents(bf[4]);
        if (openingCents === null) openingCents = carried;
        else if (balance !== null && carried !== balance) warnings.push(`Page ${pageIndex + 1}: carried balance ${carried / 100} doesn't match the previous balance ${balance / 100}`);
        balance = carried;
        continue;
      }
      const m = text.match(RE_BBL_ROW);
      if (!m) continue;
      const [, dd, mm, yy, particularsRaw, , amountStr, balanceStr, via] = m;
      const particulars = norm(particularsRaw);
      const amount = cents(amountStr);
      const after = cents(balanceStr);
      const delta = balance === null ? null : after - balance;
      let type;
      if (delta !== null && Math.abs(delta) === Math.abs(amount)) type = delta < 0 ? 'expense' : 'income';
      else {
        type = /^(DEP|DEPOSIT|TRF\.? FR|INT|PROMPTPAY IN|RECV)/i.test(particulars) ? 'income' : 'expense';
        warnings.push(`Page ${pageIndex + 1}: ${dd}/${mm}/${yy} ${amount / 100} doesn't match the balance change; guessed ${type === 'income' ? 'deposit' : 'withdrawal'} from "${particulars}"`);
      }
      balance = after;
      out.push({
        date: `20${yy}-${mm}-${dd}`,
        time: null,
        bank_description: particulars,
        channel: via ? norm(via) : null,
        description: bblDescription(particulars),
        merchant_key: particulars,
        amount: Math.abs(amount) / 100,
        amount_cents: Math.abs(amount),
        balance_cents: after,
        type,
        // No counterparty is printed, so a transfer to/from another bank may be
        // the holder's own account: statementImport starts these unticked.
        is_bank_transfer: /^TRF\.? (TO|FR(OM)?)\.? OTH/i.test(particulars),
      });
    }
  });

  const sum = (type) => out.filter((r) => r.type === type).reduce((n, r) => n + r.amount_cents, 0);
  const n = (type) => out.filter((r) => r.type === type).length;
  const checks = [];
  const check = (label, expected, actual) => { if (expected !== null && expected !== undefined) checks.push({ label, expected, actual, ok: expected === actual }); };
  check('withdrawal_count', summary.withdrawal_count, n('expense'));
  check('withdrawal_total_cents', summary.withdrawal_total_cents, sum('expense'));
  check('deposit_count', summary.deposit_count, n('income'));
  check('deposit_total_cents', summary.deposit_total_cents, sum('income'));
  if (openingCents === null) warnings.push('No brought-forward (B/F) balance found, so signs are guessed from the descriptions.');

  return {
    bank: 'bbl',
    summary: { ...summary, opening_balance_cents: openingCents },
    rows: out,
    checks,
    ok: warnings.length === 0 && checks.length > 0 && checks.every((c) => c.ok),
    warnings,
  };
}

const SUPPORTED = 'KBank savings/current and Bangkok Bank savings statements';

function parseStatement(pages) {
  if (!Array.isArray(pages) || pages.length === 0) throw new UnsupportedStatementError('No pages found in this PDF.');
  const format = detectFormat(pages);
  if (format === 'kbank') return parseKbank(pages);
  if (format === 'bbl') return parseBbl(pages);
  throw new UnsupportedStatementError(`This statement format isn't supported yet. Supported so far: ${SUPPORTED}.`);
}

module.exports = { parseStatement, cleanDetails, toLines, detectFormat, UnsupportedStatementError };
