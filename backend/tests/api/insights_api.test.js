// Repeat-payment suggestions and the monthly report over REST, the monthly
// report job (LINE stubbed, in-process) and the "รายงาน" chat command.
const { BASE, BACKEND } = require('../lib');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const pushes = [];
const replies = [];
const lp = require.resolve(`${BACKEND}/services/lineMessagingClient.js`);
require.cache[lp] = { id: lp, filename: lp, loaded: true, exports: {
  async pushMessages(to, messages) { pushes.push({ to, messages }); }, async replyText(t, text) { replies.push(text); },
  async replyMessages() {}, async replyConfirmationCard() {}, async pushText() {}, async getImageBuffer() { return Buffer.alloc(0); }, async getGroupMemberName() { return null; }, async getGroupName() { return null; },
} };
const { sendMonthlyReports } = require(`${BACKEND}/jobs/monthlyReport.js`);
const controller = require(`${BACKEND}/controllers/lineWebhookController.js`);

const U = `test_insight_${crypto.randomBytes(4).toString('hex')}`;
const call = (method, p, body) => fetch(`${BASE}/api${p}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().replace(/T.*/, 'T05:00:00Z');

(async () => {
  await call('POST', '/users', { line_user_id: U, display_name: 'Insights Test' });
  try {
    const { data: cats } = await db.from('categories').select('id, name, type').eq('line_user_id', U);
    const other = cats.find((c) => c.name === 'Others');
    const income = cats.find((c) => c.type === 'income');
    const rows = [
      ...[0, 30, 60, 90].map((d) => ({ amount: 419, type: 'expense', category_id: other.id, description: 'NETFLIX.COM', transaction_date: daysAgo(d + 1) })),
      ...[0, 30, 60].map((d) => ({ amount: 799, type: 'expense', category_id: other.id, description: 'TRUEMOVE H 0812345678', transaction_date: daysAgo(d + 2) })),
      ...[0, 30, 60].map((d) => ({ amount: 199, type: 'expense', category_id: other.id, description: 'YouTube Premium', transaction_date: daysAgo(d + 3) })),
      { amount: 120, type: 'expense', category_id: other.id, description: 'coffee', transaction_date: daysAgo(4) },
      { amount: 30000, type: 'income', category_id: income.id, description: 'Freelance', transaction_date: daysAgo(5) },
    ];
    const ins = await db.from('transactions').insert(rows.map((r) => ({ ...r, line_user_id: U })));
    assert(!ins.error, 'seed transactions');

    // --- Suggestions ---
    let r = await call('GET', `/recurring/${U}/suggestions`);
    const names = r.body.suggestions.map((s) => s.description);
    assert(r.status === 200 && names.includes('NETFLIX.COM') && names.some((n) => n.startsWith('TRUEMOVE')) && names.includes('YouTube Premium') && !names.includes('coffee'), `three repeat payments (got ${JSON.stringify(names)})`);
    const nf = r.body.suggestions.find((s) => s.description === 'NETFLIX.COM');
    const tm = r.body.suggestions.find((s) => s.description.startsWith('TRUEMOVE'));
    const yt = r.body.suggestions.find((s) => s.description === 'YouTube Premium');
    assert(nf.amount === 419 && nf.confidence === 'high' && nf.nextDate > new Date().toISOString().slice(0, 10), 'Netflix: amount, high confidence, next date in the future');

    r = await call('POST', `/recurring/${U}/suggestions/${nf.key}/accept`, { mode: 'log' });
    assert(r.status === 200 && r.body.mode === 'log' && r.body.created.recurringId && !r.body.suggestions.some((s) => s.key === nf.key), 'log -> a recurring rule, gone from the list');
    const rule = (await db.from('recurring_transactions').select('amount, frequency, description, next_run_date, type').eq('id', r.body.created.recurringId).single()).data;
    assert(rule && Number(rule.amount) === 419 && rule.frequency === 'monthly' && rule.type === 'expense' && rule.next_run_date.startsWith(nf.nextDate), 'rule: monthly 419 from the next expected date');
    r = await call('POST', `/recurring/${U}/suggestions/${tm.key}/accept`, { mode: 'remind' });
    assert(r.status === 200 && r.body.created.reminderId, 'remind -> a reminder');
    const rem = (await db.from('reminders').select('title, repeat, category, importance, details').eq('id', r.body.created.reminderId).single()).data;
    assert(rem.title.startsWith('Pay TRUEMOVE') && rem.repeat === 'monthly' && rem.category === 'finance' && rem.importance === 1 && rem.details.includes('฿799'), 'reminder: monthly, finance, important, amount in details');
    r = await call('POST', `/recurring/${U}/suggestions/${yt.key}/dismiss`);
    assert(r.status === 200 && r.body.suggestions.length === 0, 'dismiss');
    r = await call('GET', `/recurring/${U}/suggestions`);
    assert(r.body.suggestions.length === 0, 'nothing comes back (rule, reminder, dismissed)');
    assert((await call('POST', `/recurring/${U}/suggestions/${yt.key}/accept`, { mode: 'log' })).status === 404, 'a dismissed one can\'t be accepted');
    assert((await call('POST', `/recurring/${U}/suggestions/0123456789ab/accept`, { mode: 'nope' })).status === 404 && (await call('POST', `/recurring/${U}/suggestions/bad/accept`, {})).status === 400, 'unknown and malformed keys');

    // --- Report ---
    r = await call('GET', `/reports/${U}/monthly?offset=0`);
    assert(r.status === 200 && r.body.report.count >= 1 && r.body.report.label && Array.isArray(r.body.report.categories), 'current period report');
    r = await call('GET', `/reports/${U}/monthly`);
    assert(r.status === 200 && typeof r.body.report.expense === 'number' && r.body.report.start < new Date().toISOString(), 'default: the last complete period');
    assert((await call('GET', `/reports/${U}/monthly?offset=1`)).status === 400 && (await call('GET', `/reports/${U}/monthly?offset=x`)).status === 400, 'offset validated');

    // --- Job (forced, scoped) and chat ---
    const out = await sendMonthlyReports({ lineUserId: U, force: true });
    const lastCount = (await call('GET', `/reports/${U}/monthly`)).body.report.count;
    assert(lastCount >= 3 ? out.sent === 1 && pushes[0].messages[0].text.startsWith('Your money report') : out.sent === 0, `job sends when the period had 3+ entries (count ${lastCount}, sent ${out.sent})`);
    assert((await sendMonthlyReports({ lineUserId: U })).sent === 0 || new Date().getUTCDate() === 1, 'not the cycle start day -> nothing');
  } finally {
    await db.from('reminders').delete().eq('line_user_id', U);
    await db.from('recurring_transactions').delete().eq('line_user_id', U);
    await db.from('transactions').delete().eq('line_user_id', U);
    await db.from('categories').delete().eq('line_user_id', U);
    await db.from('users').delete().eq('line_user_id', U);
  }
  // "รายงาน" in chat (a real LINE-style id; the webhook path is in-process)
  const L = `U${crypto.randomBytes(16).toString('hex')}`;
  await db.from('users').insert({ line_user_id: L, display_name: 'Chat' });
  try {
    await controller.webhook({ body: { events: [{ type: 'message', replyToken: 'r', timestamp: Date.now(), mode: 'active', source: { type: 'user', userId: L }, message: { id: 'm', type: 'text', text: 'รายงาน' } }] } }, { status() { return this; }, end() {} });
    assert(replies.length === 1 && replies[0].includes('nothing was logged'), `"รายงาน" replies with the report (got ${JSON.stringify(replies[0])})`);
  } finally {
    await db.from('categories').delete().eq('line_user_id', L);
    await db.from('users').delete().eq('line_user_id', L);
  }
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); console.log('FAIL: crashed'); process.exit(1); });
