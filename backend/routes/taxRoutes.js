const express = require('express');
const router = express.Router();
const { requireOwnUser } = require('../services/lineAuth');
const { requireUuidParam } = require('../services/uuid');
const { YEARS } = require('../services/tax/rules');
// Every :line_user_id route requires that user's LINE token (services/lineAuth.js).
router.param('line_user_id', requireOwnUser);
router.param('income_id', requireUuidParam('income'));
router.param('document_id', requireUuidParam('document'));
const { rateLimit, LIMITS } = require('../services/rateLimit');
router.param('year', (req, res, next, value) => {
  if (!YEARS.includes(Number(value))) return res.status(404).json({ error: `No tax rules for ${value}. Available: ${YEARS.join(', ')}` });
  next();
});
router.param('suggestion_id', (req, res, next, value) => {
  if (!/^[0-9a-f]{12}$/.test(value)) return res.status(400).json({ error: 'Invalid suggestion id' });
  next();
});
const c = require('../controllers/taxController');

// GET /api/tax/:line_user_id/:year - Rules for the app, profile, claims, incomes and the computed result
router.get('/:line_user_id/:year', c.get);
// GET /api/tax/:line_user_id/:year/suggestions - From transactions and the portfolio
router.get('/:line_user_id/:year/suggestions', rateLimit('tax-suggestions', 30, 10 * 60 * 1000), c.suggestions); // reads Yahoo dividends
// POST /api/tax/:line_user_id/:year/suggestions/:suggestion_id/accept|dismiss|restore
router.post('/:line_user_id/:year/suggestions/:suggestion_id/:action', c.suggestionAction);
// POST|DELETE /api/tax/:line_user_id/:year/reminders - LINE reminders for filing (and buying funds by 31 Dec)
router.post('/:line_user_id/:year/reminders', c.setReminders);
router.delete('/:line_user_id/:year/reminders', c.clearReminders);
// Documents: POST /documents (attach a photo), POST /documents/scan-50tawi (read a 50 ทวิ; OCR budget),
// PUT|DELETE /documents/:document_id. Literal paths before the :document_id wildcard.
router.post('/:line_user_id/:year/documents/scan-50tawi', rateLimit('ocr', LIMITS.ocr.max, LIMITS.ocr.windowMs), c.scan50Tawi);
router.post('/:line_user_id/:year/documents', rateLimit('taxdoc', 60, 10 * 60 * 1000), c.uploadDocument);
router.put('/:line_user_id/:year/documents/:document_id', c.updateDocument);
router.delete('/:line_user_id/:year/documents/:document_id', c.deleteDocument);
// PUT /api/tax/:line_user_id/:year/half-year - PND 94: Jan-Jun amounts and the tax paid with it
router.put('/:line_user_id/:year/half-year', c.updateHalfYear);
// POST /api/tax/:line_user_id/:year/export-link -> signed URL; GET .../export (printable page or CSV)
router.post('/:line_user_id/:year/export-link', c.exportLink);
router.get('/:line_user_id/:year/export', c.exportSummary);
// PUT /api/tax/:line_user_id/:year/profile - Marital status, spouse income, 65+/disabled, children
router.put('/:line_user_id/:year/profile', c.updateProfile);
// PUT /api/tax/:line_user_id/:year/claims - Deduction amounts (merged; null removes)
router.put('/:line_user_id/:year/claims', c.updateClaims);
// POST /api/tax/:line_user_id/:year/incomes, PUT|DELETE /incomes/:income_id
router.post('/:line_user_id/:year/incomes', c.addIncome);
router.put('/:line_user_id/:year/incomes/:income_id', c.updateIncome);
router.delete('/:line_user_id/:year/incomes/:income_id', c.deleteIncome);

module.exports = router;
