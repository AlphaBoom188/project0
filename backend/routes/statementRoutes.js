const express = require('express');
const router = express.Router();
const statementController = require('../controllers/statementController');

// POST /api/statements/:line_user_id/parse - Preview a bank statement (pdf.js text pieces from the LIFF app); writes nothing
router.post('/:line_user_id/parse', statementController.parse);

// POST /api/statements/:line_user_id/import - Import the rows the user kept (re-imports skipped via slip_hash)
router.post('/:line_user_id/import', statementController.import);

// POST /api/statements/:line_user_id/undo - Reverse one import (the `undo` object its response returned)
router.post('/:line_user_id/undo', statementController.undo);

module.exports = router;
