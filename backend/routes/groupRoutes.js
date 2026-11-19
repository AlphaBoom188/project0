const express = require('express');
const router = express.Router();
const { requireOwnUser } = require('../services/lineAuth');
const { requireUuidParam } = require('../services/uuid');
const { rateLimit } = require('../services/rateLimit');
// Every :line_user_id route requires that user's LINE token (services/lineAuth.js).
router.param('line_user_id', requireOwnUser);
router.param('bill_id', requireUuidParam('bill'));
const groupController = require('../controllers/groupController');

// LINE group/room ids: "C" or "R" + 32 hex. Anything else gets a clean 400.
router.param('group_id', (req, res, next, value) => {
  if (!/^[CR][0-9a-f]{32}$/.test(value)) return res.status(400).json({ error: 'Invalid group id' });
  next();
});
// LINE user ids ("U" + 32 hex; test_ ids in the test suites).
router.param('member_id', (req, res, next, value) => {
  if (!/^(U[0-9a-f]{32}|test_[\w-]{1,60})$/.test(value)) return res.status(400).json({ error: 'Invalid member id' });
  next();
});

// GET /api/groups/:line_user_id - The user's LINE groups with open-bill totals
router.get('/:line_user_id', groupController.listGroups);

// Literal "bills" paths before the /:group_id wildcard.
// GET /api/groups/:line_user_id/bills/:bill_id - One bill: shares, payment details, slips (owner)
router.get('/:line_user_id/bills/:bill_id', groupController.getBill);
// POST /api/groups/:line_user_id/bills/:bill_id/slip - Member sends a transfer slip
router.post('/:line_user_id/bills/:bill_id/slip', rateLimit('slip', 30, 10 * 60 * 1000), groupController.uploadSlip);
// POST /api/groups/:line_user_id/bills/:bill_id/shares/:member_id/confirm|reject - Owner checks a payment
router.post('/:line_user_id/bills/:bill_id/shares/:member_id/confirm', groupController.confirmShare);
router.post('/:line_user_id/bills/:bill_id/shares/:member_id/reject', groupController.rejectSlip);
// POST /api/groups/:line_user_id/bills/:bill_id/cancel - Owner cancels the collection
router.post('/:line_user_id/bills/:bill_id/cancel', groupController.cancelBill);

// GET /api/groups/:line_user_id/:group_id - One group: open and recent bills
router.get('/:line_user_id/:group_id', groupController.getGroup);

module.exports = router;
