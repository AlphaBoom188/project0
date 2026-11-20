const express = require('express');
const router = express.Router();
const { requireOwnUser } = require('../services/lineAuth');
const { requireUuidParam } = require('../services/uuid');
const { YEARS } = require('../services/tax/rules');
// Every :line_user_id route requires that user's LINE token (services/lineAuth.js).
router.param('line_user_id', requireOwnUser);
router.param('income_id', requireUuidParam('income'));
router.param('year', (req, res, next, value) => {
  if (!YEARS.includes(Number(value))) return res.status(404).json({ error: `No tax rules for ${value}. Available: ${YEARS.join(', ')}` });
  next();
});
router.param('suggestion_id', (req, res, next, value) => {
  if (!/^[0-9a-f]{12}$/.test(value)) return res.status(400).json({ error: 'Invalid suggestion id' });
  next();
});
const c = require('../controllers/taxController');

// GET /api/tax/:line_user_id/:year - Rules for the app, profile, claims, incomes and the computed result
router.get('/:line_user_id/:year', c.get);
// GET /api/tax/:line_user_id/:year/suggestions - From transactions and the portfolio
router.get('/:line_user_id/:year/suggestions', c.suggestions);
// POST /api/tax/:line_user_id/:year/suggestions/:suggestion_id/accept|dismiss|restore
router.post('/:line_user_id/:year/suggestions/:suggestion_id/:action', c.suggestionAction);
// POST|DELETE /api/tax/:line_user_id/:year/reminders - LINE reminders for filing (and buying funds by 31 Dec)
router.post('/:line_user_id/:year/reminders', c.setReminders);
router.delete('/:line_user_id/:year/reminders', c.clearReminders);
// PUT /api/tax/:line_user_id/:year/profile - Marital status, spouse income, 65+/disabled, children
router.put('/:line_user_id/:year/profile', c.updateProfile);
// PUT /api/tax/:line_user_id/:year/claims - Deduction amounts (merged; null removes)
router.put('/:line_user_id/:year/claims', c.updateClaims);
// POST /api/tax/:line_user_id/:year/incomes, PUT|DELETE /incomes/:income_id
router.post('/:line_user_id/:year/incomes', c.addIncome);
router.put('/:line_user_id/:year/incomes/:income_id', c.updateIncome);
router.delete('/:line_user_id/:year/incomes/:income_id', c.deleteIncome);

module.exports = router;
