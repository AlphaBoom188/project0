const express = require('express');
const router = express.Router();
const { requireOwnUser } = require('../services/lineAuth');
// Every :line_user_id route requires that user's LINE token (services/lineAuth.js).
router.param('line_user_id', requireOwnUser);
const { requireUuidParam } = require('../services/uuid');

// Every :transaction_id route (GET/PUT/DELETE) gets a clean 400 for a malformed id.
router.param('transaction_id', requireUuidParam('transaction'));

const transactionController = require('../controllers/transactionController');

// GET /api/transactions/:line_user_id - Get all transactions for a user
router.get('/:line_user_id', transactionController.getTransactions);

// GET /api/transactions/:line_user_id/summary - Get transaction summary by category
router.get('/:line_user_id/summary', transactionController.getTransactionSummary);

// POST /api/transactions/:line_user_id/export-link - { query } -> a 2-minute signed query string for
// GET .../export: CSV download is a browser navigation, which can't send the Authorization header.
router.post('/:line_user_id/export-link', (req, res) => {
  const { signExportLink } = require('../services/lineAuth');
  const query = typeof (req.body && req.body.query) === 'string' ? req.body.query : '';
  res.json({ success: true, query: signExportLink(req.params.line_user_id, query) });
});

// POST /api/transactions/:line_user_id/import-csv/preview { csv, mapping? } (writes nothing) and
// POST .../import-csv { csv, mapping?, createCategories? } - transactions from another app's CSV export
const csvImport = require('../controllers/csvImportController');
const { rateLimit, LIMITS } = require('../services/rateLimit');
router.post('/:line_user_id/import-csv/preview', rateLimit('csv', 60, LIMITS.statement.windowMs), csvImport.preview);
router.post('/:line_user_id/import-csv', rateLimit('csv-import', 20, LIMITS.statement.windowMs), csvImport.import);

// GET /api/transactions/:line_user_id/export - Export transactions as CSV (UTF-8 BOM)
router.get('/:line_user_id/export', transactionController.exportTransactions);

// POST /api/transactions/:line_user_id/export/email - Email the same filtered export
router.post('/:line_user_id/export/email', transactionController.exportTransactionsByEmail);

// GET /api/transactions/:line_user_id/:transaction_id - Get a single transaction
router.get('/:line_user_id/:transaction_id', transactionController.getTransaction);

// POST /api/transactions/:line_user_id - Create a new transaction
router.post('/:line_user_id', transactionController.createTransaction);

// PUT /api/transactions/:line_user_id/:transaction_id - Update a transaction
router.put('/:line_user_id/:transaction_id', transactionController.updateTransaction);

// DELETE /api/transactions/:line_user_id/all - Delete ALL transactions for a user
// (must be registered before the :transaction_id route below, or "all" would be
// matched as a transaction_id instead)
router.delete('/:line_user_id/all', transactionController.deleteAllTransactions);

// DELETE /api/transactions/:line_user_id/:transaction_id - Delete a transaction
router.delete('/:line_user_id/:transaction_id', transactionController.deleteTransaction);

module.exports = router;
