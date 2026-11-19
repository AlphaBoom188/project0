const express = require('express');
const router = express.Router();
const voiceController = require('../controllers/voiceController');

// POST /api/voice/:line_user_id/parse - Transcribe + parse a LIFF mic recording into expense fields (writes nothing)
router.post('/:line_user_id/parse', voiceController.parse);

module.exports = router;
