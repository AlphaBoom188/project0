const express = require('express');
const router = express.Router();
const { requireOwnUser, requireBodyUser } = require('../services/lineAuth');
// Every :line_user_id route requires that user's LINE token (services/lineAuth.js).
router.param('line_user_id', requireOwnUser);
const userController = require('../controllers/userController');

// POST /api/users - Create or update user after LINE Login
router.post('/', requireBodyUser, userController.createOrUpdateUser); // body.line_user_id must match the token

// GET /api/users/:line_user_id - Get user profile
router.get('/:line_user_id', userController.getUser);

// PUT /api/users/:line_user_id/billing-cycle - Update billing cycle
router.put('/:line_user_id/billing-cycle', userController.updateBillingCycle);

// PATCH /api/users/:line_user_id/preferences - Update notification/thumbnail preferences
router.patch('/:line_user_id/preferences', userController.updatePreferences);

// PUT /api/users/:line_user_id/emergency-fund - Set goal_amount and/or account_id
router.put('/:line_user_id/emergency-fund', userController.updateEmergencyFund);

// PUT /api/users/:line_user_id/payment-details - PromptPay ID / bank account for group bills
router.put('/:line_user_id/payment-details', userController.updatePaymentDetails);

// DELETE /api/users/:line_user_id - Delete user account
router.delete('/:line_user_id', userController.deleteUser);

module.exports = router;
