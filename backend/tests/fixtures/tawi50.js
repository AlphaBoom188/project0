// Synthetic 50 ทวิ (withholding tax certificate) image for the paid OCR
// test: an SVG with the form's key Thai labels and made-up figures,
// rendered to JPEG by sharp. No real person or company.
const sharp = require('sharp');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

async function build50Tawi({ payer = 'บริษัท ตัวอย่าง จำกัด', employee = 'นาย ทดสอบ ระบบ', amount = '600,000.00', withheld = '18,500.00', sso = '9,000.00', pvd = '30,000.00', year = '2568' } = {}) {
  const lines = [
    [40, 'หนังสือรับรองการหักภาษี ณ ที่จ่าย', 30, 'bold'],
    [80, 'ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร', 22],
    [140, `ผู้มีหน้าที่หักภาษี ณ ที่จ่าย: ${payer}`, 22],
    [175, 'เลขประจำตัวผู้เสียภาษีอากร 0105500000000', 20],
    [230, `ผู้ถูกหักภาษี ณ ที่จ่าย: ${employee}`, 22],
    [290, 'ประเภทเงินได้พึงประเมินที่จ่าย          ปีภาษีที่จ่าย     จำนวนเงินที่จ่าย     ภาษีที่หักและนำส่งไว้', 18, 'bold'],
    [330, `1. เงินเดือน ค่าจ้าง ฯลฯ ตามมาตรา 40 (1)     ${year}        ${amount}        ${withheld}`, 18],
    [370, '2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)     -        -        -', 18],
    [420, `รวมเงินที่จ่ายและภาษีที่หักนำส่ง                         ${amount}        ${withheld}`, 20, 'bold'],
    [480, `เงินที่จ่ายเข้า กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน -   กองทุนประกันสังคม ${sso} บาท   กองทุนสำรองเลี้ยงชีพ ${pvd} บาท`, 16],
    [540, 'ผู้จ่ายเงิน  (1) หัก ณ ที่จ่าย', 18],
    [600, `วันที่ 28 กุมภาพันธ์ ${Number(year) + 1}`, 18],
  ];
  const text = lines.map(([y, t, size, weight]) => `<text x="40" y="${y}" font-family="Thonburi, Tahoma, sans-serif" font-size="${size}" font-weight="${weight || 'normal'}">${esc(t)}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="660"><rect width="100%" height="100%" fill="#fff"/><rect x="20" y="10" width="1160" height="640" fill="none" stroke="#000"/>${text}</svg>`;
  const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
  return jpeg.toString('base64');
}

module.exports = { build50Tawi };
