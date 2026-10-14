const express = require('express');
const router = express.Router();
const ocrController = require('../controllers/ocrController');

// POST /api/ocr/scan/:line_user_id - Scan a receipt image and extract transaction details
router.post('/scan/:line_user_id', ocrController.scanReceipt);

module.exports = router;
