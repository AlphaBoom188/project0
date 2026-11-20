// Repeat-payment detection (pure). Finds payments (or income) that repeat
// monthly in the user's transactions and aren't covered by a recurring rule
// yet, so the app can offer to log them automatically or remind the user.
//
// A candidate: the same payee (normalized description, same type) in at
// least 3 different months of the last 6, mostly consecutive (one gap
// allowed), on a similar day of the month (spread up to 7 days), with
// amounts within 25% of the median, and seen in the last 45 days (still
// happening). Transfers never count.

const crypto = require('crypto');

const DAY = 86400000;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// "TRUEMOVE H 0812345678 REF#998877 15/10" -> "truemove h"
function normalizeDescription(s) {
  return String(s || '').toLowerCase()
    .replace(/\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b/g, ' ') // dates
    .replace(/(\b(ref|no)|เลขที่)\s*[#:.]?\s*[\w-]*\d[\w-]*|#\s*[\w-]*\d[\w-]*/g, ' ') // reference numbers
    .replace(/\d{3,}/g, ' ') // long numbers (phone, account, invoice)
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|(ม|ก|มี|เม|พ|มิ|ส|ต|ธ)\.(ค|พ|ย)\./g, ' ') // Thai month abbreviations only with their dots (ส.ค.), never inside words
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ') // keep Thai vowel and tone marks (\p{M})
    .replace(/\s+/g, ' ')
    .trim();
}

const monthIndex = (ymd) => Number(ymd.slice(0, 4)) * 12 + Number(ymd.slice(5, 7)) - 1;
const addMonthsYmd = (ymd, n, day) => {
  const idx = monthIndex(ymd) + n;
  const y = Math.floor(idx / 12);
  const m = idx % 12;
  const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(Math.min(day, dim)).padStart(2, '0')}`;
};

// transactions: [{ id, date 'YYYY-MM-DD' (Bangkok), type, amount, description, category_id, category_name }]
// rules: existing recurring rules [{ type, description, amount, category_id, is_active }]
// -> candidates, best first
function detectRecurring({ transactions = [], rules = [], dismissed = [], today }) {
  const todayIdx = monthIndex(today);
  const recent = transactions.filter((t) => (t.type === 'expense' || t.type === 'income') && Number(t.amount) > 0 && monthIndex(t.date) > todayIdx - 6 && t.date <= today);
  const groups = new Map();
  for (const t of recent) {
    const norm = normalizeDescription(t.description) || (t.category_name ? `category:${t.category_name.toLowerCase()}` : '');
    if (!norm || norm.length < 3) continue;
    const key = `${t.type}|${norm}`;
    if (!groups.has(key)) groups.set(key, { type: t.type, norm, rows: [] });
    groups.get(key).rows.push(t);
  }
  const ruleMatch = (g, amount, categoryId) => rules.some((r) => r.is_active !== false && r.type === g.type
    && (normalizeDescription(r.description) === g.norm || (r.category_id && r.category_id === categoryId && Math.abs(Number(r.amount) - amount) <= amount * 0.15)));

  const out = [];
  for (const g of groups.values()) {
    // One payment per month: the one closest to the group's usual amount.
    const byMonth = new Map();
    g.rows.forEach((t) => { const m = t.date.slice(0, 7); (byMonth.get(m) || byMonth.set(m, []).get(m)).push(t); });
    if (byMonth.size < 3) continue;
    const allAmounts = g.rows.map((t) => Number(t.amount));
    const typical = median(allAmounts);
    const picks = [...byMonth.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([, ts]) => ts.reduce((best, t) => (Math.abs(Number(t.amount) - typical) < Math.abs(Number(best.amount) - typical) ? t : best)));
    const months = picks.map((t) => monthIndex(t.date));
    if (months[months.length - 1] - months[0] + 1 > picks.length + 1) continue; // more than one gap
    const amounts = picks.map((t) => Number(t.amount));
    const med = median(amounts);
    if (amounts.some((a) => Math.abs(a - med) > med * 0.25)) continue;
    const days = picks.map((t) => Number(t.date.slice(8, 10)));
    if (Math.max(...days) - Math.min(...days) > 7) continue;
    const last = picks[picks.length - 1];
    if ((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${last.date}T00:00:00Z`)) / DAY > 45) continue; // stopped
    const categories = new Map();
    picks.forEach((t) => categories.set(t.category_id, (categories.get(t.category_id) || 0) + 1));
    const categoryId = [...categories.entries()].sort((a, b) => b[1] - a[1])[0][0];
    if (ruleMatch(g, med, categoryId)) continue;
    const key = crypto.createHash('sha1').update(`${g.type}|${g.norm}`).digest('hex').slice(0, 12);
    if (dismissed.includes(key)) continue;
    const dayOfMonth = Math.round(median(days));
    const variable = Math.max(...amounts) - Math.min(...amounts) > med * 0.05;
    let next = addMonthsYmd(last.date, 1, dayOfMonth);
    while (next <= today) next = addMonthsYmd(next, 1, dayOfMonth);
    out.push({
      key,
      type: g.type,
      description: last.description || picks.find((t) => t.description)?.description || last.category_name || 'Repeat payment',
      amount: Math.round(med),
      variable,
      dayOfMonth,
      categoryId,
      categoryName: picks.find((t) => t.category_id === categoryId)?.category_name || null,
      months: picks.length,
      lastDate: last.date,
      nextDate: next,
      confidence: picks.length >= 4 && !variable ? 'high' : 'medium',
      sources: picks.slice(-6).map((t) => ({ id: t.id, date: t.date, amount: Number(t.amount), description: t.description || '' })),
    });
  }
  return out.sort((a, b) => (a.confidence === b.confidence ? b.amount - a.amount : a.confidence === 'high' ? -1 : 1));
}

module.exports = { detectRecurring, normalizeDescription, addMonthsYmd };
