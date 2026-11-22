// Morning briefing (migration 023): buildBriefing (pure), loadBriefing on
// seeded reminders, the 07:30 job scoped to one user with LINE stubbed, the
// preference, and the "today" chat command.
const { BASE, BACKEND } = require('../lib');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const pushes = [];
const replies = [];
const p = require.resolve(`${BACKEND}/services/lineMessagingClient.js`);
require.cache[p] = { id: p, filename: p, loaded: true, exports: {
  async pushMessages(to, messages) { pushes.push({ to, messages }); },
  async replyText(token, text) { replies.push(text); }, async replyMessages() {}, async replyConfirmationCard() {}, async pushText() {}, async getImageBuffer() { return Buffer.alloc(0); }, async getGroupMemberName() { return null; }, async getGroupName() { return null; },
} };
const { buildBriefing, loadBriefing } = require(`${BACKEND}/services/briefing.js`);
const { sendMorningBriefings } = require(`${BACKEND}/jobs/morningBriefing.js`);
const controller = require(`${BACKEND}/controllers/lineWebhookController.js`);

const U = `U${crypto.randomBytes(16).toString('hex')}`;
const at = (h, mi, dayOffset = 0) => { const d = new Date(Date.now() + 7 * 3600000); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + dayOffset, h - 7, mi)).toISOString(); };

(async () => {
  // --- Pure ---
  const now = new Date('2026-11-20T00:30:00Z'); // Fri 07:30 Bangkok
  assert(buildBriefing({ now }) === null, 'nothing on -> no message');
  const text = buildBriefing({ now, timed: [{ at: '2026-11-20T07:00:00Z', title: 'Dentist', importance: 1 }, { at: '2026-11-20T02:00:00Z', title: 'Stand-up', kind: 'event' }], allDay: ['Holiday'], overdue: [{ title: 'Pay rent' }], todos: ['Buy milk', 'Call mum'] });
  assert(text.startsWith('Good morning. Friday 20 Nov:') && text.indexOf('09:00  Stand-up · calendar') < text.indexOf('14:00  Dentist (important)'), `sorted by time, calendar marked (got ${JSON.stringify(text)})`);
  assert(text.includes('- All day  Holiday') && text.includes('Still open\n- Pay rent') && text.includes('To-do (2)\n- Buy milk'), 'all-day, overdue and to-dos');
  const billsOnly = buildBriefing({ now, bills: ['Netflix ฿419', 'Water ฿300'] });
  assert(billsOnly && billsOnly.includes('Bills due today\n- Netflix ฿419\n- Water ฿300'), 'bills due today alone make a briefing');
  const many = buildBriefing({ now, todos: Array.from({ length: 8 }, (_, i) => `T${i}`) });
  assert(many.includes('- and 3 more'), 'long lists are capped');

  await db.from('users').insert({ line_user_id: U, display_name: 'Brief Test', morning_briefing: true });
  try {
    await db.from('reminders').insert([
      { line_user_id: U, title: 'Dentist', remind_at: at(14, 0), next_fire_at: at(14, 0), importance: 1 },
      { line_user_id: U, title: 'Pay rent', remind_at: at(9, 0, -2) },
      { line_user_id: U, title: 'Buy milk' },
      { line_user_id: U, title: 'Tomorrow thing', remind_at: at(9, 0, 1), next_fire_at: at(9, 0, 1) },
      { line_user_id: U, title: 'Daily pills', repeat: 'daily', remind_at: at(8, 0), anchor_at: at(8, 0, -10), next_fire_at: at(8, 0) },
    ], { defaultToNull: false }); // rows with different keys: keep column defaults
    const b = await loadBriefing(U, new Date(), { withCalendar: false });
    assert(b.text && b.text.includes('14:00  Dentist (important)') && b.text.includes('08:00  Daily pills') && !b.text.includes('Tomorrow thing'), `today's reminders incl. the daily one (got ${JSON.stringify(b.counts)})`);
    assert(b.counts.overdue === 1 && b.counts.todos === 1, 'overdue and to-do counted');

    // --- Job ---
    let out = await sendMorningBriefings({ lineUserId: U });
    assert(out.sent === 1 && pushes.length === 1 && pushes[0].to === U && pushes[0].messages[0].text.startsWith('Good morning.'), 'job pushes the briefing');
    assert(!process.env.LIFF_ID || pushes[0].messages[0].quickReply.items[0].action.uri.endsWith('?tab=tasks'), 'Open Tasks quick reply links to the Tasks tab');
    await db.from('users').update({ notifications_enabled: false }).eq('line_user_id', U);
    out = await sendMorningBriefings({ lineUserId: U });
    assert(out.sent === 0, 'notifications off -> no briefing');
    await db.from('users').update({ notifications_enabled: true, morning_briefing: false }).eq('line_user_id', U);
    assert((await sendMorningBriefings({ lineUserId: U })).sent === 0, 'briefing off -> nothing');

    // --- "today" in chat (a free reply, works even with the briefing off) ---
    await controller.webhook({ body: { events: [{ type: 'message', replyToken: 'r', timestamp: Date.now(), mode: 'active', source: { type: 'user', userId: U }, message: { id: 'm1', type: 'text', text: 'วันนี้' } }] } }, { status() { return this; }, end() {} });
    assert(replies.length === 1 && replies[0].startsWith('Good morning.') && replies[0].includes('Dentist'), '"วันนี้" replies with the briefing');
  } finally {
    await db.from('categories').delete().eq('line_user_id', U);
    await db.from('users').delete().eq('line_user_id', U);
  }
  // --- Preference over REST ---
  const T = `test_brief_${crypto.randomBytes(4).toString('hex')}`;
  await db.from('users').insert({ line_user_id: T, display_name: 'Pref' });
  try {
    const r = await fetch(`${BASE}/api/users/${T}/preferences`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ morning_briefing: true }) }).then((x) => x.json());
    assert(r.user && r.user.morning_briefing === true, 'PATCH preferences turns it on');
  } finally {
    await db.from('users').delete().eq('line_user_id', T);
  }
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); console.log('FAIL: crashed'); process.exit(1); });
