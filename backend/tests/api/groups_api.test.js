// Group bills over REST (migration 019): /api/groups/:u, /:group_id,
// /bills/:bill_id (+ slip, confirm, reject, cancel) and
// PUT /api/users/:u/payment-details, on data seeded by tests/fixtures/groupSeed.js.
// LINE pushes from the server go to made-up group ids and fail quietly (warn).
const { BASE, FIXTURES } = require('../lib');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { seedGroups } = require(`${FIXTURES}/groupSeed.js`);

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const assert = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`); if (!c) failures += 1; };
const call = (method, p, body) => fetch(`${BASE}/api${p}`, {
  method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const get = (p) => call('GET', p);
const post = (p, body) => call('POST', p, body);
const SLIP = fs.readFileSync(`${FIXTURES}/receipt.jpg`).toString('base64');

let seed;
(async () => {
  seed = await seedGroups(db);
  const { ids, G, R, bills } = seed;

  // --- List ---
  const ann = await get(`/groups/${ids.A}`);
  assert(ann.status === 200 && ann.body.groups.length === 2, `Ann is in 2 groups (got ${ann.status} ${ann.body.groups && ann.body.groups.length})`);
  const [trip, room] = ann.body.groups;
  assert(trip.group_id === G && room.group_id === R, 'newest activity first');
  assert(trip.name === 'Test Trip' && trip.member_count === 3 && trip.is_active && !trip.i_left, 'group name, member count, active');
  assert(trip.open_bills === 2 && trip.my_owe === 0 && trip.my_owed === 200, `Ann in Test Trip: 2 open bills, owed 200 (got ${JSON.stringify(trip)})`);
  assert(room.name === null && room.source_type === 'room' && room.open_bills === 0 && room.my_owed === 0, 'the room: no name, nothing open');
  const bo = (await get(`/groups/${ids.B}`)).body.groups.find((g) => g.group_id === G);
  assert(bo.my_owe === 45 && bo.my_owed === 0, `Bo owes 45 (taxi) (got ${bo.my_owe}/${bo.my_owed})`);
  const cee = (await get(`/groups/${ids.C}`)).body.groups;
  assert(cee.length === 1 && cee[0].my_owe === 200 && cee[0].my_owed === 45, 'Cee only sees Test Trip: owes 200, owed 45');
  assert((await get('/groups/test_grp_nobody')).body.groups.length === 0, 'a user in no groups gets an empty list');

  // --- Group detail ---
  const d = await get(`/groups/${ids.C}/${G}`);
  assert(d.status === 200 && d.body.group.name === 'Test Trip' && d.body.my_owe === 200, 'detail: group and my totals');
  assert(d.body.open_bills.map((b) => b.description).join() === 'taxi,ข้าว' && d.body.closed_bills.map((b) => b.description).join() === 'เค้ก', 'open bills newest first; closed separately');
  const [taxi, rice] = d.body.open_bills;
  assert(taxi.is_owner && taxi.my_status === 'owner' && taxi.paid_count === 0 && taxi.owe_count === 1, 'taxi from Cee\'s side: owner, 0 of 1 paid');
  assert(!rice.is_owner && rice.my_status === 'unpaid' && rice.my_share === 200 && rice.owner_name === 'Ann' && rice.paid_count === 1 && rice.owe_count === 2, 'rice from Cee\'s side: unpaid 200 to Ann, 1 of 2 paid');

  // --- Members (Groups page) ---
  const mem = d.body.members.map((x) => [x.name, x.is_me, x.owes_me, x.i_owe, x.unpaid_total, x.unpaid_bills]);
  assert(JSON.stringify(mem) === JSON.stringify([['Cee', true, 0, 0, 200, 1], ['Bo', false, 45, 0, 45, 1], ['Ann', false, 0, 200, 0, 0]]), `members from Cee's side: me first, then who owes most (got ${JSON.stringify(mem)})`);
  assert(d.body.members.every((x) => !('line_user_id' in x)), 'member rows carry no LINE ids');
  const boRow = d.body.members.find((x) => x.name === 'Bo');
  assert(boRow.rank >= 1 && boRow.firsts >= 1, `Bo paid first on a bill this month: ranked (got ${JSON.stringify(boRow)})`);
  assert(d.body.top_host && typeof d.body.top_host.name === 'string' && d.body.top_host.bills >= 1, `top host this month (got ${JSON.stringify(d.body.top_host)})`);

  // --- Bill detail ---
  let b = await get(`/groups/${ids.C}/bills/${bills.rice}`);
  assert(b.status === 200 && b.body.bill.description === 'ข้าว' && b.body.bill.my_status === 'unpaid' && b.body.bill.unpaid_total === 200, 'bill: Cee owes, 200 to go');
  assert(JSON.stringify(b.body.bill.shares.map((s) => [s.name, s.status, s.position])) === JSON.stringify([['Ann', 'owner', null], ['Bo', 'paid', 1], ['Cee', 'unpaid', null]]), `shares: owner first, Bo paid 1st (got ${JSON.stringify(b.body.bill.shares.map((s) => [s.name, s.status, s.position]))})`);
  const pay = b.body.pay_to;
  assert(pay && pay.name === 'Ann' && pay.promptpay_id === '081-234-5678' && pay.bank_account_no === '1234567890' && pay.bank_name === 'Test Bank' && pay.bank_account_name === 'Ann Example', 'pay_to: the owner\'s PromptPay and bank details');
  assert(pay.promptpay_payload.startsWith('000201010212') && pay.promptpay_payload.includes('01130066812345678') && pay.promptpay_payload.includes('5406200.00'), 'PromptPay payload for Cee\'s 200.00 share');
  assert((await get(`/groups/${ids.B}/bills/${bills.rice}`)).body.pay_to === null, 'Bo already paid: no pay_to');
  assert((await get(`/groups/${ids.A}/bills/${bills.rice}`)).body.pay_to === null, 'the owner gets no pay_to');
  const roomBill = await get(`/groups/${ids.C}/bills/${bills.coffee}`);
  assert(roomBill.status === 404, 'a bill in a group you are not in -> 404');
  assert((await get(`/groups/${ids.C}/bills/not-a-uuid`)).status === 400, 'malformed bill id -> 400');

  // --- Slip upload ---
  let r = await post(`/groups/${ids.C}/bills/${bills.rice}/slip`, { image_base64: SLIP });
  assert(r.status === 200 && r.body.slip_status === 'pending' && typeof r.body.slip_url === 'string', `Cee sends a slip (got ${r.status} ${JSON.stringify(r.body)})`);
  const { data: share } = await db.from('group_expense_shares').select('slip_path, slip_status, paid_at').eq('expense_id', bills.rice).eq('line_user_id', ids.C).single();
  assert(share.slip_status === 'pending' && share.slip_path.startsWith(`${ids.C}/`) && share.paid_at === null, 'slip stored under the payer\'s folder, share still unpaid');
  b = await get(`/groups/${ids.A}/bills/${bills.rice}`);
  const ceeRow = b.body.bill.shares.find((s) => s.name === 'Cee');
  assert(ceeRow.status === 'slip_pending' && ceeRow.slip_url && ceeRow.slip_url.includes('payment-slips'), 'the owner sees the pending slip with a signed link');
  const boView = (await get(`/groups/${ids.B}/bills/${bills.rice}`)).body.bill.shares.find((s) => s.name === 'Cee');
  assert(boView.slip_url === null && boView.slip_status === null && boView.status === 'slip_pending', 'other members see "slip sent" but not the slip');
  assert((await post(`/groups/${ids.B}/bills/${bills.rice}/slip`, { image_base64: SLIP })).status === 409, 'Bo (already paid) can\'t send a slip');
  assert((await post(`/groups/${ids.C}/bills/${bills.rice}/slip`, { image_base64: 'bm90IGFuIGltYWdl' })).status === 400, 'a non-image is refused');
  assert((await post(`/groups/${ids.C}/bills/${bills.rice}/slip`, {})).status === 400, 'missing image -> 400');

  // --- Owner actions: only the owner ---
  assert((await post(`/groups/${ids.B}/bills/${bills.rice}/shares/${ids.C}/confirm`)).status === 403, 'only the owner can confirm');
  assert((await post(`/groups/${ids.A}/bills/${bills.rice}/shares/${ids.B}/confirm`)).status === 409, 'confirming an already-paid share -> 409');
  assert((await post(`/groups/${ids.A}/bills/${bills.rice}/shares/bad id/confirm`)).status === 400, 'malformed member id -> 400');

  // Reject, then send again, then confirm.
  r = await post(`/groups/${ids.A}/bills/${bills.rice}/shares/${ids.C}/reject`);
  assert(r.status === 200, 'owner rejects the slip');
  const { data: rejected } = await db.from('group_expense_shares').select('slip_path, slip_status').eq('expense_id', bills.rice).eq('line_user_id', ids.C).single();
  assert(rejected.slip_status === 'rejected' && rejected.slip_path === null, 'rejected: slip removed');
  assert((await post(`/groups/${ids.A}/bills/${bills.rice}/shares/${ids.C}/reject`)).status === 409, 'nothing left to reject -> 409');
  await post(`/groups/${ids.C}/bills/${bills.rice}/slip`, { image_base64: SLIP });
  r = await post(`/groups/${ids.A}/bills/${bills.rice}/shares/${ids.C}/confirm`);
  assert(r.status === 200 && r.body.method === 'slip' && r.body.position === 2 && r.body.fully_paid === true, `confirm: paid 2nd, bill fully paid (got ${JSON.stringify(r.body)})`);
  const { data: riceRow } = await db.from('group_expenses').select('status, closed_at').eq('id', bills.rice).single();
  assert(riceRow.status === 'paid' && riceRow.closed_at, 'the bill closes as paid');
  assert((await post(`/groups/${ids.A}/bills/${bills.rice}/cancel`)).status === 409, 'a paid bill can\'t be cancelled');

  // Mark paid without a slip (taxi: Cee marks Bo).
  r = await post(`/groups/${ids.C}/bills/${bills.taxi}/shares/${ids.B}/confirm`);
  assert(r.status === 200 && r.body.method === 'marked' && r.body.fully_paid, 'owner marks a member paid by hand');
  const { data: taxiShare } = await db.from('group_expense_shares').select('paid_method').eq('expense_id', bills.taxi).eq('line_user_id', ids.B).single();
  assert(taxiShare.paid_method === 'marked', 'recorded as "marked"');

  // --- Cancel ---
  const { data: extra } = await db.from('group_expenses').insert({ group_id: G, kind: 'expense', payer_line_user_id: ids.B, amount: 50, description: 'น้ำ' }).select().single();
  await db.from('group_expense_shares').insert([{ expense_id: extra.id, line_user_id: ids.B, share: 25, paid_at: new Date().toISOString(), paid_method: 'owner' }, { expense_id: extra.id, line_user_id: ids.A, share: 25 }]);
  assert((await post(`/groups/${ids.A}/bills/${extra.id}/cancel`)).status === 403, 'only the owner can cancel');
  assert((await post(`/groups/${ids.B}/bills/${extra.id}/cancel`)).status === 200, 'owner cancels');
  assert((await db.from('group_expenses').select('status').eq('id', extra.id).single()).data.status === 'cancelled', 'status cancelled');
  assert((await post(`/groups/${ids.A}/bills/${extra.id}/slip`, { image_base64: SLIP })).status === 409, 'no slips on a cancelled bill');
  const after = (await get(`/groups/${ids.A}/${G}`)).body;
  assert(after.open_bills.length === 0 && after.closed_bills.length === 4 && after.my_owed === 0, 'after everything: nothing open, 4 closed');

  // --- Payment details ---
  const T = ids.B;
  r = await call('PUT', `/users/${T}/payment-details`, { promptpay_id: '081-111-2222', bank_name: 'Test Bank', bank_account_no: '123-4-56789-0', bank_account_name: 'Bo Example' });
  assert(r.status === 200 && r.body.payment_details.promptpay_id === '0811112222' && r.body.payment_details.bank_account_no === '1234567890', 'saved, normalized to digits');
  assert((await call('PUT', `/users/${T}/payment-details`, { promptpay_id: '12345' })).status === 400, 'a bad PromptPay ID -> 400');
  assert((await call('PUT', `/users/${T}/payment-details`, { bank_account_no: '12ab' })).status === 400, 'a bad account number -> 400');
  assert((await call('PUT', `/users/${T}/payment-details`, {})).status === 400, 'empty body -> 400');
  r = await call('PUT', `/users/${T}/payment-details`, { promptpay_id: '', bank_account_no: null });
  assert(r.status === 200 && r.body.payment_details.promptpay_id === null && r.body.payment_details.bank_account_no === null && r.body.payment_details.bank_name === 'Test Bank', 'clearing fields leaves the others');

  // --- Access ---
  assert((await get(`/groups/${ids.C}/${R}`)).status === 404, 'a group you are not in -> 404');
  assert((await get(`/groups/${ids.A}/not-a-group`)).status === 400, 'a malformed group id -> 400');
  await db.from('line_group_members').update({ left_at: new Date().toISOString() }).eq('group_id', G).eq('line_user_id', ids.C);
  const left = (await get(`/groups/${ids.C}`)).body.groups[0];
  assert(left.i_left && left.member_count === 2, 'after leaving: still listed, i_left, member count drops');
  assert((await get(`/groups/${ids.C}/bills/${bills.taxi}`)).status === 200, 'a former member can still open the group\'s bills');

  await seed.cleanup();
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error(e); if (seed) await seed.cleanup(); process.exit(1); });
