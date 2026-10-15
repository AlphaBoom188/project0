const API_BASE = '/api';

const el = {
  loading: document.getElementById('loading'),
  app: document.getElementById('app'),
  errorBanner: document.getElementById('error-banner'),
  profilePicture: document.getElementById('profile-picture'),
  profileName: document.getElementById('profile-name'),

  // Dashboard tab
  periodLabel: document.getElementById('period-label'),
  summaryIncome: document.getElementById('summary-income'),
  summaryExpense: document.getElementById('summary-expense'),
  summaryNet: document.getElementById('summary-net'),
  transactionList: document.getElementById('transaction-list'),
  emptyState: document.getElementById('empty-state'),
  addExpenseButton: document.getElementById('add-expense-button'),

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
    dashboard: document.getElementById('tab-dashboard'),
    analytics: document.getElementById('tab-analytics'),
    categories: document.getElementById('tab-categories'),
    transactions: document.getElementById('tab-transactions'),
    settings: document.getElementById('tab-settings'),
  },

  // Analytics tab
  trendChart: document.getElementById('trend-chart'),
  categoryChart: document.getElementById('category-chart'),
  analyticsEmptyState: document.getElementById('analytics-empty-state'),

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
  txnFilterStart: document.getElementById('txn-filter-start'),
  txnFilterEnd: document.getElementById('txn-filter-end'),
  exportCsvButton: document.getElementById('export-csv-button'),
  exportEmailButton: document.getElementById('export-email-button'),
  exportStatus: document.getElementById('export-status'),
  txnFullList: document.getElementById('txn-full-list'),
  txnEmptyState: document.getElementById('txn-empty-state'),

  // Settings tab
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
function getBillingCycleRange(billingCycleStartDay) {
  const day = billingCycleStartDay || 1;
  const now = new Date();
  let start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));
  if (start > now) {
    start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, day));
  }
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

// ---- Tab navigation ----
//
// Switching is pure, synchronous show/hide (instant); each tab's load function
// runs after, not blocking the switch, and reads through cachedGet so a repeat
// visit this session resolves immediately instead of re-fetching.
const TAB_LOADERS = {
  dashboard: loadDashboardTab,
  analytics: loadAnalyticsTab,
  categories: loadCategoriesTab,
  transactions: loadTransactionsTab,
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
  el.summaryNet.style.color = net >= 0 ? '#06c755' : '#e53935';
}

function renderTransactionList(target, emptyStateEl, transactions, { showPaymentMethod = false } = {}) {
  target.innerHTML = '';
  emptyStateEl.hidden = transactions.length > 0;

  for (const t of transactions) {
    const li = document.createElement('li');
    li.className = 'transaction-row';

    const thumbHtml = t.thumbnail_url ? `<img class="transaction-thumbnail" src="${t.thumbnail_url}" alt="" />` : '';
    const paymentHtml =
      showPaymentMethod && t.payment_method ? `<div class="transaction-date">${escapeHtml(t.payment_method)}</div>` : '';

    li.innerHTML = `
      ${thumbHtml}
      <div class="transaction-details">
        <div class="transaction-category">${escapeHtml(t.categories?.name || 'Uncategorized')}</div>
        ${t.description ? `<div class="transaction-description">${escapeHtml(t.description)}</div>` : ''}
        <div class="transaction-date">${formatDate(t.transaction_date)}</div>
        ${paymentHtml}
      </div>
      <div class="transaction-amount ${t.type}">${parseFloat(t.amount).toFixed(2)}</div>
    `;
    target.appendChild(li);
  }
}

async function loadDashboardTab() {
  // The transactions fetch can't be date-filtered server-side until we know the
  // user's billing_cycle_start_day, which only comes back from the /users call --
  // so instead of waiting on that before firing it, fetch a fixed recent window
  // in parallel with everything else and filter the cycle window client-side.
  const [userResponse, transactionsResponse] = await Promise.all([
    cachedGet(`/users/${lineUserId}`),
    cachedGet(`/transactions/${lineUserId}?limit=50`),
  ]);

  currentUser = userResponse.user;

  const { startISO, endISO } = getBillingCycleRange(currentUser.billing_cycle_start_day);
  const periodLabel = `${formatDate(startISO)} – ${formatDate(endISO)}`;

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
  renderTransactionList(el.transactionList, el.emptyState, allTransactions);
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
    await apiRequest(`/transactions/${lineUserId}`, {
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
      }),
    });
    closeAddExpenseModal();
    await loadDashboardTab();
  } catch (error) {
    // Shown inside the modal, not the top-level banner -- the modal overlay would
    // otherwise hide the banner from view while still open.
    showModalError(el.modalError, error.message);
  } finally {
    submitButton.disabled = false;
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

function renderCategoryBreakdown(transactions, periodStart, periodEnd) {
  const totalsByCategory = new Map();
  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    const d = new Date(t.transaction_date);
    if (d < periodStart || d >= periodEnd) continue;
    const name = t.categories?.name || 'Uncategorized';
    totalsByCategory.set(name, (totalsByCategory.get(name) || 0) + parseFloat(t.amount));
  }

  const rows = Array.from(totalsByCategory.entries()).sort((a, b) => b[1] - a[1]);
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

async function loadAnalyticsTab() {
  if (!currentUser) {
    const userResponse = await cachedGet(`/users/${lineUserId}`);
    currentUser = userResponse.user;
  }

  // One fetch covering a wide-enough window for both charts: the trend chart
  // needs the last 6 months, the breakdown needs the current billing cycle
  // (which the trend window always contains).
  const sixMonthsAgoISO = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 5, 1)).toISOString();
  const response = await cachedGet(`/transactions/${lineUserId}?start_date=${encodeURIComponent(sixMonthsAgoISO)}&limit=1000`);
  const transactions = response.transactions;

  renderTrendChart(transactions);

  const { startISO, endISO } = getBillingCycleRange(currentUser.billing_cycle_start_day);
  const hasBreakdown = renderCategoryBreakdown(transactions, new Date(startISO), new Date(endISO));
  el.analyticsEmptyState.hidden = transactions.length > 0 || hasBreakdown;
}

