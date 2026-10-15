const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');

// GET /api/transactions/:line_user_id - Get all transactions for a user
router.get('/:line_user_id', transactionController.getTransactions);

// GET /api/transactions/:line_user_id/summary - Get transaction summary by category
router.get('/:line_user_id/summary', transactionController.getTransactionSummary);

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
