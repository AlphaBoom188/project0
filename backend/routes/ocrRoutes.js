const express = require('express');
const router = express.Router();
const { requireOwnUser } = require('../services/lineAuth');
const { rateLimit, LIMITS } = require('../services/rateLimit');
// Every :line_user_id route requires that user's LINE token (services/lineAuth.js).
router.param('line_user_id', requireOwnUser);
const ocrController = require('../controllers/ocrController');

// POST /api/ocr/scan/:line_user_id - Scan a receipt image and extract transaction details
router.post('/scan/:line_user_id', rateLimit('ocr', LIMITS.ocr.max, LIMITS.ocr.windowMs), ocrController.scanReceipt);

module.exports = router;
