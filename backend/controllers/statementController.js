const supabase = require('../config/supabase');
const { parseStatement, UnsupportedStatementError } = require('../services/statementParser');
const { buildPreview } = require('../services/statementImport');
const { isUuid } = require('../services/uuid');
const crypto = require('crypto');
const { BANK_LABEL, sideLabel, describeTransfer, parseTransfer, fetchTransferPool, matchTransfer, mergeTransfer, revertSide, isSideLabel } = require('../services/statementTransfers');

const MAX_PAGES = 100;
const MAX_ITEMS = 60000;
const MAX_IMPORT_ROWS = 3000;
const INSERT_CHUNK = 200;
const RE_ROW_KEY = /^stmt:[0-9a-f]{64}$/;
const RE_TXN_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+07:00$/;
const MAX_UNDO_IDS = 5000;
const ID_CHUNK = 150;

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

      // Real statement text runs are short; capping them keeps every regex in
      // the parser linear-ish even for a hostile request.
      const MAX_PIECE = 500;
      const safePages = pages.map((items) => items.map((it) => (it && typeof it === 'object' ? { ...it, s: String(it.s == null ? '' : it.s).slice(0, MAX_PIECE) } : it)));
      let parsed;
      try {
        parsed = parseStatement(safePages);
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
  // Body: { account_id?, statement: { bank, account_last4 },
  //         rows: [{ row_key, transaction_date, description, amount, type, category_id, direction? }] }
  // type 'income'/'expense' rows are inserted with their category. type
  // 'transfer' rows (direction 'out' | 'in') become Transfer entries: merged
  // into the other side of the same move if another statement already
  // recorded it, skipped if this statement's side is already recorded, else
  // inserted (statementTransfers.js). Re-imports are skipped via the
  // slip_hash UNIQUE constraint. Account balances are NOT adjusted (statement
  // rows are history; the account's balance is already current), and no
  // budget alerts fire.
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

      const { statement } = req.body;
      const hasTransfers = rows.some((r) => r && r.type === 'transfer');
      if (hasTransfers && !(statement && BANK_LABEL[statement.bank] && /^\d{4}$/.test(String(statement.account_last4 || '')))) {
        return res.status(400).json({ error: 'statement { bank, account_last4 } is required to import transfers' });
      }

      const seen = new Set();
      const inserts = [];
      const transfers = [];
      for (const [i, r] of rows.entries()) {
        const bad = (msg) => res.status(400).json({ error: `Row ${i + 1}: ${msg}` });
        if (!r || typeof r !== 'object') return bad('invalid row');
        if (!RE_ROW_KEY.test(r.row_key || '')) return bad('invalid row_key');
        if (!RE_TXN_DATE.test(r.transaction_date || '') || Number.isNaN(Date.parse(r.transaction_date))) return bad('invalid transaction_date');
        if (!['income', 'expense', 'transfer'].includes(r.type)) return bad('type must be income, expense or transfer');
        const amount = Number(r.amount);
        if (!Number.isFinite(amount) || amount <= 0 || amount >= 1e10) return bad('amount must be a positive number');
        if (r.type === 'transfer') {
          if (r.direction !== 'out' && r.direction !== 'in') return bad("direction must be 'out' or 'in' for a transfer");
        } else if (categoryType.get(r.category_id) !== r.type) return bad(`category must be one of your ${r.type} categories`);
        if (seen.has(r.row_key)) continue;
        seen.add(r.row_key);
        if (r.type === 'transfer') {
          transfers.push({ ...r, amount: Math.round(amount * 100) / 100 });
          continue;
        }
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

      // Transfers: merge, skip, or add to the inserts.
      let merged = 0;
      const mergedIds = [];
      if (transfers.length) {
        const myLabel = sideLabel(statement.bank, statement.account_last4);
        const pool = await fetchTransferPool(line_user_id, transfers.map((r) => r.transaction_date.slice(0, 10)));
        for (const r of transfers) {
          const asRow = { date: r.transaction_date.slice(0, 10), amount_cents: Math.round(r.amount * 100), type: r.direction === 'out' ? 'expense' : 'income' };
          const m = matchTransfer(pool, asRow, myLabel);
          if (m && m.kind === 'recorded') continue; // this side is already recorded: counted as skipped
          if (m) {
            mergedIds.push(await mergeTransfer(m.transfer, asRow, myLabel, account_id || null));
            merged += 1;
            continue;
          }
          inserts.push({
            line_user_id,
            category_id: null,
            amount: r.amount,
            type: 'transfer',
            description: r.direction === 'out' ? describeTransfer(myLabel, null) : describeTransfer(null, myLabel),
            slip_hash: r.row_key,
            transaction_date: r.transaction_date,
            payment_method: 'BANK',
            from_account_id: r.direction === 'out' ? account_id || null : null,
            to_account_id: r.direction === 'in' ? account_id || null : null,
          });
        }
      }

      let imported = 0;
      const insertedIds = [];
      for (let i = 0; i < inserts.length; i += INSERT_CHUNK) {
        const { data, error } = await supabase
          .from('transactions')
          .upsert(inserts.slice(i, i + INSERT_CHUNK), { onConflict: 'slip_hash', ignoreDuplicates: true })
          .select('id');
        if (error) throw error;
        imported += data.length;
        insertedIds.push(...data.map((t) => t.id));
      }
      res.json({
        success: true,
        imported: imported + merged,
        merged,
        skipped: rows.length - imported - merged,
        // Everything this import changed, for POST /undo.
        undo: {
          label: statement && BANK_LABEL[statement.bank] ? sideLabel(statement.bank, statement.account_last4) : null,
          inserted_ids: insertedIds,
          merged: mergedIds,
        },
      });
    } catch (error) {
      console.error('Error in statement import:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // POST /api/statements/:line_user_id/undo
  // Body: the `undo` object an import returned: { label, inserted_ids, merged: [{ id, side }] }.
  // Removes what that import added: its rows are deleted, and the transfers it
  // joined lose this statement's side again. Only the user's own
  // statement-imported rows are touched (slip_hash 'stmt:'); anything already
  // gone is skipped. If a later import joined one of this import's own
  // transfers, that transfer is kept with only the other statement's side.
  async undo(req, res) {
    try {
      const { line_user_id } = req.params;
      const { label = null, inserted_ids: insertedIds = [], merged = [] } = req.body || {};
      if (!Array.isArray(insertedIds) || !Array.isArray(merged)) return res.status(400).json({ error: 'inserted_ids and merged must be arrays' });
      if (insertedIds.length + merged.length === 0) return res.status(400).json({ error: 'Nothing to undo' });
      if (insertedIds.length + merged.length > MAX_UNDO_IDS) return res.status(400).json({ error: `At most ${MAX_UNDO_IDS} rows per undo` });
      if (![...insertedIds, ...merged.map((m) => m && m.id)].every(isUuid)) return res.status(400).json({ error: 'Invalid transaction id' });
      if (merged.some((m) => m.side !== 'from' && m.side !== 'to')) return res.status(400).json({ error: "merged side must be 'from' or 'to'" });
      if ((merged.length || label !== null) && !isSideLabel(label)) return res.status(400).json({ error: 'Invalid label' });

      const fetchOwn = async (ids) => {
        const out = [];
        for (let i = 0; i < ids.length; i += ID_CHUNK) {
          const { data, error } = await supabase
            .from('transactions')
            .select('id, type, description, slip_hash')
            .eq('line_user_id', line_user_id)
            .like('slip_hash', 'stmt:%')
            .in('id', ids.slice(i, i + ID_CHUNK));
          if (error) throw error;
          out.push(...data);
        }
        return out;
      };

      let deleted = 0;
      let reverted = 0;
      const toDelete = [];
      for (const t of await fetchOwn(insertedIds)) {
        const sides = t.type === 'transfer' ? parseTransfer(t.description) : null;
        const joinedLater = sides && label && sides.from && sides.to && (sides.from === label || sides.to === label);
        if (!joinedLater) { toDelete.push(t.id); continue; }
        // Keep the other statement's side. The row key is retired so this
        // statement's row shows as new again if it's re-imported.
        const update = revertSide(t, label);
        update.slip_hash = `stmt:${crypto.createHash('sha256').update(`undone|${t.id}`).digest('hex')}`;
        const { error } = await supabase.from('transactions').update(update).eq('id', t.id).eq('line_user_id', line_user_id);
        if (error) throw error;
        reverted += 1;
      }
      for (let i = 0; i < toDelete.length; i += ID_CHUNK) {
        const { data, error } = await supabase.from('transactions').delete().eq('line_user_id', line_user_id).in('id', toDelete.slice(i, i + ID_CHUNK)).select('id');
        if (error) throw error;
        deleted += data.length;
      }
      const mergedRows = new Map((await fetchOwn(merged.map((m) => m.id))).map((t) => [t.id, t]));
      for (const m of merged) {
        const t = mergedRows.get(m.id);
        if (!t || t.type !== 'transfer') continue;
        const { from, to } = parseTransfer(t.description);
        if ((m.side === 'from' ? from : to) !== label) continue; // already reverted or changed since
        const { error } = await supabase.from('transactions').update(revertSide(t, label)).eq('id', t.id).eq('line_user_id', line_user_id);
        if (error) throw error;
        reverted += 1;
      }
      res.json({ success: true, deleted, reverted });
    } catch (error) {
      console.error('Error in statement undo:', error);
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = statementController;
