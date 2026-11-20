// Tax tab: Thai personal income tax for tax years 2568 and 2569.
// Loaded after app.js and tasks.js; shares their globals (el, lineUserId,
// apiRequest, cachedGet, escapeHtml, formatMoney, confirmAction, showError,
// setAiStatus, hideAiStatus, showModalError, clearModalError, plainError, SVG, ICONS).
// Backend: /api/tax/:u/:year (migration 021); the numbers come from
// services/tax/taxMath.js, so the app never calculates tax itself.

const TAX_GROUPS = [
  ['family', 'Family'],
  ['insurance', 'Insurance'],
  ['retirement', 'Retirement savings'],
  ['investment', 'Investments'],
  ['other', 'Other'],
  ['measures', 'This year only'],
  ['donation', 'Donations'],
];
const TAX_GROUP_NOTES = {
  insurance: 'Life and health insurance count up to 100,000 together.',
  retirement: 'Provident fund, GPF, RMF, pension insurance and NSF count up to 500,000 together.',
};
const TAX_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SHORTCUT_LABELS = { salary: 'Salary and bonus', freelance: 'Freelance', biz_27: 'Online selling', biz_9: 'Food and drinks', interest: 'Deposit interest', dividend_th: 'Dividends' };
const SHORTCUT_ICONS = {
  salary: ICONS.work,
  freelance: '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
  biz_27: ICONS.order,
  biz_9: '<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/>',
  interest: '<path d="M3 21h18"/><path d="M5 21V10"/><path d="M19 21V10"/><path d="M9 21V10"/><path d="M15 21V10"/><path d="m2 10 10-7 10 7"/>',
  dividend_th: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
};

const x = {
  years: document.getElementById('tax-years'),
  heroLabel: document.getElementById('tax-hero-label'),
  heroAmount: document.getElementById('tax-hero-amount'),
  heroSub: document.getElementById('tax-hero-sub'),
  heroFiling: document.getElementById('tax-hero-filing'),
  hero: document.getElementById('tax-hero'),
  status: document.getElementById('tax-status'),
  profileSummary: document.getElementById('tax-profile-summary'),
  profileText: document.getElementById('tax-profile-text'),
  addIncome: document.getElementById('tax-add-income'),
  incomes: document.getElementById('tax-incomes'),
  incomesEmpty: document.getElementById('tax-incomes-empty'),
  deductions: document.getElementById('tax-deductions'),
  deductionsTotal: document.getElementById('tax-deductions-total'),
  breakdown: document.getElementById('tax-breakdown'),
  warnings: document.getElementById('tax-warnings'),
  sgHeader: document.getElementById('tax-sg-header'),
  sgToggle: document.getElementById('tax-sg-toggle'),
  sgStatus: document.getElementById('tax-sg-status'),
  sgList: document.getElementById('tax-suggestions'),
  // profile sheet
  profileModal: document.getElementById('tax-profile-modal'),
  profileForm: document.getElementById('tax-profile-form'),
  marital: document.getElementById('tax-marital'),
  spouseRow: document.getElementById('tax-spouse-row'),
  spouseIncome: document.getElementById('tax-spouse-income'),
  age65: document.getElementById('tax-age65'),
  disabled: document.getElementById('tax-disabled'),
  children: document.getElementById('tax-children'),
  addChild: document.getElementById('tax-add-child'),
  profileError: document.getElementById('tax-profile-error'),
  profileCancel: document.getElementById('tax-profile-cancel'),
  profileSave: document.getElementById('tax-profile-save'),
  // income sheet
  incomeModal: document.getElementById('tax-income-modal'),
  incomeTitle: document.getElementById('tax-income-title'),
  shortcuts: document.getElementById('tax-shortcuts'),
  incomeForm: document.getElementById('tax-income-form'),
  kind: document.getElementById('tax-income-kind'),
  kindHelp: document.getElementById('tax-income-kind-help'),
  amount: document.getElementById('tax-income-amount'),
  withheld: document.getElementById('tax-income-withheld'),
  payer: document.getElementById('tax-income-payer'),
  expenseBlock: document.getElementById('tax-expense-block'),
  expenseMethod: document.getElementById('tax-expense-method'),
  expenseFlat: document.getElementById('tax-expense-flat'),
  actualField: document.getElementById('tax-actual-field'),
  actual: document.getElementById('tax-income-actual'),
  creditField: document.getElementById('tax-credit-field'),
  credit: document.getElementById('tax-income-credit'),
  creditHelp: document.getElementById('tax-credit-help'),
  incomeError: document.getElementById('tax-income-error'),
  incomeCancel: document.getElementById('tax-income-cancel'),
  incomeSave: document.getElementById('tax-income-save'),
  incomeDelete: document.getElementById('tax-income-delete'),
  // deduction sheet
  dedModal: document.getElementById('tax-deduction-modal'),
  dedTitle: document.getElementById('tax-deduction-title'),
  dedHelp: document.getElementById('tax-deduction-help'),
  dedForm: document.getElementById('tax-deduction-form'),
  dedAmountLabel: document.getElementById('tax-deduction-amount-label'),
  dedAmount: document.getElementById('tax-deduction-amount'),
  dedError: document.getElementById('tax-deduction-error'),
  dedCancel: document.getElementById('tax-deduction-cancel'),
  dedSave: document.getElementById('tax-deduction-save'),
  dedRemove: document.getElementById('tax-deduction-remove'),
};

