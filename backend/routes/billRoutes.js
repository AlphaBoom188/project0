const express = require('express');
const router = express.Router();
const { requireUuidParam } = require('../services/uuid');

// Malformed ids get a clean 400 instead of Postgres's uuid-syntax error as a 500.
router.param('bill_id', requireUuidParam('bill'));
router.param('participant_id', requireUuidParam('participant'));
const billController = require('../controllers/billController');

// Public (unauthenticated, bill_id-as-token) routes -- registered before the
// /:line_user_id routes below so "public" isn't swallowed as a line_user_id,
// the same ordering gotcha as the /all transactions route.
router.get('/public/:bill_id', billController.getPublicBill);
router.patch('/public/:bill_id/participants/:participant_id', billController.updatePublicParticipant);

// GET /api/bills/:line_user_id - List bills this user created
router.get('/:line_user_id', billController.getBills);

// POST /api/bills/:line_user_id - Create a shared bill (equal/custom/itemized)
router.post('/:line_user_id', billController.createBill);

// POST /api/bills/:line_user_id/scan-items - OCR a receipt into line items for an itemized split
router.post('/:line_user_id/scan-items', billController.scanReceiptItems);

// GET /api/bills/:line_user_id/:bill_id - Bill detail with participants + items
router.get('/:line_user_id/:bill_id', billController.getBillDetail);

// DELETE /api/bills/:line_user_id/:bill_id - Delete a bill
router.delete('/:line_user_id/:bill_id', billController.deleteBill);

// PATCH /api/bills/:line_user_id/:bill_id/participants/:participant_id - Mark a participant paid/unpaid
router.patch('/:line_user_id/:bill_id/participants/:participant_id', billController.updateParticipant);

module.exports = router;
