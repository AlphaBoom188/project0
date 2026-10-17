function toCsvField(value) {
  const str = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// Mirrors the LIFF row label (liff-app/app.js transactionSourceLabel) minus its
// payment_method fallback -- that has its own column here. Blank when no account.
function accountLabel(t) {
  const from = t.from_account?.account_name;
  const to = t.to_account?.account_name;
  if (t.type === 'transfer' && from && to) return `${from} → ${to}`;
  return from || to || '';
}

// Shared by the direct-download export and the email export, so the two can't drift.
function buildTransactionsCsv(transactions) {
  // Account is appended last so spreadsheets that read columns by position keep working.
  const header = ['Date', 'Type', 'Category', 'Description', 'Amount', 'Payment Method', 'Account'];
  const rows = (transactions || []).map((t) => [
    t.transaction_date,
    t.type,
    t.categories?.name || '',
    t.description || '',
    t.amount,
    t.payment_method || '',
    accountLabel(t),
  ]);
  return [header, ...rows].map((row) => row.map(toCsvField).join(',')).join('\r\n');
}

module.exports = { buildTransactionsCsv };
