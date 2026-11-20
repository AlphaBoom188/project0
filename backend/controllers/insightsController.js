// Repeat-payment suggestions (migration 024) and the monthly report.
const supabase = require('../config/supabase');
const { detectRecurring } = require('../services/recurringDetect');
const { loadReport } = require('../services/monthlyReport');
const reminderStore = require('../services/reminderStore');
const { getBangkokYmd } = require('../services/bangkokDay');

async function candidatesFor(lineUserId) {
  const today = getBangkokYmd();
  const since = new Date(Date.now() - 200 * 86400000).toISOString();
  const [tx, rules, user] = await Promise.all([
    supabase.from('transactions').select('id, type, amount, description, category_id, transaction_date, categories ( name )')
      .eq('line_user_id', lineUserId).in('type', ['income', 'expense']).gte('transaction_date', since).limit(10000),
    supabase.from('recurring_transactions').select('type, description, amount, category_id, is_active').eq('line_user_id', lineUserId),
    supabase.from('users').select('recurring_dismissed').eq('line_user_id', lineUserId).maybeSingle(),
  ]);
  for (const r of [tx, rules, user]) if (r.error) throw r.error;
  const transactions = tx.data.map((t) => ({ id: t.id, type: t.type, amount: Number(t.amount), description: t.description, category_id: t.category_id, category_name: t.categories ? t.categories.name : null, date: getBangkokYmd(new Date(t.transaction_date)) }));
  return { list: detectRecurring({ transactions, rules: rules.data, dismissed: (user.data && user.data.recurring_dismissed) || [], today }), dismissed: (user.data && user.data.recurring_dismissed) || [] };
}

async function addDismissed(lineUserId, dismissed, key) {
  const next = [...new Set([...dismissed, key])].slice(-300);
  const { error } = await supabase.from('users').update({ recurring_dismissed: next }).eq('line_user_id', lineUserId);
  if (error) throw error;
}

const handle = (name, fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    console.error(`Error in ${name}:`, error);
    res.status(500).json({ error: error.message });
  }
};

const insightsController = {
  // GET /api/recurring/:u/suggestions -> repeat payments not set up yet
  recurringSuggestions: handle('recurringSuggestions', async (req, res) => {
    const { list } = await candidatesFor(req.params.line_user_id);
    res.json({ suggestions: list });
  }),

  // POST /api/recurring/:u/suggestions/:key/accept { mode: 'log' | 'remind' }
  //   log: a monthly recurring rule (auto-logged from the next date)
  //   remind: a monthly reminder on that day (nothing is logged)
  // POST /api/recurring/:u/suggestions/:key/dismiss
  recurringSuggestionAction: handle('recurringSuggestionAction', async (req, res) => {
    const { line_user_id: u, key, action } = req.params;
    if (!['accept', 'dismiss'].includes(action)) return res.status(404).json({ error: 'Unknown action' });
    const { list, dismissed } = await candidatesFor(u);
    const c = list.find((x) => x.key === key);
    if (action === 'dismiss') {
      await addDismissed(u, dismissed, key);
      return res.json({ success: true, suggestions: list.filter((x) => x.key !== key) });
    }
    if (!c) return res.status(404).json({ error: 'That suggestion is no longer available' });
    const mode = req.body && req.body.mode === 'remind' ? 'remind' : req.body && req.body.mode === 'log' ? 'log' : null;
    if (!mode) return res.status(400).json({ error: "mode must be 'log' or 'remind'" });
    let created;
    if (mode === 'log') {
      let categoryId = c.categoryId;
      if (!categoryId) {
        const { data: cat } = await supabase.from('categories').select('id').eq('line_user_id', u).eq('type', c.type).in('name', c.type === 'income' ? ['Income'] : ['Others']).limit(1).maybeSingle();
        categoryId = cat && cat.id;
      }
      if (!categoryId) return res.status(400).json({ error: 'Choose a category for it in Recurring rules instead.' });
      const { data, error } = await supabase.from('recurring_transactions').insert({
        line_user_id: u, category_id: categoryId, amount: c.amount, type: c.type, description: c.description,
        frequency: 'monthly', next_run_date: `${c.nextDate}T12:00:00Z`, is_active: true,
      }).select('id, next_run_date').single();
      if (error) throw error;
      created = { recurringId: data.id, nextRunDate: data.next_run_date };
    } else {
      const { reminder, error } = await reminderStore.createReminder(u, {
        title: `${c.type === 'income' ? 'Expect' : 'Pay'} ${c.description}`.slice(0, 200),
        details: `About ฿${c.amount.toLocaleString('en-US')}${c.variable ? ' (it varies)' : ''}, seen ${c.months} months in a row.`,
        remind_at: new Date(`${c.nextDate}T09:00:00+07:00`).toISOString(),
        repeat: 'monthly', category: 'finance', importance: c.type === 'expense' ? 1 : 0,
      });
      if (error) return res.status(400).json({ error });
      created = { reminderId: reminder.id, remindAt: reminder.remind_at };
    }
    await addDismissed(u, dismissed, key);
    res.json({ success: true, mode, created, suggestions: list.filter((x) => x.key !== key) });
  }),

  // GET /api/recurring/:u/overview -> subscriptions and bills: monthly/yearly totals, price rises
  subscriptionsOverview: handle('subscriptionsOverview', async (req, res) => {
    const u = req.params.line_user_id;
    const { overview } = require('../services/subscriptions');
    const since = new Date(Date.now() - 100 * 86400000).toISOString();
    const [rules, tx] = await Promise.all([
      supabase.from('recurring_transactions').select('id, description, amount, frequency, type, is_active, categories ( name )').eq('line_user_id', u),
      supabase.from('transactions').select('description, amount, transaction_date').eq('line_user_id', u).eq('type', 'expense').gte('transaction_date', since).limit(5000),
    ]);
    for (const r of [rules, tx]) if (r.error) throw r.error;
    res.json(overview(rules.data, tx.data.map((t) => ({ description: t.description, amount: Number(t.amount), date: getBangkokYmd(new Date(t.transaction_date)) }))));
  }),

  // GET /api/reports/:u/monthly?offset=-1 (-24..0; -1 = the last complete billing cycle)
  monthlyReport: handle('monthlyReport', async (req, res) => {
    const offset = req.query.offset === undefined ? -1 : Number(req.query.offset);
    if (!Number.isInteger(offset) || offset < -24 || offset > 0) return res.status(400).json({ error: 'offset must be a whole number from -24 to 0' });
    res.json({ report: await loadReport(req.params.line_user_id, { offset }) });
  }),
};

module.exports = insightsController;