const taxState = {
  year: null, // selected tax year
  rules: {}, // year -> rules from GET (kept across writes)
  data: null, // last state response for the selected year
  seq: 0,
  editingIncome: null,
  method: 'flat',
  deduction: null,
  suggestions: null, // { year, suggestions, dividendsError }
  sgSeq: 0,
  showHidden: false, // also show added and dismissed suggestions
};

// Whole baht, with satang only when there are some: ฿500,000 / ฿17,647.06.
const taxBaht = (n) => {
  const v = Number(n) || 0;
  const digits = Number.isInteger(Math.round(v * 100) / 100) ? 0 : 2;
  return `${v < 0 ? '-' : ''}฿${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
};
const thaiDate = (ymd) => { if (!ymd) return null; const [y, m, d] = ymd.split('-').map(Number); return `${d} ${TAX_MONTHS[m - 1]} ${y}`; };
const parseMoney = (s) => (String(s || '').trim() === '' ? null : Number(String(s).replace(/[,\s฿]/g, '')));
const kindOf = (key) => (taxState.rules[taxState.year] || { incomeKinds: [] }).incomeKinds.find((k) => k.key === key);
const taxBase = () => `/tax/${lineUserId}/${taxState.year}`;

// Jan-Apr is filing season for last year; otherwise the current year.
function defaultTaxYear(years) {
  const [y, m] = bangkokYmd().split('-').map(Number);
  const want = y + 543 - (m <= 4 ? 1 : 0);
  return years.includes(want) ? want : Math.max(...years.filter((yr) => yr <= want), Math.min(...years));
}

async function loadTaxTab(year) {
  if (year) taxState.year = year;
  const seq = ++taxState.seq;
  if (!taxState.data) setAiStatus(x.status, 'working', 'Loading…');
  try {
    if (!taxState.year) {
      // First visit: find the years, then pick the one being filed.
      const first = await cachedGet(`/tax/${lineUserId}/2568`);
      taxState.rules[2568] = first.rules;
      taxState.year = defaultTaxYear(first.years);
    }
    const data = await cachedGet(taxBase());
    if (seq !== taxState.seq) return;
    if (data.rules) taxState.rules[data.year] = data.rules;
    taxState.data = data;
    hideAiStatus(x.status);
    renderTax();
    loadTaxSuggestions();
  } catch (error) {
    if (seq !== taxState.seq) return;
    setAiStatus(x.status, 'error', plainError(error));
  }
}

// After a write: the response is the whole state with a fresh result.
function applyTaxState(data) {
  taxState.data = { ...data, rules: taxState.rules[data.year] };
  renderTax();
  if (data.suggestions) {
    taxState.suggestions = { year: data.year, suggestions: data.suggestions, dividendsError: data.dividendsError };
    renderTaxSuggestions();
  } else loadTaxSuggestions(); // statuses and tax effects depend on what changed
}

// ---- Suggestions (Phase 3): found in transactions and the portfolio ----
async function loadTaxSuggestions() {
  const seq = ++taxState.sgSeq;
  const year = taxState.year;
  if (!taxState.suggestions || taxState.suggestions.year !== year) {
    x.sgHeader.hidden = false;
    x.sgList.hidden = true;
    setAiStatus(x.sgStatus, 'working', 'Checking your transactions and investments…');
  }
  try {
    const data = await cachedGet(`${taxBase()}/suggestions`);
    if (seq !== taxState.sgSeq) return;
    taxState.suggestions = data;
    renderTaxSuggestions();
  } catch (error) {
    if (seq !== taxState.sgSeq) return;
    setAiStatus(x.sgStatus, 'error', `Couldn't check your data: ${plainError(error)}`);
  }
}

