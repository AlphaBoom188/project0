const API_BASE = '/api';

const el = {
  loading: document.getElementById('loading'),
  app: document.getElementById('app'),
  errorBanner: document.getElementById('error-banner'),
  budgetAlertBanner: document.getElementById('budget-alert-banner'),
  profilePicture: document.getElementById('profile-picture'),
  profileName: document.getElementById('profile-name'),

  // Dashboard tab
  periodLabel: document.getElementById('period-label'),
  summaryIncome: document.getElementById('summary-income'),
  summaryExpense: document.getElementById('summary-expense'),
  summaryNet: document.getElementById('summary-net'),
  transactionList: document.getElementById('transaction-list'),
  emptyState: document.getElementById('empty-state'),
  fabAdd: document.getElementById('fab-add'),

  // Shared Bills (Dashboard tab)
  billsList: document.getElementById('bills-list'),
  billsEmptyState: document.getElementById('bills-empty-state'),
  addBillButton: document.getElementById('add-bill-button'),

  // Bill create modal
  billModal: document.getElementById('bill-modal'),
  billForm: document.getElementById('bill-form'),
  cancelBill: document.getElementById('cancel-bill'),
  billFieldTitle: document.getElementById('bill-field-title'),
  billFieldTotal: document.getElementById('bill-field-total'),
  billSplitButtons: document.querySelectorAll('[data-split-type]'),
  billParticipantsList: document.getElementById('bill-participants-list'),
  billAddParticipant: document.getElementById('bill-add-participant'),
  billItemizedSection: document.getElementById('bill-itemized-section'),
  billFieldReceiptImage: document.getElementById('bill-field-receipt-image'),
  billScanStatus: document.getElementById('bill-scan-status'),
  billItemsList: document.getElementById('bill-items-list'),
  billAddItem: document.getElementById('bill-add-item'),
  billModalError: document.getElementById('bill-modal-error'),

  // Bill detail modal
  billDetailModal: document.getElementById('bill-detail-modal'),
  billDetailTitle: document.getElementById('bill-detail-title'),
  billDetailMeta: document.getElementById('bill-detail-meta'),
  billDetailParticipants: document.getElementById('bill-detail-participants'),
  billDetailError: document.getElementById('bill-detail-error'),
  billCopyLink: document.getElementById('bill-copy-link'),
  billDelete: document.getElementById('bill-delete'),
  closeBillDetail: document.getElementById('close-bill-detail'),

  // Add Expense modal
  addExpenseModal: document.getElementById('add-expense-modal'),
  addExpenseForm: document.getElementById('add-expense-form'),
  cancelAddExpense: document.getElementById('cancel-add-expense'),
  fieldCategory: document.getElementById('field-category'),
  fieldAmount: document.getElementById('field-amount'),
  fieldDescription: document.getElementById('field-description'),
  fieldDate: document.getElementById('field-date'),
  modalError: document.getElementById('modal-error'),
  fieldReceiptImage: document.getElementById('field-receipt-image'),
  receiptPreview: document.getElementById('receipt-preview'),
  scanStatus: document.getElementById('scan-status'),

  // Tab shell
  tabContent: document.querySelector('.tab-content'),
  navTabs: Array.from(document.querySelectorAll('.nav-tab')),
  tabPanels: {
    home: document.getElementById('tab-home'),
    transactions: document.getElementById('tab-transactions'),
    budgets: document.getElementById('tab-budgets'),
    networth: document.getElementById('tab-networth'),
    settings: document.getElementById('tab-settings'),
  },

  // Home tab
  trendChart: document.getElementById('trend-chart'),

  // Budgets tab
  categoryChart: document.getElementById('category-chart'),
  analyticsEmptyState: document.getElementById('analytics-empty-state'),
  budgetsStatus: document.getElementById('budgets-status'),
  advancedToggle: document.getElementById('advanced-toggle'),
  advancedSection: document.getElementById('advanced-section'),

  // Event/Occasion budgets (Budgets tab)
  eventsList: document.getElementById('events-list'),
  eventsEmptyState: document.getElementById('events-empty-state'),
  addEventButton: document.getElementById('add-event-button'),
  eventModal: document.getElementById('event-modal'),
  eventForm: document.getElementById('event-form'),
  cancelEvent: document.getElementById('cancel-event'),
  eventFieldTitle: document.getElementById('event-field-title'),
  eventFieldCategory: document.getElementById('event-field-category'),
  eventFieldAmount: document.getElementById('event-field-amount'),
  eventFieldMonth: document.getElementById('event-field-month'),
  eventModalError: document.getElementById('event-modal-error'),

  // Net Worth tab
  networthStatus: document.getElementById('networth-status'),

  // Transactions tab
  txnScanButton: document.getElementById('txn-scan-button'),

  // Google connect (Settings tab, export-email verification only)
  connectGoogleButton: document.getElementById('connect-google-button'),
  googleConnectedRow: document.getElementById('google-connected-row'),
  googleConnectedEmail: document.getElementById('google-connected-email'),
  disconnectGoogle: document.getElementById('disconnect-google'),
  googleConnectStatus: document.getElementById('google-connect-status'),
  legacyEmailField: document.getElementById('legacy-email-field'),

  // Portfolio & Net Worth (Net Worth tab)
  refreshPricesButton: document.getElementById('refresh-prices-button'),
  portfolioTotalValue: document.getElementById('portfolio-total-value'),
  portfolioTotalCost: document.getElementById('portfolio-total-cost'),
  portfolioTotalGain: document.getElementById('portfolio-total-gain'),
  portfolioAllocationChart: document.getElementById('portfolio-allocation-chart'),
  emergencyFundCard: document.getElementById('emergency-fund-card'),
  emergencyFundLabel: document.getElementById('emergency-fund-label'),
  emergencyFundFill: document.getElementById('emergency-fund-fill'),
  emergencyFundSuggestion: document.getElementById('emergency-fund-suggestion'),
  holdingsList: document.getElementById('holdings-list'),
  holdingsEmptyState: document.getElementById('holdings-empty-state'),
  addHoldingButton: document.getElementById('add-holding-button'),

  // Holding modal
  holdingModal: document.getElementById('holding-modal'),
  holdingForm: document.getElementById('holding-form'),
  cancelHolding: document.getElementById('cancel-holding'),
  holdingFieldType: document.getElementById('holding-field-type'),
  holdingSymbolField: document.getElementById('holding-symbol-field'),
  holdingFieldSymbol: document.getElementById('holding-field-symbol'),
  holdingSymbolHint: document.getElementById('holding-symbol-hint'),
  holdingFieldName: document.getElementById('holding-field-name'),
  holdingFieldQuantity: document.getElementById('holding-field-quantity'),
  holdingFieldCost: document.getElementById('holding-field-cost'),
  holdingPriceField: document.getElementById('holding-price-field'),
  holdingFieldPrice: document.getElementById('holding-field-price'),
  holdingModalError: document.getElementById('holding-modal-error'),

  // Emergency Fund settings (Settings tab)
  settingEfGoal: document.getElementById('setting-ef-goal'),
  settingEfAccount: document.getElementById('setting-ef-account'),
  saveEmergencyFund: document.getElementById('save-emergency-fund'),

  // Categories tab
  categoriesTypeExpense: document.getElementById('categories-type-expense'),
  categoriesTypeIncome: document.getElementById('categories-type-income'),
  categoriesList: document.getElementById('categories-list'),
  categoriesEmptyState: document.getElementById('categories-empty-state'),
  addCategoryButton: document.getElementById('add-category-button'),

  // Accounts (also on the Categories & Budgets tab)
  accountsList: document.getElementById('accounts-list'),
  accountsEmptyState: document.getElementById('accounts-empty-state'),
  addAccountButton: document.getElementById('add-account-button'),
  addTransferButton: document.getElementById('add-transfer-button'),
  accountModal: document.getElementById('account-modal'),
  accountForm: document.getElementById('account-form'),
  cancelAccount: document.getElementById('cancel-account'),
  accountFieldName: document.getElementById('account-field-name'),
  accountFieldType: document.getElementById('account-field-type'),
  accountFieldBalance: document.getElementById('account-field-balance'),
  accountModalError: document.getElementById('account-modal-error'),
  transferModal: document.getElementById('transfer-modal'),
  transferForm: document.getElementById('transfer-form'),
  cancelTransfer: document.getElementById('cancel-transfer'),
  transferFieldFrom: document.getElementById('transfer-field-from'),
  transferFieldTo: document.getElementById('transfer-field-to'),
  transferFieldAmount: document.getElementById('transfer-field-amount'),
  transferFieldDate: document.getElementById('transfer-field-date'),
  transferModalError: document.getElementById('transfer-modal-error'),

  // Category modal
  categoryModal: document.getElementById('category-modal'),
  categoryModalTitle: document.getElementById('category-modal-title'),
  categoryForm: document.getElementById('category-form'),
  cancelCategory: document.getElementById('cancel-category'),
  categoryFieldName: document.getElementById('category-field-name'),
  categoryFieldType: document.getElementById('category-field-type'),
  categoryFieldBudgetAmount: document.getElementById('category-field-budget-amount'),
  categoryFieldBudgetPeriod: document.getElementById('category-field-budget-period'),
  categoryModalError: document.getElementById('category-modal-error'),

  // Transactions tab
  txnFilterType: document.getElementById('txn-filter-type'),
  txnSearch: document.getElementById('txn-search'),
  txnAccountButton: document.getElementById('txn-account-button'),
  accountFilterModal: document.getElementById('account-filter-modal'),
  accountFilterList: document.getElementById('account-filter-list'),
  accountFilterEmpty: document.getElementById('account-filter-empty'),
  accountFilterClear: document.getElementById('account-filter-clear'),
  accountFilterApply: document.getElementById('account-filter-apply'),
  streakCount: document.getElementById('streak-count'),
  streakBest: document.getElementById('streak-best'),
  streakDays: document.getElementById('streak-days'),
  streakHint: document.getElementById('streak-hint'),
  breakdownTotalLabel: document.getElementById('breakdown-total-label'),
  breakdownTotalValue: document.getElementById('breakdown-total-value'),
  billShareLine: document.getElementById('bill-share-line'),
  txnRangePills: document.querySelectorAll('.range-pill'),
  txnPeriodNav: document.getElementById('txn-period-nav'),
  txnPeriodLabel: document.getElementById('txn-period-label'),
  txnPeriodPrev: document.getElementById('txn-period-prev'),
  txnPeriodNext: document.getElementById('txn-period-next'),
  txnCustomRange: document.getElementById('txn-custom-range'),
  billProgressCount: document.getElementById('bill-progress-count'),
  billProgressOutstanding: document.getElementById('bill-progress-outstanding'),
  billProgressFill: document.getElementById('bill-progress-fill'),
  txnFilterStart: document.getElementById('txn-filter-start'),
  txnFilterEnd: document.getElementById('txn-filter-end'),
  exportCsvButton: document.getElementById('export-csv-button'),
  exportEmailButton: document.getElementById('export-email-button'),
  exportStatus: document.getElementById('export-status'),
  txnFullList: document.getElementById('txn-full-list'),
  txnEmptyState: document.getElementById('txn-empty-state'),

  // Settings tab
  themeOptionButtons: document.querySelectorAll('[data-theme-option]'),
  settingNotifications: document.getElementById('setting-notifications'),
  settingThumbnails: document.getElementById('setting-thumbnails'),
  settingCycleDay: document.getElementById('setting-cycle-day'),
  saveCycleDay: document.getElementById('save-cycle-day'),
  settingEmail: document.getElementById('setting-email'),
  saveEmail: document.getElementById('save-email'),
  settingsStatus: document.getElementById('settings-status'),
  clearHistoryButton: document.getElementById('clear-history-button'),

  // Recurring expenses
  recurringList: document.getElementById('recurring-list'),
  recurringEmptyState: document.getElementById('recurring-empty-state'),
  addRecurringButton: document.getElementById('add-recurring-button'),
  recurringModal: document.getElementById('recurring-modal'),
  recurringForm: document.getElementById('recurring-form'),
  cancelRecurring: document.getElementById('cancel-recurring'),
  recurringFieldType: document.getElementById('recurring-field-type'),
  recurringFieldCategory: document.getElementById('recurring-field-category'),
  recurringFieldAmount: document.getElementById('recurring-field-amount'),
  recurringFieldDescription: document.getElementById('recurring-field-description'),
  recurringFieldFrequency: document.getElementById('recurring-field-frequency'),
  recurringFieldStartDate: document.getElementById('recurring-field-start-date'),
  recurringFieldPayStartDay: document.getElementById('recurring-field-pay-start-day'),
  recurringFieldPayEndDay: document.getElementById('recurring-field-pay-end-day'),
  recurringModalError: document.getElementById('recurring-modal-error'),

  // Generic confirm modal
  confirmModal: document.getElementById('confirm-modal'),
  confirmMessage: document.getElementById('confirm-message'),
  confirmOk: document.getElementById('confirm-ok'),
  confirmCancel: document.getElementById('confirm-cancel'),
};

