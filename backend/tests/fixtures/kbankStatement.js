// Synthetic KBank-style statement for tests -- no real data. Mirrors the real
// layout measured from a K PLUS statement PDF: header labels, a "Beginning
// Balance" carry-over row per page, rows starting with a dd-mm-yy date at
// x=67.9, amounts right-aligned around x=230-249, balances around x=303-318,
// Channel at x=333, Details at x=404 with wrapped continuation lines, and the
// last row of a full page sharing its line with the "KBPDF" footer.
//
// buildStatement(transactions, opts) -> { pages: [[{x, y, s}]], totals }
//   transactions: [{ date: 'YYYY-MM-DD', time, desc, amount (number, >0),
//                    sign: -1|1, channel, details: [line, ...] }]
const money = (cents) => (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ddmmyy = (ymd) => `${ymd.slice(8, 10)}-${ymd.slice(5, 7)}-${ymd.slice(2, 4)}`;
// Right-aligned columns: a narrower string starts further right.
const amountX = (s) => 249.2 - (s.length - 6) * 4.2;
const balanceX = (s) => 303.2 + Math.max(0, 9 - s.length) * 4.4;

function buildStatement(transactions, { opening = 1000000, perPage = 4, holder = 'MR. TEST STATEMENTUSER', accountNumber = '123-4-56789-0', period = ['01/06/2026', '30/06/2026'] } = {}) {
  let balance = opening;
  const rows = transactions.map((t) => {
    const cents = Math.round(t.amount * 100);
    balance += t.sign * cents;
    return { ...t, cents, balance };
  });
  const wd = rows.filter((r) => r.sign < 0);
  const dep = rows.filter((r) => r.sign > 0);
  const sum = (list) => list.reduce((n, r) => n + r.cents, 0);
  const pageCount = Math.max(1, Math.ceil(rows.length / perPage));

  const pages = [];
  let carried = opening;
  for (let p = 0; p < pageCount; p += 1) {
    const items = [];
    const add = (x, y, s) => items.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, s });
    add(493.5, 780.5, `PAGE/OF ${p + 1}/${pageCount}`);
    if (p === 0) {
      add(66, 757.5, `Account ${holder}`);
      add(345, 746.7, 'Account Number'); add(393, 746.7, accountNumber);
      add(345, 733.7, 'Period'); add(393, 733.7, `${period[0]} - ${period[1]}`);
      add(345, 707.7, 'Ending Balance'); add(510.4, 707.7, money(balance));
      add(345, 694.7, `Total Withdrawal ${wd.length} Items`); add(503.9, 694.7, money(sum(wd)));
      add(345, 681.7, `Total Deposit ${dep.length} Items`); add(503.9, 681.7, money(sum(dep)));
    }
    add(100.7, 661.5, 'Time/'); add(273.7, 661.5, 'Outstanding Balance');
    add(73.9, 655.7, 'Date'); add(146, 655.7, 'Descriptions'); add(208.6, 655.7, 'Withdrawal / Deposit ');
    add(356.8, 655.7, 'Channel'); add(460.2, 655.7, 'Details');
    add(97.5, 650, 'Eff.Date'); add(293.3, 650, '(THB)');

    const pageRows = rows.slice(p * perPage, (p + 1) * perPage);
    const firstDate = pageRows.length ? pageRows[0].date : '2026-06-01';
    let y = 637;
    const bb = money(carried);
    add(67.9, y, `${ddmmyy(firstDate)} `); add(123, y, 'Beginning Balance'); add(balanceX(bb), y, bb);
    const full = pageRows.length === perPage;
    pageRows.forEach((r, i) => {
      y -= 11.5;
      if (full && i === pageRows.length - 1) {
        y = 97.5; // last row of a full page shares the footer's line
        add(52, y, 'KBPDF (FM702-CA_SA-V.1) (03-25)');
      }
      const amt = money(r.cents);
      const bal = money(r.balance);
      add(67.9, y, `${ddmmyy(r.date)} `);
      if (r.time) add(101.2, y, `${r.time} `);
      add(123, y, `${r.desc} `);
      add(amountX(amt), y, amt);
      add(balanceX(bal), y, `${bal} `);
      add(333, y, r.channel || 'K PLUS');
      (r.details || []).forEach((line, j) => add(404, y - j * 11.5, line));
      y -= Math.max(0, (r.details || []).length - 1) * 11.5;
      carried = r.balance;
    });
    if (!full) add(52, 96, 'KBPDF (FM702-CA_SA-V.1) (03-25)');
    add(128.9, 84.5, 'For more information, call K-Contact Center (Individuals) at 02-8888888.');
    add(67, 72.5, 'Issued by K PLUS');
    pages.push(items);
  }
  return {
    pages,
    totals: { withdrawals: wd.length, withdrawalCents: sum(wd), deposits: dep.length, depositCents: sum(dep), endingCents: balance },
  };
}