const SG_CONFIDENCE = { high: 'From your portfolio', medium: 'Likely', low: 'Check first' };

function impactText(sg) {
  if (sg.impact == null) return '';
  if (Math.abs(sg.impact) < 0.01) return 'No change to your tax';
  return sg.impact < 0 ? `Lowers your tax by ${taxBaht(-sg.impact)}` : `Raises your tax by ${taxBaht(sg.impact)}`;
}

function suggestionCard(sg) {
  const hiddenState = sg.status === 'added' || sg.status === 'dismissed';
  const action = sg.status === 'dismissed'
    ? `<button type="button" class="secondary-button tax-sg-btn" data-sg="${sg.id}" data-sg-action="restore">Show again</button>`
    : sg.status === 'added' ? '<span class="tax-sg-added">Added</span>'
      : `<button type="button" class="secondary-button tax-sg-btn" data-sg="${sg.id}" data-sg-action="dismiss">Dismiss</button>
         <button type="button" class="primary-button tax-sg-btn" data-sg="${sg.id}" data-sg-action="accept">${sg.status === 'changed' ? `Update to ${taxBaht(sg.amount)}` : sg.status === 'entered' ? `Use ${taxBaht(sg.amount)}` : 'Add'}</button>`;
  const conf = sg.confidence === 'high' && !/portfolio/.test(sg.reason) ? 'Confident' : SG_CONFIDENCE[sg.confidence];
  const status = sg.status === 'changed' ? 'Your data changed since you added this.' : sg.status === 'entered' ? `You entered ${taxBaht(sg.entered)}.` : '';
  const sources = sg.sources && sg.sources.length
    ? `<details class="tax-sg-sources"><summary>Based on ${sg.sources.length}${sg.sources.length === 20 ? '+' : ''} item${sg.sources.length === 1 ? '' : 's'}</summary><ul>${sg.sources.map((src) => `<li><span>${escapeHtml([src.date, src.description].filter(Boolean).join(' · '))}</span><span>${taxBaht(src.amount)}</span></li>`).join('')}</ul></details>`
    : '';
  return `<li class="tax-sg${sg.warning ? ' is-warning' : ''}${hiddenState ? ' is-muted' : ''}" data-sg-card="${sg.id}">
    <div class="tax-sg-top">
      <span class="tax-sg-title">${escapeHtml(sg.title)}</span>
      <span class="tax-sg-amount">${taxBaht(sg.amount)}</span>
    </div>
    <div class="tax-sg-tags"><span class="tax-sg-tag conf-${sg.confidence}">${conf}</span>${impactText(sg) ? `<span class="tax-sg-impact${sg.impact < 0 ? ' is-good' : ''}">${impactText(sg)}</span>` : ''}</div>
    <p class="tax-sg-reason">${escapeHtml(sg.reason)}${status ? ` ${escapeHtml(status)}` : ''}</p>
    ${sg.note ? `<p class="tax-sg-note">${escapeHtml(sg.note)}</p>` : ''}
    ${sources}
    <div class="tax-sg-actions">${action}</div>
  </li>`;
}

function renderTaxSuggestions() {
  const data = taxState.suggestions;
  if (!data || data.year !== taxState.year) return;
  const all = data.suggestions;
  const open = all.filter((sg) => sg.status !== 'added' && sg.status !== 'dismissed');
  const done = all.length - open.length;
  const shown = taxState.showHidden ? all : open;
  x.sgHeader.hidden = all.length === 0 && !data.dividendsError;
  x.sgToggle.hidden = done === 0;
  x.sgToggle.textContent = taxState.showHidden ? 'Hide added and dismissed' : `Show ${done} added or dismissed`;
  x.sgList.hidden = shown.length === 0;
  x.sgList.innerHTML = shown.map(suggestionCard).join('');
  if (data.dividendsError) setAiStatus(x.sgStatus, 'info', data.dividendsError);
  else if (all.length && !open.length) setAiStatus(x.sgStatus, 'done', 'All caught up: everything found in your data is added or dismissed.');
  else hideAiStatus(x.sgStatus);
}

