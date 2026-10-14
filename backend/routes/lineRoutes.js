const express = require('express');
const router = express.Router();
const lineController = require('../controllers/lineController');

// GET /api/line/login-url - Generate LINE Login URL
router.get('/login-url', lineController.getLoginUrl);

// GET /api/line/callback - Handle LINE Login callback
router.get('/callback', lineController.handleCallback);

// POST /api/line/verify - Verify LINE access token
router.post('/verify', lineController.verifyToken);

// POST /api/line/logout - Logout (revoke token)
router.post('/logout', lineController.logout);

module.exports = router;
