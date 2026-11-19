const express = require('express');
const router = express.Router();
const { requireOwnUser } = require('../services/lineAuth');
// Every :line_user_id route requires that user's LINE token (services/lineAuth.js).
router.param('line_user_id', requireOwnUser);
const voiceController = require('../controllers/voiceController');

// POST /api/voice/:line_user_id/parse - Transcribe + parse a LIFF mic recording into expense fields (writes nothing)
router.post('/:line_user_id/parse', voiceController.parse);

module.exports = router;
