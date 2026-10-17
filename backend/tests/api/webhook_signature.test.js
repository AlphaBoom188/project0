// The LINE webhook must only accept requests signed with the channel secret.
const { BASE } = require('../lib');
const crypto = require('crypto');

const secret = process.env.LINE_MESSAGING_CHANNEL_SECRET;
const body = JSON.stringify({ destination: 'U' + 'a'.repeat(32), events: [] });
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures++; };

const sign = (payload, key) => crypto.createHmac('sha256', key).update(payload).digest('base64');

async function post(signature) {
  const headers = { 'Content-Type': 'application/json' };
  if (signature !== null) headers['x-line-signature'] = signature;
  const res = await fetch(`${BASE}/api/line/webhook`, { method: 'POST', headers, body });
  return res.status;
}

(async () => {
  if (!secret) {
    console.log('FAIL: LINE_MESSAGING_CHANNEL_SECRET is not set in backend/.env');
    process.exit(1);
  }
  const valid = await post(sign(body, secret));
  assert(valid === 200, `correctly signed request accepted (got ${valid})`);
  const wrong = await post(sign(body, 'wrong-secret-entirely'));
  assert(wrong !== 200, `request signed with the wrong secret rejected (got ${wrong})`);
  const missing = await post(null);
  assert(missing !== 200, `request with no signature header rejected (got ${missing})`);
  process.exit(failures ? 1 : 0);
})();
