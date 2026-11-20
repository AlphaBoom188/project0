const express = require('express');
const router = express.Router();
const { requireOwnUser } = require('../services/lineAuth');
const { requireUuidParam } = require('../services/uuid');
// Every :line_user_id route requires that user's LINE token (services/lineAuth.js).
router.param('line_user_id', requireOwnUser);
router.param('reminder_id', requireUuidParam('reminder'));
const c = require('../controllers/reminderController');
const { rateLimit } = require('../services/rateLimit');
const TEN_MIN = 10 * 60 * 1000;

// GET /api/reminders/:line_user_id?from&to - Open reminders, recently done ones, and occurrences in the window
router.get('/:line_user_id', c.list);
// POST /api/reminders/:line_user_id - New reminder or to-do
router.post('/:line_user_id', rateLimit('reminder-create', 60, TEN_MIN), c.create); // each reminder becomes a LINE push
// PUT|DELETE /api/reminders/:line_user_id/:reminder_id
router.put('/:line_user_id/:reminder_id', c.update);
router.delete('/:line_user_id/:reminder_id', c.remove);
// POST /api/reminders/:line_user_id/:reminder_id/done|snooze|stop|reopen
router.post('/:line_user_id/:reminder_id/:action', c.act);

module.exports = router;
