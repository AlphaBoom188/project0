// Synthetic Bangkok Bank savings statement for tests -- no real data. Mirrors
// the layout of a real Bualuang mBanking "STATEMENT OF SAVING ACCOUNT" PDF:
// bank header, account/period on the right, a Date / Particulars / Chq.No. /
// Withdrawal / Deposit / Balance / Via table starting with a "B/F" row, and
// debit/credit totals under it (the credit amount printed before its label,
// as on the real one).
//
// buildBblStatement(rows, { merged, perPage }) -> { pages, totals }
//   merged: true  = one piece per table row (what PDFKit returns)
//           false = one piece per column (closer to pdf.js)
const { money, statementPdf } = require('./kbankStatement');

const ddmmyy = (ymd) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(2, 4)}`;
const rightAt = (x, s) => x - s.length * 3.6;

function buildBblStatement(rows, { opening = 1000000, merged = false, perPage = 20, holder = 'MR TEST STATEMENTUSER', accountNumber = '033-0-12345-6', period = ['01/11/2026', '18/11/2026'] } = {}) {
  let balance = opening;
  const withBal = rows.map((r) => {
    const c = Math.round(r.amount * 100);
    balance += r.sign * c;
    return { ...r, cents: c, balance };
  });
  const debits = withBal.filter((r) => r.sign < 0);
  const credits = withBal.filter((r) => r.sign > 0);
  const sum = (list) => list.reduce((n, r) => n + r.cents, 0);
  const pageCount = Math.max(1, Math.ceil(withBal.length / perPage));
  const pages = [];
  let carried = opening;
  for (let p = 0; p < pageCount; p += 1) {
    const items = [];
    const add = (x, y, s) => items.push({ x: Math.round(x * 10) / 10, y, s });
    add(410.9, 806, 'ใบแจ้งรายการบัญชีเงินฝากสะสมทรัพย์');
    add(438.9, 793, 'STATEMENT OF SAVING ACCOUNT');
    add(50, 774.6, 'Bangkok Bank Public Company Limited 333 Silom Road Bangrak Bangkok 10500 Tel. +66 2231 4333');
    add(50, 757, '0001 TEST BRANCH');
    add(20, 736, `ชื่อ/Name ${holder} `); add(308, 736, 'เลขที่บัญชี/Account No.'); add(450, 736, accountNumber);
    add(308, 718, 'สกุลเงิน/Currency'); add(450, 718, 'THB');
    add(308, 700, 'รอบรายการบัญชี / Statement Period'); add(450, 700, `${period[0]} - ${period[1]}`);
    add(29.2, 640.4, 'Date'); add(80, 640.4, 'Particulars'); add(164.1, 640.4, 'Chq.No.');
    add(244.2, 640.4, 'Withdrawal Deposit'); add(396.6, 640.4, 'Balance'); add(498.3, 640.4, 'Via');

    const pageRows = withBal.slice(p * perPage, (p + 1) * perPage);
    let y = 624;
    const firstDate = pageRows.length ? pageRows[0].date : '2026-11-01';
    if (merged) add(24.8, y, `${ddmmyy(firstDate)} B/F ${money(carried)}`);
    else { add(24.8, y, ddmmyy(firstDate)); add(64, y, 'B/F'); add(rightAt(450, money(carried)), y, money(carried)); }
    for (const r of pageRows) {
      y -= 15;
      const amt = money(r.cents);
      const bal = money(r.balance);
      if (merged) {
        add(24.8, y, `${ddmmyy(r.date)} ${r.particulars}${r.chq ? ` ${r.chq}` : ''} ${amt} ${bal} ${r.via || 'mPhone'}`);
      } else {
        add(24.8, y, ddmmyy(r.date));
        add(64, y, r.particulars);
        if (r.chq) add(162, y, r.chq);
        add(rightAt(r.sign < 0 ? 300 : 375, amt), y, amt);
        add(rightAt(450, bal), y, bal);
        add(489, y, r.via || 'mPhone');
      }
      carried = r.balance;
    }
    if (p === pageCount - 1) {
      add(20, y - 18, 'จำนวนรายการถอน/Total No. of Debits'); add(279, y - 18, String(debits.length));
      add(297, y - 18, 'จำนวนเงินถอน/Total Debit Amount'); add(542, y - 18, money(sum(debits)));
      add(20, y - 34, 'จำนวนรายการฝาก/Total No. of Credits '); add(279, y - 34, `${credits.length} ${money(sum(credits))}`);
      add(297, y - 34, 'จำนวนเงินฝาก/Total Credit Amount');
    }
    add(20, 58, 'If no objection is made within 14 Days, all items herein shall be deemed accurate.');
    add(489, 20, `หน้าที่/Page ${p + 1} / ${pageCount}`);
    pages.push(items);
  }
  return {
    pages,
    totals: { debits: debits.length, debitCents: sum(debits), credits: credits.length, creditCents: sum(credits), endingCents: balance },
  };
}

const BBL_SAMPLE = [
  { date: '2026-11-01', particulars: 'PMT. PROMPTPAY', amount: 20, sign: -1 },
  { date: '2026-11-01', particulars: 'PMT FOR GOODS', amount: 705, sign: -1 },
  { date: '2026-11-02', particulars: 'TRF FR OTH BK', amount: 5000, sign: 1 },
  { date: '2026-11-03', particulars: 'ATM WDL', amount: 500, sign: -1, via: 'ATM' },
  { date: '2026-11-05', particulars: 'TRF TO OTH BK', amount: 2000, sign: -1 },
  { date: '2026-11-10', particulars: 'CHQ DEPOSIT', chq: '00012345', amount: 1500, sign: 1, via: 'Branch' },
  { date: '2026-11-15', particulars: 'INTEREST', amount: 3.21, sign: 1, via: 'System' },
];

// ASCII-only copy for statementPdf() (Helvetica can't draw Thai labels).
const asciiPages = (pages) => pages.map((items) => items.map((it) => ({ ...it, s: it.s.replace(/[^\x20-\x7e]+/g, '').trim() || '-' })));

module.exports = { buildBblStatement, BBL_SAMPLE, bblStatementPdf: (pages) => statementPdf(asciiPages(pages)) };
