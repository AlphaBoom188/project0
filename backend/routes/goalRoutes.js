const express = require('express');
const router = express.Router();
const { requireOwnUser } = require('../services/lineAuth');
const { requireUuidParam } = require('../services/uuid');
// Every :line_user_id route requires that user's LINE token (services/lineAuth.js).
router.param('line_user_id', requireOwnUser);
router.param('goal_id', requireUuidParam('goal'));
const c = require('../controllers/goalsController');

// GET|POST /api/goals/:line_user_id - Savings goals with progress
router.get('/:line_user_id', c.list);
router.post('/:line_user_id', c.create);
// PUT|DELETE /api/goals/:line_user_id/:goal_id; POST .../add { amount }
router.put('/:line_user_id/:goal_id', c.update);
router.delete('/:line_user_id/:goal_id', c.remove);
router.post('/:line_user_id/:goal_id/add', c.addMoney);

module.exports = router;