async function handleSuggestionAction(event) {
  const b = event.target.closest('[data-sg-action]');
  if (!b) return;
  const card = b.closest('.tax-sg');
  card.querySelectorAll('button').forEach((btn) => { btn.disabled = true; });
  try {
    applyTaxState(await apiRequest(`${taxBase()}/suggestions/${b.dataset.sg}/${b.dataset.sgAction}`, { method: 'POST' }));
  } catch (error) {
    card.querySelectorAll('button').forEach((btn) => { btn.disabled = false; });
    setAiStatus(x.sgStatus, 'error', plainError(error));
  }
}

// ---- Render ----
function renderTax() {
  const d = taxState.data;
  const rules = taxState.rules[d.year];
  x.years.innerHTML = d.years.map((y) => `<button type="button" class="segment${y === d.year ? ' active' : ''}" data-year="${y}" role="tab" aria-selected="${y === d.year}">Tax year ${y}</button>`).join('');
  renderHero(d, rules);
  renderProfileSummary(d.profile);
  renderIncomes(d);
  renderDeductions(d, rules);
  renderBreakdown(d.result);
  const warnings = d.result.warnings;
  x.warnings.hidden = warnings.length === 0;
  x.warnings.innerHTML = warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('');
}

function renderHero(d, rules) {
  const r = d.result;
  x.hero.dataset.result = r.result;
  if (!d.incomes.length) {
    x.heroLabel.textContent = 'Your tax';
    x.heroAmount.textContent = taxBaht(0);
    x.heroSub.textContent = 'Add your income to see what you owe or get back.';
  } else {
    x.heroLabel.textContent = r.result === 'refund' ? 'Refund' : r.result === 'pay' ? 'Tax to pay' : 'Nothing to pay';
    x.heroAmount.textContent = taxBaht(Math.abs(r.balance));
    const parts = [`Tax ${taxBaht(r.taxDue)}`];
    if (r.withheld) parts.push(`withheld ${taxBaht(r.withheld)}`);
    if (r.dividendCredit) parts.push(`dividend credit ${taxBaht(r.dividendCredit)}`);
    x.heroSub.textContent = parts.join(' · ');
  }
  const f = r.filing;
  const deadline = f.onlineDeadline ? `online by ${thaiDate(f.onlineDeadline)}` : `by ${thaiDate(f.paperDeadline)} on paper (online date not announced yet)`;
  const lastDay = f.onlineDeadline || f.paperDeadline;
  const [gy, gm, gd] = bangkokYmd().split('-');
  const todayBE = `${Number(gy) + 543}-${gm}-${gd}`; // deadlines are Buddhist-era dates
  const late = lastDay && todayBE > lastDay;
  x.heroFiling.textContent = !d.incomes.length ? '' : f.mustFile && late
    ? `The ${f.form === 'PND91' ? 'PND 91' : 'PND 90'} deadline was ${thaiDate(lastDay)}. File as soon as you can: unpaid tax gets a 1.5% monthly surcharge.`
    : f.mustFile
    ? `File ${f.form === 'PND91' ? 'PND 91' : 'PND 90'} ${deadline}${r.instalments ? '. You can pay in 3 instalments.' : ''}`
    : `Your income is under ${taxBaht(f.threshold)}, so you don't need to file for ${d.year}${r.result === 'refund' ? ', but filing gets your refund' : ''}.`;
}

function renderProfileSummary(p) {
  const bits = [{ single: 'Single', married: 'Married', divorced: 'Divorced', widowed: 'Widowed' }[p.maritalStatus] || 'Single'];
  if (p.maritalStatus === 'married') bits.push(p.spouseHasIncome === false ? 'spouse has no income' : 'spouse has income');
  const kids = (p.children || []).length;
  bits.push(kids ? `${kids} child${kids === 1 ? '' : 'ren'}` : 'no children');
  if (p.age65) bits.push('65+');
  if (p.disabled) bits.push('disability');
  x.profileText.textContent = bits.join(' · ');
}

