const express = require('express');
const router = express.Router();
const { requireOwnUser } = require('../services/lineAuth');
// Every :line_user_id route requires that user's LINE token (services/lineAuth.js).
router.param('line_user_id', requireOwnUser);
const c = require('../controllers/calendarController');
const { rateLimit } = require('../services/rateLimit');

// GET /api/calendar/:line_user_id/status - Connected? Which Google account?
router.get('/:line_user_id/status', c.status);
// GET /api/calendar/:line_user_id/login-url - Consent URL (calendar.events.readonly); callback is /api/google/callback
router.get('/:line_user_id/login-url', c.loginUrl);
// GET /api/calendar/:line_user_id/events?from&to - Primary-calendar events (never stored)
router.get('/:line_user_id/events', rateLimit('calendar-events', 60, 10 * 60 * 1000), c.events); // calls Google each time
// DELETE /api/calendar/:line_user_id - Revoke and forget the token
router.delete('/:line_user_id', c.disconnect);

module.exports = router;
