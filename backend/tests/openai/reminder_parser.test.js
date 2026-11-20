// Paid (a fraction of a cent): services/reminderParser.js against real
// gpt-4o-mini, on Thai and English phrasings, with a fixed "now"
// (Fri 20 Nov 2026 11:41 Bangkok) so dates are checkable.
const { BACKEND } = require('../lib');
const { parseReminderText, looksLikeReminder } = require(`${BACKEND}/services/reminderParser.js`);

let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const NOW = new Date('2026-11-20T04:41:00Z');
const bkk = (d) => (d ? new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 16).replace('T', ' ') : null);

const CASES = [
  ['พรุ่งนี้ 9 โมง เตือนประชุม', (r) => r.isReminder && bkk(r.remindAt) === '2026-11-21 09:00' && r.title.includes('ประชุม') && r.repeat === 'none'],
  ['เตือนจ่ายค่าเน็ตทุกวันที่ 5 ของเดือน', (r) => r.isReminder && r.repeat === 'monthly' && r.title.includes('ค่าเน็ต') && bkk(r.remindAt).startsWith('2026-12-05')],
  ['บ่าย 2 อย่าลืมโทรหาลูกค้า สำคัญมาก', (r) => r.isReminder && bkk(r.remindAt) === '2026-11-20 14:00' && r.importance >= 1],
  ['remind me to take vitamins every day at 8am', (r) => r.isReminder && r.repeat === 'daily' && bkk(r.remindAt) === '2026-11-21 08:00' && /vitamin/i.test(r.title)],
  ['todo ซื้อนม', (r) => r.isReminder && r.remindAt === null && r.title.includes('นม')],
  ['อีก 30 นาที เตือนเอาผ้าออกจากเครื่อง', (r) => r.isReminder && bkk(r.remindAt) === '2026-11-20 12:11'],
];

(async () => {
  assert(!looksLikeReminder('กาแฟ 120') && !looksLikeReminder('coffee 120') && looksLikeReminder('เตือนด้วย'), 'keyword gate keeps expenses out');
  for (const [text, check] of CASES) {
    const r = await parseReminderText(text, NOW);
    assert(check(r), `${text} -> ${JSON.stringify({ ...r, remindAt: bkk(r.remindAt) })}`);
  }
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); console.log('FAIL: crashed'); process.exit(1); });
