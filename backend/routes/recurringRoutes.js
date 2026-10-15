const express = require('express');
const router = express.Router();
const recurringController = require('../controllers/recurringController');

// GET /api/recurring/:line_user_id - List a user's recurring rules
router.get('/:line_user_id', recurringController.getRecurring);

// POST /api/recurring/:line_user_id - Create a recurring rule
router.post('/:line_user_id', recurringController.createRecurring);

// PUT /api/recurring/:line_user_id/:recurring_id - Update (or pause/resume via is_active)
router.put('/:line_user_id/:recurring_id', recurringController.updateRecurring);

// DELETE /api/recurring/:line_user_id/:recurring_id - Delete a recurring rule
router.delete('/:line_user_id/:recurring_id', recurringController.deleteRecurring);

module.exports = router;
