const express = require('express');
const router = express.Router();
const { requireOwnUser } = require('../services/lineAuth');
const { requireUuidParam } = require('../services/uuid');
// Every :line_user_id route requires that user's LINE token (services/lineAuth.js).
router.param('line_user_id', requireOwnUser);
router.param('note_id', requireUuidParam('note'));
const c = require('../controllers/reminderController');

// GET /api/notes/:line_user_id?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/:line_user_id', c.listNotes);
// POST /api/notes/:line_user_id { body, note_date?, pinned? }
router.post('/:line_user_id', c.createNote);
// PUT|DELETE /api/notes/:line_user_id/:note_id
router.put('/:line_user_id/:note_id', c.updateNote);
router.delete('/:line_user_id/:note_id', c.deleteNote);

module.exports = router;
