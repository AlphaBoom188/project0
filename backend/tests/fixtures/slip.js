// Synthetic Thai bank e-slip for the paid slip-read test: an SVG with a
// made-up bank layout, names and account numbers, rendered to JPEG by sharp.
// No real person, account or transfer. (No QR: the QR key has its own pure
// test with synthetic payloads, tests/api/slip_qr.test.js.)
const sharp = require('sharp');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

async function buildSlip({ amount = '1,250.00', date = '20 พ.ย. 69', time = '18:45', fromName = 'นาย ทดสอบ ระบบ', fromAccount = 'xxx-x-x6789-x', toName = 'ร้านตัวอย่าง จำกัด', toAccount = 'xxx-x-x4321-x', bank = 'ธนาคารทดสอบ' } = {}) {
  const lines = [
    [70, 'โอนเงินสำเร็จ', 34, 'bold'],
    [110, `${date} ${time} น.`, 22],
    [190, 'จาก', 20],
    [225, fromName, 26, 'bold'],
    [258, `${bank} ${fromAccount}`, 20],
    [330, 'ไปยัง', 20],
    [365, toName, 26, 'bold'],
    [398, `${bank} ${toAccount}`, 20],
    [470, 'จำนวนเงิน', 20],
    [515, `${amount} บาท`, 36, 'bold'],
    [580, 'ค่าธรรมเนียม 0.00 บาท', 20],
    [630, 'เลขที่รายการ: 2026112018450000TEST', 18],
  ];
  const text = lines.map(([y, t, size, weight]) => `<text x="40" y="${y}" font-family="Thonburi, Tahoma, sans-serif" font-size="${size}" font-weight="${weight || 'normal'}">${esc(t)}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="700"><rect width="100%" height="100%" fill="#fff"/><rect width="100%" height="20" fill="#2a7a4b"/>${text}</svg>`;
  return (await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer()).toString('base64');
}

module.exports = { buildSlip };