function renderIncomes(d) {
  x.incomes.hidden = d.incomes.length === 0;
  x.incomesEmpty.hidden = d.incomes.length > 0;
  const lines = d.result.incomes;
  x.incomes.innerHTML = d.incomes.map((inc, i) => {
    const k = kindOf(inc.kind) || { label: inc.kind, type: '' };
    const line = lines.find((l) => l.index === i) || {};
    const meta = [k.type, inc.payer, inc.withheld ? `withheld ${taxBaht(inc.withheld)}` : null, line.expense ? `expenses ${taxBaht(line.expense)}` : null].filter(Boolean).join(' · ');
    return `<li class="task-row tax-income-row">
      <button type="button" class="task-main" data-income="${inc.id}">
        <span class="task-title">${escapeHtml(k.label)}</span>
        <span class="task-meta"><span>${escapeHtml(meta)}</span></span>
      </button>
      <span class="tax-amount">${taxBaht(inc.amount)}</span>
    </li>`;
  }).join('') + `<li class="tax-total-row"><span>Total for ${d.year}</span><span>${taxBaht(d.result.totals.gross)}</span></li>`;
}

function deductionRow(def, d) {
  const r = d.result;
  const row = r.allowances.find((a) => a.key === def.key) || r.donations.find((a) => a.key === def.key);
  const claimed = d.claims[def.key];
  const allowed = row ? row.allowed : 0;
  const limit = r.limits[def.key];
  let meta;
  if (def.input === 'auto') {
    meta = def.key === 'personal' ? (d.claims.personal === false ? 'Not claimed' : 'Everyone gets this') : allowed ? 'From your profile' : 'Set in About you';
  } else if (claimed != null) {
    const paid = def.input === 'count' ? `${claimed} ${claimed === 1 ? 'person' : 'people'}` : `paid ${taxBaht(claimed)}`;
    meta = row && row.trimmedBy ? `${paid} · over the shared limit` : row && row.allowed < (def.input === 'count' ? row.claimed : Number(claimed) * (def.multiplier || 1)) ? `${paid} · capped` : paid;
  } else meta = limit == null ? 'No limit of its own' : `Up to ${taxBaht(limit)}`;
  const pct = limit ? Math.min(100, Math.round((allowed / limit) * 100)) : 0;
  const tappable = def.input !== 'auto' || def.key !== 'personal';
  return `<li class="task-row tax-ded-row${allowed ? ' is-claimed' : ''}">
    <button type="button" class="task-main" data-deduction="${def.key}"${tappable ? '' : ' disabled'}>
      <span class="task-title">${escapeHtml(def.label)}${def.verified ? '' : ' <span class="tax-unverified">Unverified</span>'}</span>
      <span class="task-meta"><span>${escapeHtml(meta)}</span></span>
      ${limit ? `<span class="tax-bar" aria-hidden="true"><span style="width:${pct}%"></span></span>` : ''}
    </button>
    <span class="tax-amount${allowed ? '' : ' is-zero'}">${allowed ? taxBaht(allowed) : '-'}</span>
  </li>`;
}

function renderDeductions(d, rules) {
  const visible = rules.deductions.filter((def) => d.result.limits[def.key] !== 0 || d.claims[def.key] != null);
  x.deductionsTotal.textContent = `${taxBaht(d.result.totals.allowances + d.result.totals.donations)} in all`;
  x.deductions.innerHTML = TAX_GROUPS.map(([group, title]) => {
    const defs = visible.filter((def) => def.group === group);
    if (!defs.length) return '';
    return `<h3 class="tax-group-title">${title}</h3>${TAX_GROUP_NOTES[group] ? `<p class="group-hint tax-group-note">${TAX_GROUP_NOTES[group]}</p>` : ''}
      <ul class="task-list">${defs.map((def) => deductionRow(def, d)).join('')}</ul>`;
  }).join('');
}