let lineUserId = null;
let currentUser = null;
let scannedThumbnailPath = null;
let categoriesTabType = 'expense';
let editingCategoryId = null;
let billSplitType = 'equal';
let openBillDetailId = null;
let editingHoldingId = null;
const MANUAL_PRICE_ASSET_TYPES = ['mutual_fund', 'gold']; // mirrors backend/services/marketPrices.js -- no live price source for these

// ---- API + in-memory cache ----
//
// Any non-GET request clears the whole cache (simplest-correct for an app
// this size, rather than tracking exactly which keys a given write affects).
// GETs go through cachedGet() so revisiting a tab you've already loaded this
// session is instant instead of re-fetching.
const getCache = new Map();

async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch (networkError) {
    // fetch() itself rejects (no response at all) on a dropped connection, CORS
    // failure, or offline device -- distinguish this from an HTTP error response
    // below, since there's no status code to show for it.
    throw new Error(`Network error: ${networkError.message}`);
  }

  // A 413 (payload too large) or a 5xx from a proxy in front of the app is often
  // an HTML error page, not JSON -- always show the status code even when the
  // body can't be parsed, rather than silently swallowing it into a generic message.
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`[${response.status}] ${body.error || body.message || response.statusText || 'Request failed'}`);
  }

  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    getCache.clear();
  }
  return body;
}

async function cachedGet(path) {
  if (getCache.has(path)) return getCache.get(path);
  const result = await apiRequest(path);
  getCache.set(path, result);
  return result;
}

// ---- Shared helpers ----

function showError(message) {
  el.errorBanner.textContent = message;
  el.errorBanner.hidden = false;
}

// Real-time Channel B alert (see backend/services/transactionCreate.js): the
// server already decided NOT to also push this via LINE because this request
// came from the LIFF channel -- this banner IS the one and only notification
// for this budget crossing, so it has to actually show it, not just log it.
let budgetAlertTimer = null;
function showBudgetAlert(alert) {
  clearTimeout(budgetAlertTimer);
  el.budgetAlertBanner.textContent = `Budget alert: your "${alert.categoryName}" ${alert.budgetPeriod} budget of ${alert.budgetAmount.toFixed(2)} has been reached (${alert.totalSpent.toFixed(2)} spent).`;
  el.budgetAlertBanner.hidden = false;
  budgetAlertTimer = setTimeout(() => {
    el.budgetAlertBanner.hidden = true;
  }, 8000);
}

// The modal is a fixed, full-screen overlay, so the top-level error banner would be
// rendered underneath it and never seen -- errors from inside a modal need their
// own visible spot instead of (or in addition to) the global banner.
function showModalError(target, message) {
  target.textContent = message;
  target.hidden = false;
}

function clearModalError(target) {
  target.hidden = true;
}

// Mirrors the billing-cycle window used elsewhere in the backend (e.g. the bot's
// "summary" command): the current cycle starting on the user's configured day.
// `offset` steps whole cycles back (-1 = previous cycle) for the Transactions
// tab's period navigator.
function getBillingCycleRange(billingCycleStartDay, offset = 0) {
  const day = billingCycleStartDay || 1;
  const now = new Date();
  let start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));
  if (start > now) {
    start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, day));
  }
  if (offset) start = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + offset, day));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, day));
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

