// Thai bank e-slip verification QR (pure, no DB). Bank slips carry a small
// EMV-style TLV QR (ID 2 digits, length 2 digits, value):
//   00 payload (nested): 00 API id "000001", 01 sending bank code (3 digits),
//                        02 transaction reference
//   51 country "TH", 91 CRC-16/CCITT of everything before the CRC value.
// It has no amount and could be faked, so it is only a dedupe key: amounts,
// dates and names come from OCR and the user approves them.
const crypto = require('crypto');
const { crc16 } = require('./promptpay');

function parseTlv(s) {
  const out = {};
  let i = 0;
  while (i < s.length) {
    if (i + 4 > s.length) return null;
    const id = s.slice(i, i + 2);
    const len = Number(s.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(s.slice(i + 2, i + 4))) return null;
    const value = s.slice(i + 4, i + 4 + len);
    if (value.length !== len) return null;
    out[id] = value;
    i += 4 + len;
  }
  return out;
}

// -> { bank: '004', ref: '...' } or null (not a slip QR: PromptPay, a URL, garbage).
function parseSlipQr(text) {
  const s = String(text || '').trim();
  if (!s || s.length > 512 || s.startsWith('000201')) return null; // 000201 = EMV merchant/PromptPay QR
  const top = parseTlv(s);
  if (!top || !top['00']) return null;
  if (top['91']) {
    const crcAt = s.lastIndexOf(`9104${top['91']}`);
    if (crcAt < 0 || crc16(s.slice(0, crcAt + 4)) !== top['91'].toUpperCase()) return null;
  }
  const inner = parseTlv(top['00']);
  if (!inner || inner['00'] !== '000001') return null;
  const bank = inner['01'];
  const ref = inner['02'];
  if (!/^\d{3}$/.test(bank || '') || !/^[A-Za-z0-9]{6,40}$/.test(ref || '')) return null;
  return { bank, ref };
}

// Validates a client-sent { bank, ref } (the phone decodes the QR).
const validQr = (qr) => !!qr && /^\d{3}$/.test(String(qr.bank || '')) && /^[A-Za-z0-9]{6,40}$/.test(String(qr.ref || ''));

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
// slip_hash is UNIQUE across all users, so keys include the user id (the payer
// and the payee may both import the same slip).
//   slipqr:<sha256(user|bank|ref)> when the QR decoded, else slip:<sha256(user|image sha256)>.
function slipKey(lineUserId, { qr, imageSha256 } = {}) {
  if (validQr(qr)) return `slipqr:${sha(`${lineUserId}|${qr.bank}|${qr.ref}`)}`;
  if (/^[0-9a-f]{64}$/.test(String(imageSha256 || ''))) return `slip:${sha(`${lineUserId}|${imageSha256}`)}`;
  return null;
}

const SLIP_KEY = /^slip(qr)?:[0-9a-f]{64}$/;

// Builds a payload (tests and fixtures only).
function buildSlipQr(bank, ref) {
  const f = (id, v) => `${id}${String(v.length).padStart(2, '0')}${v}`;
  const body = f('00', f('00', '000001') + f('01', bank) + f('02', ref)) + f('51', 'TH') + '9104';
  return body + crc16(body);
}

module.exports = { parseSlipQr, validQr, slipKey, SLIP_KEY, buildSlipQr, parseTlv };