function renderBreakdown(r) {
  const row = (label, value, cls = '') => `<div class="tax-line ${cls}"><span>${label}</span><span>${value}</span></div>`;
  const minus = (n) => `- ${taxBaht(n)}`;
  const lines = [row('Income', taxBaht(r.totals.gross))];
  if (r.totals.exempt) lines.push(row('65+ / disability exemption', minus(r.totals.exempt)));
  if (r.dividendCredit) lines.push(row('Dividend credit added to income', `+ ${taxBaht(r.dividendCredit)}`));
  lines.push(row('Expenses', minus(r.totals.expenses)), row('Deductions', minus(r.totals.allowances)));
  if (r.totals.donations) lines.push(row('Donations', minus(r.totals.donations)));
  lines.push(row('Net income', taxBaht(r.totals.netIncome), 'is-strong'));
  const bands = r.brackets.filter((b) => b.taxable > 0).map((b) => row(`${Math.round(b.rate * 100)}% on ${taxBaht(b.taxable)}`, taxBaht(b.tax), 'is-sub'));
  lines.push(...bands);
  if (r.minimumTax.base) lines.push(row(`0.5% of non-salary income${r.minimumTax.applies ? ' (higher, so it applies)' : r.minimumTax.tax <= 5000 ? ' (5,000 or less, ignored)' : ' (lower)'}`, taxBaht(r.minimumTax.tax), 'is-sub'));
  lines.push(row('Tax', taxBaht(r.taxDue), 'is-strong'));
  if (r.withheld) lines.push(row('Tax withheld', minus(r.withheld)));
  if (r.dividendCredit) lines.push(row('Dividend tax credit', minus(r.dividendCredit)));
  lines.push(row(r.result === 'refund' ? 'Refund' : 'To pay', taxBaht(Math.abs(r.balance)), 'is-total'));
  const rates = r.totals.gross ? `Effective rate ${(r.effectiveRate * 100).toFixed(2)}%${r.marginalRate != null ? ` · top rate ${Math.round(r.marginalRate * 100)}%` : ''}` : '';
  x.breakdown.innerHTML = lines.join('') + (rates ? `<p class="tax-rates">${rates}</p>` : '');
}

// ---- Profile sheet ----
function childRow(year = '') {
  return `<li class="tax-child"><label class="field">Birth year<input type="number" inputmode="numeric" min="2450" max="${taxState.year}" value="${year}" class="tax-child-year" /></label>
    <button type="button" class="link-button tax-child-remove" aria-label="Remove child">Remove</button></li>`;
}

function openTaxProfile() {
  const p = taxState.data.profile;
  clearModalError(x.profileError);
  x.marital.value = p.maritalStatus || 'single';
  x.spouseIncome.checked = p.spouseHasIncome !== false;
  x.age65.checked = !!p.age65;
  x.disabled.checked = !!p.disabled;
  x.children.innerHTML = (p.children || []).map((c) => childRow(c.birthYear)).join('');
  syncSpouseRow();
  x.profileModal.hidden = false;
}

const syncSpouseRow = () => { x.spouseRow.hidden = x.marital.value !== 'married'; };

async function saveTaxProfile(event) {
  event.preventDefault();
  clearModalError(x.profileError);
  const children = [...x.children.querySelectorAll('.tax-child-year')].map((i) => i.value.trim()).filter(Boolean).map((v) => ({ birthYear: Number(v) }));
  const body = { maritalStatus: x.marital.value, spouseHasIncome: x.spouseIncome.checked, age65: x.age65.checked, disabled: x.disabled.checked, children };
  x.profileSave.disabled = true;
  try {
    applyTaxState(await apiRequest(`${taxBase()}/profile`, { method: 'PUT', body: JSON.stringify(body) }));
    x.profileModal.hidden = true;
  } catch (error) {
    showModalError(x.profileError, plainError(error));
  } finally {
    x.profileSave.disabled = false;
  }
}

// ---- Income sheet ----
function fillKindOptions() {
  const rules = taxState.rules[taxState.year];
  const byType = {};
  rules.incomeKinds.forEach((k) => { (byType[k.type] ||= []).push(k); });
  x.kind.innerHTML = '<option value="">Choose…</option>' + Object.entries(byType).map(([type, kinds]) =>
    `<optgroup label="${type}">${kinds.map((k) => `<option value="${k.key}">${escapeHtml(k.label)}</option>`).join('')}</optgroup>`).join('');
  x.shortcuts.innerHTML = rules.shortcuts.map((key) => `<button type="button" class="tax-shortcut" data-kind="${key}">${SVG(SHORTCUT_ICONS[key] || ICONS.other, 20)}<span>${SHORTCUT_LABELS[key] || kindOf(key).label}</span></button>`).join('');
}

function setExpenseMethod(method) {
  taxState.method = method;
  x.expenseMethod.querySelectorAll('.segment').forEach((b) => b.classList.toggle('active', b.dataset.method === method));
  x.actualField.hidden = method !== 'actual';
}