// Mirrors services/budgetAlert.js's getPeriodStartISO on the backend, for
// client-side "how much spent this period" display on the Categories tab.
function getPeriodStartDate(period) {
  const now = new Date();
  switch (period) {
    case 'daily':
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    case 'weekly': {
      const day = now.getUTCDay();
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
    }
    case 'monthly':
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    case 'yearly':
      return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    default:
      return null;
  }
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Billing-cycle bounds are UTC midnights (getBillingCycleRange) and the end is
// exclusive, so the label shows the last included day, formatted in UTC -- in
// local time (UTC+7) the end would otherwise read as the next cycle's first day.
function formatCycleLabel(startISO, endISO) {
  const fmt = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${fmt(startISO)} – ${fmt(new Date(new Date(endISO).getTime() - 1).toISOString())}`;
}

// Shared by category budgets and event buckets: amber from 80%, red once over.
const BUDGET_WARN_RATIO = 0.8;
function budgetFillClass(spent, budget) {
  if (spent >= budget) return 'category-budget-fill over';
  if (spent >= budget * BUDGET_WARN_RATIO) return 'category-budget-fill warn';
  return 'category-budget-fill';
}

function dayHeaderLabel(date) {
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== today.getFullYear() && { year: 'numeric' }),
  });
}

// YYYY-MM-01, matching backend/controllers/budgetEventController.js's period_month shape.
function currentMonthFirstDay() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderProfile(profile) {
  el.profileName.textContent = profile.displayName || 'You';
  if (profile.pictureUrl) {
    el.profilePicture.src = profile.pictureUrl;
  }
}

// Generic yes/no confirmation, used for every destructive action across tabs.
function confirmAction(message, confirmLabel = 'Delete') {
  return new Promise((resolve) => {
    el.confirmMessage.textContent = message;
    el.confirmOk.textContent = confirmLabel;
    el.confirmModal.hidden = false;

    function cleanup(result) {
      el.confirmModal.hidden = true;
      el.confirmOk.removeEventListener('click', onOk);
      el.confirmCancel.removeEventListener('click', onCancel);
      resolve(result);
    }
    function onOk() {
      cleanup(true);
    }
    function onCancel() {
      cleanup(false);
    }

    el.confirmOk.addEventListener('click', onOk);
    el.confirmCancel.addEventListener('click', onCancel);
  });
}

// ---- Theme (System / Light / Dark) ----
//
// Persisted client-side only (localStorage), not a backend preference -- the
// <head> inline script already applied any saved choice before first paint.
function applyTheme(choice) {
  if (choice === 'light' || choice === 'dark') {
    document.documentElement.setAttribute('data-theme', choice);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  for (const button of el.themeOptionButtons) {
    button.classList.toggle('active', button.dataset.themeOption === choice);
  }
}

function setTheme(choice) {
  if (choice === 'system') {
    localStorage.removeItem('theme');
  } else {
    localStorage.setItem('theme', choice);
  }
  applyTheme(choice);
}

for (const button of el.themeOptionButtons) {
  button.addEventListener('click', () => setTheme(button.dataset.themeOption));
}

applyTheme(localStorage.getItem('theme') || 'system');

// ---- Tab navigation ----
//
// Switching is pure, synchronous show/hide (instant); each tab's load function
// runs after, not blocking the switch, and reads through cachedGet so a repeat
// visit this session resolves immediately instead of re-fetching.
const TAB_LOADERS = {
  home: loadHomeTab,
  transactions: loadTransactionsTab,
  budgets: loadBudgetsTab,
  networth: loadNetWorthTab,
  settings: loadSettingsTab,
};

function switchTab(tabName) {
  for (const [name, panel] of Object.entries(el.tabPanels)) {
    panel.hidden = name !== tabName;
  }
  for (const button of el.navTabs) {
    button.classList.toggle('active', button.dataset.tab === tabName);
  }
  el.tabContent.scrollTop = 0;
  TAB_LOADERS[tabName]().catch((error) => showError(error.message));
  el.fabAdd.hidden = tabName === 'settings';
}

// ---- Dashboard tab ----

function renderSummary(transactions, periodLabel) {
  el.periodLabel.textContent = periodLabel;
  const totals = transactions.reduce(
    (acc, t) => {
      acc[t.type] += parseFloat(t.amount);
      return acc;
    },
    { income: 0, expense: 0 }
  );
  const net = totals.income - totals.expense;
  el.summaryIncome.textContent = totals.income.toFixed(2);
  el.summaryExpense.textContent = totals.expense.toFixed(2);
  el.summaryNet.textContent = net.toFixed(2);
  el.summaryNet.style.color = net >= 0 ? 'var(--color-income)' : 'var(--color-expense)';
}

// Grouped under one header per local calendar day (input is newest-first, so
// days come out newest-first too), each header carrying that day's spending.
function renderTransactionList(target, emptyStateEl, transactions, { showPaymentMethod = false } = {}) {
  target.innerHTML = '';
  emptyStateEl.hidden = transactions.length > 0;
  target.hidden = transactions.length === 0;

  const dayGroups = new Map();
  for (const t of transactions) {
    const date = new Date(t.transaction_date);
    const key = date.toDateString();
    if (!dayGroups.has(key)) dayGroups.set(key, { date, transactions: [] });
    dayGroups.get(key).transactions.push(t);
  }

  for (const { date, transactions: dayTransactions } of dayGroups.values()) {
    const spent = dayTransactions.filter((t) => t.type === 'expense').reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const header = document.createElement('li');
    header.className = 'transaction-day-header';
    header.innerHTML = `
      <span>${escapeHtml(dayHeaderLabel(date))}</span>
      ${spent > 0 ? `<span class="transaction-day-total">Spent ${spent.toFixed(2)}</span>` : ''}
    `;
    target.appendChild(header);
    for (const t of dayTransactions) target.appendChild(buildTransactionRow(t, showPaymentMethod));
  }
}

// Where the money moved: the account(s) when one is attributed, falling back to
// payment_method only when none is -- payment_method defaults to "cash", so on
// its own it would mislabel e.g. a bank-account expense as CASH.
function transactionSourceLabel(t) {
  const from = t.from_account?.account_name;
  const to = t.to_account?.account_name;
  if (t.type === 'transfer' && from && to) return `${from} → ${to}`;
  return from || to || t.payment_method || '';
}

function buildTransactionRow(t, showPaymentMethod) {
  const li = document.createElement('li');
  li.className = 'transaction-row';

  const thumbHtml = t.thumbnail_url ? `<img class="transaction-thumbnail" src="${t.thumbnail_url}" alt="" />` : '';
  const sourceLabel = transactionSourceLabel(t);
  const paymentHtml = showPaymentMethod && sourceLabel ? `<div class="transaction-date">${escapeHtml(sourceLabel)}</div>` : '';

  li.innerHTML = `
    ${thumbHtml}
    <div class="transaction-details">
      <div class="transaction-category">${escapeHtml(t.type === 'transfer' ? 'Transfer' : t.categories?.name || 'Uncategorized')}</div>
      ${t.description ? `<div class="transaction-description">${escapeHtml(t.description)}</div>` : ''}
      ${paymentHtml}
    </div>
    <div class="transaction-amount ${t.type}">${parseFloat(t.amount).toFixed(2)}</div>
  `;
  return li;
}

// ---- Logging streak (Home) ----
//
// Consecutive local calendar days with at least one transaction, from the
// Home tab's existing 6-month fetch (no extra request). A streak is still
// "alive" if today has nothing yet but yesterday does -- the hint nudges the
// user to log today instead of showing it as already lost. "Best" is the
// longest run inside that same 6-month window, and is labelled as such.
function localDayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function computeStreak(transactions, today = new Date()) {
  const loggedDays = new Set(transactions.map((t) => localDayKey(new Date(t.transaction_date))));
  const dayOffset = (n) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - n);

  const loggedToday = loggedDays.has(localDayKey(today));
  let current = 0;
  for (let n = loggedToday ? 0 : 1; loggedDays.has(localDayKey(dayOffset(n))); n++) current++;

  const sortedDays = [...new Set(transactions.map((t) => {
    const d = new Date(t.transaction_date);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < sortedDays.length; i++) {
    // Compare calendar dates, not a fixed 24h gap, so a DST shift can't break a run.
    const prev = i > 0 ? new Date(sortedDays[i - 1]) : null;
    const isNext = prev && localDayKey(new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1)) === localDayKey(new Date(sortedDays[i]));
    run = isNext ? run + 1 : 1;
    best = Math.max(best, run);
  }

  const lastSeven = [6, 5, 4, 3, 2, 1, 0].map((n) => {
    const date = dayOffset(n);
    return { date, logged: loggedDays.has(localDayKey(date)), isToday: n === 0 };
  });
  return { current, best: Math.max(best, current), loggedToday, lastSeven };
}

function renderStreak(transactions) {
  const { current, best, loggedToday, lastSeven } = computeStreak(transactions);
  el.streakCount.textContent = current === 0 ? 'No streak yet' : `${current}-day logging streak`;
  el.streakBest.textContent = best > 0 ? `Best: ${best} days (6 mo)` : '';
  el.streakDays.innerHTML = lastSeven
    .map(
      (d) => `
        <div class="streak-day${d.isToday ? ' today' : ''}">
          <span class="streak-dot${d.logged ? ' logged' : ''}" aria-label="${d.logged ? 'Logged' : 'Not logged'}"></span>
          <span>${d.isToday ? 'Today' : d.date.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
        </div>
      `
    )
    .join('');
  if (loggedToday) {
    el.streakHint.textContent = 'Logged today. Come back tomorrow to keep it going.';
  } else if (current > 0) {
    el.streakHint.textContent = `Log something today to keep your ${current}-day streak.`;
  } else {
    el.streakHint.textContent = 'Log a transaction today to start a streak.';
  }
}

async function loadHomeTab() {
  // The transactions fetch can't be date-filtered server-side until we know the
  // user's billing_cycle_start_day, which only comes back from the /users call --
  // so instead of waiting on that before firing it, fetch a wide-enough window
  // (6 months, also covers the Monthly Pulse trend chart) in parallel with
  // everything else and filter the cycle window client-side.
  const sixMonthsAgoISO = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 5, 1)).toISOString();
  const [userResponse, transactionsResponse, billsResponse] = await Promise.all([
    cachedGet(`/users/${lineUserId}`),
    cachedGet(`/transactions/${lineUserId}?start_date=${encodeURIComponent(sixMonthsAgoISO)}&limit=1000`),
    cachedGet(`/bills/${lineUserId}`),
  ]);

  currentUser = userResponse.user;

  const { startISO, endISO } = getBillingCycleRange(currentUser.billing_cycle_start_day);
  const periodLabel = `This cycle · ${formatCycleLabel(startISO, endISO)}`;

  const allTransactions = transactionsResponse.transactions;
  const periodStart = new Date(startISO);
  const periodEnd = new Date(endISO);
  // String comparison isn't safe here: the API returns "+00:00"-suffixed
  // timestamps while startISO/endISO are "Z"-suffixed -- same instant, different
  // string shape -- so these are compared as actual Dates instead.
  const inPeriod = allTransactions.filter((t) => {
    const d = new Date(t.transaction_date);
    return d >= periodStart && d < periodEnd;
  });

  renderSummary(inPeriod, periodLabel);
  renderStreak(allTransactions);
  renderTrendChart(allTransactions);
  // allTransactions is newest-first (API default order) across the whole
  // 6-month window -- the first 50 are still the 50 most recent overall.
  renderTransactionList(el.transactionList, el.emptyState, allTransactions.slice(0, 50));
  renderBillsList(billsResponse.bills);
}

// ---- Add Expense modal ----

async function renderAddExpenseCategoryOptions() {
  const response = await cachedGet(`/categories/${lineUserId}?type=expense`);
  const autoOption = '<option value="">Auto-Categorize</option>';
  const categoryOptions = response.categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  el.fieldCategory.innerHTML = autoOption + categoryOptions;
}

function resetReceiptScanState() {
  el.fieldReceiptImage.value = '';
  el.receiptPreview.hidden = true;
  el.receiptPreview.removeAttribute('src');
  el.scanStatus.hidden = true;
  el.scanStatus.classList.remove('scan-error');
  scannedThumbnailPath = null;
}

async function openAddExpenseModal() {
  el.fieldAmount.value = '';
  el.fieldDescription.value = '';
  el.fieldDate.value = new Date().toISOString().slice(0, 10);
  el.fieldCategory.value = ''; // defaults to "Auto-Categorize", not whatever was left selected last time
  clearModalError(el.modalError);
  resetReceiptScanState();
  el.addExpenseModal.hidden = false;
  try {
    await renderAddExpenseCategoryOptions();
  } catch (error) {
    showModalError(el.modalError, error.message);
  }
}

function closeAddExpenseModal() {
  el.addExpenseModal.hidden = true;
}

// Resizes to roughly match the iOS app's OCR payload (keeps upload size and
// Vision cost sane) rather than sending a multi-MB camera photo unmodified.
function resizeImageToJpegBlob(file, maxDimension = 1280, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not process this image.'))), 'image/jpeg', quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not load this image.'));
    };
    img.src = objectUrl;
  });
}

async function blobToBase64AndHash(blob) {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const base64 = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(blob);
  });
  return { base64, hashHex };
}

async function handleReceiptFileChange(event) {
  const file = event.target.files[0];
  if (!file) return;

  clearModalError(el.modalError);
  el.scanStatus.hidden = false;
  el.scanStatus.classList.remove('scan-error');
  el.scanStatus.textContent = 'Scanning receipt…';

  try {
    const resizedBlob = await resizeImageToJpegBlob(file);
    el.receiptPreview.src = URL.createObjectURL(resizedBlob);
    el.receiptPreview.hidden = false;

    const { base64, hashHex } = await blobToBase64AndHash(resizedBlob);

    const response = await apiRequest(`/ocr/scan/${lineUserId}`, {
      method: 'POST',
      body: JSON.stringify({ image_base64: base64, slip_hash: hashHex }),
    });

    const data = response.data;
    if (data.amount != null) el.fieldAmount.value = data.amount;
    if (data.merchant) el.fieldDescription.value = data.merchant;
    if (data.date) el.fieldDate.value = data.date;
    if (data.suggested_category_id) el.fieldCategory.value = data.suggested_category_id;
    scannedThumbnailPath = data.thumbnail_path || null;

    el.scanStatus.textContent = 'Scanned — review the details below before saving.';
  } catch (error) {
    el.scanStatus.classList.add('scan-error');
    el.scanStatus.textContent = error.message;
  }
}

async function handleAddExpenseSubmit(event) {
  event.preventDefault();
  const submitButton = event.submitter;
  submitButton.disabled = true;
  clearModalError(el.modalError);

  try {
    const response = await apiRequest(`/transactions/${lineUserId}`, {
      method: 'POST',
      body: JSON.stringify({
        // Left empty ("Auto-Categorize"), this key is dropped entirely by
        // JSON.stringify rather than sent as category_id: "" -- the backend
        // infers it from the description via services/autoCategorize.js.
        category_id: el.fieldCategory.value || undefined,
        amount: parseFloat(el.fieldAmount.value),
        type: 'expense',
        description: el.fieldDescription.value || undefined,
        thumbnail_url: scannedThumbnailPath || undefined,
        transaction_date: new Date(`${el.fieldDate.value}T12:00:00Z`).toISOString(),
        // Tells the backend to skip its own LINE push for this budget crossing
        // and hand the alert back here instead -- see transactionCreate.js.
        channel: 'liff',
      }),
    });
    closeAddExpenseModal();
    await loadHomeTab();
    if (response.budget_alert) {
      showBudgetAlert(response.budget_alert);
    }
  } catch (error) {
    // Shown inside the modal, not the top-level banner -- the modal overlay would
    // otherwise hide the banner from view while still open.
    showModalError(el.modalError, error.message);
  } finally {
    submitButton.disabled = false;
  }
}

// ---- Shared Bills ----
//
// Participants are plain display names, not linked LINE accounts (see migration
// 010's header comment for why) -- settlement happens either here, by the
// creator tapping "Mark Paid" on someone's behalf, or by the participant
// themselves via the public, no-login bill.html share link (the bill's UUID
// is the only "auth" that page has, same model a payment-split link uses).

function renderBillsList(bills) {
  el.billsList.innerHTML = '';
  el.billsEmptyState.hidden = bills.length > 0;

  for (const bill of bills) {
    const participants = bill.shared_bill_participants || [];
    const paidCount = participants.filter((p) => p.is_paid).length;
    const statusText = bill.status === 'settled' ? 'Settled' : `${paidCount}/${participants.length} paid`;

    const li = document.createElement('li');
    li.className = 'category-row';
    li.innerHTML = `
      <div class="category-row-top">
        <span class="category-name">${escapeHtml(bill.title)}</span>
        <span class="bill-status-pill ${bill.status === 'settled' ? 'paid' : 'unpaid'}">${statusText}</span>
      </div>
      <div class="category-bar-label-row"><span>${parseFloat(bill.total_amount).toFixed(2)}</span></div>
    `;
    li.addEventListener('click', () => openBillDetail(bill.id));
    el.billsList.appendChild(li);
  }
}

// ---- Bill create modal ----

function setBillSplitType(type) {
  billSplitType = type;
  for (const button of el.billSplitButtons) {
    button.classList.toggle('active', button.dataset.splitType === type);
  }
  el.billItemizedSection.hidden = type !== 'itemized';
  const showAmount = type === 'custom';
  el.billParticipantsList.querySelectorAll('.bill-participant-amount').forEach((input) => {
    input.hidden = !showAmount;
  });
}

for (const button of el.billSplitButtons) {
  button.addEventListener('click', () => setBillSplitType(button.dataset.splitType));
}

function participantNames() {
  return Array.from(el.billParticipantsList.querySelectorAll('.bill-participant-name')).map((input) => input.value || 'Unnamed');
}

// Each item row carries its assignment in data-participant ('' = Shared, else
// a participant index) and shows it as tap-to-assign chips. Rebuilt on every
// participant add/remove/rename so chips always match the current names; an
// assignment pointing past the end of the list falls back to Shared.
function renderAssignChips(row) {
  const names = participantNames();
  if (row.dataset.participant !== '' && Number(row.dataset.participant) >= names.length) row.dataset.participant = '';
  const chips = row.querySelector('.assign-chips');
  chips.innerHTML = [['', 'Shared'], ...names.map((name, i) => [String(i), name])]
    .map(([value, label]) => `<button type="button" class="assign-chip${row.dataset.participant === value ? ' active' : ''}" data-value="${value}">${escapeHtml(label)}</button>`)
    .join('');
}

function refreshItemParticipantSelects() {
  el.billItemsList.querySelectorAll('.bill-item-row').forEach(renderAssignChips);
}

function addParticipantRow(name = '', amount = '') {
  const row = document.createElement('div');
  row.className = 'bill-participant-row';
  row.innerHTML = `
    <input type="text" class="bill-participant-name" placeholder="Name" maxlength="128" />
    <input type="number" class="bill-participant-amount" placeholder="Amount" step="0.01" min="0" ${billSplitType === 'custom' ? '' : 'hidden'} />
    <button type="button" class="bill-row-remove" aria-label="Remove">&times;</button>
  `;
  row.querySelector('.bill-participant-name').value = name;
  row.querySelector('.bill-participant-amount').value = amount;
  row.querySelector('.bill-participant-name').addEventListener('input', refreshItemParticipantSelects);
  row.querySelector('.bill-row-remove').addEventListener('click', () => {
    row.remove();
    refreshItemParticipantSelects();
  });
  el.billParticipantsList.appendChild(row);
  refreshItemParticipantSelects();
}

function addItemRow(name = '', amount = '', participantIndex = null) {
  const row = document.createElement('div');
  row.className = 'bill-item-row';
  row.dataset.participant = participantIndex === null ? '' : String(participantIndex);
  row.innerHTML = `
    <input type="text" class="bill-item-name" placeholder="Item" maxlength="128" />
    <input type="number" class="bill-item-amount" placeholder="Amount" step="0.01" min="0.01" />
    <button type="button" class="bill-row-remove" aria-label="Remove">&times;</button>
    <div class="assign-chips" role="group" aria-label="Assign to"></div>
  `;
  row.querySelector('.bill-item-name').value = name;
  row.querySelector('.bill-item-amount').value = amount;
  row.querySelector('.bill-row-remove').addEventListener('click', () => row.remove());
  row.querySelector('.assign-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.assign-chip');
    if (!chip) return;
    row.dataset.participant = chip.dataset.value;
    renderAssignChips(row);
  });
  el.billItemsList.appendChild(row);
  renderAssignChips(row);
}

async function handleBillReceiptFileChange(event) {
  const file = event.target.files[0];
  if (!file) return;

  clearModalError(el.billModalError);
  el.billScanStatus.hidden = false;
  el.billScanStatus.classList.remove('scan-error');
  el.billScanStatus.textContent = 'Scanning receipt…';

  try {
    const resizedBlob = await resizeImageToJpegBlob(file);
    const { base64 } = await blobToBase64AndHash(resizedBlob);

    const response = await apiRequest(`/bills/${lineUserId}/scan-items`, {
      method: 'POST',
      body: JSON.stringify({ image_base64: base64 }),
    });

    const data = response.data;
    for (const item of data.items) {
      addItemRow(item.name, item.amount, null);
    }
    if (data.tax) addItemRow('Tax', data.tax, null);
    if (data.service_charge) addItemRow('Service Charge', data.service_charge, null);
    if (data.total != null) el.billFieldTotal.value = data.total;

    el.billScanStatus.textContent = 'Scanned — assign each item to a person below, or leave it Shared.';
  } catch (error) {
    el.billScanStatus.classList.add('scan-error');
    el.billScanStatus.textContent = error.message;
  }
}

function resetBillModal() {
  el.billFieldTitle.value = '';
  el.billFieldTotal.value = '';
  el.billParticipantsList.innerHTML = '';
  el.billItemsList.innerHTML = '';
  el.billFieldReceiptImage.value = '';
  el.billScanStatus.hidden = true;
  el.billScanStatus.classList.remove('scan-error');
  setBillSplitType('equal');
  addParticipantRow();
}

function openBillModal() {
  clearModalError(el.billModalError);
  resetBillModal();
  el.billModal.hidden = false;
}

function closeBillModal() {
  el.billModal.hidden = true;
}

function collectParticipants() {
  return Array.from(el.billParticipantsList.querySelectorAll('.bill-participant-row')).map((row) => ({
    display_name: row.querySelector('.bill-participant-name').value.trim(),
    amount_owed: parseFloat(row.querySelector('.bill-participant-amount').value) || 0,
  }));
}

function collectItems() {
  return Array.from(el.billItemsList.querySelectorAll('.bill-item-row')).map((row) => {
    const participantValue = row.dataset.participant;
    return {
      name: row.querySelector('.bill-item-name').value.trim(),
      amount: parseFloat(row.querySelector('.bill-item-amount').value),
      participant_index: participantValue === '' ? null : Number(participantValue),
    };
  });
}

async function handleBillSubmit(event) {
  event.preventDefault();
  const submitButton = event.submitter;
  submitButton.disabled = true;
  clearModalError(el.billModalError);

  try {
    const participants = collectParticipants();
    if (participants.length === 0 || participants.some((p) => !p.display_name)) {
      throw new Error('Every participant needs a name.');
    }

    const payload = {
      title: el.billFieldTitle.value,
      total_amount: parseFloat(el.billFieldTotal.value),
      split_type: billSplitType,
      participants: participants.map((p) => (billSplitType === 'custom' ? p : { display_name: p.display_name })),
    };
    if (billSplitType === 'itemized') {
      payload.items = collectItems();
    }

    await apiRequest(`/bills/${lineUserId}`, { method: 'POST', body: JSON.stringify(payload) });
    closeBillModal();
    await loadHomeTab();
  } catch (error) {
    showModalError(el.billModalError, error.message);
  } finally {
    submitButton.disabled = false;
  }
}

// ---- Bill detail modal ----

async function openBillDetail(billId) {
  openBillDetailId = billId;
  clearModalError(el.billDetailError);
  el.billDetailModal.hidden = false;
  try {
    const response = await apiRequest(`/bills/${lineUserId}/${billId}`);
    renderBillDetail(response.bill);
  } catch (error) {
    showModalError(el.billDetailError, error.message);
  }
}

function renderBillDetail(bill) {
  el.billDetailTitle.textContent = bill.title;
  el.billDetailMeta.textContent = `${parseFloat(bill.total_amount).toFixed(2)} total — ${bill.split_type} split`;

  const participants = bill.shared_bill_participants;
  const paidCount = participants.filter((p) => p.is_paid).length;
  const owedTotal = participants.reduce((sum, p) => sum + parseFloat(p.amount_owed), 0);
  const outstanding = participants.filter((p) => !p.is_paid).reduce((sum, p) => sum + parseFloat(p.amount_owed), 0);
  el.billProgressCount.textContent = `${paidCount} of ${participants.length} paid`;
  el.billProgressOutstanding.textContent = outstanding > 0 ? `${outstanding.toFixed(2)} outstanding` : 'Settled';
  el.billProgressFill.style.width = `${owedTotal > 0 ? Math.round(((owedTotal - outstanding) / owedTotal) * 100) : 100}%`;

  el.billDetailParticipants.innerHTML = '';
  for (const participant of participants) {
    const li = document.createElement('li');
    li.className = 'category-row';
    li.innerHTML = `
      <div class="bill-participant-detail-row">
        <span class="category-name">
          ${escapeHtml(participant.display_name)}
          <span class="bill-status-pill ${participant.is_paid ? 'paid' : 'unpaid'}">${participant.is_paid ? 'Paid' : 'Unpaid'}</span>
        </span>
        <span>${parseFloat(participant.amount_owed).toFixed(2)}</span>
        <button type="button" class="bill-participant-toggle">${participant.is_paid ? 'Undo' : 'Mark Paid'}</button>
      </div>
    `;
    li.querySelector('.bill-participant-toggle').addEventListener('click', () =>
      toggleParticipantPaid(bill.id, participant.id, !participant.is_paid)
    );
    el.billDetailParticipants.appendChild(li);
  }
}

async function toggleParticipantPaid(billId, participantId, isPaid) {
  clearModalError(el.billDetailError);
  try {
    await apiRequest(`/bills/${lineUserId}/${billId}/participants/${participantId}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_paid: isPaid }),
    });
    const response = await apiRequest(`/bills/${lineUserId}/${billId}`);
    renderBillDetail(response.bill);
    await loadHomeTab();
  } catch (error) {
    showModalError(el.billDetailError, error.message);
  }
}

