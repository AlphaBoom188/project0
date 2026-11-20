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
const c = require('../controllers/taxController');

// GET /api/tax/:line_user_id/:year - Rules for the app, profile, claims, incomes and the computed result
router.get('/:line_user_id/:year', c.get);
// PUT /api/tax/:line_user_id/:year/profile - Marital status, spouse income, 65+/disabled, children
router.put('/:line_user_id/:year/profile', c.updateProfile);
// PUT /api/tax/:line_user_id/:year/claims - Deduction amounts (merged; null removes)
router.put('/:line_user_id/:year/claims', c.updateClaims);
// POST /api/tax/:line_user_id/:year/incomes, PUT|DELETE /incomes/:income_id
router.post('/:line_user_id/:year/incomes', c.addIncome);
router.put('/:line_user_id/:year/incomes/:income_id', c.updateIncome);
router.delete('/:line_user_id/:year/incomes/:income_id', c.deleteIncome);

module.exports = router;