function syncKindFields() {
  const k = kindOf(x.kind.value);
  x.shortcuts.querySelectorAll('.tax-shortcut').forEach((b) => b.classList.toggle('active', b.dataset.kind === x.kind.value));
  if (!k) { x.kindHelp.textContent = ''; x.expenseBlock.hidden = true; x.creditField.hidden = true; x.creditHelp.hidden = true; return; }
  const exp = { pool12: '50% expenses, up to 100,000 together with other salary and freelance income', pool3: '50% expenses up to 100,000, or actual', none: 'No expense deduction', rate: `${Math.round((k.rate || 0) * 100)}% expenses, or your actual expenses`, performer: '60% of the first 300,000 and 40% above (up to 600,000), or actual', actual: 'Actual expenses only' }[k.expense];
  x.kindHelp.textContent = `Income type ${k.type}. ${exp}.`;
  x.expenseBlock.hidden = !(k.actualAllowed);
  x.expenseFlat.hidden = k.expense === 'actual';
  x.expenseFlat.textContent = k.rate ? `Flat ${Math.round(k.rate * 100)}%` : 'Flat rate';
  if (k.expense === 'actual') setExpenseMethod('actual');
  else if (!k.actualAllowed) setExpenseMethod('flat');
  x.creditField.hidden = !k.dividendCredit;
  x.creditHelp.hidden = !k.dividendCredit;
}

function openTaxIncomeModal(income = null) {
  if (!taxState.data) return;
  taxState.editingIncome = income;
  clearModalError(x.incomeError);
  fillKindOptions();
  x.incomeTitle.textContent = income ? 'Edit income' : 'Add income';
  x.shortcuts.hidden = !!income;
  x.kind.value = income ? income.kind : '';
  x.amount.value = income ? income.amount : '';
  x.withheld.value = income && income.withheld ? income.withheld : '';
  x.payer.value = income ? income.payer || '' : '';
  x.actual.value = income && income.actual_expenses ? income.actual_expenses : '';
  x.credit.value = income && income.credit_rate != null ? String(income.credit_rate) : (income ? '' : '0.2');
  setExpenseMethod(income ? income.expense_method : 'flat');
  syncKindFields();
  x.incomeDelete.hidden = !income;
  x.incomeModal.hidden = false;
}

async function saveTaxIncome(event) {
  event.preventDefault();
  clearModalError(x.incomeError);
  const k = kindOf(x.kind.value);
  if (!k) return showModalError(x.incomeError, 'Choose an income type.');
  const amount = parseMoney(x.amount.value);
  if (!(amount > 0)) return showModalError(x.incomeError, 'Enter the income for the year.');
  const body = {
    kind: k.key,
    amount,
    withheld: parseMoney(x.withheld.value) || 0,
    payer: x.payer.value.trim() || null,
    expenseMethod: k.expense === 'actual' ? 'actual' : k.actualAllowed ? taxState.method : 'flat',
    actualExpenses: taxState.method === 'actual' ? parseMoney(x.actual.value) || 0 : 0,
    creditRate: k.dividendCredit && x.credit.value ? Number(x.credit.value) : null,
  };
  if ([body.amount, body.withheld, body.actualExpenses].some((n) => !Number.isFinite(n))) return showModalError(x.incomeError, 'Amounts must be numbers.');
  x.incomeSave.disabled = true;
  try {
    const inc = taxState.editingIncome;
    const data = inc
      ? await apiRequest(`${taxBase()}/incomes/${inc.id}`, { method: 'PUT', body: JSON.stringify(body) })
      : await apiRequest(`${taxBase()}/incomes`, { method: 'POST', body: JSON.stringify(body) });
    applyTaxState(data);
    x.incomeModal.hidden = true;
  } catch (error) {
    showModalError(x.incomeError, plainError(error));
  } finally {
    x.incomeSave.disabled = false;
  }
}

async function deleteTaxIncome() {
  const inc = taxState.editingIncome;
  if (!inc || !(await confirmAction('Delete this income?'))) return;
  try {
    applyTaxState(await apiRequest(`${taxBase()}/incomes/${inc.id}`, { method: 'DELETE' }));
    x.incomeModal.hidden = true;
  } catch (error) {
    showModalError(x.incomeError, plainError(error));
  }
}

