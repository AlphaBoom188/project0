// Rich menu postbacks (backend/config/richmenu.js): `menu=scan|summary|today`.
// 1:1 chats only (groups never show a rich menu, and lineWebhookController
// sends group events elsewhere first). Replies use the reply token, so they
// cost no OA push quota. They share the bot free-text rate limit.
const { replyText, replyMessages } = require('../services/lineMessagingClient');
const { allow, LIMITS } = require('../services/rateLimit');

const MENU_POSTBACKS = ['scan', 'summary', 'today'];
const RATE_LIMITED_REPLY = "You're sending a lot right now. Please wait a few minutes and try again.";

// A rich menu can't open the camera itself: this reply's quick replies can.
// The photo then goes through the normal receipt flow (Confirm card, slip_hash, OCR limit).
const SCAN_MESSAGE = {
  type: 'text',
  text: 'Send a photo of your receipt or slip.',
  quickReply: {
    items: [
      { type: 'action', action: { type: 'camera', label: 'Camera' } },
      { type: 'action', action: { type: 'cameraRoll', label: 'Photos' } },
    ],
  },
};

// -> true when handled. `summary(event, lineUserId)` is the chat "summary" reply.
async function handleMenuPostback(event, menu, { summary }) {
  if (!MENU_POSTBACKS.includes(menu)) return false;
  const lineUserId = event.source && event.source.userId;
  if (!lineUserId) return true;
  if (!allow('text', lineUserId, LIMITS.text.max, LIMITS.text.windowMs)) {
    await replyText(event.replyToken, RATE_LIMITED_REPLY);
    return true;
  }
  if (menu === 'scan') await replyMessages(event.replyToken, [SCAN_MESSAGE]);
  else if (menu === 'summary') await summary(event, lineUserId);
  else await require('./lineReminderHandler').handlePersonalText(event, lineUserId, 'today'); // same as typing "today"
  return true;
}

module.exports = { handleMenuPostback, MENU_POSTBACKS, SCAN_MESSAGE };
