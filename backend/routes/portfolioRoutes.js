const express = require('express');
const router = express.Router();
const { requireUuidParam } = require('../services/uuid');

// Malformed ids get a clean 400 instead of Postgres's uuid-syntax error as a 500.
router.param('holding_id', requireUuidParam('holding'));
router.param('lot_id', requireUuidParam('lot'));
const portfolioController = require('../controllers/portfolioController');

// GET /api/portfolio/:line_user_id - Holdings + totals + allocation + emergency fund status
router.get('/:line_user_id', portfolioController.getPortfolio);

// POST /api/portfolio/:line_user_id - Add a holding (plus its opening buy lot)
router.post('/:line_user_id', portfolioController.createHolding);

// Literal "lots" routes go before the /:line_user_id/:holding_id ones, same
// ordering habit as /all in transactionRoutes.js and /public in billRoutes.js.
// GET /api/portfolio/:line_user_id/lots - Every lot, newest first (Transactions tab "Investments")
router.get('/:line_user_id/lots', portfolioController.listAllLots);

// PUT /api/portfolio/:line_user_id/lots/:lot_id - Edit a lot (re-validates the whole history)
router.put('/:line_user_id/lots/:lot_id', portfolioController.updateLot);

// DELETE /api/portfolio/:line_user_id/lots/:lot_id - Delete a lot (re-validates the whole history)
router.delete('/:line_user_id/lots/:lot_id', portfolioController.deleteLot);

// POST /api/portfolio/:line_user_id/refresh-all - Refresh every live-priced holding.
// No ordering gotcha here (unlike /public in billRoutes.js or /all in transactionRoutes.js):
// every other route sharing this depth uses PUT/DELETE, not POST, so there's no collision
// to avoid regardless of registration order -- kept here anyway for readability.
router.post('/:line_user_id/refresh-all', portfolioController.refreshAllPrices);

// PUT /api/portfolio/:line_user_id/:holding_id - Update a holding
router.put('/:line_user_id/:holding_id', portfolioController.updateHolding);

// DELETE /api/portfolio/:line_user_id/:holding_id - Remove a holding
router.delete('/:line_user_id/:holding_id', portfolioController.deleteHolding);

// GET /api/portfolio/:line_user_id/:holding_id/lots - One holding's lots with open/closed state
router.get('/:line_user_id/:holding_id/lots', portfolioController.listHoldingLots);

// POST /api/portfolio/:line_user_id/:holding_id/lots - Add a buy/sell lot
router.post('/:line_user_id/:holding_id/lots', portfolioController.createLot);

// POST /api/portfolio/:line_user_id/:holding_id/refresh-price - Refresh one holding's live price
router.post('/:line_user_id/:holding_id/refresh-price', portfolioController.refreshHoldingPrice);

module.exports = router;
