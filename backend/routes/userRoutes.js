const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// POST /api/users - Create or update user after LINE Login
router.post('/', userController.createOrUpdateUser);

// GET /api/users/:line_user_id - Get user profile
router.get('/:line_user_id', userController.getUser);

// PUT /api/users/:line_user_id/billing-cycle - Update billing cycle
router.put('/:line_user_id/billing-cycle', userController.updateBillingCycle);

// DELETE /api/users/:line_user_id - Delete user account
router.delete('/:line_user_id', userController.deleteUser);

module.exports = router;
