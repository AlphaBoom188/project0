// Slip verification QR (pure): TLV parse, CRC, non-slip QRs, key format.
// Synthetic payloads only (buildSlipQr), never a real slip.
const { BACKEND } = require('../lib');
const { parseSlipQr, validQr, slipKey, SLIP_KEY, buildSlipQr } = require(`${BACKEND}/services/slipQr.js`);
const { promptPayPayload } = require(`${BACKEND}/services/promptpay.js`);

let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };

const good = buildSlipQr('004', '2026112412000000TEST01');
const p = parseSlipQr(good);
assert(p && p.bank === '004' && p.ref === '2026112412000000TEST01', 'valid payload: bank and reference');
assert(parseSlipQr(` ${good}\n`) !== null, 'surrounding whitespace ignored');
assert(parseSlipQr(good.slice(0, -4) + '0000') === null, 'bad CRC rejected');
const noCrc = good.slice(0, good.indexOf('5102'));
assert(parseSlipQr(noCrc + '5102TH') !== null, 'payload without a CRC tag still parses');

const f = (id, v) => `${id}${String(v.length).padStart(2, '0')}${v}`;
assert(parseSlipQr(f('00', f('00', '000001') + f('01', '004')) + f('51', 'TH')) === null, 'missing reference -> null');
assert(parseSlipQr(f('00', f('00', '999999') + f('01', '004') + f('02', 'ABCDEF123')) + f('51', 'TH')) === null, 'wrong API id -> null');
assert(parseSlipQr(f('00', f('00', '000001') + f('01', '4') + f('02', 'ABCDEF123'))) === null, 'bank code must be 3 digits');
assert(parseSlipQr(promptPayPayload('0812345678', 100)) === null, 'a PromptPay QR is not a slip');
for (const junk of ['', 'hello', 'https://example.com/x', '0099', '00', 'x'.repeat(600), null]) assert(parseSlipQr(junk) === null, `garbage -> null (${String(junk).slice(0, 12)})`);

assert(validQr({ bank: '014', ref: 'ABC123XYZ' }) && !validQr({ bank: '14', ref: 'ABC123XYZ' }) && !validQr({ bank: '014', ref: 'a b' }) && !validQr(null), 'client QR validation');
const k1 = slipKey('test_a', { qr: p });
const k2 = slipKey('test_b', { qr: p });
assert(SLIP_KEY.test(k1) && k1.startsWith('slipqr:') && k1 !== k2, 'QR key is per user (slip_hash is unique across users)');
assert(slipKey('test_a', { qr: { bank: '004', ref: p.ref } }) === k1, 'same slip, same key (re-saved or screenshotted)');
const h = 'a'.repeat(64);
const k3 = slipKey('test_a', { imageSha256: h });
assert(k3.startsWith('slip:') && SLIP_KEY.test(k3), 'image-hash fallback key');
assert(slipKey('test_a', { qr: { bank: 'x' }, imageSha256: h }) === k3, 'invalid QR falls back to the image hash');
assert(slipKey('test_a', {}) === null && slipKey('test_a', { imageSha256: 'zz' }) === null, 'nothing usable -> null');
assert(!SLIP_KEY.test('stmt:' + h) && !SLIP_KEY.test('slip:' + h.slice(1)) && !SLIP_KEY.test(h), 'key regex');

process.exit(failures ? 1 : 0);
