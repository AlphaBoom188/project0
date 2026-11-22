// CSV import (History tab), savings goals (Wealth tab) and the
// subscriptions & bills overview (Budgets tab). Loaded after app.js,
// tasks.js, tax.js and insights.js; shares their globals.
// Backend: /api/transactions/:u/import-csv(/preview), /api/goals/:u,
// /api/recurring/:u/overview.

const mo = {
  csvButton: document.getElementById('import-csv-button'),
  csvModal: document.getElementById('csv-modal'),
  csvFile: document.getElementById('csv-file'),
  csvStatus: document.getElementById('csv-status'),
  csvReview: document.getElementById('csv-review'),
  csvMapping: document.getElementById('csv-mapping'),
  csvSummary: document.getElementById('csv-summary'),
  csvCategories: document.getElementById('csv-categories'),
  csvCreateRow: document.getElementById('csv-create-row'),
  csvCreate: document.getElementById('csv-create'),
  csvPreview: document.getElementById('csv-preview'),
  csvError: document.getElementById('csv-error'),
  csvCancel: document.getElementById('csv-cancel'),
  csvImport: document.getElementById('csv-import'),
  csvClose: document.getElementById('csv-close'),
  addGoal: document.getElementById('add-goal-button'),
  goalModal: document.getElementById('sgoal-modal'),
  goalTitle: document.getElementById('sgoal-title'),
  goalForm: document.getElementById('sgoal-form'),
  goalName: document.getElementById('sgoal-name'),
  goalTarget: document.getElementById('sgoal-target'),
  goalDate: document.getElementById('sgoal-date'),
  goalAccount: document.getElementById('sgoal-account'),
  goalSavedField: document.getElementById('sgoal-saved-field'),
  goalSaved: document.getElementById('sgoal-saved'),
  goalRemind: document.getElementById('sgoal-remind'),
  goalAddRow: document.getElementById('sgoal-add-row'),
  goalAddAmount: document.getElementById('sgoal-add-amount'),
  goalAdd: document.getElementById('sgoal-add'),
  goalError: document.getElementById('sgoal-error'),
  goalCancel: document.getElementById('sgoal-cancel'),
  goalSave: document.getElementById('sgoal-save'),
  goalDelete: document.getElementById('sgoal-delete'),
  subsHeader: document.getElementById('subs-header'),
  subsList: document.getElementById('subs-list'),
  subsHero: document.getElementById('subs-hero'),
  subsNext: document.getElementById('subs-next'),
  subsDue7: document.getElementById('subs-due7'),
  subsLeft: document.getElementById('subs-left'),
  subsTotal: document.getElementById('subs-total'),
  subsSort: document.getElementById('subs-sort'),
};
const moState = { csvText: null, mapping: null, goals: [], editingGoal: null, goalSeq: 0, subsSeq: 0, subs: null, subsSort: 'due' };
const thb = (n) => `฿${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const moneyInput = (v) => (String(v || '').trim() === '' ? null : Number(String(v).replace(/[,\s฿]/g, '')));

// ---- CSV import ----
const CSV_FIELDS = [
  ['date', 'Date'], ['amount', 'Amount (+ / -)'], ['income', 'Income column'], ['expense', 'Expense column'],
  ['type', 'Type (income/expense)'], ['category', 'Category'], ['description', 'Note'],
];

function openCsvImport() {
  moState.csvText = null;
  moState.mapping = null;
  mo.csvReview.hidden = true;
  mo.csvFile.value = '';
  hideAiStatus(mo.csvStatus);
  clearModalError(mo.csvError);
  mo.csvModal.hidden = false;
}

async function previewCsv() {
  setAiStatus(mo.csvStatus, 'working', 'Reading the file…');
  clearModalError(mo.csvError);
  try {
    const p = await apiRequest(`/transactions/${lineUserId}/import-csv/preview`, { method: 'POST', body: JSON.stringify({ csv: moState.csvText, mapping: moState.mapping }) });
    moState.mapping = p.mapping;
    renderCsvPreview(p);
    if (p.problem) setAiStatus(mo.csvStatus, 'error', `${p.problem}: pick it below.`);
    else setAiStatus(mo.csvStatus, 'done', `${p.toImport} of ${p.total} rows ready to import.`);
  } catch (error) {
    mo.csvReview.hidden = true;
    setAiStatus(mo.csvStatus, 'error', plainError(error));
  }
}

function renderCsvPreview(p) {
  mo.csvReview.hidden = false;
  const opts = (sel) => `<option value="">Not in this file</option>${p.headers.map((h, i) => `<option value="${i}"${sel === i ? ' selected' : ''}>${escapeHtml(h || `Column ${i + 1}`)}</option>`).join('')}`;
  mo.csvMapping.innerHTML = CSV_FIELDS.map(([k, label]) => `<label class="field">${label}<select data-map="${k}">${opts(p.mapping[k])}</select></label>`).join('')
    + `<label class="field">Dates are<select data-map="dateOrder">${[['dmy', 'Day/Month/Year'], ['mdy', 'Month/Day/Year'], ['ymd', 'Year-Month-Day']].map(([v, l]) => `<option value="${v}"${p.mapping.dateOrder === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`
    + `<label class="field">Amounts without a sign are<select data-map="signed">${[['signed', 'Income (minus = expense)'], ['positive-expense', 'Expenses'], ['positive-income', 'Income']].map(([v, l]) => `<option value="${v}"${p.mapping.signed === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
  const ok = !p.problem;
  mo.csvImport.disabled = !ok || !p.toImport;
  mo.csvSummary.hidden = !ok;
  mo.csvPreview.parentElement.hidden = !ok;
  if (!ok) { mo.csvCategories.innerHTML = ''; mo.csvCreateRow.hidden = true; return; }
  const line = (l, v) => `<div class="tax-line"><span>${l}</span><span>${v}</span></div>`;
  mo.csvSummary.innerHTML = line('Rows', p.total) + line('Expenses / income', `${p.expense} / ${p.income}`)
    + (p.duplicates ? line('Already imported', p.duplicates) : '') + (p.errorCount ? line('Skipped (problems)', p.errorCount) : '')
    + `<div class="tax-line is-total"><span>Will import</span><span>${p.toImport}</span></div>`
    + (p.errors.length ? `<p class="tax-rates">${p.errors.slice(0, 3).map((e) => `Line ${e.line}: ${escapeHtml(e.error)}`).join(' · ')}${p.errorCount > 3 ? ' …' : ''}</p>` : '');
  const fresh = p.categories.filter((c) => !c.matched);
  mo.csvCreateRow.hidden = fresh.length === 0;
  mo.csvCategories.innerHTML = p.categories.length
    ? `<h3 class="group-subtitle">Categories</h3><div class="category-chips">${p.categories.map((c) => `<span class="tax-sg-tag${c.matched ? '' : ' conf-low'}">${escapeHtml(c.name)} · ${c.count}${c.matched ? '' : ' · new'}</span>`).join('')}</div>`
    : '';
  mo.csvPreview.innerHTML = `<tr><th>Date</th><th>Type</th><th class="n">Amount</th><th>Category</th><th>Note</th></tr>${p.preview.slice(0, 10).map((r) => (r.error
    ? `<tr class="is-error"><td colspan="5">Line ${r.line}: ${escapeHtml(r.error)}</td></tr>`
    : `<tr><td>${escapeHtml(r.date)}</td><td>${r.type === 'income' ? 'Income' : 'Expense'}</td><td class="n">${thb(r.amount)}</td><td>${escapeHtml(r.category || '')}</td><td>${escapeHtml(r.description || '')}</td></tr>`)).join('')}`;
}

async function importCsv() {
  mo.csvImport.disabled = true;
  setAiStatus(mo.csvStatus, 'working', 'Importing…');
  try {
    const r = await apiRequest(`/transactions/${lineUserId}/import-csv`, { method: 'POST', body: JSON.stringify({ csv: moState.csvText, mapping: moState.mapping, createCategories: !mo.csvCreateRow.hidden && mo.csvCreate.checked }) });
    mo.csvReview.hidden = true;
    setAiStatus(mo.csvStatus, 'done', `Imported ${r.imported} transaction${r.imported === 1 ? '' : 's'}${r.duplicates ? `, ${r.duplicates} already there` : ''}${r.skipped ? `, ${r.skipped} skipped` : ''}${r.createdCategories.length ? `. New categories: ${r.createdCategories.join(', ')}` : ''}.`);
    if (typeof loadTransactionsTab === 'function') loadTransactionsTab().catch(() => {});
  } catch (error) {
    mo.csvImport.disabled = false;
    setAiStatus(mo.csvStatus, 'error', plainError(error));
  }
}

// ---- Savings goals ----
async function loadGoals() {
  const seq = ++moState.goalSeq;
  try {
    const { goals } = await cachedGet(`/goals/${lineUserId}`);
    if (seq !== moState.goalSeq) return;
    moState.goals = goals;
    renderGoals();
  } catch (error) {
    if (seq === moState.goalSeq) showError(plainError(error));
  }
}

// The rows live in Wealth's Goals and income list (app.js renderGoalsIncome).
function renderGoals() {
  renderGoalsIncome();
}

async function openSavingsGoalModal(goal = null) {
  moState.editingGoal = goal;
  clearModalError(mo.goalError);
  mo.goalTitle.textContent = goal ? 'Edit goal' : 'New savings goal';
  try {
    const accounts = (await cachedGet(`/accounts/${lineUserId}`)).accounts || [];
    mo.goalAccount.innerHTML = '<option value="">I\'ll add money here by hand</option>' + accounts.filter((a) => a.account_type !== 'credit_card').map((a) => `<option value="${a.id}">${escapeHtml(a.account_name)} (${thb(a.balance)})</option>`).join('');
  } catch { /* accounts are optional */ }
  mo.goalRemind.innerHTML = (goal && goal.reminder_id ? '<option value="keep">Keep the monthly reminder</option>' : '') + '<option value="">No reminder</option>' + Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}">On the ${i + 1}${[1, 21].includes(i + 1) ? 'st' : [2, 22].includes(i + 1) ? 'nd' : [3, 23].includes(i + 1) ? 'rd' : 'th'} of each month</option>`).join('');
  mo.goalName.value = goal ? goal.name : '';
  mo.goalTarget.value = goal ? goal.target_amount : '';
  mo.goalDate.value = goal && goal.target_date ? goal.target_date : '';
  mo.goalAccount.value = goal && goal.account_id ? goal.account_id : '';
  mo.goalSaved.value = goal && !goal.account_id && goal.saved_amount ? goal.saved_amount : '';
  mo.goalRemind.value = goal && goal.reminder_id ? 'keep' : '';
  syncGoalAccount();
  mo.goalSavedField.hidden = !!goal || !!mo.goalAccount.value;
  mo.goalAddRow.hidden = !goal || !!goal.account_id;
  mo.goalAddAmount.value = '';
  mo.goalDelete.hidden = !goal;
  mo.goalModal.hidden = false;
  if (!goal) setTimeout(() => mo.goalName.focus(), 50);
}

const syncGoalAccount = () => { if (!moState.editingGoal) mo.goalSavedField.hidden = !!mo.goalAccount.value; };

async function saveGoal(event) {
  event.preventDefault();
  clearModalError(mo.goalError);
  const target = moneyInput(mo.goalTarget.value);
  if (!mo.goalName.value.trim()) return showModalError(mo.goalError, 'Give the goal a name.');
  if (!(target > 0)) return showModalError(mo.goalError, 'Enter the target amount.');
  const body = { name: mo.goalName.value.trim(), target_amount: target, target_date: mo.goalDate.value || null, account_id: mo.goalAccount.value || null };
  if (!moState.editingGoal && !body.account_id) body.saved_amount = moneyInput(mo.goalSaved.value) || 0;
  const remind = mo.goalRemind.value;
  if (remind && remind !== 'keep') body.remind_day = Number(remind);
  else if (!remind && moState.editingGoal && moState.editingGoal.reminder_id) body.remind_day = null; // turn it off
  mo.goalSave.disabled = true;
  try {
    const g = moState.editingGoal;
    const res = g ? await apiRequest(`/goals/${lineUserId}/${g.id}`, { method: 'PUT', body: JSON.stringify(body) }) : await apiRequest(`/goals/${lineUserId}`, { method: 'POST', body: JSON.stringify(body) });
    moState.goals = res.goals;
    renderGoals();
    mo.goalModal.hidden = true;
  } catch (error) {
    showModalError(mo.goalError, plainError(error));
  } finally {
    mo.goalSave.disabled = false;
  }
}

async function addToGoal() {
  const amount = moneyInput(mo.goalAddAmount.value);
  if (!amount || !Number.isFinite(amount)) return showModalError(mo.goalError, 'Enter an amount, like 1000 or -500.');
  try {
    const res = await apiRequest(`/goals/${lineUserId}/${moState.editingGoal.id}/add`, { method: 'POST', body: JSON.stringify({ amount }) });
    moState.goals = res.goals;
    renderGoals();
    mo.goalModal.hidden = true;
  } catch (error) {
    showModalError(mo.goalError, plainError(error));
  }
}

async function deleteGoal() {
  const g = moState.editingGoal;
  if (!g || !(await confirmAction(`Delete "${g.name}"?`))) return;
  try {
    const res = await apiRequest(`/goals/${lineUserId}/${g.id}`, { method: 'DELETE' });
    moState.goals = res.goals;
    renderGoals();
    mo.goalModal.hidden = true;
  } catch (error) {
    showModalError(mo.goalError, plainError(error));
  }
}

// ---- Subscriptions & bills ----
// "in 3 days (Fri 27 Nov)" style labels from the API's Bangkok dates.
const SUBS_WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SUBS_MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function subsDate(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`);
  return `${SUBS_WD[d.getUTCDay()]} ${d.getUTCDate()} ${SUBS_MO[d.getUTCMonth()]}`;
}
function subsWhen(days) {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 0) return `Overdue ${-days} ${days === -1 ? 'day' : 'days'}`;
  return `in ${days} days`;
}
const SUBS_FREQ = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };

function subsRow(i) {
  const due = i.status === 'paid'
    ? '<span class="row-sub subs-paid"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Paid</span>'
    : i.next_due ? `<span class="row-sub${i.status === 'overdue' ? ' amount-over' : ''}" data-subs-due>${subsWhen(i.days_until)}</span>` : '';
  const meta = [SUBS_FREQ[i.frequency] || i.frequency];
  const last4 = i.account && String(i.account.masked || '').replace(/\D/g, '').slice(-4);
  if (i.account) meta.push(escapeHtml(last4 ? `${i.account.name} •••${last4}` : i.account.name));
  meta.push(i.auto ? 'Logs automatically' : 'Track only');
  const markPaid = i.pay_window && i.status !== 'paid' ? `<button type="button" class="btn btn-outline btn-sm subs-mark-paid" data-subs-paid="${escapeHtml(i.id)}">Mark paid</button>` : '';
  return `<li class="row subs-row" data-subs-id="${escapeHtml(i.id)}" data-status="${i.status}">${categoryTile(i.category || i.description)}
    <span class="row-main"><span class="row-title">${escapeHtml(i.description)}</span>
      <span class="row-meta">${meta.join(' · ')}</span>
      ${i.increase ? `<span class="row-meta amount-warn">Went up: ${thb(i.increase.from)} to ${thb(i.increase.to)} (${escapeHtml(i.increase.date)})</span>` : ''}
      ${markPaid}</span>
    <span class="row-end"><span class="row-value">${formatBaht(i.next_amount)}</span>${due}</span>
  </li>`;
}

function renderSubscriptions() {
  const o = moState.subs;
  const any = !!(o && o.items.length);
  for (const n of [mo.subsHeader, mo.subsHero, mo.subsSort, mo.subsList]) n.hidden = !any;
  if (!any) return;
  mo.subsNext.textContent = o.next
    ? `${o.next.description} ${formatBaht(o.next.amount)} · ${subsWhen(o.next.days_until).toLowerCase()} (${subsDate(o.next.next_due)})`
    : 'Nothing due';
  mo.subsDue7.textContent = `${formatBaht(o.due_7d.total)} (${o.due_7d.count})`;
  mo.subsLeft.textContent = `${formatBaht(o.left_this_cycle.total)} (${o.left_this_cycle.count})`;
  mo.subsTotal.textContent = `${thb(o.monthlyTotal)} a month · ${thb(o.yearlyTotal)} a year`;
  for (const b of mo.subsSort.querySelectorAll('[data-subs-sort]')) b.setAttribute('aria-pressed', String(b.dataset.subsSort === moState.subsSort));
  const items = moState.subsSort === 'cost' ? [...o.items].sort((a, b) => b.monthly - a.monthly) : o.items; // API order = next due
  mo.subsList.innerHTML = items.map(subsRow).join('');
  if (moState.scrollToSubs) { moState.scrollToSubs = false; mo.subsHeader.scrollIntoView({ block: 'start' }); }
}

async function loadSubscriptions() {
  const seq = ++moState.subsSeq;
  try {
    const o = await cachedGet(`/recurring/${lineUserId}/overview`);
    if (seq !== moState.subsSeq) return;
    moState.subs = o;
    renderSubscriptions();
  } catch {
    if (seq !== moState.subsSeq) return;
    moState.subs = null;
    renderSubscriptions(); // extra information: never block Budgets
  }
}

async function setSubsPaid(id, paid) {
  await apiRequest(`/recurring/${lineUserId}/${id}/paid`, { method: 'PATCH', body: JSON.stringify({ paid }) });
  await loadSubscriptions();
  if (typeof loadRecurringList === 'function') loadRecurringList();
}

async function markSubsPaid(button) {
  const id = button.dataset.subsPaid;
  button.disabled = true;
  try {
    await setSubsPaid(id, true);
    showToast({ title: 'Marked paid', undo: () => setSubsPaid(id, false) });
  } catch (error) {
    button.disabled = false;
    showToast({ title: "Couldn't update the payment", description: plainError(error), kind: 'bad' });
  }
}

// Home: "Next bill: Netflix · in 3 days" (shares the cached overview).
let homeBillSeq = 0;
async function loadHomeBill() {
  const seq = ++homeBillSeq;
  const box = document.getElementById('home-bill');
  try {
    const o = await cachedGet(`/recurring/${lineUserId}/overview`);
    if (seq !== homeBillSeq) return;
    const n = o.next;
    box.hidden = !n;
    if (!n) return;
    document.getElementById('home-bill-title').textContent = `Next bill: ${n.description}`;
    document.getElementById('home-bill-meta').textContent = `${subsWhen(n.days_until)} · ${subsDate(n.next_due)}`;
    document.getElementById('home-bill-meta').classList.toggle('amount-over', n.status === 'overdue');
    document.getElementById('home-bill-amount').textContent = formatBaht(n.amount);
  } catch {
    if (seq === homeBillSeq) box.hidden = true; // extra information: never block Home
  }
}

// ---- Wiring ----
mo.csvButton.addEventListener('click', openCsvImport);
mo.csvFile.addEventListener('change', async () => {
  const file = mo.csvFile.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { setAiStatus(mo.csvStatus, 'error', 'The file is over 5 MB. Split it and import the parts.'); return; }
  moState.csvText = await file.text();
  moState.mapping = null;
  previewCsv();
});
mo.csvMapping.addEventListener('change', (e) => {
  const sel = e.target.closest('[data-map]');
  if (!sel) return;
  const k = sel.dataset.map;
  moState.mapping = { ...moState.mapping, [k]: ['dateOrder', 'signed'].includes(k) ? sel.value : (sel.value === '' ? null : Number(sel.value)) };
  previewCsv();
});
mo.csvImport.addEventListener('click', importCsv);
mo.csvCancel.addEventListener('click', () => { mo.csvModal.hidden = true; });
mo.csvClose.addEventListener('click', () => { mo.csvModal.hidden = true; });
mo.subsSort.addEventListener('click', (e) => {
  const b = e.target.closest('[data-subs-sort]');
  if (!b) return;
  moState.subsSort = b.dataset.subsSort;
  renderSubscriptions();
});
mo.subsList.addEventListener('click', (e) => {
  const b = e.target.closest('[data-subs-paid]');
  if (b) markSubsPaid(b);
});
document.getElementById('home-bill-row').addEventListener('click', () => {
  moState.scrollToSubs = true; // renderSubscriptions scrolls once the list is in
  switchTab('budgets');
});
mo.addGoal.addEventListener('click', openAddGoalChooser);
mo.goalAccount.addEventListener('change', syncGoalAccount);
mo.goalForm.addEventListener('submit', saveGoal);
mo.goalCancel.addEventListener('click', () => { mo.goalModal.hidden = true; });
mo.goalAdd.addEventListener('click', addToGoal);
mo.goalDelete.addEventListener('click', deleteGoal);
const baseLoadNetWorth = TAB_LOADERS.networth;
TAB_LOADERS.networth = async () => { loadGoals(); await baseLoadNetWorth(); };
const baseLoadBudgetsMoney = TAB_LOADERS.budgets;
TAB_LOADERS.budgets = async () => { await baseLoadBudgetsMoney(); loadSubscriptions(); };
