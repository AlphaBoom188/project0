// Free text ("พรุ่งนี้ 9 โมง เตือนประชุม", "remind me to pay rent every month
// on the 1st") -> a candidate reminder, with gpt-4o-mini. The model only
// extracts fields; reminderMath turns date + time into an instant (Bangkok).
const OpenAI = require('openai');
const { getBangkokYmd } = require('./bangkokDay');
const m = require('./reminderMath');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 20000 });
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Messages that look like a reminder or to-do. Anything else goes to the
// expense parser as before ("กาแฟ 120" must never become a reminder).
const REMINDER_HINT = /(เตือน|อย่าลืม|นัด|ต้องทำ|remind|reminder|don'?t forget|to-?do\b|todo\b)/i;
const looksLikeReminder = (text) => REMINDER_HINT.test(text);

function buildPrompt(text, now) {
  const ymd = getBangkokYmd(now);
  const weekday = WEEKDAYS[new Date(`${ymd}T00:00:00Z`).getUTCDay()];
  const hm = new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(11, 16);
  return `You turn chat messages into reminders for a Thai personal assistant. Now is ${weekday} ${ymd} ${hm} (Asia/Bangkok).
Message: "${text}"
Return ONLY a JSON object:
"is_reminder" (boolean: true if the person wants to be reminded of something or wants a to-do item),
"title" (string: what to remind about, short, without the time words, or null. Use the SAME language as the message: an English message gets an English title, a Thai message a Thai title. Never translate),
"date" ("YYYY-MM-DD" or null: resolve words like today/พรุ่งนี้/มะรืน/วันจันทร์หน้า/next Friday from now. For a repeating reminder, the date of its FIRST occurrence: "every 5th"/"ทุกวันที่ 5" = the next 5th of a month, "every Monday" = the next Monday),
"time" ("HH:MM" 24-hour or null: 9 โมง/9 โมงเช้า=09:00, เที่ยง=12:00, บ่าย 2=14:00, 4 โมงเย็น=16:00, 1 ทุ่ม=19:00, 3 ทุ่ม=21:00, ตี 5=05:00; "in 30 minutes"/"อีก 2 ชั่วโมง" = now plus that),
"repeat" (one of none, daily, weekdays, weekly, monthly),
"importance" (0 normal, 1 if they say important/สำคัญ, 2 if must not miss/ห้ามพลาด/ห้ามลืม),
"category" (one of work, finance, health, client, order, other, or null).
No time and no date means a to-do without a time.`;
}

// -> { isReminder, title, remindAt (Date|null), repeat, importance, category }
async function parseReminderText(text, now = new Date()) {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: buildPrompt(text, now) }],
  });
  const x = JSON.parse(completion.choices[0].message.content || '{}');
  return interpret(x, now);
}

// Model output -> safe values (also used by tests with canned output).
function interpret(x, now) {
  const title = typeof x.title === 'string' ? x.title.trim().slice(0, 200) : '';
  const repeat = m.REPEATS.includes(x.repeat) ? x.repeat : 'none';
  let remindAt = m.resolveRemindAt({ date: x.date || null, time: x.time || null }, now);
  // A repeat with no time starts at the next 09:00.
  if (!remindAt && repeat !== 'none') remindAt = m.resolveRemindAt({ time: '09:00' }, now);
  return {
    isReminder: Boolean(x.is_reminder) && !!title,
    title,
    remindAt,
    repeat,
    importance: [0, 1, 2].includes(Number(x.importance)) ? Number(x.importance) : 0,
    category: m.CATEGORIES.includes(x.category) ? x.category : null,
  };
}

module.exports = { parseReminderText, looksLikeReminder, interpret, buildPrompt };
