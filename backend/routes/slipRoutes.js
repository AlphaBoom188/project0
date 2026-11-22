const express = require('express');
const router = express.Router();
const { requireOwnUser } = require('../services/lineAuth');
const { rateLimit, LIMITS } = require('../services/rateLimit');
// Every :line_user_id route requires that user's LINE token (services/lineAuth.js).
router.param('line_user_id', requireOwnUser);
const slipController = require('../controllers/slipController');

// Bulk e-slip import: read one slip (writes nothing), import approved rows, undo them.
router.post('/:line_user_id/read', rateLimit('slipRead', LIMITS.slipRead.max, LIMITS.slipRead.windowMs), slipController.read);
router.post('/:line_user_id/import', rateLimit('slipImport', LIMITS.slipImport.max, LIMITS.slipImport.windowMs), slipController.import);
router.post('/:line_user_id/undo', slipController.undo);

module.exports = router;
