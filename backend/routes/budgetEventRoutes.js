const express = require('express');
const router = express.Router();
const budgetEventController = require('../controllers/budgetEventController');

// GET /api/budget-events/:line_user_id?month=YYYY-MM-01 - List event/occasion buckets (+ computed spend)
router.get('/:line_user_id', budgetEventController.getBudgetEvents);

// POST /api/budget-events/:line_user_id - Create a one-off budget bucket for a specific month
router.post('/:line_user_id', budgetEventController.createBudgetEvent);

// PUT /api/budget-events/:line_user_id/:event_id - Update title/amount/period_month
router.put('/:line_user_id/:event_id', budgetEventController.updateBudgetEvent);

// DELETE /api/budget-events/:line_user_id/:event_id - Delete a bucket
router.delete('/:line_user_id/:event_id', budgetEventController.deleteBudgetEvent);

module.exports = router;
