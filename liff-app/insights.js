// Repeat payments found in transactions (Budgets tab) and the monthly
// report (sheet; opened from the report push and chat). Loaded after app.js, tasks.js and tax.js and
// shares their globals. Backend: /api/recurring/:u/suggestions,
// /api/reports/:u/monthly (services/recurringDetect.js, services/monthlyReport.js).

const ins = {
  repeatHeader: document.getElementById('repeat-header'),
  repeatEmpty: document.getElementById('repeat-empty'),
  repeatList: document.getElementById('repeat-list'),
  repeatStatus: document.getElementById('repeat-status'),
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

// Recommendation cards (spec 4.3 item 5, no confidence meter). The choice
// is a single-select list; Accept sends it, Not a repeat dismisses.
// "Track as a subscription only" creates a track-only rule (migration 026):
// listed under Subscriptions & bills, never logged by itself.
let repeatHadAny = false;
function renderRepeatPayments(list) {
  const any = list.length > 0;
  ins.repeatHeader.hidden = !any && !repeatHadAny;
  ins.repeatList.hidden = !any;
  ins.repeatEmpty.hidden = any || !repeatHadAny;
  if (any) repeatHadAny = true;
  ins.repeatList.innerHTML = list.map((c) => {
    const d = c.dayOfMonth;
    const day = `${d}${d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th'}`;
    const name = `rep-${c.key}`;
    const opt = (mode, label, checked) => `<label class="rec-option"><input type="radio" name="${name}" value="${mode}"${checked ? ' checked' : ''} /><span class="rec-radio" aria-hidden="true"></span><span>${label}</span></label>`;
    return `<li class="card rec-card" data-repeat="${c.key}">
      <div class="rec-top"><span class="cat-tile rec-tile" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg></span>
        <span class="row-main"><span class="row-title"><span class="tax-sg-title">${escapeHtml(c.description)}</span> · ${c.variable ? 'about ' : ''}${whole(c.amount)} a month</span>
        <span class="row-meta">${c.months} of the last 6 months, around the ${day}${c.categoryName ? ` · ${escapeHtml(c.categoryName)}` : ''}</span></span></div>
      <p class="rec-q">What should we do?</p>
      <div class="rec-options" role="radiogroup" aria-label="What should we do with ${escapeHtml(c.description)}?">
        ${opt('log', 'Log it automatically', true)}
        ${opt('remind', 'Remind me to log it', false)}
        ${opt('track', 'Track as a subscription only', false)}
      </div>
      <div class="rec-actions">
        <button type="button" class="btn btn-outline" data-repeat-action="dismiss">Not a repeat</button>
        <button type="button" class="btn" data-repeat-action="accept">Accept</button>
      </div>
    </li>`;
  }).join('');
}

async function handleRepeatAction(event) {
  const b = event.target.closest('[data-repeat-action]');
  if (!b) return;
  const card = b.closest('[data-repeat]');
  const dismiss = b.dataset.repeatAction === 'dismiss';
  const mode = dismiss ? null : card.querySelector('input[type="radio"]:checked')?.value || 'log';
  const title = card.querySelector('.tax-sg-title').textContent;
  card.querySelectorAll('button, input').forEach((x) => { x.disabled = true; });
  try {
    const path = `/recurring/${lineUserId}/suggestions/${card.dataset.repeat}/${dismiss ? 'dismiss' : 'accept'}`;
    const res = await apiRequest(path, { method: 'POST', body: JSON.stringify(dismiss ? {} : { mode }) });
    renderRepeatPayments(res.suggestions);
    const created = res.created || {};
    const key = card.dataset.repeat;
    // Every Undo also forgets the dismissal, so the suggestion comes back.
    const restore = async () => {
      const back = await apiRequest(`/recurring/${lineUserId}/suggestions/${key}/restore`, { method: 'POST', body: '{}' });
      renderRepeatPayments(back.suggestions);
    };
    if (dismiss) {
      showToast({
        title: 'Marked as not a repeat', description: title,
        undo: async () => { await restore(); showToast({ title: 'Suggestion back', description: title }); },
      });
    } else if (mode === 'log' || mode === 'track') {
      showToast({
        title: mode === 'log' ? 'Logs itself each month' : 'Tracked as a subscription',
        description: mode === 'log' ? `${title} is in your recurring rules` : `${title} is listed under Subscriptions. Nothing is logged.`,
        undo: created.recurringId ? async () => {
          await apiRequest(`/recurring/${lineUserId}/${created.recurringId}`, { method: 'DELETE' });
          await restore();
          showToast({ title: 'Rule removed', description: title });
          refreshRecurringViews().catch(() => {}); // rules list + Subscriptions
        } : null,
      });
      TAB_LOADERS.budgets().catch(() => {}); // the wrapped loader also refreshes Subscriptions (money.js)
    } else {
      showToast({
        title: 'Monthly reminder set', description: `${title}: find it under Tasks`,
        undo: created.reminderId ? async () => {
          await apiRequest(`/reminders/${lineUserId}/${created.reminderId}`, { method: 'DELETE' });
          await restore();
          showToast({ title: 'Reminder removed', description: title });
        } : null,
      });
    }
  } catch (error) {
    card.querySelectorAll('button, input').forEach((x) => { x.disabled = false; });
    setAiStatus(ins.repeatStatus, 'error', plainError(error));
  }
}

// ---- Monthly report ----
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
const baseLoadBudgets = TAB_LOADERS.budgets;
TAB_LOADERS.budgets = async () => { await baseLoadBudgets(); loadRepeatPayments(); };
ins.repeatList.addEventListener('click', handleRepeatAction);
ins.prev.addEventListener('click', () => openReport(insState.offset - 1));
ins.next.addEventListener('click', () => openReport(insState.offset + 1));
ins.close.addEventListener('click', () => { ins.modal.hidden = true; insState.seq += 1; });
