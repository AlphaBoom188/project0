const express = require('express');
const router = express.Router();
const { requireOwnUser } = require('../services/lineAuth');
// Every :line_user_id route requires that user's LINE token (services/lineAuth.js).
router.param('line_user_id', requireOwnUser);
const c = require('../controllers/insightsController');

// GET /api/reports/:line_user_id/monthly?offset=-1 - One billing cycle's report (-1 = the last complete one)
router.get('/:line_user_id/monthly', c.monthlyReport);

module.exports = router;
