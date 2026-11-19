// GET /api/groups/:u and /api/groups/:u/:group_id -- read-only views of the
// LINE group split tracker, on data seeded by tests/fixtures/groupSeed.js.
const { BASE, FIXTURES } = require('../lib');
const { createClient } = require('@supabase/supabase-js');
const { seedGroups } = require(`${FIXTURES}/groupSeed.js`);

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const get = (p) => fetch(`${BASE}/api${p}`).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

let seed;
(async () => {
  seed = await seedGroups(db);
  const { ids, G, R } = seed;

  // --- List ---
  const ann = await get(`/groups/${ids.A}`);
  assert(ann.status === 200 && ann.body.groups.length === 2, `Ann is in 2 groups (got ${ann.status} ${ann.body.groups && ann.body.groups.length})`);
  const [trip, room] = ann.body.groups;
  assert(trip.group_id === G && room.group_id === R, 'newest activity first');
  assert(trip.name === 'Test Trip' && trip.member_count === 3 && trip.is_active && !trip.i_left, 'group name, member count, active');
  assert(trip.my_net === 300, `Ann's net in Test Trip is +300 (got ${trip.my_net})`);
  assert(JSON.stringify(trip.my_payments) === JSON.stringify([{ direction: 'receive', name: 'Cee', amount: 155 }, { direction: 'receive', name: 'Bo', amount: 145 }]), `Ann receives 155 from Cee and 145 from Bo (got ${JSON.stringify(trip.my_payments)})`);
  assert(room.name === null && room.source_type === 'room' && room.my_net === 0 && room.my_payments.length === 0, 'the settled room: no name, net 0, no payments');
  assert(trip.last_activity && new Date(trip.last_activity) > new Date(room.last_activity), 'last_activity per group');

  const bo = await get(`/groups/${ids.B}`);
  const boTrip = bo.body.groups.find((g) => g.group_id === G);
  assert(boTrip.my_net === -145 && JSON.stringify(boTrip.my_payments) === JSON.stringify([{ direction: 'pay', name: 'Ann', amount: 145 }]), "Bo's view: owes Ann 145");
  const cee = await get(`/groups/${ids.C}`);
  assert(cee.body.groups.length === 1 && cee.body.groups[0].my_net === -155, 'Cee only sees Test Trip, owing 155');
  const nobody = await get('/groups/test_grp_nobody');
  assert(nobody.status === 200 && nobody.body.groups.length === 0, 'a user in no groups gets an empty list');

  // --- Detail ---
  const d = await get(`/groups/${ids.C}/${G}`);
  assert(d.status === 200 && d.body.group.name === 'Test Trip' && d.body.my_net === -155, 'detail: group and my net');
  assert(d.body.payments.length === 2 && d.body.payments.every((p) => p.to_name === 'Ann')
    && d.body.payments.find((p) => p.from_name === 'Cee').involves_me && !d.body.payments.find((p) => p.from_name === 'Bo').involves_me, 'detail: the whole plan, with involves_me');
  assert(JSON.stringify(d.body.members.map((m) => [m.name, m.net, m.is_me])) === JSON.stringify([['Ann', 300, false], ['Bo', -145, false], ['Cee', -155, true]]), `detail: members by net, me marked (got ${JSON.stringify(d.body.members)})`);
  const recent = d.body.recent;
  assert(recent.length === 3 && recent[0].kind === 'settlement' && recent[0].payer_name === 'Bo' && recent[0].to_name === 'Ann' && recent[0].my_share === null, 'recent: newest first; a settlement has payer and receiver, no share');
  assert(recent[1].description === 'taxi' && recent[1].paid_by_me && recent[1].split_count === 2 && recent[1].my_share === 45, 'recent: my own expense with my share');
  assert(recent[2].description === 'ข้าว' && !recent[2].paid_by_me && recent[2].my_share === 200 && recent[2].amount === 600, 'recent: someone else\'s expense with my share');

  // --- Access and validation ---
  assert((await get(`/groups/${ids.C}/${R}`)).status === 404, 'a group you are not in -> 404');
  assert((await get(`/groups/${ids.A}/not-a-group`)).status === 400, 'a malformed group id -> 400');
  await db.from('line_group_members').update({ left_at: new Date().toISOString() }).eq('group_id', G).eq('line_user_id', ids.C);
  const left = await get(`/groups/${ids.C}`);
  assert(left.body.groups[0].i_left && left.body.groups[0].member_count === 2 && left.body.groups[0].my_net === -155, 'after leaving: still listed (debts remain), i_left, member count drops');
  assert((await get(`/groups/${ids.C}/${G}`)).status === 200, 'a former member can still open the group');

  await seed.cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); if (seed) await seed.cleanup(); process.exit(1); });
