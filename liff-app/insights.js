// Repeat payments found in transactions (Budgets tab) and the monthly
// report (Home card + sheet). Loaded after app.js, tasks.js and tax.js and
// shares their globals. Backend: /api/recurring/:u/suggestions,
// /api/reports/:u/monthly (services/recurringDetect.js, services/monthlyReport.js).

const ins = {
  repeatHeader: document.getElementById('repeat-header'),
  repeatHint: document.getElementById('repeat-hint'),
  repeatList: document.getElementById('repeat-list'),
  repeatStatus: document.getElementById('repeat-status'),
  homeCard: document.getElementById('home-report-card'),
  homeTitle: document.getElementById('home-report-title'),
  homeMeta: document.getElementById('home-report-meta'),
  modal: document.getElementById('report-modal'),
  title: document.getElementById('report-title'),
  prev: document.getElementById('report-prev'),
  next: document.getElementById('report-next'),
  status: document.getElementById('report-status'),
  body: document.getElementById('report-body'),
  close: document.getElementById('close-report'),
};
const insState = { offset: -1, seq: 0, repeatSeq: 0 };
const whole = (n) => `฿${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

// ---- Repeat payments ----
async function loadRepeatPayments() {
  const seq = ++insState.repeatSeq;
  try {
    const { suggestions } = await cachedGet(`/recurring/${lineUserId}/suggestions`);
    if (seq !== insState.repeatSeq) return;
    renderRepeatPayments(suggestions);
  } catch (error) {
    if (seq !== insState.repeatSeq) return;
    setAiStatus(ins.repeatStatus, 'error', plainError(error));
  }
}

function renderRepeatPayments(list) {
  const any = list.length > 0;
  ins.repeatHeader.hidden = !any;
  ins.repeatHint.hidden = !any;
  ins.repeatList.hidden = !any;
  ins.repeatList.innerHTML = list.map((c) => {
    const d = c.dayOfMonth;
    const day = `${d}${d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th'}`;
    return `<li class="tax-sg" data-repeat="${c.key}">
      <div class="tax-sg-top"><span class="tax-sg-title">${escapeHtml(c.description)}</span><span class="tax-sg-amount">${c.variable ? 'about ' : ''}${whole(c.amount)}</span></div>
      <div class="tax-sg-tags"><span class="tax-sg-tag${c.confidence === 'high' ? '' : ' conf-low'}">${c.confidence === 'high' ? 'Every month' : 'Most months'}</span><span class="tax-sg-tag">${c.type === 'income' ? 'Income' : 'Payment'} around the ${day}</span>${c.categoryName ? `<span class="tax-sg-tag">${escapeHtml(c.categoryName)}</span>` : ''}</div>
      <p class="tax-sg-reason">Seen ${c.months} months in a row, last on ${escapeHtml(c.lastDate)}. Next expected ${escapeHtml(c.nextDate)}.</p>
      <div class="tax-sg-actions">
        <button type="button" class="secondary-button tax-sg-btn" data-repeat-action="dismiss">Dismiss</button>
        <button type="button" class="secondary-button tax-sg-btn" data-repeat-action="remind">Remind me monthly</button>
        <button type="button" class="primary-button tax-sg-btn" data-repeat-action="log">Log automatically</button>
      </div>
    </li>`;
  }).join('');
}

async function handleRepeatAction(event) {
  const b = event.target.closest('[data-repeat-action]');
  if (!b) return;
  const card = b.closest('[data-repeat]');
  const action = b.dataset.repeatAction;
  card.querySelectorAll('button').forEach((x) => { x.disabled = true; });
  try {
    const path = `/recurring/${lineUserId}/suggestions/${card.dataset.repeat}/${action === 'dismiss' ? 'dismiss' : 'accept'}`;
    const res = await apiRequest(path, { method: 'POST', body: JSON.stringify(action === 'dismiss' ? {} : { mode: action }) });
    renderRepeatPayments(res.suggestions);
    setAiStatus(ins.repeatStatus, 'done', action === 'log' ? 'Added to your recurring rules: it logs itself each month.' : action === 'remind' ? 'Monthly reminder set: you\'ll find it under Tasks.' : 'Dismissed.');
    if (action === 'log' && typeof loadBudgetsTab === 'function') loadBudgetsTab().catch(() => {});
  } catch (error) {
    card.querySelectorAll('button').forEach((x) => { x.disabled = false; });
    setAiStatus(ins.repeatStatus, 'error', plainError(error));
  }
}

