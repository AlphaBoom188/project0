const express = require('express');
const router = express.Router();
const { requireOwnUser } = require('../services/lineAuth');
// Every :line_user_id route requires that user's LINE token (services/lineAuth.js).
router.param('line_user_id', requireOwnUser);
const { requireUuidParam } = require('../services/uuid');

// Malformed ids get a clean 400 instead of Postgres's uuid-syntax error as a 500.
router.param('recurring_id', requireUuidParam('recurring rule'));
const recurringController = require('../controllers/recurringController');

// GET /api/recurring/:line_user_id - List a user's recurring rules
router.get('/:line_user_id', recurringController.getRecurring);

// POST /api/recurring/:line_user_id - Create a recurring rule
router.post('/:line_user_id', recurringController.createRecurring);

// Repeat payments found in transactions (literal paths before /:recurring_id).
// GET /api/recurring/:line_user_id/suggestions; POST .../suggestions/:key/accept { mode: 'log'|'remind' } | dismiss
const insights = require('../controllers/insightsController');
router.param('key', (req, res, next, value) => (/^[0-9a-f]{12}$/.test(value) ? next() : res.status(400).json({ error: 'Invalid suggestion id' })));
router.get('/:line_user_id/suggestions', insights.recurringSuggestions);
// GET /api/recurring/:line_user_id/overview - subscriptions and bills totals, price rises
router.get('/:line_user_id/overview', insights.subscriptionsOverview);
router.post('/:line_user_id/suggestions/:key/:action', insights.recurringSuggestionAction);

// PUT /api/recurring/:line_user_id/:recurring_id - Update (or pause/resume via is_active)
router.put('/:line_user_id/:recurring_id', recurringController.updateRecurring);

// PATCH /api/recurring/:line_user_id/:recurring_id/paid - { paid: true|false } for the rule's current pay period
router.patch('/:line_user_id/:recurring_id/paid', recurringController.setPaid);

// DELETE /api/recurring/:line_user_id/:recurring_id - Delete a recurring rule
router.delete('/:line_user_id/:recurring_id', recurringController.deleteRecurring);

module.exports = router;