// ---- Categories & Budgets tab ----

function setCategoriesTabType(type) {
  categoriesTabType = type;
  el.categoriesTypeExpense.classList.toggle('active', type === 'expense');
  el.categoriesTypeIncome.classList.toggle('active', type === 'income');
  loadCategoriesTab().catch((error) => showError(error.message));
}

async function loadCategoriesTab() {
  const [categoriesResponse, transactionsResponse, accountsResponse] = await Promise.all([
    cachedGet(`/categories/${lineUserId}?type=${categoriesTabType}`),
    cachedGet(`/transactions/${lineUserId}?limit=200`),
    cachedGet(`/accounts/${lineUserId}`),
  ]);

  renderCategoriesList(categoriesResponse.categories, transactionsResponse.transactions);
  renderAccountsList(accountsResponse.accounts);
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
    await loadCategoriesTab();
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
    await loadCategoriesTab();
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
          <div class="category-budget-fill${spent >= budget ? ' over' : ''}" style="width:${pct}%"></div>
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
    await loadCategoriesTab();
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
    await loadCategoriesTab();
  } catch (error) {
    showError(error.message);
  }
}

// ---- Transactions tab ----

function buildTransactionFilterQuery() {
  const params = new URLSearchParams();
  if (el.txnFilterType.value) params.set('type', el.txnFilterType.value);
  if (el.txnFilterStart.value) params.set('start_date', new Date(`${el.txnFilterStart.value}T00:00:00Z`).toISOString());
  if (el.txnFilterEnd.value) params.set('end_date', new Date(`${el.txnFilterEnd.value}T23:59:59Z`).toISOString());
  return params;
}

async function loadTransactionsTab() {
  const params = buildTransactionFilterQuery();
  params.set('limit', '200');
  const response = await cachedGet(`/transactions/${lineUserId}?${params.toString()}`);
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
  if (!currentUser) {
    const userResponse = await cachedGet(`/users/${lineUserId}`);
    currentUser = userResponse.user;
  }
  el.settingNotifications.checked = currentUser.notifications_enabled !== false;
  el.settingThumbnails.checked = currentUser.thumbnails_enabled !== false;
  el.settingCycleDay.value = currentUser.billing_cycle_start_day || 1;
  el.settingEmail.value = currentUser.email || '';

  await loadRecurringList();
}

function showSettingsStatus(message) {
  el.settingsStatus.textContent = message;
  el.settingsStatus.hidden = false;
  setTimeout(() => {
    el.settingsStatus.hidden = true;
  }, 2500);
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
    showSettingsStatus('Recurring expense added.');
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
    showSettingsStatus(error.message);
    await loadRecurringList(); // revert the optimistic checkbox state on failure
  }
}

async function handleDeleteRecurring(recurringId) {
  const confirmed = await confirmAction('Delete this recurring expense? This cannot be undone.', 'Delete');
  if (!confirmed) return;

  try {
    await apiRequest(`/recurring/${lineUserId}/${recurringId}`, { method: 'DELETE' });
    await loadRecurringList();
    showSettingsStatus('Recurring expense deleted.');
  } catch (error) {
    showSettingsStatus(error.message);
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
    await loadDashboardTab();

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

el.addExpenseButton.addEventListener('click', openAddExpenseModal);
el.cancelAddExpense.addEventListener('click', closeAddExpenseModal);
el.addExpenseForm.addEventListener('submit', handleAddExpenseSubmit);
el.fieldReceiptImage.addEventListener('change', handleReceiptFileChange);

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
el.txnFilterStart.addEventListener('change', () => loadTransactionsTab().catch((error) => showError(error.message)));
el.txnFilterEnd.addEventListener('change', () => loadTransactionsTab().catch((error) => showError(error.message)));
el.exportCsvButton.addEventListener('click', handleExportCsv);
el.exportEmailButton.addEventListener('click', handleExportEmail);

el.settingNotifications.addEventListener('change', () => handlePreferenceToggle('notifications_enabled', el.settingNotifications));
el.settingThumbnails.addEventListener('change', () => handlePreferenceToggle('thumbnails_enabled', el.settingThumbnails));
el.saveCycleDay.addEventListener('click', handleSaveCycleDay);
el.saveEmail.addEventListener('click', handleSaveEmail);
el.clearHistoryButton.addEventListener('click', handleClearHistory);

el.addRecurringButton.addEventListener('click', openRecurringModal);
el.cancelRecurring.addEventListener('click', closeRecurringModal);
el.recurringForm.addEventListener('submit', handleRecurringSubmit);
el.recurringFieldType.addEventListener('change', () =>
  populateRecurringCategoryOptions().catch((error) => showModalError(el.recurringModalError, error.message))
);

init();
