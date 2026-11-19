const express = require('express');
const router = express.Router();
const { requireOwnUser } = require('../services/lineAuth');
// Every :line_user_id route requires that user's LINE token (services/lineAuth.js).
router.param('line_user_id', requireOwnUser);
const groupController = require('../controllers/groupController');

// LINE group/room ids: "C" or "R" + 32 hex. Anything else gets a clean 400.
router.param('group_id', (req, res, next, value) => {
  if (!/^[CR][0-9a-f]{32}$/.test(value)) return res.status(400).json({ error: 'Invalid group id' });
  next();
});

// GET /api/groups/:line_user_id - The user's LINE groups with their balance in each (read-only)
router.get('/:line_user_id', groupController.listGroups);

// GET /api/groups/:line_user_id/:group_id - One group: balances, who pays whom, recent entries
router.get('/:line_user_id/:group_id', groupController.getGroup);

module.exports = router;