// A month of varied rows: Thai and English merchants, wrapped details, an
// own-account transfer, a wallet top-up, and a small balance (right-aligned
// into the Channel column's x range) to exercise the column logic.
const SAMPLE = [
  { date: '2026-06-01', time: '00:27', desc: 'Payment', amount: 25, sign: -1, details: ['Paid for Ref X2222 CP AXTRA PUBLIC', 'COMPANY LIMITED (HEAD'] },
  { date: '2026-06-01', time: '08:42', desc: 'Transfer Deposit', amount: 675, sign: 1, channel: 'MAKE by KBank', details: ['From X1111 MS. SUDA RAKDEE++'] },
  { date: '2026-06-01', time: '11:46', desc: 'Payment', amount: 229, sign: -1, channel: 'EDC/K SHOP/MYQR', details: ['Paid for Ref X3333 แกร็บแท็กซี่ (ประเทศไทย) (A', '/C Name: GRABTAXI (THAILAND) CO.,LTD.)'] },
  { date: '2026-06-02', time: '09:27', desc: 'Transfer Withdrawal', amount: 544.58, sign: -1, details: ['To X4444 MR. TEST STATEMENTU++'] },
  { date: '2026-06-02', time: '12:21', desc: 'Payment', amount: 120, sign: -1, details: ['Paid for Ref XQ1AB LINE MAN (QR by ttb)'] },
  { date: '2026-06-03', time: '07:31', desc: 'Payment', amount: 500, sign: -1, details: ['Paid for Ref X5555 GRABPAY WALLET'] },
  { date: '2026-06-03', time: '18:24', desc: 'Payment', amount: 9250, sign: -1, details: ['Paid for Ref X6666 CS 7-Eleven Vending', 'MPQ 00016'] },
  { date: '2026-06-04', time: '10:28', desc: 'Payment', amount: 35, sign: -1, details: ['Paid for Ref X7777 BTS TIM TVM'] },
  { date: '2026-06-05', time: '23:58', desc: 'Transfer Deposit', amount: 26936.67, sign: 1, channel: 'Internet/Mobile BBL', details: ['From BBL X8888 MR TEST STATEMENTU++'] },
  { date: '2026-06-19', time: null, desc: 'Interest Deposit', amount: 26.76, sign: 1, channel: 'Automatic', details: ['Ref Code PCB00001'] },
];

module.exports = { buildStatement, SAMPLE, money };

// A real (unencrypted) PDF of those pages: one Helvetica text object per
// piece at its exact x/y, so pdf.js in the browser yields the same layout.
// 6.5pt like the real statement, so no column's text overlaps the next
// (at 8pt "Internet/Mobile BBL" would run into Details).
// Helvetica/WinAnsi can't draw Thai, so pass ASCII-only rows.
function statementPdf(pages) {
  const esc = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '?');
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };
  const catalog = add(null);
  const pagesObj = add(null);
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const kids = pages.map((items) => {
    const stream = items.map((it) => `BT /F1 6.5 Tf 1 0 0 1 ${it.x} ${it.y} Tm (${esc(it.s)}) Tj ET`).join('\n');
    const content = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    return add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`);
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const offset = Buffer.byteLength(out, 'latin1');
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

module.exports.statementPdf = statementPdf;
