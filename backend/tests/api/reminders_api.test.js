// Reminders, notes and calendar status over REST (migration 020):
// /api/reminders/:u (+ /:id, /:id/done|snooze|stop|reopen), /api/notes/:u,
// /api/calendar/:u/status|events, plus the minute dispatch job run in-process
// (scoped to this test's reminders) with LINE pushes stubbed.
const { BASE, BACKEND } = require('../lib');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const call = (method, p, body) => fetch(`${BASE}/api${p}`, {
  method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

// The dispatch job pushes through lineMessagingClient: record instead.
const pushes = [];
const p = require.resolve(`${BACKEND}/services/lineMessagingClient.js`);
require.cache[p] = { id: p, filename: p, loaded: true, exports: { async pushMessages(to, messages) { pushes.push({ to, messages }); } } };
const { dispatchDueReminders } = require(`${BACKEND}/jobs/reminderDispatch.js`);
const { fromLocal } = require(`${BACKEND}/services/reminderMath.js`);

const U = `test_rem_${crypto.randomBytes(4).toString('hex')}`;
const OTHER = `test_rem_other_${crypto.randomBytes(4).toString('hex')}`;
const inMin = (n) => new Date(Date.now() + n * 60000).toISOString();

(async () => {
  for (const id of [U, OTHER]) await db.from('users').insert({ line_user_id: id, display_name: 'Rem Test' });
  try {
    // --- Create ---
    let r = await call('POST', `/reminders/${U}`, { title: 'Call the bank', remind_at: inMin(60), importance: 1, category: 'finance', details: 'Ask about the fee' });
    assert(r.status === 201 && r.body.reminder.title === 'Call the bank' && new Date(r.body.reminder.next_fire_at).getTime() === new Date(r.body.reminder.remind_at).getTime(), `create a timed reminder (got ${r.status} ${JSON.stringify(r.body).slice(0, 120)})`);
    const bank = r.body.reminder;
    r = await call('POST', `/reminders/${U}`, { title: 'Buy milk' });
    assert(r.status === 201 && r.body.reminder.remind_at === null && r.body.reminder.next_fire_at === null, 'a to-do with no time');
    const milk = r.body.reminder;
    const nine = fromLocal(2026, 10, 2, 9, 0).toISOString(); // Mon 2 Nov 2026 09:00 Bangkok, in the past
    r = await call('POST', `/reminders/${U}`, { title: 'Stand-up', remind_at: nine, repeat: 'weekdays', category: 'work' });
    const standup = r.body.reminder;
    assert(r.status === 201 && new Date(standup.anchor_at).toISOString() === nine && new Date(standup.remind_at) > new Date(), 'repeating from a past start -> next weekday occurrence');
    for (const [body, label] of [
      [{}, 'Title is required'], [{ title: 'x', remind_at: inMin(-10) }, 'That time has already passed'],
      [{ title: 'x', importance: 5 }, 'Importance'], [{ title: 'x', repeat: 'daily' }, 'repeating reminder needs'],
    ]) {
      const res = await call('POST', `/reminders/${U}`, body);
      assert(res.status === 400 && res.body.error.includes(label), `400: ${label}`);
    }

    // --- List with occurrences ---
    const from = new Date(Date.now() - 86400000).toISOString();
    const to = new Date(Date.now() + 8 * 86400000).toISOString();
    r = await call('GET', `/reminders/${U}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    assert(r.status === 200 && r.body.reminders.length === 3, `list: 3 open (got ${r.body.reminders && r.body.reminders.length})`);
    const standupOcc = r.body.occurrences.filter((o) => o.reminder_id === standup.id);
    assert(standupOcc.length >= 5 && standupOcc.length <= 7, `weekday stand-up expands to 5-7 occurrences over ~9 days (got ${standupOcc.length})`);
    assert(r.body.occurrences.filter((o) => o.reminder_id === bank.id).length === 1 && !r.body.occurrences.some((o) => o.reminder_id === milk.id), 'one-off once; to-do none');
    assert((await call('GET', `/reminders/${U}?from=x&to=y`)).status === 400 && (await call('GET', `/reminders/${U}?from=${from}&to=${new Date(Date.now() + 90 * 86400000).toISOString()}`)).status === 400, 'bad or too-wide window -> 400');
    assert((await call('GET', `/reminders/${OTHER}`)).body.reminders.length === 0, "another user doesn't see them");

    // --- Edit ---
    r = await call('PUT', `/reminders/${U}/${milk.id}`, { title: 'Buy milk and eggs', remind_at: inMin(30) });
    assert(r.status === 200 && r.body.reminder.title === 'Buy milk and eggs' && new Date(r.body.reminder.next_fire_at).getTime() === new Date(r.body.reminder.remind_at).getTime(), 'edit: give the to-do a time');
    assert((await call('PUT', `/reminders/${OTHER}/${milk.id}`, { title: 'hijack' })).status === 404, "someone else's reminder -> 404");
    assert((await call('PUT', `/reminders/${U}/not-a-uuid`, { title: 'x' })).status === 400, 'malformed id -> 400');
    assert((await call('PUT', `/reminders/${U}/${milk.id}`, { title: '' })).status === 400, 'empty title -> 400');

    // --- Actions ---
    r = await call('POST', `/reminders/${U}/${bank.id}/snooze`, { minutes: 30 });
    assert(r.status === 200 && Math.abs(new Date(r.body.reminder.next_fire_at) - Date.now() - 30 * 60000) < 60000, 'snooze 30 minutes');
    r = await call('POST', `/reminders/${U}/${bank.id}/done`);
    assert(r.status === 200 && r.body.reminder.status === 'done' && r.body.reminder.next_fire_at === null, 'done');
    r = await call('POST', `/reminders/${U}/${bank.id}/reopen`);
    assert(r.status === 200 && r.body.reminder.status === 'open' && new Date(r.body.reminder.next_fire_at).getTime() === new Date(bank.remind_at).getTime(), 'reopen re-arms it');
    const before = standup.remind_at;
    r = await call('POST', `/reminders/${U}/${standup.id}/done`);
    assert(r.status === 200 && r.body.reminder.status === 'open' && new Date(r.body.reminder.remind_at) > new Date(before), 'done on a repeating reminder moves to the next occurrence');
    assert((await call('POST', `/reminders/${U}/${bank.id}/explode`)).status === 404, 'unknown action -> 404');

    // --- Dispatch job ---
    await db.from('reminders').update({ next_fire_at: inMin(-1), remind_at: inMin(-1), fire_count: 0 }).eq('id', bank.id);
    let out = await dispatchDueReminders({ lineUserId: U });
    assert(out.sent === 1 && pushes.length === 1 && pushes[0].to === U, `due reminder pushed once (got ${JSON.stringify(out)})`);
    const msg = pushes[0].messages[0];
    assert(msg.text.startsWith('Reminder: Call the bank\nAsk about the fee') && msg.quickReply.items.map((i) => i.action.label).join('|') === 'Done|Snooze 15 min|Stop reminding', 'push text and Done/Snooze/Stop quick replies');
    let row = (await db.from('reminders').select('fire_count, next_fire_at, remind_at').eq('id', bank.id).single()).data;
    assert(row.fire_count === 1 && Math.abs(new Date(row.next_fire_at) - new Date(row.remind_at) - 30 * 60000) < 1000, 'important: next push is the +30 min follow-up');
    out = await dispatchDueReminders({ lineUserId: U });
    assert(out.sent === 0 && pushes.length === 1, 'nothing more until the follow-up is due');
    // Two processes racing for the same row: only one push
    await db.from('reminders').update({ next_fire_at: inMin(-1) }).eq('id', bank.id);
    const [a, b] = await Promise.all([dispatchDueReminders({ lineUserId: U }), dispatchDueReminders({ lineUserId: U })]);
    assert(a.sent + b.sent === 1 && pushes.length === 2 && pushes[1].messages[0].text.includes("isn't marked done yet"), `two runs at once push once (got ${a.sent}+${b.sent}), as a follow-up`);

    // --- Delete ---
    assert((await call('DELETE', `/reminders/${U}/${milk.id}`)).status === 200, 'delete');
    assert((await call('DELETE', `/reminders/${U}/${milk.id}`)).status === 200, 'delete again: still fine');

    // --- Notes ---
    r = await call('POST', `/notes/${U}`, { body: '  Wi-Fi code at the office: ask Bo  ' });
    assert(r.status === 201 && r.body.note.body === 'Wi-Fi code at the office: ask Bo' && /^\d{4}-\d{2}-\d{2}$/.test(r.body.note.note_date) && r.body.note.pinned === false, 'create a note for today');
    const note = r.body.note;
    r = await call('POST', `/notes/${U}`, { body: 'Older note', note_date: '2026-01-15', pinned: true });
    assert(r.status === 201 && r.body.note.note_date === '2026-01-15', 'note on a chosen day');
    assert((await call('POST', `/notes/${U}`, { body: ' ' })).status === 400 && (await call('POST', `/notes/${U}`, { body: 'x', note_date: '15/01' })).status === 400, 'note validation');
    r = await call('GET', `/notes/${U}`);
    assert(r.status === 200 && r.body.notes.length === 2 && r.body.notes[0].pinned, 'list: pinned first');
    r = await call('GET', `/notes/${U}?from=2026-01-01&to=2026-01-31`);
    assert(r.body.notes.length === 1 && r.body.notes[0].body === 'Older note', 'list by date range');
    r = await call('PUT', `/notes/${U}/${note.id}`, { pinned: true, body: 'Wi-Fi: ask Bo' });
    assert(r.status === 200 && r.body.note.pinned && r.body.note.body === 'Wi-Fi: ask Bo', 'edit a note');
    assert((await call('PUT', `/notes/${OTHER}/${note.id}`, { body: 'x' })).status === 404, "someone else's note -> 404");
    await call('DELETE', `/notes/${OTHER}/${note.id}`);
    assert((await call('GET', `/notes/${U}`)).body.notes.length === 2, "another user's delete does nothing");
    assert((await call('DELETE', `/notes/${U}/${note.id}`)).status === 200 && (await call('GET', `/notes/${U}`)).body.notes.length === 1, 'delete a note');

    // --- Calendar (not connected) ---
    r = await call('GET', `/calendar/${U}/status`);
    assert(r.status === 200 && r.body.connected === false && r.body.email === null && typeof r.body.configured === 'boolean', 'calendar status: not connected');
    r = await call('GET', `/calendar/${U}/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    assert(r.status === 409 && r.body.code === 'calendar_not_connected', `events without a link -> 409 (got ${r.status})`);
    assert((await call('GET', `/calendar/${U}/events?from=x`)).status === 400, 'events: bad window -> 400');
    assert((await call('DELETE', `/calendar/${U}`)).status === 200, 'disconnect when not connected: fine');

    // --- Account deletion takes reminders and notes ---
    assert((await call('DELETE', `/users/${U}`, { confirm: 'DELETE' })).status === 200, 'delete the account');
    const left = await db.from('reminders').select('id').eq('line_user_id', U);
    const leftNotes = await db.from('notes').select('id').eq('line_user_id', U);
    assert(left.data.length === 0 && leftNotes.data.length === 0, 'reminders and notes went with it');
  } finally {
    for (const id of [U, OTHER]) await db.from('users').delete().eq('line_user_id', id);
  }
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); console.log('FAIL: crashed'); process.exit(1); });
