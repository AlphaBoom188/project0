// Rich menu postbacks through the real webhook controller, LINE client stubbed
// (random U<hex> user, nothing written except the summary's read).
const { BACKEND } = require('../lib');
const crypto = require('crypto');

const replies = [];
const p = require.resolve(`${BACKEND}/services/lineMessagingClient.js`);
require.cache[p] = { id: p, filename: p, loaded: true, exports: {
  async replyText(token, text) { replies.push({ text }); }, async replyMessages(token, messages) { replies.push(...messages); }, async replyConfirmationCard() {}, async pushText() {}, async pushMessages() {},
  async getImageBuffer() { return Buffer.alloc(0); }, async getGroupMemberName() { return null; }, async getGroupName() { return null; },
} };
const controller = require(`${BACKEND}/controllers/lineWebhookController.js`);

let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const U = `U${crypto.randomBytes(16).toString('hex')}`;
const post = async (data, source = { type: 'user', userId: U }) => {
  replies.length = 0;
  await controller.webhook({ body: { events: [{ type: 'postback', replyToken: 'r', timestamp: Date.now(), mode: 'active', source, postback: { data } }] } }, { status() { return this; }, end() {} });
  return replies.slice();
};

(async () => {
  const scan = await post('menu=scan');
  const types = scan[0] && scan[0].quickReply ? scan[0].quickReply.items.map((i) => i.action.type) : [];
  assert(scan.length === 1 && types.join() === 'camera,cameraRoll', `menu=scan replies with camera and cameraRoll quick replies (got ${JSON.stringify(types)})`);
  const summary = await post('menu=summary');
  assert(summary.length === 1 && summary[0].text.startsWith("This period's summary:"), 'menu=summary reuses the chat summary reply');
  const today = await post('menu=today');
  assert(today.length === 1 && /Nothing on today|Good morning/.test(today[0].text), `menu=today reuses the "today" reply (got ${JSON.stringify(today[0] && today[0].text)})`);
  assert((await post('menu=bogus')).length === 0, 'an unknown menu= value is ignored');
  assert((await post('menu=summary', { type: 'group', groupId: `C${crypto.randomBytes(16).toString('hex')}`, userId: U })).length === 0, 'groups never get menu replies');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
