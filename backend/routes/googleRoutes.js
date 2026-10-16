const express = require('express');
const router = express.Router();
const googleController = require('../controllers/googleController');

// GET /api/google/login-url/:line_user_id - Build the consent URL (open via liff.openWindow with external: true)
router.get('/login-url/:line_user_id', googleController.getLoginUrl);

// GET /api/google/callback?code=...&state=<line_user_id> - OAuth redirect target, runs in the system browser
router.get('/callback', googleController.handleCallback);

module.exports = router;
