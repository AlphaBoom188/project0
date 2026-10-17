const express = require('express');
const router = express.Router();
const { requireUuidParam } = require('../services/uuid');

// Malformed ids get a clean 400 instead of Postgres's uuid-syntax error as a 500.
router.param('account_id', requireUuidParam('account'));
const accountController = require('../controllers/accountController');

// GET /api/accounts/:line_user_id - List a user's accounts
router.get('/:line_user_id', accountController.getAccounts);

// POST /api/accounts/:line_user_id - Create an account
router.post('/:line_user_id', accountController.createAccount);

// PUT /api/accounts/:line_user_id/:account_id - Update an account
router.put('/:line_user_id/:account_id', accountController.updateAccount);

// DELETE /api/accounts/:line_user_id/:account_id - Delete an account (blocked if it has transactions)
router.delete('/:line_user_id/:account_id', accountController.deleteAccount);

module.exports = router;
