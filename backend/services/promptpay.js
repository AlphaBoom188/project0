// PromptPay QR payload (Thai QR Payment, EMVCo merchant-presented format).
// Pure: the LIFF app only renders the string as a QR code.
//
// Target: a mobile number (10 digits, 0XXXXXXXXX), a national ID / tax ID
// (13 digits) or an e-wallet ID (15 digits). With an amount the QR is
// "dynamic" (point of initiation 12) so the payer's bank app pre-fills it.

const field = (id, value) => `${id}${String(value.length).padStart(2, '0')}${value}`;

// CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), as the Thai QR spec requires.
function crc16(text) {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i += 1) {
    crc ^= text.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b += 1) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// -> '0812345678' | '1234567890123' | '123456789012345' or null if not a valid id
function normalizePromptPayId(raw) {
  const digits = String(raw || '').replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 10 && digits.startsWith('0')) return digits;
  if (digits.length === 13 || digits.length === 15) return digits;
  return null;
}

function promptPayPayload(id, amount) {
  const target = normalizePromptPayId(id);
  if (!target) throw new Error('Invalid PromptPay ID');
  let account;
  if (target.length === 10) account = field('01', `0066${target.slice(1)}`); // phone -> 0066 + 9 digits
  else if (target.length === 13) account = field('02', target);
  else account = field('03', target);
  const hasAmount = amount != null && Number(amount) > 0;
  const body = [
    field('00', '01'),
    field('01', hasAmount ? '12' : '11'),
    field('29', field('00', 'A000000677010111') + account),
    field('58', 'TH'),
    field('53', '764'),
    hasAmount ? field('54', Number(amount).toFixed(2)) : '',
  ].join('');
  const withCrcTag = `${body}6304`;
  return withCrcTag + crc16(withCrcTag);
}

// For display: 081-234-5678, 1-2345-67890-12-3
function formatPromptPayId(id) {
  const t = normalizePromptPayId(id);
  if (!t) return String(id || '');
  if (t.length === 10) return `${t.slice(0, 3)}-${t.slice(3, 6)}-${t.slice(6)}`;
  if (t.length === 13) return `${t[0]}-${t.slice(1, 5)}-${t.slice(5, 10)}-${t.slice(10, 12)}-${t[12]}`;
  return t;
}

module.exports = { promptPayPayload, normalizePromptPayId, formatPromptPayId, crc16 };
