// Tax summary export: a printable page (save as PDF from the browser) and a
// CSV of one tax year -- income, deductions, the calculation step by step,
// documents and the rules still unverified. Built from the same state the
// Tax tab shows (taxController.stateResponse), so the two can't disagree.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const baht = (n) => {
  const v = Number(n) || 0;
  const d = Number.isInteger(Math.round(v * 100) / 100) ? 0 : 2;
  return `${v < 0 ? '-' : ''}฿${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const beDate = (be) => { if (!be) return ''; const [y, m, d] = be.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const FORMULA_START = /^[=+\-@\t\r]/;
const csvField = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (typeof v === 'string' && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Shared rows for both formats.
function summaryRows(data) {
  const r = data.result;
  const kindLabel = Object.fromEntries((data.rules.incomeKinds || []).map((k) => [k.key, k.label]));
  const incomes = data.incomes.map((inc, i) => {
    const line = r.incomes.find((l) => l.index === i) || {};
    return { type: line.type, label: kindLabel[inc.kind] || inc.kind, payer: inc.payer || '', amount: inc.amount, withheld: inc.withheld, exempt: line.exempt || 0, expense: line.expense || 0, method: inc.expense_method, net: line.net || 0 };
  });
  const deductions = [...r.allowances, ...r.donations].filter((a) => a.allowed > 0 || a.claimed > 0)
    .map((a) => ({ key: a.key, label: a.label, claimed: a.claimed, allowed: a.allowed, verified: a.verified, note: a.trimmedBy ? `over the shared ${a.trimmedBy} limit` : a.note || '' }));
  const steps = [
    ['Income', r.totals.gross],
    ...(r.totals.exempt ? [['65+ / disability exemption', -r.totals.exempt]] : []),
    ...(r.dividendCredit ? [['Dividend credit added to income', r.dividendCredit]] : []),
    ['Expenses', -r.totals.expenses],
    ['Deductions', -r.totals.allowances],
    ...(r.totals.donations ? [['Donations', -r.totals.donations]] : []),
    ['Net income', r.totals.netIncome],
    ...r.brackets.filter((b) => b.taxable > 0).map((b) => [`  ${Math.round(b.rate * 100)}% on ${baht(b.taxable)}`, b.tax]),
    ...(r.minimumTax.base ? [[`  0.5% of non-salary income${r.minimumTax.applies ? ' (applies)' : ''}`, r.minimumTax.tax]] : []),
    ['Tax', r.taxDue],
    ...(r.withheld ? [['Tax withheld', -r.withheld]] : []),
    ...(r.dividendCredit ? [['Dividend tax credit', -r.dividendCredit]] : []),
    ...(r.prepaid ? [['Paid with PND 94', -r.prepaid]] : []),
    [r.result === 'refund' ? 'Refund' : 'To pay', Math.abs(r.balance)],
  ];
  const incomeById = new Map(data.incomes.map((i) => [i.id, kindLabel[i.kind] || i.kind]));
  const dedLabel = new Map(data.rules.deductions.map((d) => [d.key, d.label]));
  const documents = (data.documents || []).map((d) => ({ name: d.file_name || d.kind, attachedTo: d.income_id ? incomeById.get(d.income_id) || 'Income' : d.claim_key ? dedLabel.get(d.claim_key) || d.claim_key : 'Not attached' }));
  return { incomes, deductions, steps, documents };
}

function buildSummaryCsv(data) {
  const r = data.result;
  const { incomes, deductions, steps, documents } = summaryRows(data);
  const rows = [
    ['Tax summary', `Tax year ${data.year}`],
    ['Form', r.filing.form === 'PND91' ? 'PND 91' : 'PND 90', 'Deadline', r.filing.onlineDeadline || r.filing.paperDeadline],
    ['Result', r.result === 'refund' ? 'Refund' : r.result === 'pay' ? 'To pay' : 'Nothing to pay', Math.abs(r.balance)],
    [],
    ['Income type', 'Income', 'Paid by', 'Amount', 'Tax withheld', 'Exempt', 'Expenses', 'Expense method', 'Net'],
    ...incomes.map((i) => [i.type, i.label, i.payer, i.amount, i.withheld, i.exempt, i.expense, i.method, i.net]),
    [],
    ['Deduction', 'Claimed', 'Allowed', 'Note', 'Verified rule'],
    ...deductions.map((d) => [d.label, d.claimed, d.allowed, d.note, d.verified ? 'yes' : 'no']),
    [],
    ['Calculation', 'Amount'],
    ...steps.map(([label, v]) => [label.trim(), v]),
    ...(documents.length ? [[], ['Document', 'Attached to'], ...documents.map((d) => [d.name, d.attachedTo])] : []),
  ];
  return '﻿' + rows.map((row) => row.map(csvField).join(',')).join('\r\n');
}

function buildSummaryHtml(data, { name = '', csvHref = null, generatedAt = new Date() } = {}) {
  const r = data.result;
  const { incomes, deductions, steps, documents } = summaryRows(data);
  const form = r.filing.form === 'PND91' ? 'PND 91' : 'PND 90';
  const deadline = r.filing.onlineDeadline ? `${beDate(r.filing.onlineDeadline)} (online)` : `${beDate(r.filing.paperDeadline)} (paper)`;
  const headline = r.result === 'refund' ? 'Refund' : r.result === 'pay' ? 'Tax to pay' : 'Nothing to pay';
  const td = (v, num) => `<td${num ? ' class="n"' : ''}>${esc(v)}</td>`;
  const half = data.halfYear && data.halfYear.applicable ? data.halfYear : null;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tax summary ${data.year}</title>
<style>
  :root { --fg: #0a0a0a; --muted: #737373; --border: #e5e5e5; --accent: #15803d; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px 16px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Thonburi, Tahoma, sans-serif; color: var(--fg); background: #fff; font-size: 14px; line-height: 1.45; }
  main { max-width: 760px; margin: 0 auto; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 24px 0 8px; }
  .muted { color: var(--muted); }
  .hero { border: 1px solid var(--border); border-radius: 14px; padding: 16px; margin: 16px 0; }
  .hero .big { font-size: 32px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px 4px; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { font-size: 12px; color: var(--muted); font-weight: 600; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.total td { font-weight: 700; border-top: 2px solid var(--fg); }
  .tag { display: inline-block; padding: 0 6px; border: 1px solid #d97706; color: #d97706; border-radius: 6px; font-size: 11px; font-weight: 600; }
  .actions { display: flex; gap: 8px; margin: 16px 0; }
  .actions a, .actions button { min-height: 44px; padding: 8px 16px; border-radius: 10px; border: 1px solid var(--border); background: #fff; font: inherit; font-weight: 600; color: var(--fg); text-decoration: none; display: inline-flex; align-items: center; }
  .actions button { background: var(--accent); color: #fff; border-color: var(--accent); }
  .table-wrap { overflow-x: auto; }
  @media print { .actions { display: none; } body { padding: 0; } }
</style></head>
<body><main>
  <h1>Tax summary, tax year ${esc(data.year)}</h1>
  <p class="muted">${name ? `${esc(name)} · ` : ''}Thai personal income tax · made ${esc(generatedAt.toISOString().slice(0, 10))}</p>
  <div class="actions"><button type="button" onclick="window.print()">Print or save as PDF</button>${csvHref ? `<a href="${esc(csvHref)}">Download CSV</a>` : ''}</div>
  <section class="hero">
    <div class="muted">${headline}</div>
    <div class="big">${esc(baht(Math.abs(r.balance)))}</div>
    <div>Tax ${esc(baht(r.taxDue))}${r.withheld ? ` · withheld ${esc(baht(r.withheld))}` : ''}${r.dividendCredit ? ` · dividend credit ${esc(baht(r.dividendCredit))}` : ''}${r.prepaid ? ` · paid with PND 94 ${esc(baht(r.prepaid))}` : ''}</div>
    <div class="muted">${r.filing.mustFile ? `File ${form} by ${esc(deadline)}.` : `Filing isn't required (income under ${esc(baht(r.filing.threshold))}).`} Effective rate ${(r.effectiveRate * 100).toFixed(2)}%.</div>
  </section>

  <h2>Income</h2>
  <div class="table-wrap"><table>
    <tr><th>Type</th><th>Income</th><th class="n">Amount</th><th class="n">Withheld</th><th class="n">Expenses</th><th class="n">Net</th></tr>
    ${incomes.map((i) => `<tr>${td(i.type)}<td>${esc(i.label)}${i.payer ? `<br><span class="muted">${esc(i.payer)}</span>` : ''}${i.exempt ? `<br><span class="muted">exempt ${esc(baht(i.exempt))}</span>` : ''}</td>${td(baht(i.amount), 1)}${td(baht(i.withheld), 1)}${td(`${baht(i.expense)}${i.method === 'actual' ? ' (actual)' : ''}`, 1)}${td(baht(i.net), 1)}</tr>`).join('') || '<tr><td colspan="6" class="muted">No income entered.</td></tr>'}
  </table></div>

  <h2>Deductions</h2>
  <div class="table-wrap"><table>
    <tr><th>Deduction</th><th class="n">Claimed</th><th class="n">Allowed</th></tr>
    ${deductions.map((d) => `<tr><td>${esc(d.label)}${d.verified ? '' : ' <span class="tag">Unverified rule</span>'}${d.note ? `<br><span class="muted">${esc(d.note)}</span>` : ''}</td>${td(baht(d.claimed), 1)}${td(baht(d.allowed), 1)}</tr>`).join('')}
  </table></div>

  <h2>How it's worked out</h2>
  <table>
    ${steps.map(([label, v], i) => `<tr${i === steps.length - 1 ? ' class="total"' : ''}><td${label.startsWith('  ') ? ' class="muted" style="padding-left:16px"' : ''}>${esc(label.trim())}</td>${td(baht(v), 1)}</tr>`).join('')}
  </table>
  ${half ? `<h2>Half-year return (PND 94)</h2><p>January-June income ${esc(baht(half.income))}${half.estimated ? ' (partly estimated as half the year)' : ''}: estimated PND 94 tax ${esc(baht(half.tax))}. Window ${esc(half.opens)} to ${esc(half.deadline)}.</p>` : ''}
  ${documents.length ? `<h2>Documents</h2><table><tr><th>Document</th><th>Attached to</th></tr>${documents.map((d) => `<tr>${td(d.name)}${td(d.attachedTo)}</tr>`).join('')}</table>` : ''}
  ${r.warnings.length ? `<h2>Notes</h2><ul>${r.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
  <p class="muted">An estimate from the figures entered, using the Revenue Department's rules for ${esc(data.year)}. It isn't tax advice: check the figures when you file at efiling.rd.go.th.</p>
</main></body></html>`;
}

module.exports = { buildSummaryHtml, buildSummaryCsv, summaryRows };
