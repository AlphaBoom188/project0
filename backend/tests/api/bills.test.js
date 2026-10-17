const { BASE, BACKEND, FIXTURES, OUTPUT } = require('../lib');
const { createClient } = require('@supabase/supabase-js');

const serviceClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function assert(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) process.exitCode = 1;
}

async function api(path, options = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  const lineUserId = 'test_bills_001';
  await api('/users', { method: 'POST', body: JSON.stringify({ line_user_id: lineUserId, display_name: 'Bills Test' }) });

  // --- Equal split: 100 among creator + 2 friends -> 33.34 / 33.33 ---
  const equalRes = await api(`/bills/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Dinner',
      total_amount: 100,
      split_type: 'equal',
      participants: [{ display_name: 'Alice' }, { display_name: 'Bob' }],
    }),
  });
  assert(equalRes.status === 201, `equal split bill created (got ${equalRes.status}: ${JSON.stringify(equalRes.body)})`);
  const equalBillId = equalRes.body.bill?.id;
  const equalAmounts = (equalRes.body.bill?.shared_bill_participants || []).map((p) => Number(p.amount_owed)).sort();
  assert(JSON.stringify(equalAmounts) === JSON.stringify([33.33, 33.34]), `equal split amounts correct (got ${JSON.stringify(equalAmounts)})`);

  // --- Equal split requires at least one participant ---
  const noParticipants = await api(`/bills/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({ title: 'Solo', total_amount: 50, split_type: 'equal', participants: [] }),
  });
  assert(noParticipants.status === 400, `equal split rejects empty participants (got ${noParticipants.status})`);

  // --- Custom split: arbitrary amounts, no sum requirement ---
  const customRes = await api(`/bills/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Movie tickets',
      total_amount: 500,
      split_type: 'custom',
      participants: [{ display_name: 'Charlie', amount_owed: 200 }, { display_name: 'Dana', amount_owed: 0 }],
    }),
  });
  assert(customRes.status === 201, `custom split bill created (got ${customRes.status}: ${JSON.stringify(customRes.body)})`);
  const customAmounts = (customRes.body.bill?.shared_bill_participants || []).map((p) => Number(p.amount_owed));
  assert(JSON.stringify(customAmounts) === JSON.stringify([200, 0]), `custom split amounts pass through unchanged (got ${JSON.stringify(customAmounts)})`);

  // --- Custom split rejects a negative amount ---
  const negativeCustom = await api(`/bills/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Bad',
      total_amount: 50,
      split_type: 'custom',
      participants: [{ display_name: 'Eve', amount_owed: -10 }],
    }),
  });
  assert(negativeCustom.status === 400, `custom split rejects negative amount_owed (got ${negativeCustom.status})`);

  // --- Itemized split: one item assigned, one shared (tax) ---
  const itemizedRes = await api(`/bills/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Lunch',
      total_amount: 69,
      split_type: 'itemized',
      participants: [{ display_name: 'Frank' }, { display_name: 'Grace' }],
      items: [
        { name: 'Pizza', amount: 60, participant_index: 0 },
        { name: 'Tax', amount: 9, participant_index: null },
      ],
    }),
  });
  assert(itemizedRes.status === 201, `itemized split bill created (got ${itemizedRes.status}: ${JSON.stringify(itemizedRes.body)})`);
  const itemizedAmounts = (itemizedRes.body.bill?.shared_bill_participants || []).map((p) => Number(p.amount_owed));
  assert(JSON.stringify(itemizedAmounts) === JSON.stringify([63, 3]), `itemized amounts correct: Frank=63 (pizza+tax share), Grace=3 (tax share only) (got ${JSON.stringify(itemizedAmounts)})`);
  const itemizedBillId = itemizedRes.body.bill.id;

  // --- Itemized split rejects a total_amount that doesn't match the sum of items ---
  const mismatchedItemized = await api(`/bills/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Bad total',
      total_amount: 999,
      split_type: 'itemized',
      participants: [{ display_name: 'Henry' }],
      items: [{ name: 'Soda', amount: 5, participant_index: 0 }],
    }),
  });
  assert(mismatchedItemized.status === 400, `itemized split rejects mismatched total_amount (got ${mismatchedItemized.status})`);

  // --- Itemized split rejects an out-of-range participant_index ---
  const badIndex = await api(`/bills/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Bad index',
      total_amount: 10,
      split_type: 'itemized',
      participants: [{ display_name: 'Ivy' }],
      items: [{ name: 'Thing', amount: 10, participant_index: 5 }],
    }),
  });
  assert(badIndex.status === 400, `itemized split rejects out-of-range participant_index (got ${badIndex.status})`);

  // --- Invalid split_type rejected ---
  const badSplitType = await api(`/bills/${lineUserId}`, {
    method: 'POST',
    body: JSON.stringify({ title: 'Bad type', total_amount: 10, split_type: 'bogus', participants: [{ display_name: 'Jack' }] }),
  });
  assert(badSplitType.status === 400, `invalid split_type rejected (got ${badSplitType.status})`);

  // --- List bills ---
  const listRes = await api(`/bills/${lineUserId}`);
  assert(listRes.status === 200 && listRes.body.bills.length === 3, `list returns all 3 created bills (got ${listRes.body.bills?.length})`);

  // --- Get bill detail (creator-scoped) ---
  const detailRes = await api(`/bills/${lineUserId}/${equalBillId}`);
  assert(detailRes.status === 200 && detailRes.body.bill.title === 'Dinner', `get bill detail works (got ${detailRes.status})`);
  const aliceParticipant = detailRes.body.bill.shared_bill_participants.find((p) => p.display_name === 'Alice');

  // --- Mark a participant paid (creator-scoped) -- bill should NOT be settled yet (Bob still unpaid) ---
  const markPaidRes = await api(`/bills/${lineUserId}/${equalBillId}/participants/${aliceParticipant.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_paid: true }),
  });
  assert(markPaidRes.status === 200 && markPaidRes.body.participant.is_paid === true, `mark participant paid succeeds (got ${markPaidRes.status})`);

  let afterOnePaid = await api(`/bills/${lineUserId}/${equalBillId}`);
  assert(afterOnePaid.body.bill.status === 'active', `bill stays 'active' while one participant still unpaid (got ${afterOnePaid.body.bill.status})`);

  const bobParticipant = afterOnePaid.body.bill.shared_bill_participants.find((p) => p.display_name === 'Bob');
  await api(`/bills/${lineUserId}/${equalBillId}/participants/${bobParticipant.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_paid: true }),
  });
  let afterAllPaid = await api(`/bills/${lineUserId}/${equalBillId}`);
  assert(afterAllPaid.body.bill.status === 'settled', `bill auto-settles once every participant is paid (got ${afterAllPaid.body.bill.status})`);

  // --- Un-marking a payment reopens the bill ---
  await api(`/bills/${lineUserId}/${equalBillId}/participants/${bobParticipant.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_paid: false }),
  });
  let afterReopen = await api(`/bills/${lineUserId}/${equalBillId}`);
  assert(afterReopen.body.bill.status === 'active', `un-marking a payment reopens the bill (got ${afterReopen.body.bill.status})`);

  // --- Public (unauthenticated) bill view ---
  const publicRes = await api(`/bills/public/${itemizedBillId}`);
  assert(publicRes.status === 200 && publicRes.body.bill.title === 'Lunch', `public bill view works without line_user_id (got ${publicRes.status})`);
  assert(publicRes.body.bill.creator_display_name === 'Bills Test', `public view includes creator display_name (got ${publicRes.body.bill.creator_display_name})`);
  const frankParticipant = publicRes.body.bill.participants.find((p) => p.display_name === 'Frank');

  // --- Public self-serve mark-paid ---
  const publicMarkPaid = await api(`/bills/public/${itemizedBillId}/participants/${frankParticipant.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_paid: true }),
  });
  assert(publicMarkPaid.status === 200 && publicMarkPaid.body.participant.is_paid === true, `public mark-paid succeeds (got ${publicMarkPaid.status})`);

  // --- Public endpoint 404s on an unknown bill_id ---
  const publicNotFound = await api(`/bills/public/00000000-0000-0000-0000-000000000000`);
  assert(publicNotFound.status === 404, `public view 404s on unknown bill_id (got ${publicNotFound.status})`);

  // --- Deleting a bill creator doesn't own is a no-op (not found), not someone else's delete ---
  const wrongOwnerDelete = await api(`/bills/some_other_user/${equalBillId}`, { method: 'DELETE' });
  assert(wrongOwnerDelete.status === 200, `delete scoped by line_user_id returns success even when nothing matched (got ${wrongOwnerDelete.status})`);
  const stillThere = await api(`/bills/${lineUserId}/${equalBillId}`);
  assert(stillThere.status === 200, `bill was NOT actually deleted by the wrong-owner request (got ${stillThere.status})`);

  // --- Delete bill (creator-scoped, real) ---
  const deleteRes = await api(`/bills/${lineUserId}/${equalBillId}`, { method: 'DELETE' });
  assert(deleteRes.status === 200, `delete bill succeeds (got ${deleteRes.status})`);
  const afterDelete = await api(`/bills/${lineUserId}/${equalBillId}`);
  assert(afterDelete.status === 500 || afterDelete.status === 404, `deleted bill no longer fetchable (got ${afterDelete.status})`);

  // --- scan-items validation (no image call -- just the 400 path) ---
  const scanNoImage = await api(`/bills/${lineUserId}/scan-items`, { method: 'POST', body: JSON.stringify({}) });
  assert(scanNoImage.status === 400, `scan-items rejects missing image_base64 (got ${scanNoImage.status})`);

  // cleanup
  await serviceClient.from('shared_bills').delete().eq('line_user_id', lineUserId);
  await serviceClient.from('users').delete().eq('line_user_id', lineUserId);
  console.log('\nCleaned up.');
}

main().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
