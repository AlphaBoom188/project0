const supabase = require('../config/supabase');
const { parseStatement, UnsupportedStatementError } = require('../services/statementParser');
const { buildPreview } = require('../services/statementImport');
const { isUuid } = require('../services/uuid');

const MAX_PAGES = 100;
const MAX_ITEMS = 60000;
const MAX_IMPORT_ROWS = 3000;
const INSERT_CHUNK = 200;
const RE_ROW_KEY = /^stmt:[0-9a-f]{64}$/;
const RE_TXN_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+07:00$/;

const statementController = {
  // POST /api/statements/:line_user_id/parse
  // Body: { pages: [[{ x, y, s }, ...], ...] } -- positioned text pieces per
  // page, extracted in the browser by pdf.js (the PDF and its password never
  // reach the server). Returns a preview; writes nothing.
  async parse(req, res) {
    try {
      const { line_user_id } = req.params;
      const { pages } = req.body || {};
      if (!Array.isArray(pages) || pages.length === 0 || !pages.every(Array.isArray)) {
        return res.status(400).json({ error: 'pages must be a non-empty array of page item arrays' });
      }
      const itemCount = pages.reduce((n, p) => n + p.length, 0);
      if (pages.length > MAX_PAGES || itemCount > MAX_ITEMS) {
        return res.status(400).json({ error: `Statement too large (max ${MAX_PAGES} pages)` });
      }

      const { data: user, error: userError } = await supabase.from('users').select('line_user_id').eq('line_user_id', line_user_id).maybeSingle();
      if (userError) throw userError;
      if (!user) return res.status(404).json({ error: 'User not found' });

      let parsed;
      try {
        parsed = parseStatement(pages);
      } catch (error) {
        if (error instanceof UnsupportedStatementError) return res.status(422).json({ error: error.message });
        throw error;
      }
      if (parsed.rows.length === 0) return res.status(422).json({ error: 'No transactions found in this statement.' });

      const preview = await buildPreview(line_user_id, parsed, parsed.summary.holder_name);
      res.json({ success: true, ...preview });
    } catch (error) {
      console.error('Error in statement parse:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // POST /api/statements/:line_user_id/import
  // Body: { account_id?, rows: [{ row_key, transaction_date, description, amount, type, category_id }] }
  // Inserts the kept rows. Re-imports are skipped via the slip_hash UNIQUE
  // constraint. Account balances are NOT adjusted (statement rows are history;
  // the account's balance is already current), and no budget alerts fire.
  async import(req, res) {
    try {
      const { line_user_id } = req.params;
      const { rows, account_id } = req.body || {};
      if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'rows must be a non-empty array' });
      if (rows.length > MAX_IMPORT_ROWS) return res.status(400).json({ error: `At most ${MAX_IMPORT_ROWS} rows per import` });

      if (account_id !== undefined && account_id !== null && account_id !== '') {
        if (!isUuid(account_id)) return res.status(400).json({ error: 'Invalid account id' });
        const { data: account, error } = await supabase.from('accounts').select('id').eq('id', account_id).eq('line_user_id', line_user_id).maybeSingle();
        if (error) throw error;
        if (!account) return res.status(400).json({ error: 'Account not found' });
      }

      const { data: categories, error: catError } = await supabase.from('categories').select('id, type').eq('line_user_id', line_user_id);
      if (catError) throw catError;
      const categoryType = new Map(categories.map((c) => [c.id, c.type]));

      const seen = new Set();
      const inserts = [];
      for (const [i, r] of rows.entries()) {
        const bad = (msg) => res.status(400).json({ error: `Row ${i + 1}: ${msg}` });
        if (!r || typeof r !== 'object') return bad('invalid row');
        if (!RE_ROW_KEY.test(r.row_key || '')) return bad('invalid row_key');
        if (!RE_TXN_DATE.test(r.transaction_date || '') || Number.isNaN(Date.parse(r.transaction_date))) return bad('invalid transaction_date');
        if (r.type !== 'income' && r.type !== 'expense') return bad('type must be income or expense');
        const amount = Number(r.amount);
        if (!Number.isFinite(amount) || amount <= 0 || amount >= 1e10) return bad('amount must be a positive number');
        if (categoryType.get(r.category_id) !== r.type) return bad(`category must be one of your ${r.type} categories`);
        if (seen.has(r.row_key)) continue;
        seen.add(r.row_key);
        const toAccount = account_id || null;
        inserts.push({
          line_user_id,
          category_id: r.category_id,
          amount: Math.round(amount * 100) / 100,
          type: r.type,
          description: String(r.description || '').slice(0, 200) || null,
          slip_hash: r.row_key,
          transaction_date: r.transaction_date,
          payment_method: 'BANK',
          from_account_id: r.type === 'expense' ? toAccount : null,
          to_account_id: r.type === 'income' ? toAccount : null,
        });
      }

      let imported = 0;
      for (let i = 0; i < inserts.length; i += INSERT_CHUNK) {
        const { data, error } = await supabase
          .from('transactions')
          .upsert(inserts.slice(i, i + INSERT_CHUNK), { onConflict: 'slip_hash', ignoreDuplicates: true })
          .select('id');
        if (error) throw error;
        imported += data.length;
      }
      res.json({ success: true, imported, skipped: rows.length - imported });
    } catch (error) {
      console.error('Error in statement import:', error);
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = statementController;
