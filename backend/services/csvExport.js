function toCsvField(value) {
  const str = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// Shared by the direct-download export and the email export, so the two can't drift.
function buildTransactionsCsv(transactions) {
  const header = ['Date', 'Type', 'Category', 'Description', 'Amount', 'Payment Method'];
  const rows = (transactions || []).map((t) => [
    t.transaction_date,
    t.type,
    t.categories?.name || '',
    t.description || '',
    t.amount,
    t.payment_method || '',
  ]);
  return [header, ...rows].map((row) => row.map(toCsvField).join(',')).join('\r\n');
}

module.exports = { buildTransactionsCsv };
