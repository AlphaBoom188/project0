const express = require('express');
const line = require('@line/bot-sdk');
const lineWebhookController = require('../controllers/lineWebhookController');

const router = express.Router();

const middlewareConfig = { channelSecret: process.env.LINE_MESSAGING_CHANNEL_SECRET };

// line.middleware verifies x-line-signature against the raw body and parses it itself,
// so this route must be mounted before express.json() runs on the request.
router.post('/webhook', line.middleware(middlewareConfig), lineWebhookController.webhook);

// Return a clean response instead of leaking a stack trace when signature validation fails.
router.use((err, req, res, next) => {
  if (err instanceof line.SignatureValidationFailed || err instanceof line.JSONParseError) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  next(err);
});

module.exports = router;
