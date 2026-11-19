// Seeds a LINE group-bills scenario straight into the migration 016 + 019
// tables (no webhook, no personal-ledger copies) for the group endpoints and
// the LIFF Groups card / bill sheet. Synthetic data only.
//
// "Test Trip" (group G; Ann, Bo, Cee):
//   rice   ข้าว 600 paid by Ann, 200 each. Bo paid (confirmed); Cee unpaid.  -> open
//   taxi   90 paid by Cee, 45 each (Cee, Bo). Bo unpaid.                     -> open
//   cake   เค้ก 300 paid by Bo, 100 each. Ann paid 1st, Cee 2nd.             -> paid
// "Quiet Room" (room R, no name; Ann, Bo):
//   coffee กาแฟ 40 paid by Ann, Bo paid.                                     -> paid
// Ann has PromptPay 0812345678 and a (made-up) bank account.
// Totals: Ann owes 0 / is owed 200; Bo owes 45; Cee owes 200 / is owed 45.
const crypto = require('crypto');

const hex = () => crypto.randomBytes(16).toString('hex');

async function seedGroups(db, { prefix = 'test_grp' } = {}) {
  const ids = { A: `${prefix}_ann_${hex().slice(0, 8)}`, B: `${prefix}_bo_${hex().slice(0, 8)}`, C: `${prefix}_cee_${hex().slice(0, 8)}` };
  const G = `C${hex()}`;
  const R = `R${hex()}`;
  const names = { [ids.A]: 'Ann', [ids.B]: 'Bo', [ids.C]: 'Cee' };
  for (const id of Object.values(ids)) {
    const extra = id === ids.A ? { promptpay_id: '0812345678', bank_name: 'Test Bank', bank_account_no: '1234567890', bank_account_name: 'Ann Example' } : {};
    const { error } = await db.from('users').insert({ line_user_id: id, display_name: names[id], ...extra });
    if (error) throw error;
  }
  await db.from('line_groups').insert([{ group_id: G, source_type: 'group', name: 'Test Trip' }, { group_id: R, source_type: 'room', name: null }]);
  await db.from('line_group_members').insert([
    ...Object.values(ids).map((id) => ({ group_id: G, line_user_id: id, display_name: names[id] })),
    { group_id: R, line_user_id: ids.A, display_name: 'Ann' },
    { group_id: R, line_user_id: ids.B, display_name: 'Bo' },
  ]);
  const at = (minutesAgo) => new Date(Date.now() - minutesAgo * 60000).toISOString();
  // shares: [id, share, paidMinutesAgo | null]
  const bill = async (groupId, payer, amount, description, shares, createdAgo, status = 'open') => {
    const { data, error } = await db.from('group_expenses').insert({
      group_id: groupId, kind: 'expense', payer_line_user_id: payer, amount, description, created_at: at(createdAgo), status,
      closed_at: status === 'open' ? null : at(createdAgo - 5),
    }).select().single();
    if (error) throw error;
    const { error: e2 } = await db.from('group_expense_shares').insert(shares.map(([id, share, paidAgo]) => ({
      expense_id: data.id, line_user_id: id, share,
      ...(id === payer ? { paid_at: at(createdAgo), paid_method: 'owner' } : paidAgo != null ? { paid_at: at(paidAgo), paid_method: 'slip', slip_status: 'confirmed' } : {}),
    })));
    if (e2) throw e2;
    return data.id;
  };
  const bills = {};
  bills.cake = await bill(G, ids.B, 300, 'เค้ก', [[ids.B, 100], [ids.A, 100, 50], [ids.C, 100, 45]], 60, 'paid');
  bills.rice = await bill(G, ids.A, 600, 'ข้าว', [[ids.A, 200], [ids.B, 200, 25], [ids.C, 200, null]], 30);
  bills.taxi = await bill(G, ids.C, 90, 'taxi', [[ids.C, 45], [ids.B, 45, null]], 20);
  bills.coffee = await bill(R, ids.A, 40, 'กาแฟ', [[ids.A, 20], [ids.B, 20, 100]], 120, 'paid');

  const cleanup = async () => {
    const { data: slips } = await db.from('group_expense_shares').select('slip_path').in('expense_id', Object.values(bills)).not('slip_path', 'is', null);
    if (slips && slips.length) await db.storage.from('payment-slips').remove(slips.map((s) => s.slip_path));
    await db.from('line_groups').delete().in('group_id', [G, R]);
    for (const id of Object.values(ids)) {
      await db.from('transactions').delete().eq('line_user_id', id);
      await db.from('categories').delete().eq('line_user_id', id);
      await db.from('users').delete().eq('line_user_id', id);
    }
  };
  return { ids, G, R, bills, cleanup };
}

module.exports = { seedGroups };