function closeBillDetailModal() {
  el.billDetailModal.hidden = true;
  openBillDetailId = null;
}

async function handleDeleteBill() {
  if (!openBillDetailId) return;
  const confirmed = await confirmAction('Delete this shared bill? This cannot be undone.');
  if (!confirmed) return;
  try {
    await apiRequest(`/bills/${lineUserId}/${openBillDetailId}`, { method: 'DELETE' });
    closeBillDetailModal();
    await loadHomeTab();
  } catch (error) {
    showModalError(el.billDetailError, error.message);
  }
}

// KhunTong's core loop: drop the bill into the group chat so participants open
// the public share page themselves (they're plain names, not LINE accounts, so
// the bot can't message them directly). shareTargetPicker only exists inside
// the LINE app and only once it's enabled for this LIFF app in the console --
// anywhere else this falls back to copying the link.
async function handleShareBillToLine() {
  if (!openBillDetailId) return;
  clearModalError(el.billDetailError);
  const url = `${location.origin}/liff/bill.html?id=${openBillDetailId}`;
  const title = el.billDetailTitle.textContent;
  const outstanding = el.billProgressOutstanding.textContent;
  const text = `${title}: ${outstanding === 'Settled' ? 'all settled' : outstanding}.\nCheck what you owe and mark it paid here: ${url}`;

  if (!liff.isApiAvailable('shareTargetPicker')) {
    await handleCopyShareLink();
    showModalError(el.billDetailError, "Sharing to LINE isn't available here, so the link was copied instead.");
    return;
  }
  try {
    const result = await liff.shareTargetPicker([{ type: 'text', text }]);
    if (result) {
      el.billShareLine.lastElementChild.textContent = 'Shared';
      setTimeout(() => {
        el.billShareLine.lastElementChild.textContent = 'Share to LINE';
      }, 2000);
    }
  } catch (error) {
    showModalError(el.billDetailError, `Could not share: ${error.message}`);
  }
}

async function handleCopyShareLink() {
  if (!openBillDetailId) return;
  const url = `${location.origin}/liff/bill.html?id=${openBillDetailId}`;
  try {
    await navigator.clipboard.writeText(url);
    el.billCopyLink.textContent = 'Copied';
    setTimeout(() => {
      el.billCopyLink.textContent = 'Copy Link';
    }, 2000);
  } catch (error) {
    showModalError(el.billDetailError, `Could not copy automatically — copy this link manually: ${url}`);
  }
}

// ---- Analytics tab ----

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [year, month] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, { month: 'short' });
}

function renderTrendChart(transactions) {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(monthKey(d));
  }

  const totals = Object.fromEntries(months.map((m) => [m, { income: 0, expense: 0 }]));
  for (const t of transactions) {
    const key = monthKey(new Date(t.transaction_date));
    if (totals[key]) totals[key][t.type] += parseFloat(t.amount);
  }

  const maxValue = Math.max(1, ...months.flatMap((m) => [totals[m].income, totals[m].expense]));

  el.trendChart.innerHTML = months
    .map((m) => {
      const incomeHeight = Math.round((totals[m].income / maxValue) * 100);
      const expenseHeight = Math.round((totals[m].expense / maxValue) * 100);
      return `
        <div class="trend-month">
          <div class="trend-bars">
            <div class="trend-bar income" style="height:${incomeHeight}%" title="Income ${totals[m].income.toFixed(2)}"></div>
            <div class="trend-bar expense" style="height:${expenseHeight}%" title="Expense ${totals[m].expense.toFixed(2)}"></div>
          </div>
          <div class="trend-month-label">${monthLabel(m)}</div>
        </div>
      `;
    })
    .join('');
}

// Follows the Budgets tab's Expense/Income toggle (categoriesTabType) rather
// than having a second switcher of its own.
function renderCategoryBreakdown(transactions, periodStart, periodEnd, type = 'expense') {
  const totalsByCategory = new Map();
  for (const t of transactions) {
    if (t.type !== type) continue;
    const d = new Date(t.transaction_date);
    if (d < periodStart || d >= periodEnd) continue;
    const name = t.categories?.name || 'Uncategorized';
    totalsByCategory.set(name, (totalsByCategory.get(name) || 0) + parseFloat(t.amount));
  }

  const rows = Array.from(totalsByCategory.entries()).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((sum, [, amount]) => sum + amount, 0);
  el.breakdownTotalLabel.textContent = type === 'income' ? 'Earned this cycle' : 'Spent this cycle';
  el.breakdownTotalValue.textContent = total.toFixed(2);
  el.breakdownTotalValue.style.color = type === 'income' ? 'var(--color-income)' : 'var(--color-expense)';
  const maxValue = Math.max(1, ...rows.map(([, amount]) => amount));

  el.categoryChart.innerHTML = rows
    .map(
      ([name, amount]) => `
        <div class="category-bar-row">
          <div class="category-bar-label-row">
            <span>${escapeHtml(name)}</span>
            <span>${amount.toFixed(2)}</span>
          </div>
          <div class="category-bar-track">
            <div class="category-bar-fill" style="width:${Math.round((amount / maxValue) * 100)}%"></div>
          </div>
        </div>
      `
    )
    .join('');

  return rows.length > 0;
}

