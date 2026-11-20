// Savings goals (migration 025): CRUD, "add money" for manual goals, and an
// optional monthly "put aside ฿X" reminder (reminders, migration 020).
const supabase = require('../config/supabase');
const { goalStatus, validateGoal } = require('../services/savingsGoals');
const reminderStore = require('../services/reminderStore');
const { getBangkokYmd } = require('../services/bangkokDay');

const COLS = 'id, name, target_amount, target_date, account_id, saved_amount, reminder_id, achieved_at, created_at';
const bad = (res, error) => res.status(400).json({ error });
const handle = (name, fn) => async (req, res) => {
  try { await fn(req, res); } catch (error) {
    console.error(`Error in ${name}:`, error);
    res.status(500).json({ error: error.message });
  }
};

async function withStatus(lineUserId, goals) {
  const ids = [...new Set(goals.map((g) => g.account_id).filter(Boolean))];
  const balances = new Map();
  if (ids.length) {
    const { data, error } = await supabase.from('accounts').select('id, account_name, balance').eq('line_user_id', lineUserId).in('id', ids);
    if (error) throw error;
    data.forEach((a) => balances.set(a.id, a));
  }
  const today = getBangkokYmd();
  return goals.map((g) => {
    const acc = balances.get(g.account_id);
    return { ...g, target_amount: Number(g.target_amount), saved_amount: Number(g.saved_amount), account_name: acc ? acc.account_name : null, status: goalStatus(g, { today, accountBalance: acc ? acc.balance : null }) };
  });
}

async function listAll(lineUserId) {
  const { data, error } = await supabase.from('savings_goals').select(COLS).eq('line_user_id', lineUserId).order('created_at');
  if (error) throw error;
  return withStatus(lineUserId, data);
}

async function checkAccount(lineUserId, accountId) {
  if (!accountId) return true;
  const { data } = await supabase.from('accounts').select('id').eq('id', accountId).eq('line_user_id', lineUserId).maybeSingle();
  return !!data;
}

// Creates, moves or removes the goal's monthly reminder. remindDay 1-28 or null.
async function syncReminder(lineUserId, goal, remindDay) {
  const [g] = await withStatus(lineUserId, [goal]);
  if (goal.reminder_id) {
    const r = await reminderStore.getReminder(goal.reminder_id);
    if (r && r.line_user_id === lineUserId) await reminderStore.deleteReminder(r.id);
  }
  if (!remindDay || g.status.achieved || !g.status.perMonth) return null;
  const today = getBangkokYmd();
  const [y, m, d] = today.split('-').map(Number);
  const first = remindDay > d ? `${y}-${String(m).padStart(2, '0')}-${String(remindDay).padStart(2, '0')}` : new Date(Date.UTC(y, m, remindDay)).toISOString().slice(0, 10);
  const { reminder, error } = await reminderStore.createReminder(lineUserId, {
    title: `Put aside ฿${Math.ceil(g.status.perMonth).toLocaleString('en-US')} for ${goal.name}`.slice(0, 200),
    details: `Savings goal: ฿${g.status.saved.toLocaleString('en-US')} of ฿${Number(goal.target_amount).toLocaleString('en-US')}${goal.target_date ? ` by ${goal.target_date}` : ''}.`,
    remind_at: new Date(`${first}T09:00:00+07:00`).toISOString(),
    repeat: 'monthly', category: 'finance',
  });
  if (error) throw new Error(error);
  return reminder.id;
}

async function save(lineUserId, id, fields) {
  const { data, error } = await supabase.from('savings_goals').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id).eq('line_user_id', lineUserId).select(COLS).maybeSingle();
  if (error) throw error;
  return data;
}

module.exports = {
  // GET /api/goals/:u
  list: handle('listGoals', async (req, res) => res.json({ goals: await listAll(req.params.line_user_id) })),

  // POST /api/goals/:u { name, target_amount, target_date?, account_id?, saved_amount?, remind_day? (1-28) }
  create: handle('createGoal', async (req, res) => {
    const u = req.params.line_user_id;
    const { value, error } = validateGoal(req.body || {});
    if (error) return bad(res, error);
    if (!(await checkAccount(u, value.account_id))) return bad(res, 'Account not found');
    const { count } = await supabase.from('savings_goals').select('id', { count: 'exact', head: true }).eq('line_user_id', u);
    if (count >= 20) return bad(res, 'Up to 20 goals');
    const { data, error: dbError } = await supabase.from('savings_goals').insert({ line_user_id: u, ...value }).select(COLS).single();
    if (dbError) throw dbError;
    const day = Number(req.body.remind_day);
    if (Number.isInteger(day) && day >= 1 && day <= 28) await save(u, data.id, { reminder_id: await syncReminder(u, data, day) });
    res.status(201).json({ success: true, goals: await listAll(u) });
  }),

  // PUT /api/goals/:u/:goal_id (same fields; remind_day null removes the reminder)
  update: handle('updateGoal', async (req, res) => {
    const u = req.params.line_user_id;
    const { value, error } = validateGoal(req.body || {}, { partial: true });
    if (error) return bad(res, error);
    if (value.account_id && !(await checkAccount(u, value.account_id))) return bad(res, 'Account not found');
    const goal = await save(u, req.params.goal_id, value);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    if (req.body.remind_day !== undefined) {
      const day = Number(req.body.remind_day);
      await save(u, goal.id, { reminder_id: await syncReminder(u, goal, Number.isInteger(day) && day >= 1 && day <= 28 ? day : null) });
    }
    res.json({ success: true, goals: await listAll(u) });
  }),

  // POST /api/goals/:u/:goal_id/add { amount } (manual goals; negative takes money out)
  addMoney: handle('addToGoal', async (req, res) => {
    const u = req.params.line_user_id;
    const amount = Number(req.body && req.body.amount);
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1e9) return bad(res, 'Enter an amount');
    const { data: goal } = await supabase.from('savings_goals').select(COLS).eq('id', req.params.goal_id).eq('line_user_id', u).maybeSingle();
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    if (goal.account_id) return bad(res, "This goal follows an account's balance: add money to the account instead");
    const saved = Math.max(0, Math.round((Number(goal.saved_amount) + amount) * 100) / 100);
    const achieved = saved >= Number(goal.target_amount);
    await save(u, goal.id, { saved_amount: saved, achieved_at: achieved ? goal.achieved_at || new Date().toISOString() : null });
    res.json({ success: true, achieved, goals: await listAll(u) });
  }),

  // DELETE /api/goals/:u/:goal_id (also removes its reminder)
  remove: handle('deleteGoal', async (req, res) => {
    const u = req.params.line_user_id;
    const { data: goal } = await supabase.from('savings_goals').select('id, reminder_id').eq('id', req.params.goal_id).eq('line_user_id', u).maybeSingle();
    if (goal) {
      await supabase.from('savings_goals').delete().eq('id', goal.id).eq('line_user_id', u);
      if (goal.reminder_id) {
        const r = await reminderStore.getReminder(goal.reminder_id);
        if (r && r.line_user_id === u) await reminderStore.deleteReminder(r.id);
      }
    }
    res.json({ success: true, goals: await listAll(u) });
  }),
};