// ---- Monthly report ----
async function renderHomeReportCard() {
  try {
    const { report } = await cachedGet(`/reports/${lineUserId}/monthly?offset=-1`);
    ins.homeCard.hidden = report.count === 0;
    if (!report.count) return;
    ins.homeTitle.textContent = `Last period: ${report.label}`;
    const bits = [`Spent ${whole(report.expense)}`];
    if (report.expenseChangePct != null) bits.push(`${report.expenseChangePct >= 0 ? 'up' : 'down'} ${Math.abs(report.expenseChangePct)}%`);
    if (report.savingsRate != null) bits.push(`saved ${report.savingsRate}%`);
    if (report.overBudget.length) bits.push(`over budget: ${report.overBudget.length}`);
    ins.homeMeta.textContent = bits.join(' · ');
  } catch {
    ins.homeCard.hidden = true; // the card is extra: never block Home
  }
}

async function openReport(offset = insState.offset) {
  insState.offset = offset;
  const seq = ++insState.seq;
  ins.modal.hidden = false;
  ins.next.disabled = offset >= 0;
  ins.prev.disabled = offset <= -24;
  ins.body.innerHTML = '';
  setAiStatus(ins.status, 'working', 'Loading…');
  try {
    const { report: r } = await cachedGet(`/reports/${lineUserId}/monthly?offset=${offset}`);
    if (seq !== insState.seq) return;
    hideAiStatus(ins.status);
    ins.title.textContent = `${r.label}${offset === 0 ? ' (so far)' : ''}`;
    if (!r.count) { ins.body.innerHTML = '<p class="empty-state">Nothing was logged in this period.</p>'; return; }
    const line = (label, value, cls = '') => `<div class="tax-line ${cls}"><span>${escapeHtml(label)}</span><span>${value}</span></div>`;
    const change = (c) => (c.change >= 0 ? `+${whole(c.change)}` : `-${whole(-c.change)}`);
    ins.body.innerHTML = `
      <div class="tax-breakdown report-totals">
        ${line('Income', whole(r.income))}
        ${line('Spent', whole(r.expense))}
        ${line(r.net >= 0 ? 'Saved' : 'Overspent', `${whole(Math.abs(r.net))}${r.savingsRate != null ? ` (${r.savingsRate}%)` : ''}`, 'is-total')}
        ${r.expenseChangePct != null ? `<p class="tax-rates">Spending ${r.expenseChangePct >= 0 ? 'up' : 'down'} ${Math.abs(r.expenseChangePct)}% on the period before (${whole(r.prev.expense)}).</p>` : ''}
      </div>
      <h3 class="tax-group-title report-sub">Where it went</h3>
      <ul class="task-list report-cats">${r.categories.map((c) => `<li class="task-row">
        <span class="task-main"><span class="task-title">${escapeHtml(c.name)}</span>
          <span class="task-meta"><span>${c.budget != null ? `${c.pct}% of ${whole(c.budget)} budget` : 'No budget'}${c.prev ? ` · was ${whole(c.prev)}` : ''}</span></span>
          ${c.budget != null ? `<span class="tax-bar${c.pct > 100 ? ' is-over' : ''}" aria-hidden="true"><span style="width:${Math.min(100, c.pct)}%"></span></span>` : ''}
        </span>
        <span class="tax-amount">${whole(c.spent)}</span></li>`).join('')}</ul>
      ${r.changes.length ? `<h3 class="tax-group-title report-sub">Biggest changes</h3><ul class="task-list">${r.changes.map((c) => `<li class="task-row"><span class="task-main"><span class="task-title">${escapeHtml(c.name)}</span><span class="task-meta"><span>${whole(c.prev)} → ${whole(c.spent)}</span></span></span><span class="tax-amount">${change(c)}</span></li>`).join('')}</ul>` : ''}
      ${r.biggest.length ? `<h3 class="tax-group-title report-sub">Largest expenses</h3><ul class="task-list">${r.biggest.map((t) => `<li class="task-row"><span class="task-main"><span class="task-title">${escapeHtml(t.description)}</span><span class="task-meta"><span>${escapeHtml([t.date, t.category].filter(Boolean).join(' · '))}</span></span></span><span class="tax-amount">${whole(t.amount)}</span></li>`).join('')}</ul>` : ''}`;
  } catch (error) {
    if (seq !== insState.seq) return;
    setAiStatus(ins.status, 'error', plainError(error));
  }
}

// ---- Wiring: hook into the Home and Budgets loaders ----
const baseLoadHome = TAB_LOADERS.home;
TAB_LOADERS.home = async () => { await baseLoadHome(); renderHomeReportCard(); };
const baseLoadBudgets = TAB_LOADERS.budgets;
TAB_LOADERS.budgets = async () => { await baseLoadBudgets(); loadRepeatPayments(); };
ins.repeatList.addEventListener('click', handleRepeatAction);
ins.homeCard.addEventListener('click', () => openReport(-1));
ins.prev.addEventListener('click', () => openReport(insState.offset - 1));
ins.next.addEventListener('click', () => openReport(insState.offset + 1));
ins.close.addEventListener('click', () => { ins.modal.hidden = true; insState.seq += 1; });