// Shared by loadBudgetsTab and loadNetWorthTab -- both need "surplus this
// period" (Budgets for the category breakdown context, Net Worth for the
// emergency-fund allocation nudge), and both need currentUser's billing cycle
// loaded first.
async function ensureCurrentUser() {
  if (!currentUser) {
    const userResponse = await cachedGet(`/users/${lineUserId}`);
    currentUser = userResponse.user;
  }
  return currentUser;
}

async function computeCurrentPeriodSurplus() {
  await ensureCurrentUser();
  const { startISO, endISO } = getBillingCycleRange(currentUser.billing_cycle_start_day);
  const periodStart = new Date(startISO);
  const periodEnd = new Date(endISO);
  const response = await cachedGet(`/transactions/${lineUserId}?start_date=${encodeURIComponent(startISO)}&end_date=${encodeURIComponent(endISO)}&limit=1000`);
  const surplus = response.transactions.reduce(
    (sum, t) => sum + (t.type === 'income' ? 1 : t.type === 'expense' ? -1 : 0) * parseFloat(t.amount),
    0
  );
  return { surplus, periodStart, periodEnd };
}

// ---- Portfolio & Net Worth (Analytics tab) ----

const ASSET_TYPE_LABELS = { stock: 'Stock', etf: 'ETF', crypto: 'Crypto', mutual_fund: 'Mutual Fund', gold: 'Gold' };

function renderPortfolio(data, surplus) {
  el.portfolioTotalValue.textContent = data.totals.total_value.toFixed(2);
  el.portfolioTotalCost.textContent = data.totals.total_cost_basis.toFixed(2);
  el.portfolioTotalGain.textContent = data.totals.total_gain.toFixed(2);
  el.portfolioTotalGain.style.color = data.totals.total_gain >= 0 ? 'var(--color-income)' : 'var(--color-expense)';

  const allocationEntries = Object.entries(data.allocation_by_type).sort((a, b) => b[1] - a[1]);
  const maxAllocation = Math.max(1, ...allocationEntries.map(([, pct]) => pct));
  el.portfolioAllocationChart.innerHTML = allocationEntries
    .map(
      ([type, pct]) => `
        <div class="category-bar-row">
          <div class="category-bar-label-row">
            <span>${escapeHtml(ASSET_TYPE_LABELS[type] || type)}</span>
            <span>${pct.toFixed(1)}%</span>
          </div>
          <div class="category-bar-track">
            <div class="category-bar-fill" style="width:${Math.round((pct / maxAllocation) * 100)}%"></div>
          </div>
        </div>
      `
    )
    .join('');

  renderEmergencyFund(data.emergency_fund, surplus);
  renderHoldingsList(data.holdings);
}

// Deliberately does nothing (no suggestion, no progress bar) until the user
// has actually configured a goal + account in Settings -- an unconfigured
// emergency fund has nothing true to say about progress.
function renderEmergencyFund(fund, surplus) {
  if (!fund || fund.goal_amount === null || !fund.account_id) {
    el.emergencyFundCard.hidden = true;
    return;
  }
  el.emergencyFundCard.hidden = false;

  const current = fund.current_amount || 0;
  const pct = fund.percent_funded || 0;
  el.emergencyFundLabel.textContent = `${current.toFixed(2)} / ${fund.goal_amount.toFixed(2)} (${pct.toFixed(0)}%)`;
  el.emergencyFundFill.style.width = `${Math.min(100, pct)}%`;

  if (pct >= 100) {
    el.emergencyFundSuggestion.textContent = 'Goal reached — consider directing any surplus toward your portfolio instead.';
  } else if (surplus > 0) {
    el.emergencyFundSuggestion.textContent = `Surplus this period: ${surplus.toFixed(2)}. Consider adding it to "${fund.account_name}" (${pct.toFixed(0)}% funded) or your portfolio.`;
  } else {
    el.emergencyFundSuggestion.textContent = '';
  }
}

function formatPricedAt(holding) {
  if (MANUAL_PRICE_ASSET_TYPES.includes(holding.asset_type)) return holding.priced_at ? `Manual, ${new Date(holding.priced_at).toLocaleDateString()}` : 'Manual price';
  if (!holding.priced_at) return 'Fetching live price…';
  const t = new Date(holding.priced_at);
  const sameDay = t.toDateString() === new Date().toDateString();
  return `Live, ${sameDay ? t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : t.toLocaleDateString()}`;
}

function renderHoldingsList(holdings) {
  el.holdingsList.innerHTML = '';
  el.holdingsEmptyState.hidden = holdings.length > 0;

  for (const holding of holdings) {
    const li = document.createElement('li');
    li.className = 'category-row';
    const gainSign = holding.gain >= 0 ? '+' : '';
    li.innerHTML = `
      <div class="category-row-top">
        <span class="category-name">${escapeHtml(holding.symbol)}${holding.name ? ` — ${escapeHtml(holding.name)}` : ''}</span>
        <span class="category-budget-label">${holding.market_value.toFixed(2)}</span>
      </div>
      <div class="category-bar-label-row">
        <span>${ASSET_TYPE_LABELS[holding.asset_type]} · ${parseFloat(holding.quantity)} units</span>
        ${
          holding.current_price === null
            ? '<span class="empty-state">No price yet</span>'
            : `<span style="color:${holding.gain >= 0 ? 'var(--color-income)' : 'var(--color-expense)'}">${gainSign}${holding.gain.toFixed(2)} (${gainSign}${holding.gain_percent.toFixed(1)}%)</span>`
        }
      </div>
      <div class="category-bar-label-row">
        <span>${holding.current_price === null ? '' : `Price ${parseFloat(holding.current_price).toFixed(2)}`}</span>
        <span>${formatPricedAt(holding)}</span>
      </div>
      <div class="bill-participant-detail-row" style="margin-top: 6px;">
        <button type="button" class="link-button holding-edit">Edit</button>
        <button type="button" class="category-delete holding-delete">Delete</button>
      </div>
    `;
    li.querySelector('.holding-edit').addEventListener('click', () => openHoldingModal(holding));
    li.querySelector('.holding-delete').addEventListener('click', () => handleDeleteHolding(holding.id));
    el.holdingsList.appendChild(li);
  }
}

async function handleDeleteHolding(holdingId) {
  const confirmed = await confirmAction('Remove this holding from your portfolio?');
  if (!confirmed) return;
  try {
    await apiRequest(`/portfolio/${lineUserId}/${holdingId}`, { method: 'DELETE' });
    await loadNetWorthTab();
  } catch (error) {
    showError(error.message);
  }
}

// Prices are only ever stored when something asks for them -- there's no
// background price job -- so opening the tab kicks off a refresh for any
// live-priced holding that has never been priced or whose price is stale.
// Runs after the tab has already rendered (never blocks it on Yahoo/CoinGecko),
// and at most once per PRICE_STALE_MS per session, so a ticker that keeps
// failing can't turn loadNetWorthTab() -> refresh -> loadNetWorthTab() into a loop.
const PRICE_STALE_MS = 15 * 60 * 1000;
let lastAutoPriceRefreshAt = 0;

function autoRefreshStalePrices(holdings) {
  const now = Date.now();
  if (now - lastAutoPriceRefreshAt < PRICE_STALE_MS) return;
  const hasStale = holdings.some(
    (h) => !MANUAL_PRICE_ASSET_TYPES.includes(h.asset_type) && (!h.priced_at || now - new Date(h.priced_at).getTime() > PRICE_STALE_MS)
  );
  if (!hasStale) return;
  lastAutoPriceRefreshAt = now;
  handleRefreshPrices();
}

async function handleRefreshPrices() {
  el.refreshPricesButton.disabled = true;
  el.refreshPricesButton.textContent = 'Refreshing…';
  try {
    const response = await apiRequest(`/portfolio/${lineUserId}/refresh-all`, { method: 'POST' });
    const failed = response.results.filter((r) => !r.success);
    await loadNetWorthTab();
    if (failed.length > 0) {
      showError(`Could not refresh: ${failed.map((f) => f.symbol).join(', ')}`);
    }
  } catch (error) {
    showError(error.message);
  } finally {
    el.refreshPricesButton.disabled = false;
    el.refreshPricesButton.textContent = 'Refresh Prices';
  }
}

// ---- Holding modal ----

function updateHoldingFieldsForType() {
  const isManual = MANUAL_PRICE_ASSET_TYPES.includes(el.holdingFieldType.value);
  el.holdingPriceField.hidden = !isManual;
  el.holdingSymbolHint.textContent =
    el.holdingFieldType.value === 'crypto'
      ? 'Use the CoinGecko id (e.g. "bitcoin"), not a ticker like "BTC".'
      : isManual
        ? 'No live price source for this type -- enter the current price manually.'
        : 'Use the exchange ticker (e.g. "AAPL", "VOO").';
}

function openHoldingModal(holding) {
  editingHoldingId = holding ? holding.id : null;
  el.holdingFieldType.value = holding ? holding.asset_type : 'stock';
  el.holdingFieldType.disabled = !!holding;
  el.holdingFieldSymbol.value = holding ? holding.symbol : '';
  el.holdingFieldSymbol.disabled = !!holding;
  el.holdingFieldName.value = holding ? holding.name || '' : '';
  el.holdingFieldQuantity.value = holding ? holding.quantity : '';
  el.holdingFieldCost.value = holding ? holding.average_cost : '';
  el.holdingFieldPrice.value = holding ? holding.current_price || '' : '';
  updateHoldingFieldsForType();
  clearModalError(el.holdingModalError);
  el.holdingModal.hidden = false;
}

function closeHoldingModal() {
  el.holdingModal.hidden = true;
  el.holdingFieldType.disabled = false;
  el.holdingFieldSymbol.disabled = false;
}