// ---- Deduction sheet ----
function openTaxDeduction(key) {
  const rules = taxState.rules[taxState.year];
  const def = rules.deductions.find((dd) => dd.key === key);
  if (!def) return;
  if (def.input === 'auto') { openTaxProfile(); return; }
  taxState.deduction = def;
  const d = taxState.data;
  clearModalError(x.dedError);
  x.dedTitle.textContent = def.label;
  const limit = d.result.limits[key];
  const help = [];
  if (def.note) help.push(def.note + '.');
  if (def.multiplier === 2) help.push('Counts twice, up to 10% of your income after deductions.');
  else if (def.multiplier) help.push(`Counts ${def.multiplier} times what you spent.`);
  if (def.rateOf) help.push(`Up to ${Math.round(def.rate * 100)}% of your ${def.rateOf === 'wages' ? 'salary' : 'income'}${def.cap ? `, max ${taxBaht(def.cap)}` : ''}.`);
  else if (def.cap && def.input !== 'cost') help.push(`Up to ${taxBaht(def.cap)}.`);
  if (limit != null) help.push(`For you this year: up to ${taxBaht(limit)}${def.input === 'amount' && def.multiplier === 2 ? ' paid' : ''}.`);
  if (!def.verified) help.push("This rule isn't checked against a Revenue Department source yet.");
  x.dedHelp.textContent = help.join(' ');
  x.dedAmountLabel.textContent = def.input === 'count' ? `How many people (up to ${def.maxUnits})` : def.input === 'cost' ? 'Construction cost (THB)' : 'Amount paid this year (THB)';
  x.dedAmount.inputMode = def.input === 'count' ? 'numeric' : 'decimal';
  x.dedAmount.value = d.claims[key] != null ? d.claims[key] : '';
  x.dedRemove.hidden = d.claims[key] == null;
  x.dedModal.hidden = false;
  setTimeout(() => x.dedAmount.focus(), 50);
}

async function saveTaxDeduction(event, remove = false) {
  if (event) event.preventDefault();
  clearModalError(x.dedError);
  const def = taxState.deduction;
  const value = remove ? null : parseMoney(x.dedAmount.value);
  if (!remove && value != null && !Number.isFinite(value)) return showModalError(x.dedError, 'Enter a number.');
  x.dedSave.disabled = true;
  try {
    applyTaxState(await apiRequest(`${taxBase()}/claims`, { method: 'PUT', body: JSON.stringify({ [def.key]: value }) }));
    x.dedModal.hidden = true;
  } catch (error) {
    showModalError(x.dedError, plainError(error));
  } finally {
    x.dedSave.disabled = false;
  }
}

// ---- Wiring ----
x.years.addEventListener('click', (e) => {
  const b = e.target.closest('[data-year]');
  if (!b || Number(b.dataset.year) === taxState.year) return;
  taxState.data = null;
  taxState.showHidden = false;
  loadTaxTab(Number(b.dataset.year));
});
x.profileSummary.addEventListener('click', openTaxProfile);
x.sgList.addEventListener('click', handleSuggestionAction);
x.sgToggle.addEventListener('click', () => { taxState.showHidden = !taxState.showHidden; renderTaxSuggestions(); });
x.addIncome.addEventListener('click', () => openTaxIncomeModal(null));
x.incomes.addEventListener('click', (e) => {
  const b = e.target.closest('[data-income]');
  if (b) openTaxIncomeModal(taxState.data.incomes.find((i) => i.id === b.dataset.income));
});
x.deductions.addEventListener('click', (e) => {
  const b = e.target.closest('[data-deduction]');
  if (b && !b.disabled) openTaxDeduction(b.dataset.deduction);
});
x.marital.addEventListener('change', syncSpouseRow);
x.addChild.addEventListener('click', () => x.children.insertAdjacentHTML('beforeend', childRow()));
x.children.addEventListener('click', (e) => { const b = e.target.closest('.tax-child-remove'); if (b) b.closest('.tax-child').remove(); });
x.profileForm.addEventListener('submit', saveTaxProfile);
x.profileCancel.addEventListener('click', () => { x.profileModal.hidden = true; });
x.shortcuts.addEventListener('click', (e) => { const b = e.target.closest('[data-kind]'); if (b) { x.kind.value = b.dataset.kind; syncKindFields(); x.amount.focus(); } });
x.kind.addEventListener('change', syncKindFields);
x.expenseMethod.addEventListener('click', (e) => { const b = e.target.closest('[data-method]'); if (b) setExpenseMethod(b.dataset.method); });
x.incomeForm.addEventListener('submit', saveTaxIncome);
x.incomeCancel.addEventListener('click', () => { x.incomeModal.hidden = true; });
x.incomeDelete.addEventListener('click', deleteTaxIncome);
x.dedForm.addEventListener('submit', (e) => saveTaxDeduction(e));
x.dedCancel.addEventListener('click', () => { x.dedModal.hidden = true; });
x.dedRemove.addEventListener('click', () => saveTaxDeduction(null, true));
