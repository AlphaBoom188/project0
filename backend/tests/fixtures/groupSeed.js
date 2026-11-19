// Seeds a LINE group split-tracker scenario straight into the migration-016
// tables (no webhook, no personal-ledger copies) for the read-only group
// endpoints and the LIFF Groups card.
//
// "Test Trip": Ann paid ข้าว 600 (Ann/Bo/Cee), Cee paid taxi 90 (Cee/Bo),
// Bo paid Ann back 100. Nets: Ann +300, Bo -145, Cee -155.
// Plan: Cee pays Ann 155, Bo pays Ann 145.
// A second, settled group "Quiet Room" (a room with no name) has Ann and Bo.
const crypto = require('crypto');

const hex = () => crypto.randomBytes(16).toString('hex');

async function seedGroups(db, { prefix = 'test_grp' } = {}) {
  const ids = { A: `${prefix}_ann_${hex().slice(0, 8)}`, B: `${prefix}_bo_${hex().slice(0, 8)}`, C: `${prefix}_cee_${hex().slice(0, 8)}` };
  const G = `C${hex()}`;
  const R = `R${hex()}`;
  const names = { [ids.A]: 'Ann', [ids.B]: 'Bo', [ids.C]: 'Cee' };
  for (const id of Object.values(ids)) {
    const { error } = await db.from('users').insert({ line_user_id: id, display_name: names[id] });
    if (error) throw error;
  }
  await db.from('line_groups').insert([{ group_id: G, source_type: 'group', name: 'Test Trip' }, { group_id: R, source_type: 'room', name: null }]);
  await db.from('line_group_members').insert([
    ...Object.values(ids).map((id) => ({ group_id: G, line_user_id: id, display_name: names[id] })),
    { group_id: R, line_user_id: ids.A, display_name: 'Ann' },
    { group_id: R, line_user_id: ids.B, display_name: 'Bo' },
  ]);
  const at = (minutesAgo) => new Date(Date.now() - minutesAgo * 60000).toISOString();
  const entry = async (groupId, kind, payer, amount, description, shares, createdAt) => {
    const { data, error } = await db.from('group_expenses').insert({ group_id: groupId, kind, payer_line_user_id: payer, amount, description, created_at: createdAt }).select().single();
    if (error) throw error;
    const { error: e2 } = await db.from('group_expense_shares').insert(shares.map(([id, share]) => ({ expense_id: data.id, line_user_id: id, share })));
    if (e2) throw e2;
  };
  await entry(G, 'expense', ids.A, 600, 'ข้าว', [[ids.A, 200], [ids.B, 200], [ids.C, 200]], at(30));
  await entry(G, 'expense', ids.C, 90, 'taxi', [[ids.C, 45], [ids.B, 45]], at(20));
  await entry(G, 'settlement', ids.B, 100, null, [[ids.A, 100]], at(10));
  await entry(R, 'expense', ids.A, 40, 'กาแฟ', [[ids.A, 20], [ids.B, 20]], at(120));
  await entry(R, 'settlement', ids.B, 20, null, [[ids.A, 20]], at(110));

  const cleanup = async () => {
    await db.from('line_groups').delete().in('group_id', [G, R]);
    for (const id of Object.values(ids)) {
      await db.from('transactions').delete().eq('line_user_id', id);
      await db.from('categories').delete().eq('line_user_id', id);
      await db.from('users').delete().eq('line_user_id', id);
    }
  };
  return { ids, G, R, cleanup };
}

module.exports = { seedGroups };