async function handleHoldingSubmit(event) {
  event.preventDefault();
  const submitButton = event.submitter;
  submitButton.disabled = true;
  clearModalError(el.holdingModalError);

  try {
    const isManual = MANUAL_PRICE_ASSET_TYPES.includes(el.holdingFieldType.value);
    if (editingHoldingId) {
      await apiRequest(`/portfolio/${lineUserId}/${editingHoldingId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: el.holdingFieldName.value || null,
          quantity: parseFloat(el.holdingFieldQuantity.value),
          average_cost: parseFloat(el.holdingFieldCost.value),
          current_price: isManual && el.holdingFieldPrice.value ? parseFloat(el.holdingFieldPrice.value) : undefined,
        }),
      });
    } else {
      await apiRequest(`/portfolio/${lineUserId}`, {
        method: 'POST',
        body: JSON.stringify({
          asset_type: el.holdingFieldType.value,
          symbol: el.holdingFieldSymbol.value,
          name: el.holdingFieldName.value || undefined,
          quantity: parseFloat(el.holdingFieldQuantity.value),
          average_cost: parseFloat(el.holdingFieldCost.value),
          current_price: isManual && el.holdingFieldPrice.value ? parseFloat(el.holdingFieldPrice.value) : undefined,
        }),
      });
    }
    closeHoldingModal();
    await loadNetWorthTab();
  } catch (error) {
    showModalError(el.holdingModalError, error.message);
  } finally {
    submitButton.disabled = false;
  }
}

// ---- Categories & Budgets tab ----

function setCategoriesTabType(type) {
  categoriesTabType = type;
  el.categoriesTypeExpense.classList.toggle('active', type === 'expense');
  el.categoriesTypeIncome.classList.toggle('active', type === 'income');
  loadBudgetsTab().catch((error) => showError(error.message));
}

// ---- Budgets tab: recurring-period categories, this period's breakdown,
// event/occasion buckets, and (collapsed by default) recurring rules ----
async function loadBudgetsTab() {
  await ensureCurrentUser();
  const { startISO, endISO } = getBillingCycleRange(currentUser.billing_cycle_start_day);
  const periodStart = new Date(startISO);
  const periodEnd = new Date(endISO);

  const [categoriesResponse, transactionsResponse, eventsResponse] = await Promise.all([
    cachedGet(`/categories/${lineUserId}?type=${categoriesTabType}`),
    cachedGet(`/transactions/${lineUserId}?limit=200`),
    cachedGet(`/budget-events/${lineUserId}?month=${currentMonthFirstDay()}`),
  ]);

  renderCategoriesList(categoriesResponse.categories, transactionsResponse.transactions);
  const hasBreakdown = renderCategoryBreakdown(transactionsResponse.transactions, periodStart, periodEnd, categoriesTabType);
  el.analyticsEmptyState.hidden = transactionsResponse.transactions.length > 0 || hasBreakdown;
  renderEventBudgetsList(eventsResponse.budget_events);

  if (!el.advancedSection.hidden) {
    await loadRecurringList();
  }
}

// ---- Event/Occasion budgets (Budgets tab) ----
//
// A category's budget_amount/budget_period (categories table) is the
// recurring, predictable limit. This is the one-off, specific-month limit
// layered on top of it -- e.g. a one-off clinic visit stacked on top of a
// regular monthly skincare budget. Always tied to an existing category;
// "spent" is computed server-side from that category's transactions within
// the target month (see backend/controllers/budgetEventController.js).

function renderEventBudgetsList(events) {
  el.eventsList.innerHTML = '';
  el.eventsEmptyState.hidden = events.length > 0;
  el.eventsList.hidden = events.length === 0;

  for (const event of events) {
    const li = document.createElement('li');
    li.className = 'category-row';
    li.innerHTML = `
      <div class="category-row-top">
        <span class="category-name">${escapeHtml(event.title)}</span>
        <span class="category-budget-label">${event.spent.toFixed(2)} / ${parseFloat(event.amount).toFixed(2)}</span>
      </div>
      <div class="category-bar-label-row"><span>${escapeHtml(event.categories?.name || '')}</span></div>
      <div class="category-budget-track">
        <div class="${budgetFillClass(event.spent, parseFloat(event.amount))}" style="width:${Math.round(event.percent)}%"></div>
      </div>
      <div class="bill-participant-detail-row" style="margin-top: 6px;">
        <span></span>
        <button type="button" class="category-delete event-delete">Delete</button>
      </div>
    `;
    li.querySelector('.event-delete').addEventListener('click', () => handleDeleteEvent(event.id));
    el.eventsList.appendChild(li);
  }
}

async function populateEventCategoryOptions() {
  // Event buckets apply to expense categories only -- an "occasion" is
  // always a spending bucket, never an income one.
  const response = await cachedGet(`/categories/${lineUserId}?type=expense`);
  el.eventFieldCategory.innerHTML = response.categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
}

async function openEventModal() {
  el.eventFieldTitle.value = '';
  el.eventFieldAmount.value = '';
  el.eventFieldMonth.value = currentMonthFirstDay().slice(0, 7);
  clearModalError(el.eventModalError);
  el.eventModal.hidden = false;
  try {
    await populateEventCategoryOptions();
  } catch (error) {
    showModalError(el.eventModalError, error.message);
  }
}

function closeEventModal() {
  el.eventModal.hidden = true;
}

async function handleEventSubmit(event) {
  event.preventDefault();
  const submitButton = event.submitter;
  submitButton.disabled = true;
  clearModalError(el.eventModalError);

  try {
    await apiRequest(`/budget-events/${lineUserId}`, {
      method: 'POST',
      body: JSON.stringify({
        category_id: el.eventFieldCategory.value,
        title: el.eventFieldTitle.value,
        amount: parseFloat(el.eventFieldAmount.value),
        period_month: `${el.eventFieldMonth.value}-01`,
      }),
    });
    closeEventModal();
    await loadBudgetsTab();
    showBudgetsStatus('Event budget added.');
  } catch (error) {
    showModalError(el.eventModalError, error.message);
  } finally {
    submitButton.disabled = false;
  }
}

async function handleDeleteEvent(eventId) {
  const confirmed = await confirmAction('Delete this event budget?', 'Delete');
  if (!confirmed) return;
  try {
    await apiRequest(`/budget-events/${lineUserId}/${eventId}`, { method: 'DELETE' });
    await loadBudgetsTab();
    showBudgetsStatus('Event budget deleted.');
  } catch (error) {
    showBudgetsStatus(error.message);
  }
}

// ---- Advanced section toggle (Budgets tab -> Recurring rules) ----
function toggleAdvancedSection() {
  const isOpen = el.advancedToggle.getAttribute('aria-expanded') === 'true';
  el.advancedToggle.setAttribute('aria-expanded', String(!isOpen));
  el.advancedSection.hidden = isOpen;
  if (!isOpen) {
    loadRecurringList().catch((error) => showBudgetsStatus(error.message));
  }
}

const ACCOUNT_TYPE_LABELS = { bank: 'Bank', credit_card: 'Credit Card', e_wallet: 'E-Wallet', cash: 'Cash' };

function renderAccountsList(accounts) {
  el.accountsList.innerHTML = '';
  el.accountsEmptyState.hidden = accounts.length > 0;

  for (const account of accounts) {
    const li = document.createElement('li');
    li.className = 'category-row';
    li.innerHTML = `
      <div class="category-row-top">
        <span class="category-name">${escapeHtml(account.account_name)}</span>
        <span class="category-budget-label">${parseFloat(account.balance).toFixed(2)}</span>
      </div>
      <div class="category-bar-label-row"><span>${ACCOUNT_TYPE_LABELS[account.account_type] || account.account_type}</span></div>
    `;
    el.accountsList.appendChild(li);
  }
}

// ---- Net Worth tab: accounts/savings, investments, emergency fund ----
async function loadNetWorthTab() {
  const [accountsResponse, portfolioResponse, { surplus }] = await Promise.all([
    cachedGet(`/accounts/${lineUserId}`),
    cachedGet(`/portfolio/${lineUserId}`),
    computeCurrentPeriodSurplus(),
  ]);

  renderAccountsList(accountsResponse.accounts);
  renderPortfolio(portfolioResponse, surplus);
  autoRefreshStalePrices(portfolioResponse.holdings);

  el.settingEfGoal.value = currentUser.emergency_fund_goal_amount || '';
  el.settingEfAccount.innerHTML =
    '<option value="">None</option>' +
    accountsResponse.accounts.map((a) => `<option value="${a.id}">${escapeHtml(a.account_name)}</option>`).join('');
  el.settingEfAccount.value = currentUser.emergency_fund_account_id || '';
}

async function populateAccountSelects() {
  const response = await cachedGet(`/accounts/${lineUserId}`);
  const options = response.accounts.map((a) => `<option value="${a.id}">${escapeHtml(a.account_name)}</option>`).join('');
  el.transferFieldFrom.innerHTML = options;
  el.transferFieldTo.innerHTML = options;
  return response.accounts;
}

function openAccountModal() {
  el.accountFieldName.value = '';
  el.accountFieldType.value = 'bank';
  el.accountFieldBalance.value = '0';
  clearModalError(el.accountModalError);
  el.accountModal.hidden = false;
}

function closeAccountModal() {
  el.accountModal.hidden = true;
}

async function handleAccountSubmit(event) {
  event.preventDefault();
  const submitButton = event.submitter;
  submitButton.disabled = true;
  clearModalError(el.accountModalError);

  try {
    await apiRequest(`/accounts/${lineUserId}`, {
      method: 'POST',
      body: JSON.stringify({
        account_name: el.accountFieldName.value,
        account_type: el.accountFieldType.value,
        balance: parseFloat(el.accountFieldBalance.value) || 0,
      }),
    });
    closeAccountModal();
    await loadNetWorthTab();
  } catch (error) {
    showModalError(el.accountModalError, error.message);
  } finally {
    submitButton.disabled = false;
  }
}

async function openTransferModal() {
  el.transferFieldAmount.value = '';
  el.transferFieldDate.value = new Date().toISOString().slice(0, 10);
  clearModalError(el.transferModalError);
  el.transferModal.hidden = false;
  try {
    const accounts = await populateAccountSelects();
    if (accounts.length < 2) {
      showModalError(el.transferModalError, 'You need at least two accounts to transfer between.');
    }
  } catch (error) {
    showModalError(el.transferModalError, error.message);
  }
}

function closeTransferModal() {
  el.transferModal.hidden = true;
}

async function handleTransferSubmit(event) {
  event.preventDefault();
  const submitButton = event.submitter;
  submitButton.disabled = true;
  clearModalError(el.transferModalError);

  if (el.transferFieldFrom.value === el.transferFieldTo.value) {
    showModalError(el.transferModalError, 'Choose two different accounts.');
    submitButton.disabled = false;
    return;
  }

  try {
    await apiRequest(`/transactions/${lineUserId}`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'transfer',
        from_account_id: el.transferFieldFrom.value,
        to_account_id: el.transferFieldTo.value,
        amount: parseFloat(el.transferFieldAmount.value),
        transaction_date: new Date(`${el.transferFieldDate.value}T12:00:00Z`).toISOString(),
      }),
    });
    closeTransferModal();
    await loadNetWorthTab();
  } catch (error) {
    showModalError(el.transferModalError, error.message);
  } finally {
    submitButton.disabled = false;
  }
}

function renderCategoriesList(categories, transactions) {
  el.categoriesList.innerHTML = '';
  el.categoriesEmptyState.hidden = categories.length > 0;

  for (const category of categories) {
    const li = document.createElement('li');
    li.className = 'category-row';

    let budgetHtml = '';
    if (category.budget_amount && category.budget_period) {
      const periodStart = getPeriodStartDate(category.budget_period);
      const spent = transactions
        .filter((t) => t.category_id === category.id && new Date(t.transaction_date) >= periodStart)
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);
      const budget = parseFloat(category.budget_amount);
      const pct = Math.min(100, Math.round((spent / budget) * 100));
      budgetHtml = `
        <div class="category-budget-track">
          <div class="${budgetFillClass(spent, budget)}" style="width:${pct}%"></div>
        </div>
      `;
    }

    const budgetLabel = category.budget_amount
      ? `${parseFloat(category.budget_amount).toFixed(2)} / ${category.budget_period}`
      : 'No budget';

    li.innerHTML = `
      <div class="category-row-top">
        <span class="category-name">${escapeHtml(category.name)}</span>
        <span class="category-budget-label">${escapeHtml(budgetLabel)}</span>
        ${category.is_preset ? '' : '<button type="button" class="category-delete">Delete</button>'}
      </div>
      ${budgetHtml}
    `;
    li.addEventListener('click', (e) => {
      if (e.target.closest('.category-delete')) return;
      openCategoryModal(category);
    });
    const deleteButton = li.querySelector('.category-delete');
    if (deleteButton) {
      deleteButton.addEventListener('click', (e) => {
        e.stopPropagation();
        handleDeleteCategory(category);
      });
    }
    el.categoriesList.appendChild(li);
  }
}

function openCategoryModal(category) {
  editingCategoryId = category ? category.id : null;
  el.categoryModalTitle.textContent = category ? 'Edit Category' : 'Add Category';
  el.categoryFieldName.value = category ? category.name : '';
  el.categoryFieldName.disabled = !!category; // renaming isn't exposed here, keep this focused on budget editing
  el.categoryFieldType.value = category ? category.type : categoriesTabType;
  el.categoryFieldType.disabled = !!category;
  el.categoryFieldBudgetAmount.value = category?.budget_amount || '';
  el.categoryFieldBudgetPeriod.value = category?.budget_period || '';
  clearModalError(el.categoryModalError);
  el.categoryModal.hidden = false;
}

function closeCategoryModal() {
  el.categoryModal.hidden = true;
  el.categoryFieldName.disabled = false;
  el.categoryFieldType.disabled = false;
}

async function handleCategorySubmit(event) {
  event.preventDefault();
  const submitButton = event.submitter;
  submitButton.disabled = true;
  clearModalError(el.categoryModalError);

  try {
    const budgetAmount = el.categoryFieldBudgetAmount.value ? parseFloat(el.categoryFieldBudgetAmount.value) : null;
    const budgetPeriod = el.categoryFieldBudgetPeriod.value || null;

    if (editingCategoryId) {
      await apiRequest(`/categories/${lineUserId}/${editingCategoryId}`, {
        method: 'PUT',
        body: JSON.stringify({ budget_amount: budgetAmount, budget_period: budgetPeriod }),
      });
    } else {
      await apiRequest(`/categories/${lineUserId}`, {
        method: 'POST',
        body: JSON.stringify({
          name: el.categoryFieldName.value,
          type: el.categoryFieldType.value,
          budget_amount: budgetAmount || undefined,
          budget_period: budgetPeriod || undefined,
        }),
      });
    }
    closeCategoryModal();
    await loadBudgetsTab();
  } catch (error) {
    showModalError(el.categoryModalError, error.message);
  } finally {
    submitButton.disabled = false;
  }
}

async function handleDeleteCategory(category) {
  const confirmed = await confirmAction(`Delete "${category.name}"? This only works if it has no transactions.`, 'Delete');
  if (!confirmed) return;

  try {
    await apiRequest(`/categories/${lineUserId}/${category.id}`, { method: 'DELETE' });
    await loadBudgetsTab();
  } catch (error) {
    showError(error.message);
  }
}

// ---- Transactions tab ----

// 'cycle' steps through billing cycles with the < > navigator (offset 0 =
// current, never positive); 'custom' reveals the two date inputs. Both CSV
// exports read the same params, so they always match what's on screen.
const txnRange = { mode: 'cycle', offset: 0 };
let txnAccountIds = []; // empty = all accounts (including transactions with no account)

function buildTransactionFilterQuery() {
  const params = new URLSearchParams();
  if (el.txnFilterType.value) params.set('type', el.txnFilterType.value);
  const search = el.txnSearch.value.trim();
  if (search) params.set('q', search);
  if (txnAccountIds.length > 0) params.set('account_id', txnAccountIds.join(','));
  if (txnRange.mode === 'cycle') {
    const { startISO, endISO } = getBillingCycleRange(currentUser.billing_cycle_start_day, txnRange.offset);
    params.set('start_date', startISO);
    // The API's end_date is inclusive; the cycle end is the next cycle's start.
    params.set('end_date', new Date(new Date(endISO).getTime() - 1).toISOString());
  } else if (txnRange.mode === '3months') {
    const now = new Date();
    params.set('start_date', new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, now.getUTCDate())).toISOString());
  } else if (txnRange.mode === 'custom') {
    if (el.txnFilterStart.value) params.set('start_date', new Date(`${el.txnFilterStart.value}T00:00:00Z`).toISOString());
    if (el.txnFilterEnd.value) params.set('end_date', new Date(`${el.txnFilterEnd.value}T23:59:59Z`).toISOString());
  }
  return params;
}

function renderTxnRangeControls() {
  el.txnRangePills.forEach((pill) => pill.classList.toggle('active', pill.dataset.range === txnRange.mode));
  el.txnPeriodNav.hidden = txnRange.mode !== 'cycle';
  el.txnCustomRange.hidden = txnRange.mode !== 'custom';
  if (txnRange.mode === 'cycle') {
    const { startISO, endISO } = getBillingCycleRange(currentUser.billing_cycle_start_day, txnRange.offset);
    el.txnPeriodLabel.textContent = `${txnRange.offset === 0 ? 'This cycle · ' : ''}${formatCycleLabel(startISO, endISO)}`;
    el.txnPeriodNext.disabled = txnRange.offset >= 0;
  }
}

function setTxnRange(mode, offset = 0) {
  txnRange.mode = mode;
  txnRange.offset = offset;
  loadTransactionsTab().catch((error) => showError(error.message));
}

// Tapping < > quickly fires overlapping fetches; only the newest one may render,
// or a slow earlier response could land last and show the wrong cycle.
let txnLoadSeq = 0;

// Bottom-sheet checklist of the user's accounts (MeowJot's account filter).
// Checkbox state lives in the sheet until "Show Records", so dismissing it
// changes nothing; "All Accounts" clears the filter outright.
async function openAccountFilter() {
  const { accounts } = await cachedGet(`/accounts/${lineUserId}`);
  el.accountFilterEmpty.hidden = accounts.length > 0;
  el.accountFilterList.hidden = accounts.length === 0;
  el.accountFilterApply.disabled = accounts.length === 0;
  el.accountFilterList.innerHTML = accounts
    .map(
      (a) => `
        <li>
          <label class="account-filter-row">
            <input type="checkbox" value="${a.id}" ${txnAccountIds.includes(a.id) ? 'checked' : ''} />
            <span class="account-filter-name">${escapeHtml(a.account_name)}</span>
            <span class="account-filter-type">${ACCOUNT_TYPE_LABELS[a.account_type] || ''}</span>
          </label>
        </li>
      `
    )
    .join('');
  el.accountFilterModal.hidden = false;
}

function applyAccountFilter(ids) {
  txnAccountIds = ids;
  el.accountFilterModal.hidden = true;
  loadTransactionsTab().catch((error) => showError(error.message));
}

async function renderAccountFilterButton() {
  if (txnAccountIds.length === 0) {
    el.txnAccountButton.textContent = 'All accounts';
  } else if (txnAccountIds.length === 1) {
    const { accounts } = await cachedGet(`/accounts/${lineUserId}`);
    el.txnAccountButton.textContent = accounts.find((a) => a.id === txnAccountIds[0])?.account_name || '1 account';
  } else {
    el.txnAccountButton.textContent = `${txnAccountIds.length} accounts`;
  }
  el.txnAccountButton.classList.toggle('active', txnAccountIds.length > 0);
}

async function loadTransactionsTab() {
  const seq = ++txnLoadSeq;
  await ensureCurrentUser();
  renderTxnRangeControls();
  renderAccountFilterButton().catch(() => {});
  const params = buildTransactionFilterQuery();
  params.set('limit', '200');
  const response = await cachedGet(`/transactions/${lineUserId}?${params.toString()}`);
  if (seq !== txnLoadSeq) return;
  el.txnEmptyState.textContent = params.get('q')
    ? `No transactions matching "${params.get('q')}" in this range.`
    : 'No transactions match these filters.';
  renderTransactionList(el.txnFullList, el.txnEmptyState, response.transactions, { showPaymentMethod: true });
}

function handleExportCsv() {
  const params = buildTransactionFilterQuery();
  // A plain top-level navigation lets the browser handle the response's
  // Content-Disposition: attachment header natively (save/share prompt),
  // rather than fetching the CSV into JS just to hand it back off again.
  window.location.href = `${API_BASE}/transactions/${lineUserId}/export?${params.toString()}`;
}

async function handleExportEmail() {
  el.exportEmailButton.disabled = true;
  el.exportStatus.hidden = true;
  try {
    const params = buildTransactionFilterQuery();
    const response = await apiRequest(`/transactions/${lineUserId}/export/email?${params.toString()}`, { method: 'POST' });
    el.exportStatus.textContent = response.message || 'Export emailed.';
    el.exportStatus.hidden = false;
  } catch (error) {
    el.exportStatus.textContent = error.message;
    el.exportStatus.hidden = false;
  } finally {
    el.exportEmailButton.disabled = false;
  }
}

// ---- Settings tab ----

async function loadSettingsTab() {
  await ensureCurrentUser();
  el.settingNotifications.checked = currentUser.notifications_enabled !== false;
  el.settingThumbnails.checked = currentUser.thumbnails_enabled !== false;
  el.settingCycleDay.value = currentUser.billing_cycle_start_day || 1;
  el.settingEmail.value = currentUser.email || '';
  renderGoogleConnectState();
}

// LINE Login is still the only identity/auth model (Phase 2A) -- this is NOT
// a sign-in flow, only a way to get a verified email for CSV export. Shown
// as connected once google_email is set; the legacy manual email field stays
// available underneath as a fallback for anyone who hasn't linked Google.
function renderGoogleConnectState() {
  const connected = !!currentUser.google_email;
  el.googleConnectedRow.hidden = !connected;
  el.connectGoogleButton.hidden = connected;
  el.legacyEmailField.hidden = connected;
  if (connected) {
    el.googleConnectedEmail.textContent = currentUser.google_email;
  }
}

// Google blocks its own OAuth consent screen inside embedded webviews
// (LINE's in-app browser included -- error 403 disallowed_useragent), so
// this MUST open in the real system browser via liff.openWindow({ url, external: true }),
// never inline. The backend's callback renders a plain "connected, close this
// tab" page; there's no way back into the LIFF app directly from there, so
// the user just switches back and this tab's Settings re-fetch (next load,
// or the manual refresh below) picks up the new google_email.
let awaitingGoogleConnectReturn = false;

async function handleConnectGoogle() {
  el.googleConnectStatus.hidden = false;
  el.googleConnectStatus.classList.remove('scan-error');
  el.googleConnectStatus.textContent = 'Opening Google sign-in in your browser…';
  try {
    const response = await apiRequest(`/google/login-url/${lineUserId}`);
    awaitingGoogleConnectReturn = true;
    liff.openWindow({ url: response.login_url, external: true });
    el.googleConnectStatus.textContent = 'After connecting, switch back to this tab.';
  } catch (error) {
    el.googleConnectStatus.classList.add('scan-error');
    el.googleConnectStatus.textContent = error.message;
  }
}

// Picks the connection back up automatically once the user returns from the
// external browser -- backgrounding/foregrounding a tab fires visibilitychange
// reliably, so there's no need for a manual "I'm done" button.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !awaitingGoogleConnectReturn) return;
  awaitingGoogleConnectReturn = false;
  getCache.delete(`/users/${lineUserId}`);
  apiRequest(`/users/${lineUserId}`)
    .then((response) => {
      currentUser = response.user;
      renderGoogleConnectState();
      el.googleConnectStatus.hidden = true;
      showSettingsStatus(currentUser.google_email ? 'Google connected.' : 'Not connected yet.');
    })
    .catch((error) => showSettingsStatus(error.message));
});

async function handleSaveEmergencyFund() {
  el.saveEmergencyFund.disabled = true;
  try {
    const response = await apiRequest(`/users/${lineUserId}/emergency-fund`, {
      method: 'PUT',
      body: JSON.stringify({
        goal_amount: el.settingEfGoal.value ? parseFloat(el.settingEfGoal.value) : null,
        account_id: el.settingEfAccount.value || null,
      }),
    });
    currentUser = response.user;
    showNetWorthStatus('Saved.');
  } catch (error) {
    showNetWorthStatus(error.message);
  } finally {
    el.saveEmergencyFund.disabled = false;
  }
}

// Generic -- each tab that can trigger a background save (Settings, Budgets'
// recurring/event CRUD, Net Worth's emergency fund) has its own status
// paragraph, since #settings-status itself is invisible while on another tab.
function showStatus(targetEl, message) {
  targetEl.textContent = message;
  targetEl.hidden = false;
  setTimeout(() => {
    targetEl.hidden = true;
  }, 2500);
}

function showSettingsStatus(message) {
  showStatus(el.settingsStatus, message);
}

function showBudgetsStatus(message) {
  showStatus(el.budgetsStatus, message);
}

function showNetWorthStatus(message) {
  showStatus(el.networthStatus, message);
}

async function handlePreferenceToggle(key, checkbox) {
  checkbox.disabled = true;
  try {
    const response = await apiRequest(`/users/${lineUserId}/preferences`, {
      method: 'PATCH',
      body: JSON.stringify({ [key]: checkbox.checked }),
    });
    currentUser = response.user;
    showSettingsStatus('Saved.');
  } catch (error) {
    checkbox.checked = !checkbox.checked;
    showSettingsStatus(error.message);
  } finally {
    checkbox.disabled = false;
  }
}

async function handleSaveCycleDay() {
  const day = parseInt(el.settingCycleDay.value, 10);
  if (!day || day < 1 || day > 31) {
    showSettingsStatus('Cycle start day must be between 1 and 31.');
    return;
  }

  el.saveCycleDay.disabled = true;
  try {
    const response = await apiRequest(`/users/${lineUserId}/billing-cycle`, {
      method: 'PUT',
      body: JSON.stringify({ billing_cycle_start_day: day }),
    });
    currentUser = response.user;
    showSettingsStatus('Saved.');
  } catch (error) {
    showSettingsStatus(error.message);
  } finally {
    el.saveCycleDay.disabled = false;
  }
}

async function handleSaveEmail() {
  el.saveEmail.disabled = true;
  try {
    const response = await apiRequest(`/users/${lineUserId}/preferences`, {
      method: 'PATCH',
      body: JSON.stringify({ email: el.settingEmail.value || null }),
    });
    currentUser = response.user;
    showSettingsStatus('Saved.');
  } catch (error) {
    showSettingsStatus(error.message);
  } finally {
    el.saveEmail.disabled = false;
  }
}

async function handleClearHistory() {
  const confirmed = await confirmAction(
    'Permanently delete every transaction in your history? This cannot be undone.',
    'Delete Everything'
  );
  if (!confirmed) return;

  el.clearHistoryButton.disabled = true;
  try {
    await apiRequest(`/transactions/${lineUserId}/all`, { method: 'DELETE' });
    showSettingsStatus('Transaction history cleared.');
  } catch (error) {
    showSettingsStatus(error.message);
  } finally {
    el.clearHistoryButton.disabled = false;
  }
}

// ---- Recurring expenses ----

const FREQUENCY_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };

async function loadRecurringList() {
  const response = await cachedGet(`/recurring/${lineUserId}`);
  renderRecurringList(response.recurring || []);
}

function renderRecurringList(rules) {
  el.recurringList.innerHTML = '';
  el.recurringEmptyState.hidden = rules.length > 0;

  for (const rule of rules) {
    const li = document.createElement('li');
    li.className = `recurring-row${rule.is_active ? '' : ' inactive'}`;
    li.innerHTML = `
      <input type="checkbox" class="recurring-active-toggle" ${rule.is_active ? 'checked' : ''} />
      <div class="recurring-details">
        <div class="recurring-description">${escapeHtml(rule.description || rule.categories?.name || 'Recurring')}</div>
        <div class="recurring-meta">${FREQUENCY_LABELS[rule.frequency] || rule.frequency} · next ${formatDate(rule.next_run_date)}</div>
      </div>
      <div class="recurring-amount ${rule.type}">${parseFloat(rule.amount).toFixed(2)}</div>
      <button type="button" class="recurring-delete">Delete</button>
    `;
    li.querySelector('.recurring-active-toggle').addEventListener('change', (e) =>
      handleToggleRecurringActive(rule.id, e.target.checked)
    );
    li.querySelector('.recurring-delete').addEventListener('click', () => handleDeleteRecurring(rule.id));
    el.recurringList.appendChild(li);
  }
}

async function populateRecurringCategoryOptions() {
  const response = await cachedGet(`/categories/${lineUserId}?type=${el.recurringFieldType.value}`);
  el.recurringFieldCategory.innerHTML = response.categories
    .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    .join('');
}

async function openRecurringModal() {
  el.recurringFieldType.value = 'expense';
  el.recurringFieldAmount.value = '';
  el.recurringFieldDescription.value = '';
  el.recurringFieldFrequency.value = 'monthly';
  el.recurringFieldStartDate.value = new Date().toISOString().slice(0, 10);
  el.recurringFieldPayStartDay.value = '';
  el.recurringFieldPayEndDay.value = '';
  clearModalError(el.recurringModalError);
  el.recurringModal.hidden = false;
  try {
    await populateRecurringCategoryOptions();
  } catch (error) {
    showModalError(el.recurringModalError, error.message);
  }
}

function closeRecurringModal() {
  el.recurringModal.hidden = true;
}

async function handleRecurringSubmit(event) {
  event.preventDefault();
  const submitButton = event.submitter;
  submitButton.disabled = true;
  clearModalError(el.recurringModalError);

  try {
    await apiRequest(`/recurring/${lineUserId}`, {
      method: 'POST',
      body: JSON.stringify({
        category_id: el.recurringFieldCategory.value,
        amount: parseFloat(el.recurringFieldAmount.value),
        type: el.recurringFieldType.value,
        description: el.recurringFieldDescription.value || undefined,
        frequency: el.recurringFieldFrequency.value,
        start_date: new Date(`${el.recurringFieldStartDate.value}T12:00:00Z`).toISOString(),
        pay_start_day: el.recurringFieldPayStartDay.value ? parseInt(el.recurringFieldPayStartDay.value, 10) : undefined,
        pay_end_day: el.recurringFieldPayEndDay.value ? parseInt(el.recurringFieldPayEndDay.value, 10) : undefined,
      }),
    });
    closeRecurringModal();
    await loadRecurringList();
    showBudgetsStatus('Recurring expense added.');
  } catch (error) {
    showModalError(el.recurringModalError, error.message);
  } finally {
    submitButton.disabled = false;
  }
}

async function handleToggleRecurringActive(recurringId, isActive) {
  try {
    await apiRequest(`/recurring/${lineUserId}/${recurringId}`, {
      method: 'PUT',
      body: JSON.stringify({ is_active: isActive }),
    });
    await loadRecurringList();
  } catch (error) {
    showBudgetsStatus(error.message);
    await loadRecurringList(); // revert the optimistic checkbox state on failure
  }
}

async function handleDeleteRecurring(recurringId) {
  const confirmed = await confirmAction('Delete this recurring expense? This cannot be undone.', 'Delete');
  if (!confirmed) return;

  try {
    await apiRequest(`/recurring/${lineUserId}/${recurringId}`, { method: 'DELETE' });
    await loadRecurringList();
    showBudgetsStatus('Recurring expense deleted.');
  } catch (error) {
    showBudgetsStatus(error.message);
  }
}

// ---- Init ----

async function init() {
  try {
    await liff.init({ liffId: window.LIFF_ID });

    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }

    const profile = await liff.getProfile();
    lineUserId = profile.userId;

    await apiRequest('/users', {
      method: 'POST',
      body: JSON.stringify({
        line_user_id: profile.userId,
        display_name: profile.displayName,
        picture_url: profile.pictureUrl,
      }),
    });

    renderProfile(profile);
    await loadHomeTab();

    el.loading.hidden = true;
    el.app.hidden = false;
  } catch (error) {
    el.loading.hidden = true;
    showError(error.message || 'Something went wrong.');
  }
}

for (const button of el.navTabs) {
  button.addEventListener('click', () => switchTab(button.dataset.tab));
}

el.fabAdd.addEventListener('click', openAddExpenseModal);
el.cancelAddExpense.addEventListener('click', closeAddExpenseModal);
el.addExpenseForm.addEventListener('submit', handleAddExpenseSubmit);
el.fieldReceiptImage.addEventListener('change', handleReceiptFileChange);

el.addBillButton.addEventListener('click', openBillModal);
el.cancelBill.addEventListener('click', closeBillModal);
el.billForm.addEventListener('submit', handleBillSubmit);
el.billAddParticipant.addEventListener('click', () => addParticipantRow());
el.billAddItem.addEventListener('click', () => addItemRow());
el.billFieldReceiptImage.addEventListener('change', handleBillReceiptFileChange);
el.billShareLine.addEventListener('click', handleShareBillToLine);
el.billCopyLink.addEventListener('click', handleCopyShareLink);
el.billDelete.addEventListener('click', handleDeleteBill);
el.closeBillDetail.addEventListener('click', closeBillDetailModal);

el.categoriesTypeExpense.addEventListener('click', () => setCategoriesTabType('expense'));
el.categoriesTypeIncome.addEventListener('click', () => setCategoriesTabType('income'));
el.addCategoryButton.addEventListener('click', () => openCategoryModal(null));
el.cancelCategory.addEventListener('click', closeCategoryModal);
el.categoryForm.addEventListener('submit', handleCategorySubmit);

el.addAccountButton.addEventListener('click', openAccountModal);
el.cancelAccount.addEventListener('click', closeAccountModal);
el.accountForm.addEventListener('submit', handleAccountSubmit);
el.addTransferButton.addEventListener('click', () => openTransferModal().catch((error) => showError(error.message)));
el.cancelTransfer.addEventListener('click', closeTransferModal);
el.transferForm.addEventListener('submit', handleTransferSubmit);

el.txnFilterType.addEventListener('change', () => loadTransactionsTab().catch((error) => showError(error.message)));
el.txnAccountButton.addEventListener('click', () => openAccountFilter().catch((error) => showError(error.message)));
el.accountFilterApply.addEventListener('click', () =>
  applyAccountFilter(Array.from(el.accountFilterList.querySelectorAll('input:checked')).map((input) => input.value))
);
el.accountFilterClear.addEventListener('click', () => applyAccountFilter([]));
el.accountFilterModal.addEventListener('click', (e) => {
  if (e.target === el.accountFilterModal) el.accountFilterModal.hidden = true;
});
let txnSearchTimer = null;
el.txnSearch.addEventListener('input', () => {
  clearTimeout(txnSearchTimer);
  txnSearchTimer = setTimeout(() => loadTransactionsTab().catch((error) => showError(error.message)), 300);
});
el.txnRangePills.forEach((pill) => pill.addEventListener('click', () => setTxnRange(pill.dataset.range)));
el.txnPeriodPrev.addEventListener('click', () => setTxnRange('cycle', txnRange.offset - 1));
el.txnPeriodNext.addEventListener('click', () => setTxnRange('cycle', Math.min(0, txnRange.offset + 1)));
el.txnFilterStart.addEventListener('change', () => loadTransactionsTab().catch((error) => showError(error.message)));
el.txnFilterEnd.addEventListener('change', () => loadTransactionsTab().catch((error) => showError(error.message)));
el.exportCsvButton.addEventListener('click', handleExportCsv);
el.exportEmailButton.addEventListener('click', handleExportEmail);

el.settingNotifications.addEventListener('change', () => handlePreferenceToggle('notifications_enabled', el.settingNotifications));
el.settingThumbnails.addEventListener('change', () => handlePreferenceToggle('thumbnails_enabled', el.settingThumbnails));
el.saveCycleDay.addEventListener('click', handleSaveCycleDay);
el.saveEmail.addEventListener('click', handleSaveEmail);
el.saveEmergencyFund.addEventListener('click', handleSaveEmergencyFund);
el.clearHistoryButton.addEventListener('click', handleClearHistory);

el.refreshPricesButton.addEventListener('click', handleRefreshPrices);
el.addHoldingButton.addEventListener('click', () => openHoldingModal(null));
el.cancelHolding.addEventListener('click', closeHoldingModal);
el.holdingForm.addEventListener('submit', handleHoldingSubmit);
el.holdingFieldType.addEventListener('change', updateHoldingFieldsForType);

el.addRecurringButton.addEventListener('click', openRecurringModal);
el.cancelRecurring.addEventListener('click', closeRecurringModal);
el.recurringForm.addEventListener('submit', handleRecurringSubmit);
el.recurringFieldType.addEventListener('change', () =>
  populateRecurringCategoryOptions().catch((error) => showModalError(el.recurringModalError, error.message))
);

el.advancedToggle.addEventListener('click', toggleAdvancedSection);

el.addEventButton.addEventListener('click', () => openEventModal().catch((error) => showModalError(el.eventModalError, error.message)));
el.cancelEvent.addEventListener('click', closeEventModal);
el.eventForm.addEventListener('submit', handleEventSubmit);

el.txnScanButton.addEventListener('click', () => {
  // el.fieldReceiptImage.click() must run synchronously inside this handler --
  // mobile browsers only honor a programmatic file-picker click within the
  // same tick as a real user gesture, not after an awaited promise resolves.
  openAddExpenseModal().catch((error) => showError(error.message));
  el.fieldReceiptImage.click();
});

el.connectGoogleButton.addEventListener('click', handleConnectGoogle);
el.disconnectGoogle.addEventListener('click', handleConnectGoogle);

init();
