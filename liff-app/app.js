const API_BASE = '/api';

const el = {
  loading: document.getElementById('loading'),
  app: document.getElementById('app'),
  errorBanner: document.getElementById('error-banner'),
  budgetAlertBanner: document.getElementById('budget-alert-banner'),

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
  voiceButton: document.getElementById('voice-button'),
  voiceButtonText: document.getElementById('voice-button-text'),

  // Tab shell
  tabContent: document.querySelector('.tab-content'),
  navTabs: Array.from(document.querySelectorAll('.nav-tab')),
  tabPanels: {
    home: document.getElementById('tab-home'),
    tasks: document.getElementById('tab-tasks'),
    tax: document.getElementById('tab-tax'),
    transactions: document.getElementById('tab-transactions'),
    budgets: document.getElementById('tab-budgets'),
    networth: document.getElementById('tab-networth'),
    settings: document.getElementById('tab-settings'),
    more: document.getElementById('tab-more'),
  },

  // Home tab
  trendChart: document.getElementById('trend-chart'),

  // Budgets tab
  budgetsStatus: document.getElementById('budgets-status'),

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
  emergencyFundCard: document.getElementById('emergency-fund-card'),
  emergencyFundLabel: document.getElementById('emergency-fund-label'),
  emergencyFundFill: document.getElementById('emergency-fund-fill'),
  emergencyFundSuggestion: document.getElementById('emergency-fund-suggestion'),
  holdingsList: document.getElementById('holdings-list'),
  holdingsEmptyState: document.getElementById('holdings-empty-state'),
  addHoldingButton: document.getElementById('add-holding-button'),

  // Performance card (Net Worth tab) + Home investments card
  perfCard: document.getElementById('perf-card'),
  perfTotalValue: document.getElementById('perf-total-value'),
  perfGainToday: document.getElementById('perf-gain-today'),
  perfGainYesterday: document.getElementById('perf-gain-yesterday'),
  perfGainAll: document.getElementById('perf-gain-all'),
  perfRangePills: document.querySelectorAll('[data-perf-range]'),
  perfViewButtons: document.querySelectorAll('[data-perf-view]'),
  perfChartWrap: document.getElementById('perf-chart-wrap'),
  perfChartCanvas: document.getElementById('perf-chart'),
  perfNote: document.getElementById('perf-note'),
  perfBenchmarkSp500: document.getElementById('perf-benchmark-sp500'),
  perfBenchmarkSet: document.getElementById('perf-benchmark-set'),
  // Dividends card (Net Worth tab)
  divCard: document.getElementById('div-card'),
  divTrailing: document.getElementById('div-trailing'),
  divYoy: document.getElementById('div-yoy'),
  divPortfolioYield: document.getElementById('div-portfolio-yield'),
  divYieldOnCost: document.getElementById('div-yield-on-cost'),
  divAvgMonthly: document.getElementById('div-avg-monthly'),
  divAvgDaily: document.getElementById('div-avg-daily'),
  divModeButtons: document.querySelectorAll('[data-div-mode]'),
  divChartWrap: document.getElementById('div-chart-wrap'),
  divChartCanvas: document.getElementById('div-chart'),
  divNote: document.getElementById('div-note'),
  // Goal tracker card + sheet (Net Worth tab)
  goalCard: document.getElementById('goal-card'),
  goalEmpty: document.getElementById('goal-empty'),
  goalBody: document.getElementById('goal-body'),
  goalSetupButton: document.getElementById('goal-setup-button'),
  goalTargetLabel: document.getElementById('goal-target-label'),
  goalTarget: document.getElementById('goal-target'),
  goalProgressPct: document.getElementById('goal-progress-pct'),
  goalProgressDetail: document.getElementById('goal-progress-detail'),
  goalProgressFill: document.getElementById('goal-progress-fill'),
  goalStatus: document.getElementById('goal-status'),
  goalChartWrap: document.getElementById('goal-chart-wrap'),
  goalChartCanvas: document.getElementById('goal-chart'),
  goalNote: document.getElementById('goal-note'),
  goalTableToggle: document.getElementById('goal-table-toggle'),
  goalTableWrap: document.getElementById('goal-table-wrap'),
  goalTableBody: document.getElementById('goal-table-body'),
  goalEditButton: document.getElementById('goal-edit-button'),
  goalModal: document.getElementById('goal-modal'),
  goalModalTitle: document.getElementById('goal-modal-title'),
  goalForm: document.getElementById('goal-form'),
  goalFieldStartDate: document.getElementById('goal-field-start-date'),
  goalFieldStartValue: document.getElementById('goal-field-start-value'),
  goalFieldYears: document.getElementById('goal-field-years'),
  goalFieldReturn: document.getElementById('goal-field-return'),
  goalFieldContribution: document.getElementById('goal-field-contribution'),
  goalFieldGrowth: document.getElementById('goal-field-growth'),
  goalFieldTarget: document.getElementById('goal-field-target'),
  goalModalError: document.getElementById('goal-modal-error'),
  goalSubmit: document.getElementById('goal-submit'),
  cancelGoal: document.getElementById('cancel-goal'),
  goalDelete: document.getElementById('goal-delete'),
  homeInvestmentsCard: document.getElementById('home-investments-card'),
  // LINE group balances (Home) + detail sheet
  homeGroups: document.getElementById('home-groups'),
  groupsList: document.getElementById('groups-list'),
  groupDetailModal: document.getElementById('group-detail-modal'),
  groupDetailTitle: document.getElementById('group-detail-title'),
  groupDetailMeta: document.getElementById('group-detail-meta'),
  groupDetailMine: document.getElementById('group-detail-mine'),
  groupDetailOpen: document.getElementById('group-detail-open'),
  groupDetailClosed: document.getElementById('group-detail-closed'),
  groupBillModal: document.getElementById('group-bill-modal'),
  gbillTitle: document.getElementById('gbill-title'),
  gbillMeta: document.getElementById('gbill-meta'),
  gbillAmount: document.getElementById('gbill-amount'),
  gbillProgress: document.getElementById('gbill-progress'),
  gbillPay: document.getElementById('gbill-pay'),
  gbillPayTitle: document.getElementById('gbill-pay-title'),
  gbillQrBlock: document.getElementById('gbill-qr-block'),
  gbillQr: document.getElementById('gbill-qr'),
  gbillPromptpay: document.getElementById('gbill-promptpay'),
  gbillBankBlock: document.getElementById('gbill-bank-block'),
  gbillBankName: document.getElementById('gbill-bank-name'),
  gbillBankNo: document.getElementById('gbill-bank-no'),
  gbillBankHolder: document.getElementById('gbill-bank-holder'),
  gbillNoDetails: document.getElementById('gbill-no-details'),
  gbillSlipLabel: document.getElementById('gbill-slip-label'),
  gbillSlipInput: document.getElementById('gbill-slip-input'),
  gbillSlipStatus: document.getElementById('gbill-slip-status'),
  gbillShares: document.getElementById('gbill-shares'),
  gbillError: document.getElementById('gbill-error'),
  gbillCancel: document.getElementById('gbill-cancel'),
  closeGroupBill: document.getElementById('close-group-bill'),
  settingPromptpay: document.getElementById('setting-promptpay'),
  settingBankName: document.getElementById('setting-bank-name'),
  settingBankNo: document.getElementById('setting-bank-no'),
  settingBankHolder: document.getElementById('setting-bank-holder'),
  savePaymentDetails: document.getElementById('save-payment-details'),
  paymentDetailsStatus: document.getElementById('payment-details-status'),
  groupDetailError: document.getElementById('group-detail-error'),
  closeGroupDetail: document.getElementById('close-group-detail'),
  homeInvestmentsValue: document.getElementById('home-investments-value'),
  homeInvestmentsToday: document.getElementById('home-investments-today'),

  // Holding modal
  holdingModal: document.getElementById('holding-modal'),
  holdingForm: document.getElementById('holding-form'),
  cancelHolding: document.getElementById('cancel-holding'),
  holdingFieldType: document.getElementById('holding-field-type'),
  holdingSymbolField: document.getElementById('holding-symbol-field'),
  holdingFieldSymbol: document.getElementById('holding-field-symbol'),
  holdingSymbolHint: document.getElementById('holding-symbol-hint'),
  holdingFieldName: document.getElementById('holding-field-name'),
  holdingModalTitle: document.getElementById('holding-modal-title'),
  holdingFieldCurrency: document.getElementById('holding-field-currency'),
  holdingQuantityField: document.getElementById('holding-quantity-field'),
  holdingCostField: document.getElementById('holding-cost-field'),
  holdingFieldQuantity: document.getElementById('holding-field-quantity'),
  holdingFieldCost: document.getElementById('holding-field-cost'),
  holdingPriceField: document.getElementById('holding-price-field'),
  holdingFieldPrice: document.getElementById('holding-field-price'),
  holdingModalError: document.getElementById('holding-modal-error'),
  portfolioSubline: document.getElementById('portfolio-subline'),

  // Holding detail sheet
  holdingDetailModal: document.getElementById('holding-detail-modal'),
  holdingDetailTitle: document.getElementById('holding-detail-title'),
  holdingDetailMeta: document.getElementById('holding-detail-meta'),
  holdingStatDayGain: document.getElementById('holding-stat-day-gain'),
  holdingStatTotalGain: document.getElementById('holding-stat-total-gain'),
  holdingStatShares: document.getElementById('holding-stat-shares'),
  holdingStatAverageCost: document.getElementById('holding-stat-average-cost'),
  holdingStatMarketValue: document.getElementById('holding-stat-market-value'),
  holdingStatRealizedGain: document.getElementById('holding-stat-realized-gain'),
  holdingStatWinRate: document.getElementById('holding-stat-win-rate'),
  holdingStatLots: document.getElementById('holding-stat-lots'),
  holdingStatDividendsRow: document.getElementById('holding-stat-dividends-row'),
  holdingStatDividends: document.getElementById('holding-stat-dividends'),
  holdingStatNextDividendRow: document.getElementById('holding-stat-next-dividend-row'),
  holdingStatNextDividend: document.getElementById('holding-stat-next-dividend'),
  holdingLotsList: document.getElementById('holding-lots-list'),
  holdingLotsEmpty: document.getElementById('holding-lots-empty'),
  holdingDetailError: document.getElementById('holding-detail-error'),
  holdingAddLot: document.getElementById('holding-add-lot'),
  holdingDetailEdit: document.getElementById('holding-detail-edit'),
  holdingDetailDelete: document.getElementById('holding-detail-delete'),
  closeHoldingDetail: document.getElementById('close-holding-detail'),

  // Lot sheet
  lotModal: document.getElementById('lot-modal'),
  lotModalTitle: document.getElementById('lot-modal-title'),
  lotForm: document.getElementById('lot-form'),
  lotSideButtons: document.querySelectorAll('[data-lot-side]'),
  lotFieldDate: document.getElementById('lot-field-date'),
  lotFieldQuantity: document.getElementById('lot-field-quantity'),
  lotFieldPriceLabel: document.getElementById('lot-field-price-label'),
  lotFieldPrice: document.getElementById('lot-field-price'),
  lotFieldFee: document.getElementById('lot-field-fee'),
  lotFieldComment: document.getElementById('lot-field-comment'),
  lotModalError: document.getElementById('lot-modal-error'),
  lotSubmit: document.getElementById('lot-submit'),
  cancelLot: document.getElementById('cancel-lot'),
  lotDelete: document.getElementById('lot-delete'),

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
  txnExportRow: document.getElementById('txn-export-row'),
  txnSearch: document.getElementById('txn-search'),
  txnAccountButton: document.getElementById('txn-account-button'),
  accountFilterModal: document.getElementById('account-filter-modal'),
  accountFilterList: document.getElementById('account-filter-list'),
  accountFilterEmpty: document.getElementById('account-filter-empty'),
  accountFilterClear: document.getElementById('account-filter-clear'),
  accountFilterApply: document.getElementById('account-filter-apply'),
  streakCount: document.getElementById('streak-count'),
  streakHint: document.getElementById('streak-hint'),
  billShareLine: document.getElementById('bill-share-line'),
  // [data-range] only: the Performance card's pills share the .range-pill class.
  txnRangePills: document.querySelectorAll('.range-pill[data-range]'),
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
  // Bank statement import (Transactions tab)
  importStatementButton: document.getElementById('import-statement-button'),
  stmtModal: document.getElementById('statement-modal'),
  stmtPick: document.getElementById('stmt-pick'),
  stmtFile: document.getElementById('stmt-file'),
  stmtPassword: document.getElementById('stmt-password'),
  stmtAccount: document.getElementById('stmt-account'),
  stmtProgress: document.getElementById('stmt-progress'),
  stmtPickError: document.getElementById('stmt-pick-error'),
  stmtRead: document.getElementById('stmt-read'),
  stmtCancel: document.getElementById('stmt-cancel'),
  stmtReview: document.getElementById('stmt-review'),
  stmtSummary: document.getElementById('stmt-summary'),
  stmtVerify: document.getElementById('stmt-verify'),
  stmtCounts: document.getElementById('stmt-counts'),
  stmtSelectNew: document.getElementById('stmt-select-new'),
  stmtSelectNone: document.getElementById('stmt-select-none'),
  stmtRows: document.getElementById('stmt-rows'),
  stmtReviewError: document.getElementById('stmt-review-error'),
  stmtImport: document.getElementById('stmt-import'),
  stmtBack: document.getElementById('stmt-back'),
  stmtRecent: document.getElementById('stmt-recent'),
  stmtRecentList: document.getElementById('stmt-recent-list'),
  exportEmailButton: document.getElementById('export-email-button'),
  exportStatus: document.getElementById('export-status'),
  txnFullList: document.getElementById('txn-full-list'),
  txnEmptyState: document.getElementById('txn-empty-state'),

  // Settings tab
  themeOptionButtons: document.querySelectorAll('[data-theme-option]'),
  settingNotifications: document.getElementById('setting-notifications'),
  settingThumbnails: document.getElementById('setting-thumbnails'),
  settingGroupCopies: document.getElementById('setting-group-copies'),
  settingCycleDay: document.getElementById('setting-cycle-day'),
  saveCycleDay: document.getElementById('save-cycle-day'),
  settingEmail: document.getElementById('setting-email'),
  saveEmail: document.getElementById('save-email'),
  settingsStatus: document.getElementById('settings-status'),
  clearHistoryButton: document.getElementById('clear-history-button'),
  deleteAccountButton: document.getElementById('delete-account-button'),

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
let holdingCurrencyTouched = false; // the Add Holding currency follows symbol/type until the user picks one
let detailHolding = null; // holding shown in the detail sheet (with computed fields)
let editingLot = null; // lot open in the lot sheet, null when adding
let lotSide = 'buy';
// Performance chart state -- declared up here because applyTheme() (which
// re-renders the chart) already runs while this script is still loading.
let perfRange = '1y';
let perfView = 'value'; // 'value' | 'return'
let perfData = null; // last GET /portfolio/:u/performance response
let perfChart = null; // Chart.js instance, destroyed before every re-render
let perfLoadSeq = 0;
// Dividends card state -- same reason (applyTheme() redraws this chart too).
let divMode = 'monthly'; // 'monthly' | 'quarterly' | 'annual'
let divData = null; // last GET /portfolio/:u/dividends response
let divChart = null;
let divLoadSeq = 0;
// Goal tracker card state -- same reason.
let goalData = null; // last GET/PUT /portfolio/:u/goal response
let goalChart = null;
let goalLoadSeq = 0;
// The Goal sheet's default start value. The goal card can render before the
// portfolio fetch finishes, so the sheet awaits this promise rather than
// reading a total that may not be set yet.
let portfolioPromise = null;
const MANUAL_PRICE_ASSET_TYPES = ['mutual_fund', 'gold']; // mirrors backend/services/marketPrices.js -- no live price source for these

// ---- API + in-memory cache ----
//
// Any non-GET request clears the whole cache (simplest-correct for an app
// this size, rather than tracking exactly which keys a given write affects).
// GETs go through cachedGet() so revisiting a tab you've already loaded this
// session is instant instead of re-fetching.
const getCache = new Map();

// LINE ID token for the signed-in user (liff.getIDToken()), sent with every
// API request; the backend verifies it and checks it matches the
// :line_user_id being read or written (backend/services/lineAuth.js).
let idToken = null;

// An expired token gets one silent re-login (liff.login() returns to this
// page with a fresh token); the timestamp guard stops a redirect loop.
function reauthenticate() {
  try {
    const last = Number(sessionStorage.getItem('liffReauthAt') || 0);
    if (Date.now() - last < 60 * 1000) return false;
    sessionStorage.setItem('liffReauthAt', String(Date.now()));
  } catch {
    // no sessionStorage: still try once per page load
    if (reauthenticate.tried) return false;
    reauthenticate.tried = true;
  }
  liff.login({ redirectUri: window.location.href });
  return true;
}

async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}), ...(options.headers || {}) },
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
    if (response.status === 401 && body.code === 'auth_invalid' && reauthenticate()) {
      throw new Error('Signing you in again…');
    }
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

// ---- Chart.js on demand ----
// Only the Wealth tab's charts use Chart.js (205 KB), so it isn't loaded at
// startup: chartReady() loads it the first time a chart is drawn (and the
// app warms it up in the background once Home is showing). With the CDN
// blocked the charts say "Chart unavailable"; everything else still works.
const CHARTJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
let chartPromise = null;
let chartFailed = false;
function loadChartJs() {
  if (window.Chart) return Promise.resolve(window.Chart);
  chartPromise ||= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHARTJS_URL;
    script.onload = () => (window.Chart ? resolve(window.Chart) : reject(new Error('Chart.js missing')));
    script.onerror = () => { chartFailed = true; chartPromise = null; reject(new Error('Chart.js failed to load')); };
    document.head.appendChild(script);
  });
  return chartPromise;
}
// True when charts can be drawn now; otherwise starts loading Chart.js and
// calls redraw when it's there (or failed, so the caller can say so).
function chartReady(redraw) {
  if (window.Chart) return true;
  if (!chartFailed) loadChartJs().then(redraw, redraw);
  return false;
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
// One banner for everything the add-expense response flagged: the category
// budget crossing (budget_alert) plus any event/occasion buckets
// (event_budget_alerts, 80% heads-up or used up). Amber when everything is
// only a heads-up, red as soon as anything is over.
function showBudgetAlerts(budgetAlert, eventAlerts = []) {
  const messages = [];
  if (budgetAlert) {
    messages.push(`Budget alert: your "${budgetAlert.categoryName}" ${budgetAlert.budgetPeriod} budget of ${budgetAlert.budgetAmount.toFixed(2)} has been reached (${budgetAlert.totalSpent.toFixed(2)} spent).`);
  }
  for (const a of eventAlerts) messages.push(a.message); // wording comes from services/eventBudgetAlert.js
  if (messages.length === 0) return;
  clearTimeout(budgetAlertTimer);
  el.budgetAlertBanner.textContent = messages.join(' ');
  el.budgetAlertBanner.classList.toggle('warning', !budgetAlert && eventAlerts.every((a) => a.level === 'warning'));
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

// All calendar periods (billing cycles, budget periods, months) follow the
// Asia/Bangkok calendar, mirroring backend/services/bangkokDay.js -- Bangkok
// has no DST, so a fixed +7h offset is exact, and this doesn't depend on the
// phone's own timezone setting.
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
function bangkokParts(date = new Date()) {
  const b = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  return { year: b.getUTCFullYear(), month: b.getUTCMonth(), day: b.getUTCDate(), weekday: b.getUTCDay() };
}
function bangkokMidnight(year, month, day) {
  return new Date(Date.UTC(year, month, day) - BANGKOK_OFFSET_MS);
}
const bangkokYmd = (date = new Date()) => new Date(date.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);

// Mirrors the billing-cycle window used elsewhere in the backend (e.g. the bot's
// "summary" command): the current cycle starting on the user's configured day.
// `offset` steps whole cycles back (-1 = previous cycle) for the Transactions
// tab's period navigator.
function getBillingCycleRange(billingCycleStartDay, offset = 0) {
  const day = billingCycleStartDay || 1;
  const now = new Date();
  const { year } = bangkokParts(now);
  let { month } = bangkokParts(now);
  if (bangkokMidnight(year, month, day) > now) month -= 1;
  month += offset;
  return { startISO: bangkokMidnight(year, month, day).toISOString(), endISO: bangkokMidnight(year, month + 1, day).toISOString() };
}

// Mirrors services/budgetAlert.js's getPeriodStartISO on the backend, for
// client-side "how much spent this period" display on the Categories tab.
function getPeriodStartDate(period) {
  const { year, month, day, weekday } = bangkokParts();
  switch (period) {
    case 'daily':
      return bangkokMidnight(year, month, day);
    case 'weekly':
      return bangkokMidnight(year, month, day - weekday);
    case 'monthly':
      return bangkokMidnight(year, month, 1);
    case 'yearly':
      return bangkokMidnight(year, 0, 1);
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
  const fmt = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'Asia/Bangkok' });
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
  return `${bangkokYmd().slice(0, 7)}-01`;
}

// ---- v5 refresh helpers (LIFF_UXUI_REFRESH_SPEC.md 1.3, 1.4, 2) ----

// ฿15,973 (no decimals when whole, 2 otherwise), U+2212 minus for negatives,
// sign: true adds a leading +. CSV exports don't use this.
function formatBaht(value, { sign = false } = {}) {
  const v = Number(value) || 0;
  const cents = Math.round(Math.abs(v) * 100);
  const digits = cents % 100 === 0 ? 0 : 2;
  const body = (cents / 100).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${v < 0 ? '\u2212' : sign && v > 0 ? '+' : ''}฿${body}`;
}

// Signed amount for an entry: expenses "−฿120" (foreground), income "+฿500"
// (--income), transfers "฿300" (muted). Red is only for over budget / errors.
function entryAmount(t) {
  const n = Math.abs(parseFloat(t.amount) || 0);
  if (t.type === 'income') return formatBaht(n, { sign: true });
  if (t.type === 'expense') return formatBaht(-n);
  return formatBaht(n);
}

// Lucide 0.469 paths for category tiles.
const LUCIDE_PATHS = {
  utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  'shopping-bag': '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  film: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/>',
  'heart-pulse': '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>',
  coffee: '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>',
  briefcase: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
  'arrow-left-right': '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  house: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
};
const lucide = (name, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LUCIDE_PATHS[name] || LUCIDE_PATHS.tag}</svg>`;

// Category name -> icon and tint (spec 1.3). Matched on the name, so the
// presets, their Thai or English variants and similar user names all get a
// tile; anything else (user categories, accounts) is the neutral tile.
const CATEGORY_ICONS = [
  { match: /food|drink|อาหาร|ข้าว|meal|restaurant|grocer/i, icon: 'utensils', tint: 'food' },
  { match: /coffee|cafe|café|กาแฟ/i, icon: 'coffee', tint: 'coffee' },
  { match: /transport|taxi|grab|travel|เดินทาง|fuel|car/i, icon: 'car', tint: 'trans' },
  { match: /shop|ช้อป|clothes/i, icon: 'shopping-bag', tint: 'shop' },
  { match: /utilit|bill|telecom|phone|internet|electric|water|ค่าน้ำ|ค่าไฟ/i, icon: 'zap', tint: 'bill' },
  { match: /entertain|movie|fun|game|บันเทิง/i, icon: 'film', tint: 'ent' },
  { match: /health|medic|pharm|hospital|สุขภาพ/i, icon: 'heart-pulse', tint: 'health' },
  { match: /income|salary|freelance|bonus|wage|รายได้|เงินเดือน/i, icon: 'briefcase', tint: 'inc' },
  { match: /^transfer$|โอน/i, icon: 'arrow-left-right', tint: 'xfer' },
  { match: /accommodation|rent|home|house|ที่พัก/i, icon: 'house', tint: null },
];
function categoryVisual(name) {
  const hit = CATEGORY_ICONS.find((c) => c.match.test(String(name || '')));
  return hit || { icon: 'tag', tint: null };
}
// A 36px tinted tile for a category (or 'Transfer').
function categoryTile(name, { size = 36 } = {}) {
  const v = categoryVisual(name);
  const style = v.tint ? ` style="--tile-bg: var(--c-${v.tint}-bg); --tile-fg: var(--c-${v.tint});"` : '';
  return `<span class="cat-tile${size !== 36 ? ' cat-tile-sm' : ''}"${style} aria-hidden="true">${lucide(v.icon, 18)}</span>`;
}

// Sonner-style toast (spec 2): showToast({ title, description, kind: 'ok'|'warn'|'bad', undo: async () => {} })
let toastTimer = null;
function showToast({ title, description = '', kind = 'ok', undo = null }) {
  const node = document.getElementById('toast');
  if (!node) return;
  clearTimeout(toastTimer);
  node.className = `toast toast-${kind}`;
  node.innerHTML = `<span class="toast-icon" aria-hidden="true">${kind === 'ok'
    ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>'
    : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>'}</span>
    <span class="toast-text"><span class="toast-title">${escapeHtml(title)}</span>${description ? `<span class="toast-desc">${escapeHtml(description)}</span>` : ''}</span>
    ${undo ? '<button type="button" class="btn btn-sm toast-undo">Undo</button>' : ''}`;
  node.hidden = false;
  if (undo) {
    node.querySelector('.toast-undo').addEventListener('click', async () => {
      node.hidden = true;
      clearTimeout(toastTimer);
      try { await undo(); } catch (error) { showToast({ title: "Couldn't undo", description: plainError(error), kind: 'bad' }); }
    }, { once: true });
  }
  toastTimer = setTimeout(() => { node.hidden = true; }, undo ? 5000 : 3200);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Avatars in every page header and the More profile card: the LINE photo,
// else initials on --brand-subtle.
function renderProfile(profile) {
  const name = profile.displayName || 'You';
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => [...w][0] || '').join('').toUpperCase() || 'Y';
  for (const node of document.querySelectorAll('[data-avatar]')) {
    node.textContent = '';
    if (profile.pictureUrl) {
      const img = document.createElement('img');
      img.src = profile.pictureUrl;
      img.alt = '';
      img.addEventListener('error', () => { node.textContent = initials; }, { once: true });
      node.appendChild(img);
    } else {
      node.textContent = initials;
    }
  }
  for (const node of document.querySelectorAll('[data-profile-name]')) node.textContent = name;
  const greeting = document.getElementById('home-greeting');
  if (greeting) greeting.textContent = `Hi, ${name.trim().split(/\s+/)[0]}`;
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
  // Chart colors are read from the tokens at render time, so redraw.
  renderPerfChart();
  renderDivChart();
  renderGoalChart();
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
// "System" follows the OS live, without going through applyTheme().
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  renderPerfChart();
  renderDivChart();
  renderGoalChart();
});

// ---- Tab navigation ----
//
// Switching is pure, synchronous show/hide (instant); each tab's load function
// runs after, not blocking the switch, and reads through cachedGet so a repeat
// visit this session resolves immediately instead of re-fetching.
const TAB_LOADERS = {
  more: async () => {},
  home: loadHomeTab,
  tasks: () => loadTasksTab(), // tasks.js
  tax: () => loadTaxTab(), // tax.js
  transactions: loadTransactionsTab,
  budgets: loadBudgetsTab,
  networth: loadNetWorthTab,
  settings: loadSettingsTab,
};

let currentTab = 'home';
// v5 nav: 5 items. Every panel keeps its id; budgets/networth light up
// Money (last one used is remembered), tax/settings/more light up More.
const NAV_FOR_TAB = { budgets: 'money', networth: 'money', tax: 'more', settings: 'more', more: 'more' };
const NO_FAB_TABS = new Set(['budgets', 'networth', 'more', 'settings']);
function lastMoneyView() {
  try { return localStorage.getItem('moneyView') === 'networth' ? 'networth' : 'budgets'; } catch { return 'budgets'; }
}

function switchTab(tabName) {
  if (tabName === 'money') tabName = lastMoneyView();
  if (!el.tabPanels[tabName]) tabName = 'home';
  if (tabName === 'budgets' || tabName === 'networth') {
    try { localStorage.setItem('moneyView', tabName); } catch { /* private mode */ }
    for (const b of document.querySelectorAll('.money-switch [data-money]')) b.setAttribute('aria-selected', String(b.dataset.money === tabName));
  }
  for (const [name, panel] of Object.entries(el.tabPanels)) {
    panel.hidden = name !== tabName;
  }
  const navName = NAV_FOR_TAB[tabName] || tabName;
  for (const button of el.navTabs) {
    const on = button.dataset.tab === navName;
    button.classList.toggle('active', on);
    if (on) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  }
  el.tabContent.scrollTop = 0;
  window.scrollTo(0, 0);
  currentTab = tabName;
  TAB_LOADERS[tabName]().catch((error) => showError(error.message));
  el.fabAdd.hidden = NO_FAB_TABS.has(tabName);
  el.fabAdd.setAttribute('aria-label', tabName === 'tasks' ? 'Add reminder or note' : tabName === 'tax' ? 'Add income for tax' : 'Add expense');
}

// ---- Dashboard tab ----

function renderSummary(transactions, periodLabel) {
  el.periodLabel.textContent = periodLabel;
  const moneyKicker = document.getElementById('money-kicker');
  if (moneyKicker) moneyKicker.textContent = periodLabel;
  const totals = transactions.reduce(
    (acc, t) => {
      acc[t.type] += parseFloat(t.amount);
      return acc;
    },
    { income: 0, expense: 0 }
  );
  const net = totals.income - totals.expense;
  el.summaryIncome.textContent = formatBaht(totals.income, { sign: true });
  el.summaryExpense.textContent = formatBaht(totals.expense);
  el.summaryNet.textContent = formatBaht(net, { sign: true });
  el.summaryNet.style.color = net >= 0 ? 'var(--income)' : 'var(--foreground)'; // red only for over budget / errors
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
      ${spent > 0 ? `<span class="transaction-day-total">Spent ${formatBaht(spent)}</span>` : ''}
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

// v5 row: tinted tile (photo badge for a receipt), title = description or
// category, meta = "Category · Account" ("From → To" for transfers).
function buildTransactionRow(t, showPaymentMethod) {
  const li = document.createElement('li');
  li.className = 'transaction-row';
  const category = t.type === 'transfer' ? 'Transfer' : t.categories?.name || 'Uncategorized';
  const sourceLabel = transactionSourceLabel(t);
  const badge = t.thumbnail_url ? `<img class="transaction-thumbnail" src="${t.thumbnail_url}" alt="" />` : '';
  const title = t.description
    ? `<span class="row-title transaction-description">${escapeHtml(t.description)}</span>`
    : `<span class="row-title">${escapeHtml(category)}</span>`;
  const metaBits = [`<span class="transaction-category">${escapeHtml(category)}</span>`];
  if (showPaymentMethod && sourceLabel) metaBits.push(`<span class="transaction-date">${escapeHtml(sourceLabel)}</span>`);
  li.innerHTML = `
    <span class="tile-wrap">${categoryTile(category)}${badge}</span>
    <span class="row-main transaction-details">${title}<span class="row-meta">${metaBits.join(' · ')}</span></span>
    <span class="transaction-amount ${t.type}">${entryAmount(t)}</span>
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

// v5: one row, "{n}-day streak" with today's state on the right.
function renderStreak(transactions) {
  const { current, loggedToday } = computeStreak(transactions);
  el.streakCount.textContent = current === 0 ? 'No streak yet' : `${current}-day streak`;
  el.streakHint.textContent = loggedToday ? 'Logged today' : current > 0 ? 'Log today to keep it' : 'Log today to start one';
}

// ---- Home (v5, spec 4.1) ----
let homeCycleReport = Promise.resolve(null); // this cycle's report (offset 0)
let homeTxns = []; // the 6-month window Home loaded, newest first
let homeLoadSeq = 0;

// Hero sub line + bar, and Budgets to watch, from this cycle's report.
async function renderHomeBudgets(seq, endISO) {
  const report = await homeCycleReport;
  if (seq !== homeLoadSeq) return;
  const sub = document.getElementById('home-hero-sub');
  const bar = document.getElementById('home-hero-bar');
  const rows = (report && report.categories) || [];
  const budget = rows.reduce((sum, r) => sum + (r.budget || 0), 0);
  const daysLeft = Math.max(0, Math.ceil((new Date(endISO) - Date.now()) / 86400000));
  if (!budget) {
    sub.textContent = 'No budget set yet';
    bar.hidden = true;
  } else {
    const spent = report.expense;
    sub.textContent = `of ${formatBaht(budget)} budget · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
    bar.hidden = false;
    bar.classList.toggle('is-over', spent > budget);
    bar.firstElementChild.style.width = `${Math.min(100, Math.round((spent / budget) * 100))}%`;
  }
  const watch = rows.filter((r) => r.budget && r.pct >= 80).sort((a, b) => b.pct - a.pct).slice(0, 3);
  document.getElementById('home-watch').hidden = watch.length === 0;
  document.getElementById('home-watch-list').innerHTML = watch.map((r) => {
    const over = r.spent > r.budget;
    return `<li class="row">${categoryTile(r.name)}
      <span class="row-main"><span class="row-title">${escapeHtml(r.name)}</span><span class="row-meta">${formatBaht(r.spent)} of ${formatBaht(r.budget)}</span>
        <span class="bar bar-thin${over ? ' is-over' : ' is-warning'}"><span style="width:${Math.min(100, r.pct)}%"></span></span></span>
      <span class="row-end"><span class="row-value ${over ? 'amount-over' : 'amount-warn'}">${over ? `Over ${formatBaht(r.spent - r.budget)}` : `${r.pct}% used`}</span></span>
    </li>`;
  }).join('');
}

// First week (fewer than 7 days with entries): the Get set up checklist,
// Scan / Speak / Import tiles, and a note instead of the pulse.
async function renderFirstWeek(seq, txns) {
  const days = new Set(txns.map((t) => getBangkokYmd(new Date(t.transaction_date))));
  const firstWeek = days.size < 7;
  document.getElementById('home-setup').hidden = !firstWeek;
  document.getElementById('add-bill-button').hidden = firstWeek;
  document.getElementById('home-import').hidden = !firstWeek;
  document.getElementById('home-pulse').hidden = firstWeek;
  document.getElementById('home-pulse-note').hidden = !firstWeek;
  if (!firstWeek) return;
  const [report, accounts, groups] = await Promise.all([
    homeCycleReport,
    cachedGet(`/accounts/${lineUserId}`).then((r) => r.accounts || []).catch(() => []),
    cachedGet(`/groups/${lineUserId}`).then((r) => r.groups || []).catch(() => []),
  ]);
  if (seq !== homeLoadSeq) return;
  const steps = [
    { key: 'entry', title: 'Log your first entry', meta: 'Type, scan a receipt or speak', done: txns.length > 0, go: () => openAddExpenseModal().catch((e) => showError(e.message)) },
    { key: 'budget', title: 'Set a monthly budget', meta: 'On a category under Money', done: Boolean(report && report.categories.some((r) => r.budget)), go: () => switchTab('budgets') },
    { key: 'accounts', title: 'Add your accounts', meta: 'Bank, card, e-wallet or cash', done: accounts.length > 0, go: () => switchTab('networth') },
    { key: 'group', title: 'Add the bot to a LINE group', meta: 'Split bills with friends', done: groups.length > 0, go: () => { document.getElementById('help-modal').hidden = false; } },
  ];
  const doneCount = steps.filter((x) => x.done).length;
  document.getElementById('home-setup-count').textContent = `${doneCount} of ${steps.length}`;
  document.getElementById('home-setup-bar').style.width = `${(doneCount / steps.length) * 100}%`;
  const list = document.getElementById('home-setup-list');
  list.innerHTML = steps.map((x) => `<li><button type="button" class="row setup-row${x.done ? ' is-done' : ''}" data-step="${x.key}"${x.done ? ' disabled' : ''}>
    <span class="setup-check" aria-hidden="true">${x.done ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' : ''}</span>
    <span class="row-main"><span class="row-title">${escapeHtml(x.title)}</span><span class="row-meta">${x.done ? 'Done' : escapeHtml(x.meta)}</span></span>
  </button></li>`).join('');
  list.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => steps.find((x) => x.key === b.dataset.step).go()));
}

// Tax row: 1 Oct - 31 Mar (filing season for the year just ending).
async function renderHomeTax(seq) {
  const wrap = document.getElementById('home-tax');
  const { year, month } = bangkokParts();
  const inSeason = month >= 10 || month <= 3;
  if (!inSeason) { wrap.hidden = true; return; }
  const taxYear = (month >= 10 ? year : year - 1) + 543;
  const d = await cachedGet(`/tax/${lineUserId}/${taxYear}`);
  if (seq !== homeLoadSeq) return;
  const r = d.result;
  const title = document.getElementById('home-tax-title');
  const meta = document.getElementById('home-tax-meta');
  if (!d.incomes.length) {
    title.textContent = `Estimate your ${taxYear} tax`;
    meta.textContent = 'File PND 90/91 by 31 Mar';
  } else {
    title.textContent = r.result === 'refund' ? `Refund ${formatBaht(Math.abs(r.balance))}` : r.result === 'pay' ? `Tax to pay ${formatBaht(r.balance)}` : 'No tax to pay';
    const plan = d.plan && d.plan.applicable ? d.plan.items : [];
    const save = plan.length ? Math.max(...plan.map((it) => it.saves || 0)) : 0;
    const form = d.guide && d.guide.form === 'PND91' ? 'PND 91' : 'PND 90';
    meta.textContent = `File ${form} by 31 Mar${plan.length && save > 0 ? ` · ${plan.length} tip${plan.length === 1 ? '' : 's'} can save up to ${formatBaht(save)}` : ''}`;
  }
  wrap.hidden = false;
}

async function loadHomeTab() {
  // The transactions fetch can't be date-filtered server-side until we know the
  // user's billing_cycle_start_day, which only comes back from the /users call --
  // so instead of waiting on that before firing it, fetch a wide-enough window
  // (6 months, also covers the Monthly Pulse trend chart) in parallel with
  // everything else and filter the cycle window client-side.
  // Independent of everything below, so it doesn't wait for the 6-month fetch.
  renderHomeGroups().catch(() => {
    el.homeGroups.hidden = true;
  });
  const { year: nowYear, month: nowMonth } = bangkokParts();
  const sixMonthsAgoISO = bangkokMidnight(nowYear, nowMonth - 5, 1).toISOString();
  // This cycle's per-category budgets and spend (hero, Budgets to watch,
  // insights). Shared with insights.js; never blocks Home.
  homeCycleReport = cachedGet(`/reports/${lineUserId}/monthly?offset=0`).then((r) => r.report).catch(() => null);
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

  homeTxns = allTransactions;
  renderSummary(inPeriod, periodLabel);
  renderStreak(allTransactions);
  renderTrendChart(allTransactions);
  // allTransactions is newest-first (API default order): the last 3 entries.
  renderTransactionList(el.transactionList, el.emptyState, allTransactions.slice(0, 3));
  const seq = ++homeLoadSeq;
  renderHomeBudgets(seq, endISO).catch(() => {});
  renderFirstWeek(seq, allTransactions).catch(() => {});
  renderHomeTax(seq).catch(() => { document.getElementById('home-tax').hidden = true; });
  renderBillsList(billsResponse.bills);
  renderHomeInvestments().catch(() => {
    el.homeInvestmentsCard.hidden = true;
  });
}

// ---- LINE group bills (migration 019) ----
//
// Bills start in the group chat ("+ข้าว 600"). Here members see each group's
// open bills, pay the person who paid (PromptPay QR or bank details), send
// their slip, and the owner confirms, marks paid or cancels. The backend
// announces every change back in the group.

const groupDisplayName = (g) => g.name || (g.source_type === 'room' ? 'LINE chat' : 'LINE group');
const plainError = (error) => String(error.message).replace(/^\[\d+\]\s*/, '');

// "You owe ฿245.00" / "Owed to you ฿400.00" / "All paid", with a pill class.
function groupTotalsStatus(g) {
  if (g.my_owe > 0) return { text: `You owe ${formatBaht(g.my_owe)}`, cls: 'unpaid' };
  if (g.my_owed > 0) return { text: `Owed ${formatBaht(g.my_owed)}`, cls: 'paid' };
  return { text: 'All paid', cls: 'settled' };
}

const onActivate = (node, fn) => {
  node.addEventListener('click', fn);
  node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
};

// Groups section on Home: hidden until the user is in a LINE group with the bot.
async function renderHomeGroups() {
  const { groups } = await cachedGet(`/groups/${lineUserId}`);
  el.homeGroups.hidden = groups.length === 0;
  el.groupsList.innerHTML = groups.map((g, i) => {
    const status = groupTotalsStatus(g);
    const detail = `${g.open_bills} open bill${g.open_bills === 1 ? '' : 's'} · ${g.member_count} member${g.member_count === 1 ? '' : 's'}`;
    return `<li class="row group-row" data-i="${i}" role="button" tabindex="0">
      <span class="cat-tile" aria-hidden="true">${lucide('users')}</span>
      <span class="row-main"><span class="row-title category-name">${escapeHtml(groupDisplayName(g))}</span><span class="row-meta category-bar-label-row">${escapeHtml(detail)}</span></span>
      <span class="row-end"><span class="row-value bill-status-pill ${status.cls}">${escapeHtml(status.text)}</span>${g.my_owe > 0 ? '<span class="row-sub">Pay now</span>' : ''}</span>
    </li>`;
  }).join('');
  el.groupsList.querySelectorAll('.group-row').forEach((row) => onActivate(row, () => openGroupDetail(groups[Number(row.dataset.i)].group_id)));
}

// One bill row's status pill, from the viewer's side.
function billPill(b) {
  if (b.status === 'cancelled') return { text: 'Cancelled', cls: 'settled' };
  if (b.status === 'paid') return { text: 'Fully paid', cls: 'paid' };
  if (b.is_owner) return b.pending_slips ? { text: `${b.pending_slips} slip${b.pending_slips === 1 ? '' : 's'} to check`, cls: 'unpaid' } : { text: `${b.paid_count} of ${b.owe_count} paid`, cls: 'settled' };
  if (b.my_status === 'unpaid') return { text: `Pay ${formatMoney(b.my_share, 'THB')}`, cls: 'unpaid' };
  if (b.my_status === 'slip_pending') return { text: 'Slip sent', cls: 'settled' };
  if (b.my_status === 'paid') return { text: 'Paid', cls: 'paid' };
  return { text: `${b.paid_count} of ${b.owe_count} paid`, cls: 'settled' };
}

const billDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Bangkok' });

function billRows(list, emptyText) {
  if (!list.length) return `<li class="empty-state">${escapeHtml(emptyText)}</li>`;
  return list.map((b) => {
    const pill = billPill(b);
    return `<li class="category-row group-row gbill-row" data-bill="${escapeHtml(b.id)}" role="button" tabindex="0">
      <div class="category-row-top">
        <span class="category-name">${escapeHtml(b.description || 'Shared bill')}</span>
        <span class="bill-status-pill ${pill.cls}">${escapeHtml(pill.text)}</span>
      </div>
      <div class="category-bar-label-row"><span>${escapeHtml(b.is_owner ? 'You' : b.owner_name)} paid ${formatMoney(b.amount, 'THB')} · ${escapeHtml(billDate(b.created_at))}</span></div>
    </li>`;
  }).join('');
}

let groupDetailSeq = 0;
let openGroupId = null;
async function openGroupDetail(groupId) {
  const seq = ++groupDetailSeq;
  openGroupId = groupId;
  clearModalError(el.groupDetailError);
  el.groupDetailTitle.textContent = 'Loading…';
  el.groupDetailMeta.textContent = '';
  el.groupDetailMine.textContent = '';
  el.groupDetailOpen.innerHTML = '';
  el.groupDetailClosed.innerHTML = '';
  el.groupDetailModal.hidden = false;
  try {
    const d = await cachedGet(`/groups/${lineUserId}/${groupId}`);
    if (seq !== groupDetailSeq) return;
    el.groupDetailTitle.textContent = groupDisplayName(d.group);
    el.groupDetailMeta.textContent = `${d.group.member_count} member${d.group.member_count === 1 ? '' : 's'}${d.group.is_active ? '' : ' · bot removed from this chat'}`;
    const status = groupTotalsStatus(d);
    el.groupDetailMine.textContent = status.text;
    el.groupDetailMine.className = `group-mine ${status.cls}`;
    el.groupDetailOpen.innerHTML = billRows(d.open_bills, 'No open bills.');
    el.groupDetailClosed.innerHTML = billRows(d.closed_bills, 'Nothing closed yet.');
    [el.groupDetailOpen, el.groupDetailClosed].forEach((list) => list.querySelectorAll('.gbill-row').forEach((row) => onActivate(row, () => openGroupBill(row.dataset.bill))));
  } catch (error) {
    if (seq !== groupDetailSeq) return;
    el.groupDetailTitle.textContent = 'Group';
    showModalError(el.groupDetailError, plainError(error));
  }
}

// PromptPay QR: qrcode-generator (cdnjs) loaded on first use. Without it the
// number and bank details still work ("QR unavailable").
const QR_URL = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
let qrPromise = null;
function loadQrLib() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  qrPromise ||= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = QR_URL;
    script.onload = () => (window.qrcode ? resolve(window.qrcode) : reject(new Error('QR library missing')));
    script.onerror = () => { qrPromise = null; reject(new Error('QR unavailable')); };
    document.head.appendChild(script);
  });
  return qrPromise;
}

async function renderPromptPayQr(payload, seq) {
  el.gbillQr.innerHTML = '';
  el.gbillQr.dataset.payload = payload;
  try {
    const qrcode = await loadQrLib();
    if (seq !== groupBillSeq) return;
    const qr = qrcode(0, 'M');
    qr.addData(payload);
    qr.make();
    el.gbillQr.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  } catch {
    if (seq !== groupBillSeq) return;
    el.gbillQr.innerHTML = '<p class="group-hint">QR unavailable. Use the PromptPay number below.</p>';
  }
}

const SHARE_PILL = {
  owner: { text: 'Paid the bill', cls: 'settled' },
  paid: { text: 'Paid', cls: 'paid' },
  slip_pending: { text: 'Slip sent', cls: 'unpaid' },
  unpaid: { text: 'Unpaid', cls: 'unpaid' },
};
const ORD = ['1st', '2nd', '3rd'];

let groupBillSeq = 0;
let currentGroupBill = null;
async function openGroupBill(billId) {
  const seq = ++groupBillSeq;
  clearModalError(el.gbillError);
  el.gbillTitle.textContent = 'Loading…';
  [el.gbillMeta, el.gbillAmount, el.gbillProgress].forEach((n) => { n.textContent = ''; });
  el.gbillShares.innerHTML = '';
  el.gbillPay.hidden = true;
  el.gbillCancel.hidden = true;
  hideAiStatus(el.gbillSlipStatus);
  el.groupBillModal.hidden = false;
  try {
    const d = await apiRequest(`/groups/${lineUserId}/bills/${billId}`);
    if (seq !== groupBillSeq) return;
    currentGroupBill = d;
    renderGroupBill(d, seq);
  } catch (error) {
    if (seq !== groupBillSeq) return;
    el.gbillTitle.textContent = 'Bill';
    showModalError(el.gbillError, plainError(error));
  }
}

function renderGroupBill(d, seq) {
  const b = d.bill;
  el.gbillTitle.textContent = b.description || 'Shared bill';
  el.gbillMeta.textContent = `${b.is_owner ? 'You' : b.owner_name} paid · ${billDate(b.created_at)}${b.group_name ? ` · ${b.group_name}` : ''}`;
  el.gbillAmount.textContent = formatMoney(b.amount, 'THB');
  const owing = b.shares.filter((s) => s.status !== 'owner' && s.status !== 'none');
  const paid = owing.filter((s) => s.status === 'paid').length;
  el.gbillProgress.textContent = b.status === 'cancelled' ? 'Collection cancelled'
    : b.status === 'paid' ? 'Fully paid' : `${paid} of ${owing.length} paid · ${formatMoney(b.unpaid_total, 'THB')} to go`;

  // Pay section: only for a member who still owes on an open bill.
  const p = d.pay_to;
  el.gbillPay.hidden = !p;
  if (p) {
    el.gbillPayTitle.textContent = `Pay ${formatMoney(b.my_share, 'THB')} to ${p.name}`;
    el.gbillQrBlock.hidden = !p.promptpay_payload;
    if (p.promptpay_payload) {
      el.gbillPromptpay.textContent = p.promptpay_id;
      renderPromptPayQr(p.promptpay_payload, seq);
    }
    el.gbillBankBlock.hidden = !p.bank_account_no;
    if (p.bank_account_no) {
      el.gbillBankName.textContent = p.bank_name || 'Bank account';
      el.gbillBankNo.textContent = p.bank_account_no;
      el.gbillBankHolder.textContent = p.bank_account_name || '';
    }
    el.gbillNoDetails.hidden = !!(p.promptpay_payload || p.bank_account_no);
    el.gbillNoDetails.textContent = `${p.name} hasn't added PromptPay or bank details yet. Ask them how to pay, then send your slip here.`;
    const mine = b.shares.find((s) => s.is_me);
    el.gbillSlipLabel.textContent = mine && mine.status === 'slip_pending' ? 'Replace slip' : 'Upload payment slip';
    if (mine && mine.status === 'slip_pending') setAiStatus(el.gbillSlipStatus, 'info', `Slip sent. Waiting for ${p.name} to confirm.`);
  }

  el.gbillShares.innerHTML = b.shares.map((s) => {
    const pill = SHARE_PILL[s.status] || SHARE_PILL.unpaid;
    const rank = s.status === 'paid' && s.position && s.position <= 3 ? ` · ${ORD[s.position - 1]}` : '';
    const actions = [];
    if (b.is_owner && b.status === 'open' && s.status === 'slip_pending') {
      if (s.slip_url) actions.push(`<a class="link-button" href="${escapeHtml(s.slip_url)}" target="_blank" rel="noopener">View slip</a>`);
      actions.push(`<button type="button" class="link-button" data-act="confirm" data-member="${escapeHtml(s.line_user_id)}">Confirm</button>`);
      actions.push(`<button type="button" class="link-button danger-link" data-act="reject" data-member="${escapeHtml(s.line_user_id)}">Reject</button>`);
    } else if (b.is_owner && b.status === 'open' && s.status === 'unpaid') {
      actions.push(`<button type="button" class="link-button" data-act="mark" data-member="${escapeHtml(s.line_user_id)}">Mark paid</button>`);
    } else if (s.is_me && s.slip_url) {
      actions.push(`<a class="link-button" href="${escapeHtml(s.slip_url)}" target="_blank" rel="noopener">View my slip</a>`);
    }
    return `<li class="category-row gbill-share">
      <div class="category-row-top">
        <span class="category-name">${escapeHtml(s.name)}${s.is_me ? ' (you)' : ''}</span>
        <span>${formatMoney(s.share, 'THB')}</span>
      </div>
      <div class="category-bar-label-row gbill-share-meta">
        <span class="bill-status-pill ${pill.cls}">${escapeHtml(pill.text + rank)}</span>
        ${actions.length ? `<span class="gbill-actions">${actions.join('')}</span>` : ''}
      </div>
    </li>`;
  }).join('');
  el.gbillCancel.hidden = !(b.is_owner && b.status === 'open');
}

async function refreshAfterGroupBillChange() {
  const billId = currentGroupBill && currentGroupBill.bill.id;
  if (billId) await openGroupBill(billId);
  if (openGroupId && !el.groupDetailModal.hidden) openGroupDetail(openGroupId);
  renderHomeGroups().catch(() => {});
}

async function handleGroupBillShareAction(event) {
  const button = event.target.closest('button[data-act]');
  if (!button || !currentGroupBill) return;
  const { act, member } = button.dataset;
  const billId = currentGroupBill.bill.id;
  const share = currentGroupBill.bill.shares.find((s) => s.line_user_id === member);
  const who = share ? share.name : 'this member';
  if (act === 'mark' && !(await confirmAction(`Mark ${who} as paid without a slip? The group will see it.`, 'Mark paid'))) return;
  if (act === 'reject' && !(await confirmAction(`Reject ${who}'s slip? They'll be asked to send it again.`, 'Reject'))) return;
  button.disabled = true;
  clearModalError(el.gbillError);
  try {
    await apiRequest(`/groups/${lineUserId}/bills/${billId}/shares/${member}/${act === 'reject' ? 'reject' : 'confirm'}`, { method: 'POST' });
    await refreshAfterGroupBillChange();
  } catch (error) {
    button.disabled = false;
    showModalError(el.gbillError, plainError(error));
  }
}

async function handleGroupBillSlip(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file || !currentGroupBill) return;
  const billId = currentGroupBill.bill.id;
  setAiStatus(el.gbillSlipStatus, 'working', 'Sending slip…');
  try {
    const blob = await resizeImageToJpegBlob(file, 1600, 0.8);
    const { base64 } = await blobToBase64AndHash(blob);
    const result = await apiRequest(`/groups/${lineUserId}/bills/${billId}/slip`, { method: 'POST', body: JSON.stringify({ image_base64: base64 }) });
    await refreshAfterGroupBillChange();
    const owner = currentGroupBill ? currentGroupBill.bill.owner_name : 'the owner';
    setAiStatus(el.gbillSlipStatus, 'done', result.notified === 'none'
      ? `Slip sent. ${owner} will see it in the app.`
      : `Slip sent. ${owner} has been asked to confirm it.`);
  } catch (error) {
    setAiStatus(el.gbillSlipStatus, 'error', plainError(error));
  }
}

async function handleGroupBillCancel() {
  if (!currentGroupBill) return;
  if (!(await confirmAction('Cancel this collection? Everyone in the group will see it was cancelled.', 'Cancel collection'))) return;
  clearModalError(el.gbillError);
  try {
    await apiRequest(`/groups/${lineUserId}/bills/${currentGroupBill.bill.id}/cancel`, { method: 'POST' });
    await refreshAfterGroupBillChange();
  } catch (error) {
    showModalError(el.gbillError, plainError(error));
  }
}

async function handleGroupBillCopy(event) {
  const button = event.target.closest('button[data-copy]');
  if (!button || !currentGroupBill || !currentGroupBill.pay_to) return;
  const p = currentGroupBill.pay_to;
  const text = (button.dataset.copy === 'promptpay' ? p.promptpay_id : p.bank_account_no || '').replace(/-/g, '');
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
  } catch {
    button.textContent = text;
  }
  setTimeout(() => { button.textContent = 'Copy'; }, 2000);
}

// Settings: how I get paid back (PUT /users/:u/payment-details).
function renderPaymentDetails() {
  el.settingPromptpay.value = currentUser.promptpay_id || '';
  el.settingBankName.value = currentUser.bank_name || '';
  el.settingBankNo.value = currentUser.bank_account_no || '';
  el.settingBankHolder.value = currentUser.bank_account_name || '';
}

async function handleSavePaymentDetails() {
  el.savePaymentDetails.disabled = true;
  try {
    const { payment_details: saved } = await apiRequest(`/users/${lineUserId}/payment-details`, {
      method: 'PUT',
      body: JSON.stringify({
        promptpay_id: el.settingPromptpay.value,
        bank_name: el.settingBankName.value,
        bank_account_no: el.settingBankNo.value,
        bank_account_name: el.settingBankHolder.value,
      }),
    });
    Object.assign(currentUser, saved);
    renderPaymentDetails();
    setAiStatus(el.paymentDetailsStatus, 'info', 'Saved.');
  } catch (error) {
    setAiStatus(el.paymentDetailsStatus, 'error', plainError(error));
  } finally {
    el.savePaymentDetails.disabled = false;
  }
}

// Opened from a group card's button: ?groupbill=<id> or ?group=<group id>.
// Read after liff.init(): liff.line.me links first arrive as
// ?liff.state=%3Fgroupbill%3D..., which init rewrites into the real query.
let deepLink = { bill: null, group: null };
function readDeepLink() {
  let params = new URLSearchParams(window.location.search);
  const state = params.get('liff.state');
  if (state) params = new URLSearchParams(state.replace(/^[^?]*\?/, ''));
  deepLink = { bill: params.get('groupbill'), group: params.get('group'), tab: params.get('tab'), report: params.get('report') };
}

function openDeepLink() {
  if (deepLink.tab && el.tabPanels[deepLink.tab]) switchTab(deepLink.tab); // e.g. the morning briefing's "Open Tasks"
  if (deepLink.report) openReport(-1); // the monthly report push's "Open report" (insights.js)

  if (deepLink.bill && /^[0-9a-f-]{36}$/i.test(deepLink.bill)) openGroupBill(deepLink.bill);
  else if (deepLink.group && /^[CR][0-9a-f]{32}$/.test(deepLink.group)) openGroupDetail(deepLink.group);
}

// Compact "Investments" card, only for users with holdings; tapping it opens
// Net Worth. Same cached GET the Net Worth tab uses, and never blocks Home.
async function renderHomeInvestments() {
  const portfolio = await cachedGet(`/portfolio/${lineUserId}`);
  el.homeInvestmentsCard.hidden = portfolio.holdings.length === 0;
  if (portfolio.holdings.length === 0) return;
  const { total_value: totalValue, day_gain: dayGain } = portfolio.totals;
  el.homeInvestmentsValue.textContent = formatMoney(totalValue, 'THB');
  el.homeInvestmentsToday.textContent = dayGain === null ? '—' : formatSignedMoney(dayGain, 'THB');
  el.homeInvestmentsToday.style.color = dayGain === null ? '' : gainColor(dayGain);
}

// ---- Add Expense modal ----

async function renderAddExpenseCategoryOptions() {
  const response = await cachedGet(`/categories/${lineUserId}?type=${entryType}`);
  entryCategories = response.categories;
  const autoOption = entryType === 'expense' ? '<option value="">Auto-Categorize</option>' : '<option value="">Choose a category</option>';
  const keep = el.fieldCategory.value;
  el.fieldCategory.innerHTML = autoOption + entryCategories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  el.fieldCategory.value = entryCategories.some((c) => c.id === keep) ? keep : '';
  el.fieldCategory.hidden = true;
  renderEntryCategoryChips();
}

// ---- AI states (owner's UI rules, after beautifului.dev) ----
// One status line per AI moment. data-state drives the look in CSS:
//   working: spinning Lucide loader + elapsed seconds (from 1s on)
//   done:    "AI suggestion" sparkle; fields it filled get an AI tag
//   error:   alert icon, role=alert
//   info:    plain hint (e.g. "Listening...")
// textContent stays the plain message (icons and timer are CSS-only), so
// screen readers and tests read exactly the sentence.
const aiStatusTimers = new WeakMap();
function setAiStatus(node, state, text) {
  clearInterval(aiStatusTimers.get(node));
  node.hidden = false;
  node.textContent = text;
  node.dataset.state = state;
  node.classList.toggle('scan-error', state === 'error');
  node.setAttribute('role', state === 'error' ? 'alert' : 'status');
  node.setAttribute('aria-busy', state === 'working' ? 'true' : 'false');
  delete node.dataset.elapsed;
  if (state !== 'working') return;
  // Pixel loader (spec 5): empty spans, so textContent stays the sentence.
  const loader = document.createElement('span');
  loader.className = 'pixel-loader';
  loader.setAttribute('aria-hidden', 'true');
  loader.innerHTML = '<i></i>'.repeat(9);
  node.prepend(loader);
  const started = Date.now();
  aiStatusTimers.set(node, setInterval(() => {
    if (node.hidden || node.dataset.state !== 'working') { clearInterval(aiStatusTimers.get(node)); return; }
    const sec = Math.floor((Date.now() - started) / 1000);
    if (sec >= 1) node.dataset.elapsed = `${sec}s`;
  }, 500));
}

function hideAiStatus(node) {
  clearInterval(aiStatusTimers.get(node));
  node.hidden = true;
  node.classList.remove('scan-error');
  delete node.dataset.state;
  delete node.dataset.elapsed;
}

// Skeleton shimmer on the fields an AI call is about to fill.
function setFieldsLoading(inputs, on) {
  inputs.forEach((input) => input.classList.toggle('is-loading', on));
}

// Tags each AI-filled field "AI"; the first edit flips it to "Edited".
function markAiFilled(inputs) {
  inputs.forEach((input) => {
    const label = input.closest('.field');
    if (!label) return;
    let tag = label.querySelector('.ai-tag');
    if (!tag) {
      tag = document.createElement('span');
      tag.className = 'ai-tag';
      const anchor = label.querySelector('.field-label');
      if (anchor) anchor.after(tag); else if (input.parentElement === label) label.insertBefore(tag, input); else label.insertBefore(tag, label.firstElementChild.nextSibling);
    }
    tag.textContent = 'AI';
    tag.classList.remove('is-edited');
    const onEdit = () => { tag.textContent = 'Edited'; tag.classList.add('is-edited'); };
    input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', onEdit, { once: true });
  });
}

function clearAiMarks(root) {
  root.querySelectorAll('.ai-tag').forEach((t) => t.remove());
}

function resetReceiptScanState() {
  hideAiBlock();
  el.fieldReceiptImage.value = '';
  el.receiptPreview.hidden = true;
  el.receiptPreview.removeAttribute('src');
  hideAiStatus(el.scanStatus);
  setFieldsLoading(aiFormFields(), false);
  clearAiMarks(el.addExpenseForm);
  scannedThumbnailPath = null;
}

// ---- Add entry sheet (spec 6.1) ----
let entryType = 'expense';

async function openAddExpenseModal(type = 'expense') {
  el.fieldAmount.value = '';
  el.fieldDescription.value = '';
  el.fieldDate.value = bangkokYmd();
  el.fieldCategory.value = ''; // defaults to Auto, not whatever was left selected last time
  setAmountError(false);
  clearModalError(el.modalError);
  resetReceiptScanState();
  setVoiceButton(false);
  el.voiceButton.hidden = !voiceSupported();
  el.addExpenseModal.hidden = false;
  try {
    await setEntryType(type);
    await renderAccountOptions();
  } catch (error) {
    showModalError(el.modalError, error.message);
  }
}

async function setEntryType(type) {
  entryType = type;
  for (const b of document.querySelectorAll('[data-entry-type]')) b.setAttribute('aria-selected', String(b.dataset.entryType === type));
  document.getElementById('add-entry-save').textContent = type === 'income' ? 'Save income' : 'Save expense';
  // Scan and Speak read expenses; income is typed.
  document.querySelector('#add-expense-form .receipt-scan-row').hidden = type === 'income';
  await renderAddExpenseCategoryOptions();
}

function setAmountError(on) {
  document.getElementById('amount-error').hidden = !on;
  el.fieldAmount.closest('.amount-field').classList.toggle('is-invalid', on);
}

async function renderAccountOptions() {
  const select = document.getElementById('field-account');
  const keep = select.value;
  const { accounts } = await cachedGet(`/accounts/${lineUserId}`);
  select.innerHTML = '<option value="">No account</option>' + accounts.map((a) => `<option value="${a.id}">${escapeHtml(a.account_name)}</option>`).join('');
  select.value = accounts.some((a) => a.id === keep) ? keep : '';
  select.closest('.field').hidden = accounts.length === 0;
}

// Category chips: Auto (expenses), the most-used categories, then More
// (the full list). The hidden select stays the value the form submits.
let entryCategories = [];
function renderEntryCategoryChips() {
  const wrap = document.getElementById('category-chips');
  const counts = new Map();
  for (const t of homeTxns) if (t.category_id) counts.set(t.category_id, (counts.get(t.category_id) || 0) + 1);
  const top = entryCategories.slice().sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0)).slice(0, 5);
  const current = el.fieldCategory.value;
  if (current && !top.some((c) => c.id === current)) {
    const extra = entryCategories.find((c) => c.id === current);
    if (extra) top.push(extra);
  }
  const chip = (value, label, icon = '') => `<button type="button" class="chip" data-cat="${value}" aria-pressed="${String(current === value)}">${icon}${escapeHtml(label)}</button>`;
  const sparkle = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>';
  wrap.innerHTML = (entryType === 'expense' ? chip('', 'Auto', sparkle) : '')
    + top.map((c) => chip(c.id, c.name)).join('')
    + (entryCategories.length > top.length ? '<button type="button" class="chip" data-cat-more aria-pressed="false">More</button>' : '');
}

function pickCategory(value) {
  el.fieldCategory.value = value;
  el.fieldCategory.dispatchEvent(new Event('change')); // flips an AI tag to Edited
  renderEntryCategoryChips();
}

// The AI block under the status line: tool chips + "How I read this".
function hideAiBlock() {
  const block = document.getElementById('ai-block');
  if (block) block.hidden = true;
}
function showAiBlock(chips, steps, seconds) {
  document.getElementById('ai-chips').innerHTML = chips.map((c) => `<span class="tool-chip"><span class="tool-dot" aria-hidden="true"></span>${escapeHtml(c)}</span>`).join('');
  document.getElementById('ai-trace-meta').textContent = `${steps.length} step${steps.length === 1 ? '' : 's'} · ${seconds}s`;
  document.getElementById('ai-trace-steps').innerHTML = steps.map((st) => `<li><span class="trace-check" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span><span><strong>${escapeHtml(st.label)}</strong> <span class="trace-detail">${escapeHtml(st.detail)}</span></span></li>`).join('');
  document.getElementById('ai-trace').open = false;
  document.getElementById('ai-block').hidden = false;
}
const categoryNameById = (id) => entryCategories.find((c) => c.id === id)?.name || '';

function closeAddExpenseModal() {
  cancelVoiceRecording();
  el.addExpenseModal.hidden = true;
}

// ---- Voice entry (mic button in Add Expense) ----
//
// Records with MediaRecorder (audio/mp4 on iOS, webm/opus on Android), sends
// it to POST /voice/:u/parse -- the same Typhoon/OpenAI transcription and
// expense parser as LINE voice messages -- and fills the form. Nothing is
// saved until the user taps Save, same as receipt scanning.
const VOICE_MAX_MS = 60 * 1000;
const VOICE_TYPES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
let voice = null; // { recorder, stream, chunks, timer, startedAt, cancelled }

const voiceSupported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

function setScanStatus(text, state = 'info') {
  setAiStatus(el.scanStatus, state === true ? 'error' : state, text);
}

const aiFormFields = () => [el.fieldAmount, el.fieldDescription, el.fieldDate, el.fieldCategory];

function setVoiceButton(recording, seconds = 0) {
  el.voiceButton.classList.toggle('recording', recording);
  el.voiceButton.setAttribute('aria-pressed', String(recording));
  el.voiceButtonText.textContent = recording ? `Stop 0:${String(seconds).padStart(2, '0')}` : 'Speak';
}

async function toggleVoiceRecording() {
  if (voice) {
    voice.recorder.stop();
    return;
  }
  clearModalError(el.modalError);
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    const blocked = error && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
    setScanStatus(blocked ? 'Microphone access is blocked. Allow it for LINE in your phone\'s settings, then try again.' : `Couldn't start the microphone (${error && error.message ? error.message : 'unknown error'}).`, 'error');
    return;
  }
  const mimeType = VOICE_TYPES.find((t) => window.MediaRecorder.isTypeSupported && window.MediaRecorder.isTypeSupported(t));
  const recorder = new window.MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  voice = { recorder, stream, chunks: [], startedAt: Date.now(), cancelled: false, timer: null };
  const current = voice;
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) current.chunks.push(e.data); };
  recorder.onstop = () => finishVoiceRecording(current, recorder.mimeType || mimeType || 'audio/mp4');
  recorder.start();
  setVoiceButton(true, 0);
  setScanStatus('Listening… say something like "กาแฟ 120 บาท", then tap Stop.');
  current.timer = setInterval(() => {
    const elapsed = Date.now() - current.startedAt;
    if (elapsed >= VOICE_MAX_MS) recorder.stop();
    else setVoiceButton(true, Math.floor(elapsed / 1000));
  }, 250);
}

function cancelVoiceRecording() {
  if (!voice) return;
  voice.cancelled = true;
  if (voice.recorder.state !== 'inactive') voice.recorder.stop();
}

async function finishVoiceRecording(rec, mimeType) {
  clearInterval(rec.timer);
  rec.stream.getTracks().forEach((t) => t.stop());
  if (voice === rec) voice = null;
  setVoiceButton(false);
  if (rec.cancelled) return;
  const blob = new Blob(rec.chunks, { type: mimeType });
  if (Date.now() - rec.startedAt < 600 || blob.size < 500) {
    setScanStatus('That was too short. Hold on a moment longer and try again.', 'error');
    return;
  }
  setScanStatus('Working it out…', 'working');
  const voiceStarted = Date.now();
  setFieldsLoading([el.fieldAmount, el.fieldDescription, el.fieldCategory], true);
  el.voiceButton.disabled = true;
  try {
    const { base64 } = await blobToBase64AndHash(blob);
    const result = await apiRequest(`/voice/${lineUserId}/parse`, {
      method: 'POST',
      body: JSON.stringify({ audio_base64: base64, mime_type: mimeType }),
    });
    if (el.addExpenseModal.hidden) return; // closed while we were working
    const e = result.expense;
    if (!e.is_expense) {
      setScanStatus(`Heard: "${result.transcript}". No amount found. Try again, or type it below.`, 'error');
      return;
    }
    el.fieldAmount.value = e.amount;
    if (e.description) el.fieldDescription.value = e.description;
    if (e.category_id) el.fieldCategory.value = e.category_id;
    markAiFilled([el.fieldAmount, e.description && el.fieldDescription, e.category_id && el.fieldCategory].filter(Boolean));
    renderEntryCategoryChips();
    setScanStatus(`Heard: "${result.transcript}". Review the details below before saving.`, 'done');
    showAiBlock(
      ['Thai speech to text', 'Parsed amount', ...(e.category_id ? ['Category match'] : [])],
      [
        { label: 'Heard', detail: `"${result.transcript}"` },
        { label: 'Amount', detail: formatBaht(e.amount) },
        e.description && { label: 'Description', detail: e.description },
        e.category_id && { label: 'Category', detail: categoryNameById(e.category_id) },
      ].filter(Boolean),
      Math.max(1, Math.round((Date.now() - voiceStarted) / 1000)),
    );
  } catch (error) {
    setScanStatus(String(error.message).replace(/^\[\d+\]\s*/, ''), 'error');
  } finally {
    setFieldsLoading(aiFormFields(), false);
    el.voiceButton.disabled = false;
  }
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
  hideAiBlock();
  setAiStatus(el.scanStatus, 'working', 'Scanning receipt…');
  setFieldsLoading(aiFormFields(), true);
  const scanStarted = Date.now();

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
    markAiFilled([
      data.amount != null && el.fieldAmount, data.merchant && el.fieldDescription,
      data.date && el.fieldDate, data.suggested_category_id && el.fieldCategory,
    ].filter(Boolean));

    renderEntryCategoryChips();
    setAiStatus(el.scanStatus, 'done', 'Scanned — review the details below before saving.');
    showAiBlock(
      ['Receipt OCR', 'Duplicate check: none', ...(data.suggested_category_id ? ['Category match'] : [])],
      [
        data.amount != null && { label: 'Total', detail: formatBaht(data.amount) },
        data.merchant && { label: 'Shop', detail: data.merchant },
        data.date && { label: 'Date', detail: data.date },
        data.suggested_category_id && { label: 'Category', detail: data.suggested_category_name || categoryNameById(data.suggested_category_id) },
      ].filter(Boolean),
      Math.max(1, Math.round((Date.now() - scanStarted) / 1000)),
    );
  } catch (error) {
    setAiStatus(el.scanStatus, 'error', error.message);
  } finally {
    setFieldsLoading(aiFormFields(), false);
  }
}

async function handleAddExpenseSubmit(event) {
  event.preventDefault();
  const submitButton = document.getElementById('add-entry-save');
  clearModalError(el.modalError);
  const amount = parseFloat(el.fieldAmount.value);
  if (!(amount > 0)) { setAmountError(true); el.fieldAmount.focus(); return; }
  setAmountError(false);
  if (entryType === 'income' && !el.fieldCategory.value) { showModalError(el.modalError, 'Choose a category for this income.'); return; }
  const accountId = document.getElementById('field-account').value;
  submitButton.disabled = true;
  try {
    const response = await apiRequest(`/transactions/${lineUserId}`, {
      method: 'POST',
      body: JSON.stringify({
        // Left on Auto, category_id is dropped and the backend infers it from
        // the description (services/autoCategorize.js).
        category_id: el.fieldCategory.value || undefined,
        amount,
        type: entryType,
        description: el.fieldDescription.value || undefined,
        thumbnail_url: scannedThumbnailPath || undefined,
        transaction_date: new Date(`${el.fieldDate.value}T12:00:00Z`).toISOString(),
        from_account_id: entryType === 'expense' && accountId ? accountId : undefined,
        to_account_id: entryType === 'income' && accountId ? accountId : undefined,
        // The backend skips its LINE push for a budget crossing and hands the
        // alert back here instead (transactionCreate.js).
        channel: 'liff',
      }),
    });
    closeAddExpenseModal();
    TAB_LOADERS[currentTab]().catch(() => {});
    if (currentTab !== 'home') loadHomeTab().catch(() => {});
    toastSavedEntry(response.transaction, response.budget_alert, response.event_budget_alerts || []);
  } catch (error) {
    showModalError(el.modalError, error.message);
  } finally {
    submitButton.disabled = false;
  }
}

// "Saved ฿x to {category}" with Undo; a budget crossing shows the warn/bad
// toast instead (spec 6.1). Undo deletes the entry and puts back the
// account balance it moved (a delete alone doesn't).
function toastSavedEntry(t, budgetAlert, eventAlerts) {
  const category = t.categories?.name || 'Uncategorized';
  const account = t.from_account?.account_name || t.to_account?.account_name || '';
  const undo = async () => {
    await apiRequest(`/transactions/${lineUserId}/${t.id}`, { method: 'DELETE' });
    const accountId = t.from_account_id || t.to_account_id;
    if (accountId) {
      const { accounts } = await apiRequest(`/accounts/${lineUserId}`);
      const acc = accounts.find((a) => a.id === accountId);
      const delta = t.type === 'income' ? -Number(t.amount) : Number(t.amount);
      if (acc) await apiRequest(`/accounts/${lineUserId}/${accountId}`, { method: 'PUT', body: JSON.stringify({ balance: Number(acc.balance) + delta }) });
    }
    showToast({ title: 'Entry removed', description: t.description || category });
    TAB_LOADERS[currentTab]().catch(() => {});
  };
  const messages = [];
  if (budgetAlert) messages.push(`Your ${budgetAlert.budgetPeriod} ${budgetAlert.categoryName} budget of ${formatBaht(budgetAlert.budgetAmount)} is used up: ${formatBaht(budgetAlert.totalSpent)} spent.`);
  for (const a of eventAlerts) messages.push(a.message); // wording from services/eventBudgetAlert.js
  if (messages.length) {
    const warnOnly = !budgetAlert && eventAlerts.every((a) => a.level === 'warning');
    showToast({ title: warnOnly ? 'Close to a budget' : 'Over budget', description: messages.join(' '), kind: warnOnly ? 'warn' : 'bad', undo });
    return;
  }
  showToast({ title: `Saved ${formatBaht(t.amount)} to ${category}`, description: [t.description, account].filter(Boolean).join(' · '), undo });
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
    <button type="button" class="bill-row-remove" aria-label="Remove"><svg class="lucide lucide-x" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg></button>
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
    <button type="button" class="bill-row-remove" aria-label="Remove"><svg class="lucide lucide-x" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg></button>
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
  setAiStatus(el.billScanStatus, 'working', 'Scanning receipt…');

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

    setAiStatus(el.billScanStatus, 'done', 'Scanned — assign each item to a person below, or leave it Shared.');
  } catch (error) {
    setAiStatus(el.billScanStatus, 'error', error.message);
  }
}

function resetBillModal() {
  el.billFieldTitle.value = '';
  el.billFieldTotal.value = '';
  el.billParticipantsList.innerHTML = '';
  el.billItemsList.innerHTML = '';
  el.billFieldReceiptImage.value = '';
  hideAiStatus(el.billScanStatus);
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
  return bangkokYmd(date).slice(0, 7);
}

function monthLabel(key) {
  const [year, month] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
}

function renderTrendChart(transactions) {
  const now = new Date();
  const months = [];
  const { year, month } = bangkokParts(now);
  for (let i = 5; i >= 0; i--) {
    months.push(monthKey(bangkokMidnight(year, month - i, 1)));
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
            <div class="trend-bar income" style="height:${incomeHeight}%" title="Income ${formatBaht(totals[m].income)}"></div>
            <div class="trend-bar expense" style="height:${expenseHeight}%" title="Spent ${formatBaht(totals[m].expense)}"></div>
          </div>
          <div class="trend-month-label${m === months[5] ? ' is-current' : ''}">${monthLabel(m)}</div>
        </div>
      `;
    })
    .join('');
}

// Follows the Budgets tab's Expense/Income toggle (categoriesTabType) rather
// than having a second switcher of its own.

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

// Each holding has its own currency (THB or USD); portfolio totals are THB.
const CURRENCY_SYMBOLS = { THB: '฿', USD: '$' };
function formatMoney(value, currency, maxDigits = 2) {
  const abs = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: maxDigits });
  return `${value < 0 ? '-' : ''}${CURRENCY_SYMBOLS[currency] || ''}${abs}`;
}
const formatSignedMoney = (value, currency) => `${value >= 0 ? '+' : ''}${formatMoney(value, currency)}`;
const formatSignedPercent = (pct) => `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
// Fractional shares to 5 decimals, like Yahoo Finance's lot view.
const formatShares = (quantity) => parseFloat(quantity).toLocaleString('en-US', { maximumFractionDigits: 5 });
const gainColor = (value) => (value >= 0 ? 'var(--income)' : 'var(--destructive)');

// Mirrors portfolioController.js's defaultCurrency: Thai listings (.BK),
// mutual funds and gold are THB, everything else USD.
function defaultHoldingCurrency(assetType, symbol) {
  return /\.BK$/i.test(symbol) || MANUAL_PRICE_ASSET_TYPES.includes(assetType) ? 'THB' : 'USD';
}

function renderPortfolio(data, surplus) {
  el.portfolioTotalValue.textContent = formatMoney(data.totals.total_value, 'THB');
  el.portfolioTotalCost.textContent = formatMoney(data.totals.total_cost_basis, 'THB');
  el.portfolioTotalGain.textContent = formatSignedMoney(data.totals.total_gain, 'THB');
  el.portfolioTotalGain.style.color = gainColor(data.totals.total_gain);
  const subline = [];
  if (data.totals.day_gain !== null && data.totals.day_gain !== undefined) subline.push(`Today ${formatSignedMoney(data.totals.day_gain, 'THB')}`);
  if (data.totals.realized_gain) subline.push(`Realized ${formatSignedMoney(data.totals.realized_gain, 'THB')}`);
  if (data.fx_usd_thb && data.holdings.some((h) => h.currency === 'USD')) subline.push(`USD/THB ${data.fx_usd_thb.toFixed(2)}`);
  el.portfolioSubline.textContent = subline.join(' · ');
  el.portfolioSubline.hidden = subline.length === 0;


  renderEmergencyFund(data.emergency_fund, surplus);
  renderHoldingsList(data.holdings, data.totals.total_value);
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

// Tapping a row opens its detail sheet (My Holdings card + lots), which is
// also where Edit / Delete live now.
// v5 holding rows (spec 4.4): symbol tile, "Type · x% of portfolio",
// value and gain. Tapping opens the detail sheet (Edit / Delete live there).
function renderHoldingsList(holdings, totalThb = 0) {
  el.holdingsList.innerHTML = '';
  el.holdingsEmptyState.hidden = holdings.length > 0;
  el.holdingsList.hidden = holdings.length === 0;
  for (const holding of holdings) {
    const li = document.createElement('li');
    li.className = 'row holding-row';
    li.setAttribute('role', 'button');
    li.tabIndex = 0;
    const closed = holding.quantity === 0;
    const share = totalThb > 0 && holding.market_value_thb != null ? `${((holding.market_value_thb / totalThb) * 100).toFixed(1)}% of portfolio` : closed ? 'Closed position' : `${formatShares(holding.quantity)} shares`;
    const gain = holding.current_price === null && !closed
      ? '<span class="row-sub">No price yet</span>'
      : `<span class="row-sub" style="color:${gainColor(holding.total_gain)}">${formatSignedMoney(holding.total_gain, holding.currency)} (${formatSignedPercent(holding.total_gain_percent)})</span>`;
    const today = holding.day_gain !== null && !closed ? ` · <span style="color:${gainColor(holding.day_gain)}">Today ${formatSignedMoney(holding.day_gain, holding.currency)}</span>` : '';
    li.innerHTML = `<span class="cat-tile symbol-tile" aria-hidden="true">${escapeHtml(String(holding.symbol).slice(0, 4))}</span>
      <span class="row-main"><span class="row-title category-name">${escapeHtml(holding.symbol)}${holding.name ? ` <span class="holding-name">${escapeHtml(holding.name)}</span>` : ''}</span>
        <span class="row-meta">${escapeHtml(ASSET_TYPE_LABELS[holding.asset_type] || holding.asset_type)} · ${share}${today}</span></span>
      <span class="row-end"><span class="row-value">${formatMoney(holding.market_value, holding.currency)}</span>${gain}</span>`;
    onActivate(li, () => openHoldingDetail(holding));
    el.holdingsList.appendChild(li);
  }
}

async function handleDeleteHolding(holdingId) {
  const confirmed = await confirmAction('Remove this holding and all of its lots from your portfolio?');
  if (!confirmed) return;
  try {
    await apiRequest(`/portfolio/${lineUserId}/${holdingId}`, { method: 'DELETE' });
    closeHoldingDetail();
    await loadNetWorthTab();
  } catch (error) {
    showModalError(el.holdingDetailError, error.message);
  }
}

// ---- Holding detail sheet (My Holdings card + lots) ----

function renderHoldingDetail(holding, lots) {
  detailHolding = holding;
  const cur = holding.currency;
  el.holdingDetailTitle.textContent = `${holding.symbol}${holding.name ? ` — ${holding.name}` : ''}`;
  el.holdingDetailMeta.textContent = `${ASSET_TYPE_LABELS[holding.asset_type]} · ${cur}${
    holding.current_price !== null ? ` · Price ${formatMoney(parseFloat(holding.current_price), cur, 4)}` : ''
  }`;

  const setGain = (target, value, pct) => {
    if (value === null || value === undefined) {
      target.textContent = '—';
      target.style.color = '';
      return;
    }
    target.textContent = `${formatSignedMoney(value, cur)}${pct === null || pct === undefined ? '' : ` (${formatSignedPercent(pct)})`}`;
    target.style.color = gainColor(value);
  };
  setGain(el.holdingStatDayGain, holding.day_gain, holding.day_gain_percent);
  setGain(el.holdingStatTotalGain, holding.total_gain, holding.total_gain_percent);
  setGain(el.holdingStatRealizedGain, holding.realized_gain, null);
  el.holdingStatShares.textContent = formatShares(holding.quantity);
  el.holdingStatAverageCost.textContent = holding.quantity > 0 ? formatMoney(holding.average_cost, cur, 4) : '—';
  el.holdingStatMarketValue.textContent = formatMoney(holding.market_value, cur);
  el.holdingStatWinRate.textContent = holding.win_rate === null ? '—' : `${holding.win_rate.toFixed(2)}%`;
  el.holdingStatLots.textContent = `${holding.lots_open} open / ${holding.lots_closed} closed`;
  renderHoldingDividends(holding);

  if (lots) {
    el.holdingLotsList.innerHTML = '';
    el.holdingLotsEmpty.hidden = lots.length > 0;
    el.holdingLotsList.hidden = lots.length === 0;
    for (const lot of lots) {
      const state = lot.side === 'buy' ? (lot.is_closed ? 'Closed' : lot.remaining_quantity < parseFloat(lot.quantity) ? `${formatShares(lot.remaining_quantity)} left` : 'Open') : '';
      const row = buildLotRow(lot, holding, `${formatTradeDate(lot.trade_date)}${state ? ` · ${state}` : ''}`);
      row.classList.add('lot-row');
      row.setAttribute('role', 'button');
      row.tabIndex = 0;
      row.addEventListener('click', () => openLotModal(lot));
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') openLotModal(lot);
      });
      el.holdingLotsList.appendChild(row);
    }
  }
}

// A lot's trade_date is already a Bangkok calendar date ('YYYY-MM-DD').
const formatTradeDate = (ymd) =>
  new Date(`${ymd}T00:00:00+07:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'Asia/Bangkok' });

// One Buy/Sell lot row, shared by the detail sheet and the Transactions tab's
// "Investments" view: "Buy NVDA" badge, "0.43186 shares • $311.69", total
// (shares x price, + fee on a buy / - fee on a sell) on the right.
function buildLotRow(lot, holding, rightSubline = '') {
  const li = document.createElement('li');
  li.className = 'transaction-row';
  li.innerHTML = `
    <div class="transaction-details">
      <div class="transaction-category"><span class="lot-badge ${lot.side}">${lot.side === 'buy' ? 'Buy' : 'Sell'} ${escapeHtml(holding.symbol)}</span></div>
      <div class="transaction-description">${formatShares(lot.quantity)} ${parseFloat(lot.quantity) === 1 ? 'share' : 'shares'} • ${formatMoney(parseFloat(lot.price), holding.currency, 4)}${
        parseFloat(lot.fee) > 0 ? ` • fee ${formatMoney(parseFloat(lot.fee), holding.currency)}` : ''
      }</div>
      ${lot.comment ? `<div class="transaction-date">${escapeHtml(lot.comment)}</div>` : ''}
    </div>
    <div class="lot-row-right">
      <div class="transaction-amount">${formatMoney(lot.total, holding.currency)}</div>
      ${rightSubline ? `<div class="transaction-date">${escapeHtml(rightSubline)}</div>` : ''}
    </div>
  `;
  return li;
}

async function openHoldingDetail(holding) {
  clearModalError(el.holdingDetailError);
  el.holdingLotsList.innerHTML = '';
  el.holdingLotsEmpty.hidden = true;
  renderHoldingDetail(holding, null); // the card is already known; lots follow
  el.holdingDetailModal.hidden = false;
  await refreshHoldingDetail();
}

async function refreshHoldingDetail() {
  if (!detailHolding) return;
  try {
    const response = await cachedGet(`/portfolio/${lineUserId}/${detailHolding.id}/lots`);
    renderHoldingDetail(response.holding, response.lots);
  } catch (error) {
    showModalError(el.holdingDetailError, error.message);
  }
}

function closeHoldingDetail() {
  el.holdingDetailModal.hidden = true;
  detailHolding = null;
}

// ---- Lot sheet (Add / Edit Lot) ----

function setLotSide(side) {
  lotSide = side;
  for (const button of el.lotSideButtons) button.classList.toggle('active', button.dataset.lotSide === side);
  el.lotFieldPriceLabel.textContent = side === 'buy' ? 'Cost per share' : 'Sale price per share';
}

function openLotModal(lot) {
  editingLot = lot || null;
  const today = bangkokYmd();
  setLotSide(lot ? lot.side : 'buy');
  el.lotModalTitle.textContent = lot ? `Edit Lot · ${detailHolding.symbol}` : `Add Lot · ${detailHolding.symbol}`;
  el.lotFieldDate.max = today;
  el.lotFieldDate.value = lot ? lot.trade_date : today;
  el.lotFieldQuantity.value = lot ? parseFloat(lot.quantity) : '';
  // A new lot starts at the current price when there is one (Yahoo's Add Lot does the same).
  el.lotFieldPrice.value = lot ? parseFloat(lot.price) : detailHolding.current_price !== null ? parseFloat(detailHolding.current_price) : '';
  el.lotFieldFee.value = lot && parseFloat(lot.fee) > 0 ? parseFloat(lot.fee) : '';
  el.lotFieldComment.value = lot ? lot.comment || '' : '';
  el.lotSubmit.textContent = lot ? 'Save Lot' : 'Add Lot';
  el.lotDelete.hidden = !lot;
  clearModalError(el.lotModalError);
  el.lotModal.hidden = false;
}

function closeLotModal() {
  el.lotModal.hidden = true;
  editingLot = null;
}

// Lot writes answer with the holding's recomputed figures + lot list, so the
// detail sheet re-renders straight from the response; the Net Worth list
// behind it reloads in the background.
function afterLotWrite(response) {
  closeLotModal();
  renderHoldingDetail(response.holding, response.lots);
  loadNetWorthTab().catch((error) => showError(error.message));
}

async function handleLotSubmit(event) {
  event.preventDefault();
  el.lotSubmit.disabled = true;
  clearModalError(el.lotModalError);
  const body = {
    side: lotSide,
    trade_date: el.lotFieldDate.value,
    quantity: parseFloat(el.lotFieldQuantity.value),
    price: parseFloat(el.lotFieldPrice.value),
    fee: el.lotFieldFee.value ? parseFloat(el.lotFieldFee.value) : 0,
    comment: el.lotFieldComment.value.trim() || null,
  };
  try {
    const response = editingLot
      ? await apiRequest(`/portfolio/${lineUserId}/lots/${editingLot.id}`, { method: 'PUT', body: JSON.stringify(body) })
      : await apiRequest(`/portfolio/${lineUserId}/${detailHolding.id}/lots`, { method: 'POST', body: JSON.stringify(body) });
    afterLotWrite(response);
  } catch (error) {
    showModalError(el.lotModalError, error.message);
  } finally {
    el.lotSubmit.disabled = false;
  }
}

async function handleDeleteLot() {
  if (!editingLot) return;
  const confirmed = await confirmAction('Delete this lot? Gains for this holding are recalculated without it.');
  if (!confirmed) return;
  try {
    afterLotWrite(await apiRequest(`/portfolio/${lineUserId}/lots/${editingLot.id}`, { method: 'DELETE' }));
  } catch (error) {
    showModalError(el.lotModalError, error.message);
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

function syncHoldingCurrencyDefault() {
  if (!holdingCurrencyTouched && !editingHoldingId) {
    el.holdingFieldCurrency.value = defaultHoldingCurrency(el.holdingFieldType.value, el.holdingFieldSymbol.value.trim());
  }
}

// Editing changes name / currency / manual price only: shares and cost come
// from the holding's lots, so those two fields are hidden (and not required).
function openHoldingModal(holding) {
  editingHoldingId = holding ? holding.id : null;
  holdingCurrencyTouched = false;
  el.holdingModalTitle.textContent = holding ? 'Edit Holding' : 'Add Holding';
  el.holdingQuantityField.hidden = !!holding;
  el.holdingCostField.hidden = !!holding;
  el.holdingFieldQuantity.required = !holding;
  el.holdingFieldCost.required = !holding;
  el.holdingFieldType.value = holding ? holding.asset_type : 'stock';
  el.holdingFieldType.disabled = !!holding;
  el.holdingFieldSymbol.value = holding ? holding.symbol : '';
  el.holdingFieldSymbol.disabled = !!holding;
  el.holdingFieldName.value = holding ? holding.name || '' : '';
  el.holdingFieldQuantity.value = holding ? holding.quantity : '';
  el.holdingFieldCost.value = holding ? holding.average_cost : '';
  el.holdingFieldPrice.value = holding ? holding.current_price || '' : '';
  updateHoldingFieldsForType();
  if (holding) el.holdingFieldCurrency.value = holding.currency;
  else syncHoldingCurrencyDefault();
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
          currency: el.holdingFieldCurrency.value,
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
          currency: el.holdingFieldCurrency.value,
          quantity: parseFloat(el.holdingFieldQuantity.value),
          average_cost: parseFloat(el.holdingFieldCost.value),
          current_price: isManual && el.holdingFieldPrice.value ? parseFloat(el.holdingFieldPrice.value) : undefined,
        }),
      });
    }
    closeHoldingModal();
    await loadNetWorthTab();
    if (detailHolding) await refreshHoldingDetail();
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

  renderCategoriesList(categoriesResponse.categories, transactionsResponse.transactions, periodStart, periodEnd);
  renderEventBudgetsList(eventsResponse.budget_events);
  renderBudgetHero(endISO).catch(() => {});
  await loadRecurringList();
}

// Hero "Left to spend" (spec 4.3): this cycle's budgets minus spent.
async function renderBudgetHero(endISO) {
  const { report } = await cachedGet(`/reports/${lineUserId}/monthly?offset=0`);
  const budget = report.categories.reduce((sum, r) => sum + (r.budget || 0), 0);
  const label = document.getElementById('budget-hero-label');
  const amount = document.getElementById('budget-hero-amount');
  const sub = document.getElementById('budget-hero-sub');
  const bar = document.getElementById('budget-hero-bar');
  const daysLeft = Math.max(1, Math.ceil((new Date(endISO) - Date.now()) / 86400000));
  if (!budget) {
    label.textContent = 'Spent this cycle';
    amount.textContent = formatBaht(report.expense);
    amount.classList.remove('amount-over');
    sub.textContent = 'Set a budget on a category to see what is left.';
    bar.hidden = true;
    return;
  }
  const left = budget - report.expense;
  label.textContent = left >= 0 ? 'Left to spend' : 'Over budget';
  amount.textContent = left >= 0 ? formatBaht(left) : `Over by ${formatBaht(-left)}`;
  amount.classList.toggle('amount-over', left < 0);
  sub.textContent = `${formatBaht(report.expense)} of ${formatBaht(budget)} spent${left > 0 ? ` · about ${formatBaht(Math.floor(left / daysLeft))} a day for ${daysLeft} day${daysLeft === 1 ? '' : 's'}` : ''}`;
  bar.hidden = false;
  bar.classList.toggle('is-over', left < 0);
  bar.classList.toggle('is-warning', left >= 0 && report.expense >= budget * BUDGET_WARN_RATIO);
  bar.firstElementChild.style.width = `${Math.min(100, Math.round((report.expense / budget) * 100))}%`;
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
    const amount = parseFloat(event.amount);
    const li = document.createElement('li');
    li.className = 'row category-row';
    li.innerHTML = `${categoryTile(event.categories?.name || '')}
      <span class="row-main"><span class="row-title category-name">${escapeHtml(event.title)}</span>
        <span class="row-meta">${formatBaht(event.spent)} of ${formatBaht(amount)}${event.categories?.name ? ` · ${escapeHtml(event.categories.name)}` : ''}</span>
        <span class="category-budget-track"><span class="${budgetFillClass(event.spent, amount)}" style="width:${Math.min(100, Math.round(event.percent))}%"></span></span></span>
      <button type="button" class="row-icon-button event-delete" aria-label="Delete ${escapeHtml(event.title)}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>`;
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

const ACCOUNT_TYPE_LABELS = { bank: 'Bank', credit_card: 'Credit Card', e_wallet: 'E-Wallet', cash: 'Cash' };

const ACCOUNT_ICONS = {
  bank: '<path d="M10 18v-7"/><path d="M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M3 22h18"/><path d="M6 18v-7"/>',
  credit_card: '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
  e_wallet: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
  cash: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
};
// v5 account rows: neutral tile by type; a card's negative balance is "owed".
function renderAccountsList(accounts) {
  el.accountsList.innerHTML = '';
  el.accountsEmptyState.hidden = accounts.length > 0;
  el.accountsList.hidden = accounts.length === 0;
  for (const account of accounts) {
    const balance = parseFloat(account.balance) || 0;
    const li = document.createElement('li');
    li.className = 'row category-row';
    const owed = account.account_type === 'credit_card' && balance < 0;
    li.innerHTML = `<span class="cat-tile" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ACCOUNT_ICONS[account.account_type] || ACCOUNT_ICONS.bank}</svg></span>
      <span class="row-main"><span class="row-title category-name">${escapeHtml(account.account_name)}</span><span class="row-meta">${ACCOUNT_TYPE_LABELS[account.account_type] || account.account_type}</span></span>
      <span class="row-end"><span class="row-value">${formatBaht(balance)}</span>${owed ? '<span class="row-sub">owed</span>' : ''}</span>`;
    el.accountsList.appendChild(li);
  }
}

// Net worth hero: account balances (cards' owed amounts are negative) plus
// the portfolio's THB value.
function renderNetWorthHero(accounts, portfolio) {
  const cash = accounts.reduce((sum, a) => sum + (parseFloat(a.balance) || 0), 0);
  const inv = (portfolio && portfolio.totals && portfolio.totals.total_value) || 0;
  document.getElementById('networth-total').textContent = formatBaht(Math.round(cash + inv));
  document.getElementById('networth-accounts').textContent = formatBaht(Math.round(cash));
  document.getElementById('networth-investments').textContent = formatBaht(Math.round(inv));
  const priced = (portfolio?.holdings || []).map((h) => h.priced_at).filter(Boolean).sort().pop();
  document.getElementById('networth-sub').textContent = priced
    ? `Accounts plus investments, prices as of ${new Date(priced).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })}`
    : 'Accounts plus investments';
}

// ---- Performance card (Net Worth tab) ----
//
// GET /portfolio/:u/performance does all the math (backend/services/
// performanceMath.js); this only draws it. Fetched when the tab loads and
// when the range changes, through cachedGet, with the same stale-response
// guard as loadTransactionsTab(). Chart.js comes from a CDN: if it's blocked,
// everything except the chart still renders, with a short note instead.
const PERF_RANGE_LABELS = { '1m': '1M', '3m': '3M', '6m': '6M', ytd: 'YTD', '1y': '1Y', '3y': '3Y', '5y': '5Y', all: 'All' };
const cssToken = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
// Point dates are Bangkok calendar dates already -- format them as-is (UTC).
const formatPerfDate = (ymd, withYear = false) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
const formatPerfPercent = (pct) => (pct === null || pct === undefined ? '—' : formatSignedPercent(pct));

function showPerfNote(message) {
  el.perfNote.textContent = message;
  el.perfNote.hidden = !message;
}

function showPerfError(error) {
  el.perfCard.hidden = false;
  showPerfNote(`Performance unavailable: ${error.message}`);
}

function setGainCell(target, value, pct) {
  target.textContent = value === null || value === undefined ? '—' : `${formatSignedMoney(value, 'THB')}${pct === null || pct === undefined ? '' : ` (${formatSignedPercent(pct)})`}`;
  target.style.color = value === null || value === undefined ? '' : gainColor(value);
}

function renderBenchmarkCard(target, benchmark) {
  const level = target.querySelector('.perf-benchmark-level');
  const change = target.querySelector('.perf-benchmark-change');
  if (!benchmark) {
    level.textContent = '—';
    change.textContent = 'Unavailable';
    change.style.color = '';
    return;
  }
  level.textContent = benchmark.level.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  change.innerHTML = `<span style="color:${gainColor(benchmark.day_change_pct || 0)}">${escapeHtml(formatPerfPercent(benchmark.day_change_pct))}</span> today · `
    + `<span style="color:${gainColor(benchmark.range_change_pct || 0)}">${escapeHtml(formatPerfPercent(benchmark.range_change_pct))}</span> ${PERF_RANGE_LABELS[perfRange]}`;
}

async function loadPerformance() {
  const seq = ++perfLoadSeq;
  el.perfRangePills.forEach((pill) => pill.classList.toggle('active', pill.dataset.perfRange === perfRange));
  const data = await cachedGet(`/portfolio/${lineUserId}/performance?range=${perfRange}`);
  if (seq !== perfLoadSeq) return;
  perfData = data;
  el.perfCard.hidden = data.points.length === 0;
  if (data.points.length === 0) return;

  el.perfTotalValue.textContent = formatMoney(data.summary.total_value_thb, 'THB');
  setGainCell(el.perfGainToday, data.summary.today_gain_thb, data.summary.today_pct);
  setGainCell(el.perfGainYesterday, data.summary.yesterday_gain_thb, data.summary.yesterday_pct);
  setGainCell(el.perfGainAll, data.summary.all_gain_thb, data.summary.all_pct);
  renderBenchmarkCard(el.perfBenchmarkSp500, data.benchmarks.sp500);
  renderBenchmarkCard(el.perfBenchmarkSet, data.benchmarks.set);
  renderPerfChart();
}

function setPerfRange(range) {
  perfRange = range;
  loadPerformance().catch(showPerfError);
}

function setPerfView(view) {
  perfView = view;
  el.perfViewButtons.forEach((button) => button.classList.toggle('active', button.dataset.perfView === view));
  renderPerfChart();
}

// Value: portfolio THB value vs net amount invested (dashed). Return: TWR vs
// S&P 500 vs SET, all rebased to 0% at the range start.
function perfDatasets(points) {
  const line = (label, data, colorToken, extra = {}) => ({
    label, data, borderColor: cssToken(colorToken), backgroundColor: cssToken(colorToken),
    borderWidth: 2, pointRadius: 0, pointHoverRadius: 3, tension: 0.2, spanGaps: true, ...extra,
  });
  // v5: your line in Clay (--brand) at 2.5px; S&P 500 solid muted; SET dotted.
  if (perfView === 'value') {
    return [
      line('Portfolio', points.map((p) => p.value_thb), '--brand', { borderWidth: 2.5 }),
      line('Invested', points.map((p) => p.invested_thb), '--muted-foreground', { borderDash: [6, 4], borderWidth: 1.5 }),
    ];
  }
  return [
    line('Portfolio', points.map((p) => p.twr_pct), '--brand', { borderWidth: 2.5 }),
    line('S&P 500', points.map((p) => p.sp500_pct), '--muted-foreground', { borderWidth: 1.5 }),
    line('SET', points.map((p) => p.set_pct), '--muted-foreground', { borderWidth: 1.5, borderDash: [2, 3] }),
  ];
}

function renderPerfChart() {
  if (perfChart) {
    perfChart.destroy();
    perfChart = null;
  }
  if (!perfData || perfData.points.length === 0) return;
  if (!chartReady(renderPerfChart)) {
    el.perfChartWrap.hidden = true;
    showPerfNote(chartFailed ? 'Chart unavailable' : 'Loading chart…');
    return;
  }
  el.perfChartWrap.hidden = false;
  showPerfNote(perfData.missing.length ? `No price history for ${perfData.missing.map((m) => m.symbol).join(', ')}; shown at the last known price.` : '');

  const { points } = perfData;
  const isValue = perfView === 'value';
  const formatValue = (v) => (v === null || v === undefined ? '—' : isValue ? formatMoney(v, 'THB') : formatSignedPercent(v));
  const textColor = cssToken('--muted-foreground');
  const gridColor = cssToken('--border');
  perfChart = new window.Chart(el.perfChartCanvas, {
    type: 'line',
    data: { labels: points.map((p) => p.date), datasets: perfDatasets(points) },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: textColor, boxWidth: 12, boxHeight: 2 } },
        tooltip: {
          callbacks: {
            title: (items) => formatPerfDate(points[items[0].dataIndex].date, true),
            label: (item) => `${item.dataset.label}: ${formatValue(item.raw)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: textColor, maxTicksLimit: 5, maxRotation: 0, callback: (_, i) => formatPerfDate(points[i].date, perfRange !== '1m' && perfRange !== '3m') },
          grid: { display: false },
        },
        y: {
          ticks: {
            color: textColor,
            maxTicksLimit: 5,
            callback: (v) => (isValue ? `฿${Number(v).toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 })}` : `${v}%`),
          },
          grid: { color: gridColor },
        },
      },
    },
  });
}

// ---- Dividends card (Net Worth tab) ----
//
// GET /portfolio/:u/dividends does all the math (backend/services/
// dividendMath.js); this only draws it. Same loading pattern as the
// performance card: fetched when Net Worth loads and when the mode changes,
// through cachedGet with a stale-response guard; "Chart unavailable" if
// Chart.js is blocked. Amounts are gross (before withholding tax), and only
// stocks/ETFs have a dividend source.
const DIV_PROJECTED_ALPHA = 0.35;

// A token colour ('#rgb', '#rrggbb' or 'rgb(...)') at the given opacity, so
// projected bars are a lighter version of the received colour in both
// themes without a separate literal.
function withAlpha(color, alpha) {
  let r;
  let g;
  let b;
  if (color.startsWith('#')) {
    const hex = color.length === 4 ? color.slice(1).split('').map((c) => c + c).join('') : color.slice(1, 7);
    [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  } else {
    [r, g, b] = (color.match(/\d+(\.\d+)?/g) || []).map(Number);
  }
  return [r, g, b].some((v) => Number.isNaN(v) || v === undefined) ? color : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const formatPct = (pct) => (pct === null || pct === undefined ? '—' : `${pct.toFixed(2)}%`);

function divNoteText() {
  const parts = ['Before tax.'];
  if (divData.unsupported_holdings.length > 0) parts.push("Crypto, funds and gold aren't included.");
  if (divData.missing.length > 0) parts.push(`No dividend data for ${divData.missing.map((m) => m.symbol).join(', ')}.`);
  if (chartFailed) parts.push('Chart unavailable');
  return parts.join(' ');
}

async function loadDividends() {
  const seq = ++divLoadSeq;
  el.divModeButtons.forEach((button) => button.classList.toggle('active', button.dataset.divMode === divMode));
  const data = await cachedGet(`/portfolio/${lineUserId}/dividends?mode=${divMode}`);
  if (seq !== divLoadSeq) return;
  divData = data;
  // Nothing that could pay a dividend (no stock/ETF at all) -> no card.
  el.divCard.hidden = data.holdings.length === 0 && data.missing.length === 0;
  if (detailHolding && !el.holdingDetailModal.hidden) renderHoldingDividends(detailHolding);
  if (el.divCard.hidden) return;

  const s = data.summary;
  el.divTrailing.textContent = formatMoney(s.trailing_12m_thb, 'THB');
  el.divYoy.textContent = s.yoy_pct === null ? 'No dividends in the 12 months before' : `${formatSignedPercent(s.yoy_pct)} vs the 12 months before`;
  el.divYoy.style.color = s.yoy_pct === null ? '' : gainColor(s.yoy_pct);
  el.divPortfolioYield.textContent = formatPct(s.portfolio_yield_pct);
  el.divYieldOnCost.textContent = formatPct(s.yield_on_cost_pct);
  el.divAvgMonthly.textContent = formatMoney(s.avg_monthly_thb, 'THB');
  el.divAvgDaily.textContent = formatMoney(s.avg_daily_thb, 'THB');
  renderDivChart();
}

function showDivError(error) {
  el.divCard.hidden = false;
  el.divChartWrap.hidden = true;
  el.divNote.textContent = `Dividends unavailable: ${error.message}`;
}

function setDivMode(mode) {
  divMode = mode;
  loadDividends().catch(showDivError);
}

function renderDivChart() {
  if (divChart) {
    divChart.destroy();
    divChart = null;
  }
  if (!divData || el.divCard.hidden) return;
  el.divNote.textContent = divNoteText();
  if (!chartReady(renderDivChart)) {
    el.divChartWrap.hidden = true;
    return;
  }
  el.divChartWrap.hidden = false;

  const { series } = divData;
  const received = cssToken('--income');
  const textColor = cssToken('--muted-foreground');
  const gridColor = cssToken('--border');
  const bar = (label, key, color) => ({ label, data: series.map((b) => b[key]), backgroundColor: color, borderColor: color, borderWidth: 0, stack: 'dividends' });
  divChart = new window.Chart(el.divChartCanvas, {
    type: 'bar',
    data: {
      labels: series.map((b) => b.label),
      datasets: [bar('Received', 'received_thb', received), bar('Projected', 'projected_thb', withAlpha(received, DIV_PROJECTED_ALPHA))],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: textColor, boxWidth: 12, boxHeight: 12 } },
        tooltip: {
          callbacks: {
            title: (items) => series[items[0].dataIndex].label,
            label: (item) => `${item.dataset.label}: ${formatMoney(item.raw || 0, 'THB')}`,
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          // "Oct 2026" -> "Oct 26" on the axis; the tooltip keeps the full label.
          ticks: { color: textColor, maxTicksLimit: 6, maxRotation: 0, callback: (_, i) => series[i].label.replace(/ (\d\d)(\d\d)$/, ' $2') },
          grid: { display: false },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { color: textColor, maxTicksLimit: 5, callback: (v) => `฿${Number(v).toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 })}` },
          grid: { color: gridColor },
        },
      },
    },
  });
}

// Holding detail sheet: "Dividends" (received, all-time) and the next
// projected ex-date, from the dividends endpoint's per-holding breakdown.
// Hidden for types with no dividend source; "—" until that data is in.
function renderHoldingDividends(holding) {
  const supported = holding.asset_type === 'stock' || holding.asset_type === 'etf';
  el.holdingStatDividendsRow.hidden = !supported;
  el.holdingStatNextDividendRow.hidden = true;
  if (!supported) return;
  const entry = divData && divData.holdings.find((h) => h.holding_id === holding.id);
  if (!entry) {
    el.holdingStatDividends.textContent = '—';
    return;
  }
  const cur = entry.currency;
  el.holdingStatDividends.textContent = cur === 'THB' ? formatMoney(entry.received_thb, 'THB') : `${formatMoney(entry.received, cur)} · ${formatMoney(entry.received_thb, 'THB')}`;
  const next = entry.events.find((e) => e.kind === 'projected');
  if (next) {
    el.holdingStatNextDividend.textContent = `${formatTradeDate(next.ex_date)} · ${formatMoney(next.amount, cur)} (projected)`;
    el.holdingStatNextDividendRow.hidden = false;
  }
}

// ---- Goal tracker card + sheet (Net Worth tab) ----
//
// GET /portfolio/:u/goal does all the math (backend/services/goalMath.js);
// this only draws it. Same loading pattern as the dividends card (cachedGet
// with a stale-response guard, theme redraw, "Chart unavailable" fallback),
// but the card shows even with no holdings: the goal can be set up first.
const GOAL_STATUS_BEHIND_RED = 0.1; // behind by more than 10% of plan -> red bar, else amber

// 'YYYY-MM' (or a full date) -> "Oct 2026" -- already Bangkok calendar months.
const formatGoalMonth = (ym) =>
  new Date(`${ym.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

async function loadGoal() {
  const seq = ++goalLoadSeq;
  const data = await cachedGet(`/portfolio/${lineUserId}/goal`);
  if (seq !== goalLoadSeq) return;
  renderGoal(data);
}

function showGoalError(error) {
  el.goalCard.hidden = false;
  el.goalNote.hidden = false;
  el.goalNote.textContent = `Goal unavailable: ${error.message}`;
}

function goalStatusText(p) {
  if (p.status === 'not_started') return `Starts on ${formatPerfDate(goalData.goal.start_date, true)}`;
  if (p.status === 'unknown') return 'Current value unavailable';
  if (p.status === 'on_track') return 'On track';
  return `${p.status === 'ahead' ? 'Ahead of' : 'Behind'} plan by ${formatMoney(Math.abs(p.difference_thb), 'THB')}`;
}

function renderGoal(data) {
  goalData = data;
  el.goalCard.hidden = false;
  el.goalNote.hidden = true;
  el.goalEmpty.hidden = !!data.goal;
  el.goalBody.hidden = !data.goal;
  if (!data.goal) {
    renderGoalChart();
    return;
  }

  const p = data.projection;
  el.goalTargetLabel.textContent = p.target_is_projected ? 'Goal target (projected)' : 'Goal target';
  el.goalTarget.textContent = formatMoney(p.target_value, 'THB');
  el.goalProgressPct.textContent = p.progress_pct === null ? '—' : `${p.progress_pct.toFixed(1)}%`;
  const nowText = p.current_value_thb === null ? '— now' : `${formatMoney(p.current_value_thb, 'THB')} now`;
  el.goalProgressDetail.textContent = `${nowText} · goal date ${formatGoalMonth(p.end_date)}`;
  el.goalProgressFill.style.width = `${Math.min(100, Math.max(0, p.progress_pct || 0))}%`;
  const behindShare = p.status === 'behind' && p.expected_now_thb > 0 ? -p.difference_thb / p.expected_now_thb : 0;
  el.goalProgressFill.classList.toggle('warn', p.status === 'behind' && behindShare <= GOAL_STATUS_BEHIND_RED);
  el.goalProgressFill.classList.toggle('over', p.status === 'behind' && behindShare > GOAL_STATUS_BEHIND_RED);
  el.goalStatus.textContent = goalStatusText(p);
  if (p.current_value_error) {
    el.goalNote.hidden = false;
    el.goalNote.textContent = `Progress unavailable: ${p.current_value_error}`;
  }
  el.goalStatus.style.color = p.status === 'ahead' ? 'var(--income)' : p.status === 'behind' ? 'var(--destructive)' : '';

  el.goalTableBody.innerHTML = p.yearly
    .map((y) => `<tr><td>${y.year_index} <span class="goal-table-sub">${escapeHtml(formatGoalMonth(y.end_date))}</span></td>`
      + `<td>${escapeHtml(formatMoney(y.contributed_total, 'THB'))}</td><td>${escapeHtml(formatMoney(y.projected_value, 'THB'))}</td></tr>`)
    .join('');
  renderGoalChart();
}

function toggleGoalTable() {
  const isOpen = el.goalTableToggle.getAttribute('aria-expanded') === 'true';
  el.goalTableToggle.setAttribute('aria-expanded', String(!isOpen));
  el.goalTableWrap.hidden = isOpen;
}

// Projected value (accent) and contributed (dashed), plus today's actual
// portfolio value as one highlighted point on the latest month at or
// before today (none before the goal starts).
function renderGoalChart() {
  if (goalChart) {
    goalChart.destroy();
    goalChart = null;
  }
  if (!goalData || !goalData.goal) return;
  if (!chartReady(renderGoalChart)) {
    el.goalChartWrap.hidden = true;
    el.goalNote.hidden = false;
    el.goalNote.textContent = chartFailed ? 'Chart unavailable' : 'Loading chart…';
    return;
  }
  el.goalChartWrap.hidden = false;

  const p = goalData.projection;
  const { points } = p;
  const thisMonth = bangkokYmd().slice(0, 7);
  let todayIndex = -1;
  if (p.status !== 'not_started' && p.current_value_thb !== null) points.forEach((pt, i) => { if (pt.date <= thisMonth) todayIndex = i; });
  const accent = cssToken('--brand'); // v5: chart lines in Clay
  const secondary = cssToken('--muted-foreground');
  const highlight = cssToken('--warning');
  const gridColor = cssToken('--border');
  const line = (label, key, color, extra = {}) => ({
    label, data: points.map((pt) => pt[key]), borderColor: color, backgroundColor: color,
    borderWidth: 2, pointRadius: 0, pointHoverRadius: 3, tension: 0.2, ...extra,
  });
  const datasets = [
    line('Projected', 'projected_value', accent),
    line('Contributed', 'contributed', secondary, { borderDash: [6, 4], borderWidth: 1.5 }),
  ];
  if (!p.target_is_projected) {
    datasets.push(line('Target', 'target', cssToken('--foreground'), {
      data: points.map(() => p.target_value), borderDash: [2, 3], borderWidth: 1.5, pointHoverRadius: 0, tension: 0,
    }));
  }
  if (todayIndex >= 0) {
    datasets.push({
      label: 'Today', data: points.map((_, i) => (i === todayIndex ? p.current_value_thb : null)),
      borderColor: highlight, backgroundColor: highlight, showLine: false, pointRadius: 6, pointHoverRadius: 7,
    });
  }

  goalChart = new window.Chart(el.goalChartCanvas, {
    type: 'line',
    data: { labels: points.map((pt) => pt.date), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: secondary, boxWidth: 12, boxHeight: 2 } },
        tooltip: {
          filter: (item) => item.raw !== null && item.raw !== undefined,
          callbacks: {
            title: (items) => formatGoalMonth(points[items[0].dataIndex].date),
            label: (item) => `${item.dataset.label}: ${formatMoney(item.raw, 'THB')}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: secondary, maxTicksLimit: 5, maxRotation: 0, callback: (_, i) => formatGoalMonth(points[i].date) },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: { color: secondary, maxTicksLimit: 5, callback: (v) => `฿${Number(v).toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 })}` },
          grid: { color: gridColor },
        },
      },
    },
  });
}

// Set up (defaults: today in Bangkok, the current portfolio value in whole
// baht) or edit (the saved goal).
async function goalDefaultStartValue() {
  try {
    return Math.round((await portfolioPromise).totals.total_value);
  } catch {
    return 0; // portfolio unavailable (or not requested yet): the user types it
  }
}

async function openGoalModal() {
  const goal = goalData && goalData.goal;
  el.goalModalTitle.textContent = goal ? 'Edit Goal' : 'Set Up Goal';
  el.goalFieldStartDate.value = goal ? goal.start_date : bangkokYmd();
  el.goalFieldStartValue.value = goal ? goal.start_value : await goalDefaultStartValue();
  el.goalFieldYears.value = goal ? goal.years : '';
  el.goalFieldReturn.value = goal ? goal.expected_annual_return : '';
  el.goalFieldContribution.value = goal ? goal.monthly_contribution : '';
  el.goalFieldGrowth.value = goal ? goal.contribution_growth : '';
  el.goalFieldTarget.value = goal && goal.target_value !== null ? goal.target_value : '';
  el.goalDelete.hidden = !goal;
  clearModalError(el.goalModalError);
  el.goalModal.hidden = false;
}

function closeGoalModal() {
  el.goalModal.hidden = true;
}

// Every rule is checked server-side; its 400 message shows inline.
async function handleGoalSubmit(event) {
  event.preventDefault();
  el.goalSubmit.disabled = true;
  clearModalError(el.goalModalError);
  const num = (input) => (input.value.trim() === '' ? null : Number(input.value));
  const body = {
    start_date: el.goalFieldStartDate.value,
    start_value: num(el.goalFieldStartValue),
    years: num(el.goalFieldYears),
    expected_annual_return: num(el.goalFieldReturn),
    monthly_contribution: num(el.goalFieldContribution),
    contribution_growth: num(el.goalFieldGrowth),
    target_value: num(el.goalFieldTarget),
  };
  try {
    const response = await apiRequest(`/portfolio/${lineUserId}/goal`, { method: 'PUT', body: JSON.stringify(body) });
    closeGoalModal();
    renderGoal(response);
  } catch (error) {
    showModalError(el.goalModalError, error.message);
  } finally {
    el.goalSubmit.disabled = false;
  }
}

async function handleDeleteGoal() {
  const confirmed = await confirmAction('Delete this goal? Your holdings are not affected.');
  if (!confirmed) return;
  try {
    await apiRequest(`/portfolio/${lineUserId}/goal`, { method: 'DELETE' });
    closeGoalModal();
    renderGoal({ goal: null, projection: null });
  } catch (error) {
    showModalError(el.goalModalError, error.message);
  }
}

// ---- Bank statement import (Transactions tab) ----
//
// pdf.js (cdnjs, loaded on first use) opens the PDF here, including its
// password, which never leaves the phone. Each page's text pieces go to
// POST /statements/:u/parse as { x, y, s }; the backend rebuilds the rows
// (services/statementParser.js), checks them against the statement's own
// totals, and returns a preview with categories and statuses. Only 'new'
// rows start ticked: own-account transfers, rows already imported and
// possible duplicates of manual entries start unticked.
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
let pdfjsPromise = null;
let stmtPreview = null;
let stmtCategories = { expense: [], income: [] };

function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  pdfjsPromise ||= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PDFJS_URL;
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      resolve(window.pdfjsLib);
    };
    script.onerror = () => { pdfjsPromise = null; reject(new Error("Couldn't load the PDF reader. Check your connection and try again.")); };
    document.head.appendChild(script);
  });
  return pdfjsPromise;
}

// [[{ x, y, s }]] per page, PDF points with y from the bottom.
async function extractPdfPages(file, password, onProgress) {
  const pdfjsLib = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  let doc;
  try {
    doc = await pdfjsLib.getDocument({ data, password: password || undefined }).promise;
  } catch (error) {
    if (error && error.name === 'PasswordException') {
      throw new Error(password ? 'Wrong password for this PDF.' : 'This PDF is password-protected. Enter its password above.');
    }
    throw new Error(`Couldn't open this PDF (${error && error.message ? error.message : 'unknown error'}).`);
  }
  const pages = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    onProgress(i, doc.numPages);
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items
      .filter((it) => it.str && it.str.trim())
      .map((it) => ({ x: Math.round(it.transform[4] * 10) / 10, y: Math.round(it.transform[5] * 10) / 10, w: Math.round(it.width * 10) / 10, s: it.str })));
  }
  doc.destroy();
  return pages;
}

const stripStatus = (message) => String(message).replace(/^\[\d+\]\s*/, '');

// ---- Undo an import ----
//
// Each import response carries an `undo` object (the rows it added and the
// transfers it joined); POST /statements/:u/undo reverses exactly that. The
// last 5 imports are remembered in localStorage, so the Undo buttons are a
// convenience of this phone: if storage is cleared, the imported rows stay
// and can still be deleted one by one.
const STMT_RECENT_MAX = 5;
const stmtRecentKey = () => `stmtImports:${lineUserId}`;

function loadRecentImports() {
  try {
    const list = JSON.parse(localStorage.getItem(stmtRecentKey()) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveRecentImports(list) {
  try {
    localStorage.setItem(stmtRecentKey(), JSON.stringify(list.slice(0, STMT_RECENT_MAX)));
  } catch {
    // storage full or blocked: Undo just isn't offered later
  }
}

function rememberImport(record) {
  if (!record.undo || (!record.undo.inserted_ids.length && !record.undo.merged.length)) return;
  saveRecentImports([record, ...loadRecentImports().filter((r) => r.id !== record.id)]);
}

const shortDate = (ymd) => (ymd ? new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '');
function importLabel(r) {
  const period = r.period_start ? `${shortDate(r.period_start)} – ${shortDate(r.period_end)}` : '';
  return `${STMT_BANK_NAME[r.bank] || 'Bank'} •••${r.last4 || '----'}${period ? ` · ${period}` : ''}`;
}

function renderRecentImports() {
  const list = loadRecentImports();
  el.stmtRecent.hidden = list.length === 0;
  el.stmtRecentList.innerHTML = list.map((r, i) => `<li class="category-row stmt-recent-row">
      <div class="category-row-top">
        <span class="category-name">${escapeHtml(importLabel(r))}</span>
        <button type="button" class="link-button stmt-undo" data-i="${i}">Undo</button>
      </div>
      <div class="category-bar-label-row"><span>${r.imported} added · imported ${escapeHtml(new Date(r.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Bangkok' }))}</span></div>
    </li>`).join('');
}

async function undoImport(record) {
  const ok = await confirmAction(`Remove the ${record.imported} transaction${record.imported === 1 ? '' : 's'} added by this import (${importLabel(record)})?`, 'Remove');
  if (!ok) return null;
  const result = await apiRequest(`/statements/${lineUserId}/undo`, { method: 'POST', body: JSON.stringify(record.undo) });
  saveRecentImports(loadRecentImports().filter((r) => r.id !== record.id));
  return result;
}

function showImportStatus(text, record) {
  el.exportStatus.hidden = false;
  el.exportStatus.textContent = text;
  if (!record) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'link-button stmt-undo-last';
  button.textContent = 'Undo';
  button.addEventListener('click', async () => {
    try {
      const result = await undoImport(record);
      if (!result) return;
      showImportStatus(`Import undone: ${result.deleted} removed${result.reverted ? `, ${result.reverted} transfer${result.reverted === 1 ? '' : 's'} separated again` : ''}.`);
      loadTransactionsTab().catch((error) => showError(error.message));
    } catch (error) {
      showImportStatus(`Couldn't undo: ${String(error.message).replace(/^\[\d+\]\s*/, '')}`, record);
    }
  });
  el.exportStatus.append(' ', button);
}

async function handleRecentUndoClick(event) {
  const button = event.target.closest('.stmt-undo');
  if (!button) return;
  const record = loadRecentImports()[Number(button.dataset.i)];
  if (!record) return;
  clearModalError(el.stmtPickError);
  try {
    const result = await undoImport(record);
    if (!result) return;
    renderRecentImports();
    showImportStatus(`Import undone: ${result.deleted} removed${result.reverted ? `, ${result.reverted} transfer${result.reverted === 1 ? '' : 's'} separated again` : ''}.`);
    loadTransactionsTab().catch((error) => showError(error.message));
  } catch (error) {
    showModalError(el.stmtPickError, `Couldn't undo: ${String(error.message).replace(/^\[\d+\]\s*/, '')}`);
  }
}

async function openStatementModal() {
  stmtRun += 1;
  showStmtStep('pick');
  el.stmtProgress.hidden = true;
  el.stmtFile.value = '';
  clearModalError(el.stmtPickError);
  el.stmtRead.disabled = false;
  renderRecentImports();
  try {
    const { accounts } = await cachedGet(`/accounts/${lineUserId}`);
    el.stmtAccount.innerHTML = '<option value="">Don\'t link</option>' +
      accounts.map((a) => `<option value="${a.id}">${escapeHtml(a.account_name)}</option>`).join('');
  } catch {
    // linking is optional; the select just stays at "Don't link"
  }
  el.stmtModal.hidden = false;
}

function closeStatementModal() {
  stmtRun += 1;
  clearInterval(stmtTaskTimer);
  el.stmtModal.hidden = true;
  stmtPreview = null;
  el.stmtRows.innerHTML = '';
}

// ---- Statement flow (spec 6.3): working task rows -> approvals -> done ----
let stmtRun = 0; // bumps on every read and on Cancel, so a stale result is dropped
let stmtTasks = [];
let stmtTaskTimer = null;

function renderStmtTasks() {
  const now = Date.now();
  document.getElementById('stmt-tasks').innerHTML = stmtTasks.map((t) => {
    const icon = t.state === 'done' ? '<span class="task-dot is-done"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>'
      : t.state === 'run' ? `<span class="pixel-loader">${'<i></i>'.repeat(9)}</span>`
      : t.state === 'fail' ? '<span class="task-dot is-fail"></span>' : '<span class="task-dot"></span>';
    const secs = t.started ? Math.max(0, Math.round(((t.ended || now) - t.started) / 1000)) : null;
    return `<li class="row stmt-task" data-state="${t.state === 'run' ? 'running' : t.state}">
      <span class="task-icon" aria-hidden="true">${icon}</span>
      <span class="row-main"><span class="row-title">${escapeHtml(t.title)}</span><span class="row-meta${t.state === 'fail' ? ' amount-over' : ''}">${escapeHtml(t.detail)}</span></span>
      <span class="row-sub task-secs">${secs === null ? '' : `${secs}s`}</span>
    </li>`;
  }).join('');
}

function setStmtTask(i, state, detail) {
  const t = stmtTasks[i];
  if (state === 'run' && !t.started) t.started = Date.now();
  if (state === 'done' || state === 'fail') { t.started = t.started || Date.now(); t.ended = Date.now(); }
  t.state = state;
  if (detail !== undefined) t.detail = detail;
  renderStmtTasks();
}

function showStmtStep(step) {
  el.stmtPick.hidden = step !== 'pick';
  document.getElementById('stmt-working').hidden = step !== 'working';
  el.stmtReview.hidden = step !== 'review';
  if (step !== 'working') clearInterval(stmtTaskTimer);
}

async function handleStatementRead(event) {
  event.preventDefault();
  const file = el.stmtFile.files && el.stmtFile.files[0];
  if (!file) return;
  clearModalError(el.stmtPickError);
  el.stmtRead.disabled = true;
  const run = ++stmtRun;
  stmtTasks = [
    { title: 'Opening the PDF', detail: 'Password checked on your phone', state: 'wait' },
    { title: 'Finding transactions', detail: 'Reading the rows and totals', state: 'wait' },
    { title: 'Matching transfers', detail: 'Looking for your own accounts', state: 'wait' },
    { title: 'Sorting categories', detail: 'From your past imports first', state: 'wait' },
  ];
  showStmtStep('working');
  setAiStatus(document.getElementById('stmt-working-status'), 'working', `${file.name} · reading on your phone`);
  setStmtTask(0, 'run');
  stmtTaskTimer = setInterval(renderStmtTasks, 500);
  try {
    const pages = await extractPdfPages(file, el.stmtPassword.value.trim(), (i, n) => {
      if (run === stmtRun) setStmtTask(0, 'run', `Reading page ${i} of ${n}`);
    });
    if (run !== stmtRun) return;
    setStmtTask(0, 'done', `${pages.length} page${pages.length === 1 ? '' : 's'} · read on your phone`);
    // One server call finds the rows, matches transfers and sorts categories.
    setStmtTask(1, 'run'); setStmtTask(2, 'run'); setStmtTask(3, 'run');
    const [preview, cats] = await Promise.all([
      apiRequest(`/statements/${lineUserId}/parse`, { method: 'POST', body: JSON.stringify({ pages }) }),
      cachedGet(`/categories/${lineUserId}`),
    ]);
    if (run !== stmtRun) return;
    stmtCategories = {
      expense: cats.categories.filter((c) => c.type === 'expense'),
      income: cats.categories.filter((c) => c.type === 'income'),
    };
    const c = preview.counts;
    setStmtTask(1, 'done', `${c.total} rows · ${preview.verified ? 'totals match the statement' : 'check the totals'}`);
    const transfers = (c.own_transfer || 0) + (c.transfer_match || 0) + (c.bank_transfer || 0);
    setStmtTask(2, 'done', transfers ? `${transfers} transfer${transfers === 1 ? '' : 's'} found` : 'No transfers');
    const need = stmtNeedsCall(preview.rows).length;
    const sorted = preview.rows.filter((r) => r.category_id).length;
    setStmtTask(3, 'done', `${sorted} sorted${need ? ` · ${need} need you` : ''}`);
    stmtPreview = preview;
    el.stmtPassword.value = '';
    renderStatementReview();
  } catch (error) {
    if (run !== stmtRun) return;
    const running = stmtTasks.findIndex((t) => t.state === 'run');
    if (running >= 0) setStmtTask(running, 'fail', stripStatus(error.message));
    showStmtStep('pick');
    showModalError(el.stmtPickError, stripStatus(error.message));
  } finally {
    if (run === stmtRun) el.stmtRead.disabled = false;
    hideAiStatus(document.getElementById('stmt-working-status'));
    clearInterval(stmtTaskTimer);
  }
}

// Rows the parser can't place confidently: possible duplicates, transfers
// to an unknown bank account, and new rows with no category.
function stmtNeedsCall(rows) {
  return rows.map((r, i) => ({ r, i })).filter(({ r }) => r.status === 'possible_duplicate' || r.status === 'bank_transfer' || (r.status === 'new' && !r.category_id))
    .map(({ r, i }) => ({ i, kind: r.status === 'new' ? 'category' : r.status }));
}
let stmtApprovals = [];
let stmtApprovalPos = 0;
const stmtOthers = (type) => stmtCategories[type].find((cat) => /^others?$/i.test(cat.name)) || stmtCategories[type][0];

function stmtApprovalOptions(r, kind) {
  if (kind === 'possible_duplicate') return [
    { v: 'skip', label: 'Leave it out, I already logged it' },
    { v: 'import', label: 'Import it anyway' },
    { v: 'transfer', label: 'A transfer between my accounts' },
  ];
  if (kind === 'bank_transfer') return [
    { v: 'transfer', label: 'A transfer between my accounts' },
    { v: 'import', label: `An ${r.type === 'expense' ? 'expense' : 'income'}${r.category_id ? '' : ' (Others)'}` },
    { v: 'skip', label: 'Leave it out' },
  ];
  const counts = new Map();
  for (const t of homeTxns) if (t.category_id) counts.set(t.category_id, (counts.get(t.category_id) || 0) + 1);
  const others = stmtOthers(r.type);
  const picks = stmtCategories[r.type].filter((cat) => cat.id !== others?.id).sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0)).slice(0, 2);
  return [...picks, others].filter(Boolean).map((cat) => ({ v: `cat:${cat.id}`, label: cat.name }));
}

function showStmtApproval() {
  const { i, kind } = stmtApprovals[stmtApprovalPos];
  const r = stmtPreview.rows[i];
  const total = stmtApprovals.length;
  const sorted = stmtPreview.rows.length - total;
  document.getElementById('stmt-approval-lead').textContent = `${sorted} sorted. ${total} need${total === 1 ? 's' : ''} your call.`;
  document.getElementById('stmt-approval-badge').textContent = `${stmtApprovalPos + 1} of ${total}`;
  document.getElementById('stmt-approval-desc').innerHTML = `<span class="approval-raw">${escapeHtml(r.description)}</span><span class="approval-amount ${r.type}">${r.type === 'expense' ? '\u2212' : '+'}${formatBaht(r.amount)}</span>`;
  const fmt = new Date(`${r.date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  document.getElementById('stmt-approval-meta').textContent = [fmt + (r.time ? ` ${r.time}` : ''), r.note].filter(Boolean).join(' · ');
  document.getElementById('stmt-approval-q').textContent = kind === 'possible_duplicate' ? 'This looks like an entry you already logged. What should we do?'
    : kind === 'bank_transfer' ? 'Money moved to or from another bank account. What was it?' : 'Which category is this?';
  document.getElementById('stmt-approval-options').innerHTML = stmtApprovalOptions(r, kind)
    .map((o, k) => `<label class="rec-option"><input type="radio" name="stmt-approval" value="${o.v}"${k === 0 ? ' checked' : ''} /><span class="rec-radio" aria-hidden="true"></span><span>${escapeHtml(o.label)}</span></label>`).join('');
}

// Applies a choice to the row's tick box and category in the full list.
function applyStmtChoice(i, choice) {
  const cb = el.stmtRows.querySelector(`input[type="checkbox"][data-i="${i}"]`);
  const sel = el.stmtRows.querySelector(`select.stmt-cat[data-i="${i}"]`);
  const r = stmtPreview.rows[i];
  if (choice === 'skip') cb.checked = false;
  else if (choice === 'transfer') { cb.checked = true; sel.value = STMT_TRANSFER; }
  else if (choice === 'import') { cb.checked = true; sel.value = r.category_id || stmtOthers(r.type)?.id || ''; }
  else if (choice.startsWith('cat:')) { cb.checked = true; sel.value = choice.slice(4); }
  cb.closest('.stmt-row').classList.toggle('muted', !cb.checked);
}

function nextStmtApproval(apply) {
  const { i, kind } = stmtApprovals[stmtApprovalPos];
  if (apply) applyStmtChoice(i, document.querySelector('#stmt-approval-options input:checked')?.value || 'skip');
  else if (kind === 'category') applyStmtChoice(i, `cat:${stmtOthers(stmtPreview.rows[i].type)?.id}`); // skipped rows import as Others
  stmtApprovalPos += 1;
  if (stmtApprovalPos < stmtApprovals.length) showStmtApproval();
  else showStmtDone();
}

function showStmtDone() {
  document.getElementById('stmt-approval').hidden = true;
  document.getElementById('stmt-done').hidden = false;
  updateStatementImportButton();
}

function renderStmtDoneSummary() {
  const picked = stmtCheckedIndexes();
  const catFor = new Map([...el.stmtRows.querySelectorAll('select.stmt-cat')].map((sel) => [Number(sel.dataset.i), sel.value]));
  let exp = 0; let inc = 0; let tr = 0;
  const byCat = new Map();
  for (const i of picked) {
    const r = stmtPreview.rows[i];
    if (catFor.get(i) === STMT_TRANSFER) { tr += 1; continue; }
    if (r.type === 'expense') exp += 1; else inc += 1;
    const name = stmtCategories[r.type].find((cat) => cat.id === catFor.get(i))?.name || 'Others';
    const e = byCat.get(name) || { name, n: 0, total: 0 };
    e.n += 1; e.total += r.amount; byCat.set(name, e);
  }
  const skipped = stmtPreview.rows.filter((r, i) => r.status !== 'imported' && !picked.includes(i)).length;
  const n = picked.length;
  document.getElementById('stmt-done-title').textContent = `${n} entr${n === 1 ? 'y' : 'ies'} ready`;
  document.getElementById('stmt-done-breakdown').textContent = [`${exp} expense${exp === 1 ? '' : 's'}`, `${inc} income`, `${tr} transfer${tr === 1 ? '' : 's'}`, `${skipped} skipped`].join(' · ');
  const top = [...byCat.values()].sort((a, b) => b.total - a.total).slice(0, 3);
  document.getElementById('stmt-top').innerHTML = top.map((c) => `<li class="row">${categoryTile(c.name)}<span class="row-main"><span class="row-title">${escapeHtml(c.name)}</span><span class="row-meta">${c.n} entr${c.n === 1 ? 'y' : 'ies'}</span></span><span class="row-value">${formatBaht(c.total)}</span></li>`).join('')
    + (tr ? `<li class="row">${categoryTile('Transfer')}<span class="row-main"><span class="row-title">Transfers</span><span class="row-meta">Between your accounts</span></span><span class="row-value">${tr}</span></li>` : '');
  document.getElementById('stmt-top').hidden = !top.length && !tr;
}

const STMT_STATUS_LABEL = { imported: 'Already imported', own_transfer: 'Own transfer', bank_transfer: 'Bank transfer', transfer_match: 'Matched transfer', possible_duplicate: 'Possible duplicate' };
const STMT_TRANSFER = '__transfer__'; // category select value: import as a Transfer
const stmtStartsTicked = (r) => r.status === 'new' || r.transfer_default;
const STMT_BANK_NAME = { kbank: 'KBank', bbl: 'Bangkok Bank' };

function renderStatementReview() {
  const p = stmtPreview;
  clearModalError(el.stmtReviewError);
  const fmt = (ymd) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  el.stmtSummary.textContent = `${STMT_BANK_NAME[p.bank] || 'Bank'} •••${p.account_last4 || '----'} · ${p.period_start ? `${fmt(p.period_start)} – ${fmt(p.period_end)}` : `${p.counts.total} rows`}`;
  el.stmtVerify.textContent = p.verified
    ? `All ${p.counts.total} rows match the statement's totals.`
    : `Check before importing: ${[...p.checks.filter((c) => !c.ok).map((c) => c.label.replace(/_/g, ' ')), ...p.warnings].slice(0, 3).join('; ')}`;
  el.stmtVerify.classList.toggle('warn', !p.verified);
  const c = p.counts;
  el.stmtCounts.textContent = [`${c.new} new`, c.own_transfer && `${c.own_transfer} own transfers`, c.bank_transfer && `${c.bank_transfer} bank transfer${c.bank_transfer === 1 ? '' : 's'}`,
    c.transfer_match && `${c.transfer_match} matched transfer${c.transfer_match === 1 ? '' : 's'}`, c.possible_duplicate && `${c.possible_duplicate} possible duplicates`, c.imported && `${c.imported} already imported`]
    .filter(Boolean).join(' · ');

  el.stmtRows.innerHTML = p.rows.map((r, i) => {
    const options = `<option value="${STMT_TRANSFER}"${r.transfer_default ? ' selected' : ''}>Transfer (between my accounts)</option>` + stmtCategories[r.type]
      .map((cat) => `<option value="${cat.id}"${!r.transfer_default && cat.id === r.category_id ? ' selected' : ''}>${escapeHtml(cat.name)}</option>`).join('');
    const status = STMT_STATUS_LABEL[r.status];
    const ticked = stmtStartsTicked(r);
    return `<li class="stmt-row${ticked ? '' : ' muted'}">
      <label class="stmt-check"><input type="checkbox" data-i="${i}"${ticked ? ' checked' : ''}${r.status === 'imported' ? ' disabled' : ''} aria-label="Import this row" /></label>
      <div class="stmt-main">
        <div class="stmt-line"><span class="stmt-desc">${escapeHtml(r.description)}</span>
          <span class="stmt-amount ${r.type}">${formatBaht(r.type === 'expense' ? -r.amount : r.amount, { sign: true })}</span></div>
        <div class="stmt-meta">${escapeHtml(fmt(r.date))}${r.time ? ` ${r.time}` : ''}${status ? ` · <span class="stmt-status">${status}</span>` : ''}</div>
        ${r.note && r.status !== 'new' ? `<div class="stmt-meta">${escapeHtml(r.note)}</div>` : ''}
        <select class="stmt-cat" data-i="${i}" aria-label="Category">${options}</select>
      </div>
    </li>`;
  }).join('');
  updateStatementImportButton();
  stmtApprovals = stmtNeedsCall(p.rows);
  stmtApprovalPos = 0;
  document.getElementById('stmt-all').open = false;
  showStmtStep('review');
  if (stmtApprovals.length) {
    document.getElementById('stmt-approval').hidden = false;
    document.getElementById('stmt-done').hidden = true;
    showStmtApproval();
  } else {
    showStmtDone();
  }
}

function stmtCheckedIndexes() {
  return [...el.stmtRows.querySelectorAll('input[type="checkbox"]:checked')].map((cb) => Number(cb.dataset.i));
}

function updateStatementImportButton() {
  const n = stmtCheckedIndexes().length;
  el.stmtImport.textContent = n ? `Import ${n} entr${n === 1 ? 'y' : 'ies'}` : 'Import';
  el.stmtImport.disabled = n === 0;
  if (stmtPreview) renderStmtDoneSummary();
}

function selectStatementRows(mode) {
  el.stmtRows.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    if (!cb.disabled) cb.checked = mode === 'new' && stmtStartsTicked(stmtPreview.rows[Number(cb.dataset.i)]);
  });
  updateStatementImportButton();
}

async function handleStatementImport() {
  const picked = stmtCheckedIndexes();
  if (!picked.length) return;
  const catFor = new Map([...el.stmtRows.querySelectorAll('select.stmt-cat')].map((sel) => [Number(sel.dataset.i), sel.value]));
  const rows = picked.map((i) => {
    const r = stmtPreview.rows[i];
    const base = { row_key: r.row_key, transaction_date: r.transaction_date, description: r.description, amount: r.amount };
    const choice = catFor.get(i);
    return choice === STMT_TRANSFER
      ? { ...base, type: 'transfer', direction: r.type === 'expense' ? 'out' : 'in' }
      : { ...base, type: r.type, category_id: choice || r.category_id };
  });
  el.stmtImport.disabled = true;
  clearModalError(el.stmtReviewError);
  try {
    const result = await apiRequest(`/statements/${lineUserId}/import`, {
      method: 'POST',
      body: JSON.stringify({ rows, account_id: el.stmtAccount.value || null, statement: { bank: stmtPreview.bank, account_last4: stmtPreview.account_last4 } }),
    });
    const record = {
      id: Date.now(),
      at: new Date().toISOString(),
      bank: stmtPreview.bank,
      last4: stmtPreview.account_last4,
      period_start: stmtPreview.period_start,
      period_end: stmtPreview.period_end,
      imported: result.imported,
      undo: result.undo,
    };
    rememberImport(record);
    closeStatementModal();
    const extra = [result.merged && `${result.merged} joined with transfers from your other statement`, result.skipped && `${result.skipped} already imported`].filter(Boolean);
    showToast({
      title: `Imported ${result.imported} entr${result.imported === 1 ? 'y' : 'ies'}`,
      description: ['Balances and budget alerts unchanged', ...extra].join(' · '),
      undo: result.imported ? async () => {
        const undone = await undoImport(record);
        if (!undone) return;
        showToast({ title: `Import undone: ${undone.deleted} removed${undone.reverted ? `, ${undone.reverted} transfer${undone.reverted === 1 ? '' : 's'} separated again` : ''}.` });
        loadTransactionsTab().catch((error) => showError(error.message));
      } : null,
    });
    loadTransactionsTab().catch((error) => showError(error.message));
  } catch (error) {
    showModalError(el.stmtReviewError, stripStatus(error.message));
    el.stmtImport.disabled = false;
  }
}

// ---- Net Worth tab: accounts/savings, investments, emergency fund ----
async function loadNetWorthTab() {
  // Independent of the portfolio fetch below, so a portfolio failure (e.g. a
  // USD->THB 502) doesn't take the goal card down with it.
  loadGoal().catch(showGoalError);
  portfolioPromise = cachedGet(`/portfolio/${lineUserId}`);
  portfolioPromise.catch(() => {}); // surfaced by the Promise.all below
  const [accountsResponse, portfolioResponse, { surplus }] = await Promise.all([
    cachedGet(`/accounts/${lineUserId}`),
    portfolioPromise,
    computeCurrentPeriodSurplus(),
  ]);

  renderAccountsList(accountsResponse.accounts);
  renderPortfolio(portfolioResponse, surplus);
  renderNetWorthHero(accountsResponse.accounts, portfolioResponse);
  if (portfolioResponse.holdings.length === 0) {
    el.perfCard.hidden = true;
    el.divCard.hidden = true;
  } else {
    loadPerformance().catch(showPerfError);
    loadDividends().catch(showDivError);
  }
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
  el.transferFieldDate.value = bangkokYmd();
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

// v5 category rows (spec 4.3 item 3): tile, "฿spent of ฿limit monthly",
// what's left on the right, a 4px bar. Tap opens the editor.
function renderCategoriesList(categories, transactions, cycleStart, cycleEnd) {
  el.categoriesList.innerHTML = '';
  el.categoriesEmptyState.hidden = categories.length > 0;
  el.categoriesList.hidden = categories.length === 0;
  const inCycle = (t) => { const d = new Date(t.transaction_date); return d >= cycleStart && d < cycleEnd; };
  for (const category of categories) {
    const li = document.createElement('li');
    li.className = 'row category-row';
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    const mine = transactions.filter((t) => t.category_id === category.id);
    const cycleSpent = mine.filter(inCycle).reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const verb = category.type === 'income' ? 'received' : 'spent';
    let meta;
    let end;
    let barHtml = '';
    if (category.budget_amount && category.budget_period) {
      const periodStart = getPeriodStartDate(category.budget_period);
      const spent = mine.filter((t) => new Date(t.transaction_date) >= periodStart).reduce((sum, t) => sum + parseFloat(t.amount), 0);
      const budget = parseFloat(category.budget_amount);
      const pct = Math.round((spent / budget) * 100);
      const period = category.budget_period === 'daily' ? 'today' : category.budget_period;
      meta = `${formatBaht(spent)} of ${formatBaht(budget)} ${period}${category.budget_period === 'daily' ? ` · ${formatBaht(cycleSpent)} this cycle` : ''}`;
      if (spent > budget) end = `<span class="row-value amount-over">Over ${formatBaht(spent - budget)}</span>`;
      else if (spent >= budget * BUDGET_WARN_RATIO) end = `<span class="row-value">${formatBaht(budget - spent)} left</span><span class="row-sub amount-warn">${pct}% used</span>`;
      else end = `<span class="row-value">${formatBaht(budget - spent)} left</span>`;
      barHtml = `<span class="category-budget-track"><span class="${budgetFillClass(spent, budget)}" style="width:${Math.min(100, pct)}%"></span></span>`;
    } else {
      meta = `${formatBaht(cycleSpent)} ${verb} this cycle`;
      end = '<span class="row-sub set-budget-link">Set budget</span>';
    }
    li.innerHTML = `${categoryTile(category.name)}
      <span class="row-main"><span class="row-title category-name">${escapeHtml(category.name)}</span><span class="row-meta">${meta}</span>${barHtml}</span>
      <span class="row-end">${end}</span>`;
    onActivate(li, () => openCategoryModal(category));
    el.categoriesList.appendChild(li);
  }
}

let editingCategory = null;
function openCategoryModal(category) {
  editingCategoryId = category ? category.id : null;
  el.categoryModalTitle.textContent = category ? 'Edit Category' : 'Add Category';
  el.categoryFieldName.value = category ? category.name : '';
  el.categoryFieldName.disabled = !!category; // renaming isn't exposed here, keep this focused on budget editing
  el.categoryFieldType.value = category ? category.type : categoriesTabType;
  el.categoryFieldType.disabled = !!category;
  el.categoryFieldBudgetAmount.value = category?.budget_amount || '';
  el.categoryFieldBudgetPeriod.value = category?.budget_period || '';
  editingCategory = category || null;
  document.getElementById('delete-category').hidden = !category || category.is_preset;
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
  if (el.txnFilterType.value && el.txnFilterType.value !== 'investments') params.set('type', el.txnFilterType.value);
  const search = el.txnSearch.value.trim();
  if (search) params.set('q', search);
  if (txnAccountIds.length > 0) params.set('account_id', txnAccountIds.join(','));
  const categoryId = document.getElementById('txn-filter-category').value;
  if (categoryId && el.txnFilterType.value !== 'investments') params.set('category_id', categoryId);
  if (txnRange.mode === 'cycle') {
    const { startISO, endISO } = getBillingCycleRange(currentUser.billing_cycle_start_day, txnRange.offset);
    params.set('start_date', startISO);
    // The API's end_date is inclusive; the cycle end is the next cycle's start.
    params.set('end_date', new Date(new Date(endISO).getTime() - 1).toISOString());
  } else if (txnRange.mode === '3months') {
    const { year, month, day } = bangkokParts();
    params.set('start_date', bangkokMidnight(year, month - 3, day).toISOString());
  } else if (txnRange.mode === 'custom') {
    // The picked dates are Bangkok calendar days.
    if (el.txnFilterStart.value) params.set('start_date', new Date(`${el.txnFilterStart.value}T00:00:00+07:00`).toISOString());
    if (el.txnFilterEnd.value) params.set('end_date', new Date(`${el.txnFilterEnd.value}T23:59:59.999+07:00`).toISOString());
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

// "Investments" lists Buy/Sell lots (GET /portfolio/:u/lots) instead of cash
// transactions -- never mixed into them. The range pills and search still
// apply (by Bangkok trade_date, and by symbol/name/comment); the account
// filter and both CSV exports don't: the exports only cover cash transactions,
// so they're hidden while this view is showing rather than exporting
// something other than what's on screen.
function renderLotList(target, emptyStateEl, lots) {
  target.innerHTML = '';
  emptyStateEl.hidden = lots.length > 0;
  target.hidden = lots.length === 0;
  let currentDay = null;
  for (const lot of lots) {
    if (lot.trade_date !== currentDay) {
      currentDay = lot.trade_date;
      const [y, m, d] = lot.trade_date.split('-').map(Number);
      const header = document.createElement('li');
      header.className = 'transaction-day-header';
      header.innerHTML = `<span>${escapeHtml(dayHeaderLabel(new Date(y, m - 1, d)))}</span>`;
      target.appendChild(header);
    }
    target.appendChild(buildLotRow(lot, lot.holding));
  }
}

async function loadInvestmentLots(seq, params) {
  const { lots } = await cachedGet(`/portfolio/${lineUserId}/lots`);
  if (seq !== txnLoadSeq) return;
  const startYmd = params.get('start_date') ? bangkokYmd(new Date(params.get('start_date'))) : null;
  const endYmd = params.get('end_date') ? bangkokYmd(new Date(params.get('end_date'))) : null;
  const q = (params.get('q') || '').toLowerCase();
  const shown = lots.filter(
    (lot) =>
      (!startYmd || lot.trade_date >= startYmd) &&
      (!endYmd || lot.trade_date <= endYmd) &&
      (!q || [lot.holding.symbol, lot.holding.name, lot.comment].some((v) => v && v.toLowerCase().includes(q)))
  );
  el.txnEmptyState.textContent = q ? `No investment lots matching "${params.get('q')}" in this range.` : 'No investment lots in this range.';
  renderLotList(el.txnFullList, el.txnEmptyState, shown);
}

async function loadTransactionsTab() {
  const seq = ++txnLoadSeq;
  const errorBox = document.getElementById('txn-error');
  try {
    await ensureCurrentUser();
    renderTxnRangeControls();
    renderAccountFilterButton().catch(() => {});
    fillCategoryFilter().catch(() => {});
    const investments = el.txnFilterType.value === 'investments';
    el.txnExportRow.hidden = investments;
    if (investments) el.exportStatus.hidden = true;
    el.txnAccountButton.hidden = investments;
    document.getElementById('txn-filter-category').hidden = investments;
    document.getElementById('txn-period-sub').textContent = '';
    if (investments) { errorBox.hidden = true; return await loadInvestmentLots(seq, buildTransactionFilterQuery()); }
    const params = buildTransactionFilterQuery();
    params.set('limit', '200');
    const response = await cachedGet(`/transactions/${lineUserId}?${params.toString()}`);
    if (seq !== txnLoadSeq) return;
    errorBox.hidden = true;
    const txns = response.transactions;
    lastTxnCount = txns.length;
    const sum = (type) => txns.filter((t) => t.type === type).reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0);
    document.getElementById('txn-period-sub').textContent = `Spent ${formatBaht(sum('expense'))} · Income ${formatBaht(sum('income'))} · ${txns.length} entr${txns.length === 1 ? 'y' : 'ies'}`;
    el.txnEmptyState.textContent = params.get('q') ? `No entries match "${params.get('q')}".` : 'No entries in this period.';
    renderTransactionList(el.txnFullList, el.txnEmptyState, txns, { showPaymentMethod: true });
  } catch (error) {
    if (seq !== txnLoadSeq) return;
    // Spec 4.2 item 8: an alert card, Try again, and skeleton rows.
    errorBox.hidden = false;
    el.txnFullList.hidden = true;
    el.txnEmptyState.hidden = true;
    console.warn('History load failed:', error.message);
  }
}

let lastTxnCount = 0;
let categoryFilterFilled = false;
async function fillCategoryFilter() {
  if (categoryFilterFilled) return;
  const { categories } = await cachedGet(`/categories/${lineUserId}`);
  const select = document.getElementById('txn-filter-category');
  const keep = select.value;
  select.innerHTML = '<option value="">Any category</option>' + categories
    .slice().sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
    .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}${c.type === 'income' ? ' (income)' : ''}</option>`).join('');
  select.value = keep;
  categoryFilterFilled = true;
}

// Export and import sheet (spec 6.2), from History and More.
function txnScopeText() {
  const period = txnRange.mode === 'cycle' ? el.txnPeriodLabel.textContent.replace(/^This cycle · /, '') : txnRange.mode === '3months' ? 'last 3 months' : txnRange.mode === 'all' ? 'all time' : 'custom dates';
  const accounts = txnAccountIds.length ? `${txnAccountIds.length} account${txnAccountIds.length === 1 ? '' : 's'}` : 'all accounts';
  return `Uses your current filters: ${period}, ${accounts}, ${lastTxnCount} entr${lastTxnCount === 1 ? 'y' : 'ies'}.`;
}

function renderDataRecent() {
  const list = loadRecentImports();
  document.getElementById('data-recent').hidden = list.length === 0;
  const ul = document.getElementById('data-recent-list');
  ul.innerHTML = list.map((r, i) => `<li class="row"><span class="row-main"><span class="row-title">${escapeHtml(importLabel(r))}</span><span class="row-meta">${r.imported} added · ${escapeHtml(new Date(r.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Bangkok' }))}</span></span><button type="button" class="btn btn-outline btn-sm" data-undo="${i}">Undo</button></li>`).join('');
}

function openDataSheet() {
  document.getElementById('data-scope').textContent = txnScopeText();
  renderDataRecent();
  document.getElementById('data-modal').hidden = false;
}
const closeDataSheet = () => { document.getElementById('data-modal').hidden = true; };

async function handleExportCsv() {
  const params = buildTransactionFilterQuery();
  // A plain top-level navigation lets the browser handle the response's
  // Content-Disposition: attachment header natively (save/share prompt),
  // rather than fetching the CSV into JS just to hand it back off again.
  // A navigation can't send the Authorization header, so the server first
  // signs this exact query for two minutes.
  try {
    const { query } = await apiRequest(`/transactions/${lineUserId}/export-link`, { method: 'POST', body: JSON.stringify({ query: params.toString() }) });
    window.location.href = `${API_BASE}/transactions/${lineUserId}/export?${query}`;
  } catch (error) {
    el.exportStatus.hidden = false;
    el.exportStatus.textContent = error.message;
  }
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
  // Only TRUE copies (NULL = never decided, FALSE = turned off): see migration 018.
  el.settingGroupCopies.checked = currentUser.group_ledger_copies === true;
  el.settingCycleDay.value = currentUser.billing_cycle_start_day || 1;
  el.settingEmail.value = currentUser.email || '';
  renderPaymentDetails();
  renderGoogleConnectState();
  renderCalendarSettings(); // tasks.js
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

// "Delete my account" (PDPA): two confirmations, then everything is erased
// server-side and the app closes (or shows a farewell outside LINE).
async function handleDeleteAccount() {
  const first = await confirmAction('Delete your account and ALL of your data (transactions, accounts, budgets, investments, bills, receipt images)? This cannot be undone.', 'Continue');
  if (!first) return;
  const second = await confirmAction('Are you sure? Everything will be permanently erased.', 'Delete My Account');
  if (!second) return;
  el.deleteAccountButton.disabled = true;
  try {
    await apiRequest(`/users/${lineUserId}`, { method: 'DELETE', body: JSON.stringify({ confirm: 'DELETE' }) });
    el.app.hidden = true;
    el.loading.hidden = false;
    el.loading.textContent = 'Your account and data have been deleted.';
    if (liff.isInClient && liff.isInClient()) setTimeout(() => liff.closeWindow(), 2000);
  } catch (error) {
    showSettingsStatus(error.message);
    el.deleteAccountButton.disabled = false;
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
      <input type="checkbox" role="switch" class="recurring-active-toggle" aria-label="Active" ${rule.is_active ? 'checked' : ''} />
      <div class="recurring-details">
        <div class="recurring-description">${escapeHtml(rule.description || rule.categories?.name || 'Recurring')}</div>
        <div class="recurring-meta">${FREQUENCY_LABELS[rule.frequency] || rule.frequency} · next ${formatDate(rule.next_run_date)}</div>
      </div>
      <div class="recurring-amount transaction-amount ${rule.type}">${entryAmount(rule)}</div>
      <button type="button" class="recurring-delete">Delete</button>
      ${payStatusHtml(rule.pay_status)}
    `;
    li.querySelector('.recurring-active-toggle').addEventListener('change', (e) =>
      handleToggleRecurringActive(rule.id, e.target.checked)
    );
    li.querySelector('.recurring-delete').addEventListener('click', () => handleDeleteRecurring(rule.id));
    li.querySelector('.recurring-paid-toggle')?.addEventListener('click', () => handleSetRecurringPaid(rule.id, !rule.pay_status.paid));
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
  el.recurringFieldStartDate.value = bangkokYmd();
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

// Monthly rules with a pay window get "Due Oct 1 - Oct 5" plus Unpaid / Paid /
// Overdue for the current period (computed server-side, services/payWindow.js).
function payStatusHtml(status) {
  if (!status) return '';
  const fmt = (ymdStr) => new Date(`${ymdStr}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const label = status.paid ? 'Paid' : status.overdue ? 'Overdue' : 'Unpaid';
  return `
    <div class="recurring-pay-row">
      <span>Due ${fmt(status.start)} – ${fmt(status.end)}</span>
      <span class="bill-status-pill ${status.paid ? 'paid' : 'unpaid'}">${label}</span>
      <button type="button" class="bill-participant-toggle recurring-paid-toggle">${status.paid ? 'Undo' : 'Mark Paid'}</button>
    </div>
  `;
}

async function handleSetRecurringPaid(recurringId, paid) {
  try {
    await apiRequest(`/recurring/${lineUserId}/${recurringId}/paid`, { method: 'PATCH', body: JSON.stringify({ paid }) });
    await loadRecurringList();
  } catch (error) {
    showBudgetsStatus(error.message);
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
    readDeepLink();

    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }

    const profile = await liff.getProfile();
    lineUserId = profile.userId;
    idToken = typeof liff.getIDToken === 'function' ? liff.getIDToken() : null;

    await apiRequest('/users', {
      method: 'POST',
      body: JSON.stringify({
        line_user_id: profile.userId,
        display_name: profile.displayName,
        picture_url: profile.pictureUrl,
        // Opening a group bill's link alone doesn't make someone an app user
        // (no personal-ledger copies of group shares; migration 018).
        ...(deepLink.bill || deepLink.group ? { via: 'group_bill' } : {}),
      }),
    });

    renderProfile(profile);
    await loadHomeTab();
    setTimeout(() => loadChartJs().catch(() => {}), 1500); // warm up for the Wealth tab

    el.loading.hidden = true;
    el.app.hidden = false;
    openDeepLink();
  } catch (error) {
    el.loading.hidden = true;
    showError(error.message || 'Something went wrong.');
  }
}

for (const button of el.navTabs) {
  button.addEventListener('click', () => switchTab(button.dataset.tab));
}
for (const button of document.querySelectorAll('.money-switch [data-money]')) {
  button.addEventListener('click', () => switchTab(button.dataset.money));
}

// More panel. Export/Import go through History's controls until the
// export/import sheet lands (spec 6.2).
function openTabAt(tab, selector) {
  switchTab(tab);
  const target = selector && document.querySelector(selector);
  if (target) requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
}
const moreActions = {
  'more-profile': () => switchTab('settings'),
  'more-settings': () => switchTab('settings'),
  'more-tax': () => switchTab('tax'),
  'more-recurring': () => openTabAt('budgets', '#subs-header:not([hidden]), #advanced-toggle'),
  'more-groups': () => openTabAt('home', '#home-groups:not([hidden]), #bills-list'),
  'more-bills': () => openTabAt('home', '#bills-list'),
  'more-export': () => { switchTab('transactions'); openDataSheet(); },
  'more-import': () => { switchTab('transactions'); openDataSheet(); },
  'more-help': () => { document.getElementById('help-modal').hidden = false; },
  'settings-back': () => switchTab('more'),
};
for (const [id, fn] of Object.entries(moreActions)) document.getElementById(id)?.addEventListener('click', fn);
document.getElementById('help-close')?.addEventListener('click', () => { document.getElementById('help-modal').hidden = true; });

el.fabAdd.addEventListener('click', () => {
  if (currentTab === 'tasks') openTaskModal();
  else if (currentTab === 'tax') openTaxIncomeModal();
  else openAddExpenseModal();
});
el.cancelAddExpense.addEventListener('click', closeAddExpenseModal);
for (const b of document.querySelectorAll('[data-entry-type]')) {
  b.addEventListener('click', () => {
    if (b.dataset.entryType === 'transfer') { closeAddExpenseModal(); openTransferModal().catch((error) => showError(error.message)); return; }
    setEntryType(b.dataset.entryType).catch((error) => showModalError(el.modalError, error.message));
  });
}
document.getElementById('stmt-abort').addEventListener('click', () => { stmtRun += 1; el.stmtRead.disabled = false; showStmtStep('pick'); });
document.getElementById('stmt-skip').addEventListener('click', () => nextStmtApproval(false));
document.getElementById('stmt-continue').addEventListener('click', () => nextStmtApproval(true));
el.stmtRows.addEventListener('change', () => updateStatementImportButton());
document.getElementById('category-chips').addEventListener('click', (event) => {
  const b = event.target.closest('.chip');
  if (!b) return;
  if (b.hasAttribute('data-cat-more')) { el.fieldCategory.hidden = false; el.fieldCategory.focus(); return; }
  pickCategory(b.dataset.cat);
});
el.fieldCategory.addEventListener('change', renderEntryCategoryChips);
el.fieldAmount.addEventListener('input', () => { if (parseFloat(el.fieldAmount.value) > 0) setAmountError(false); });
document.getElementById('delete-category').addEventListener('click', () => {
  const category = editingCategory;
  if (!category) return;
  el.categoryModal.hidden = true;
  handleDeleteCategory(category);
});
el.addExpenseForm.addEventListener('submit', handleAddExpenseSubmit);
el.fieldReceiptImage.addEventListener('change', handleReceiptFileChange);

el.addBillButton.addEventListener('click', openBillModal);
document.getElementById('home-scan').addEventListener('click', () => {
  openAddExpenseModal().catch((error) => showError(error.message));
  el.fieldReceiptImage.click(); // same tick as the tap (see txnScanButton)
});
document.getElementById('home-speak').addEventListener('click', () => {
  openAddExpenseModal().then(() => el.voiceButton.click()).catch((error) => showError(error.message));
});
document.getElementById('home-import').addEventListener('click', () => document.getElementById('import-statement-button').click());
document.getElementById('home-watch-all').addEventListener('click', () => switchTab('budgets'));
document.getElementById('home-recent-all').addEventListener('click', () => switchTab('transactions'));
document.getElementById('home-tax-row').addEventListener('click', () => switchTab('tax'));
document.getElementById('txn-filter-category').addEventListener('change', () => loadTransactionsTab());
document.getElementById('txn-retry').addEventListener('click', () => loadTransactionsTab());
document.getElementById('txn-data-button').addEventListener('click', openDataSheet);
document.getElementById('data-close').addEventListener('click', closeDataSheet);
for (const id of ['export-csv-button', 'export-email-button', 'import-statement-button', 'import-csv-button']) {
  document.getElementById(id).addEventListener('click', closeDataSheet); // its own flow takes over
}
document.getElementById('data-recent-list').addEventListener('click', async (event) => {
  const b = event.target.closest('[data-undo]');
  if (!b) return;
  const record = loadRecentImports()[Number(b.dataset.undo)];
  if (!record) return;
  b.disabled = true;
  try {
    const result = await undoImport(record);
    if (!result) { b.disabled = false; return; }
    renderDataRecent();
    showToast({ title: 'Import undone', description: `${result.deleted} removed${result.reverted ? `, ${result.reverted} transfer${result.reverted === 1 ? '' : 's'} separated again` : ''}` });
    if (currentTab === 'transactions') loadTransactionsTab();
  } catch (error) {
    b.disabled = false;
    showToast({ title: "Couldn't undo", description: plainError(error), kind: 'bad' });
  }
});
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
el.importStatementButton.addEventListener('click', openStatementModal);
el.stmtPick.addEventListener('submit', handleStatementRead);
el.stmtCancel.addEventListener('click', closeStatementModal);
el.stmtBack.addEventListener('click', () => { el.stmtReview.hidden = true; el.stmtPick.hidden = false; });
el.stmtSelectNew.addEventListener('click', () => selectStatementRows('new'));
el.stmtSelectNone.addEventListener('click', () => selectStatementRows('none'));
el.stmtImport.addEventListener('click', handleStatementImport);
el.stmtRecentList.addEventListener('click', handleRecentUndoClick);
el.exportEmailButton.addEventListener('click', handleExportEmail);

el.settingNotifications.addEventListener('change', () => handlePreferenceToggle('notifications_enabled', el.settingNotifications));
el.settingThumbnails.addEventListener('change', () => handlePreferenceToggle('thumbnails_enabled', el.settingThumbnails));
el.settingGroupCopies.addEventListener('change', () => handlePreferenceToggle('group_ledger_copies', el.settingGroupCopies));
el.saveCycleDay.addEventListener('click', handleSaveCycleDay);
el.saveEmail.addEventListener('click', handleSaveEmail);
el.saveEmergencyFund.addEventListener('click', handleSaveEmergencyFund);
el.clearHistoryButton.addEventListener('click', handleClearHistory);
el.deleteAccountButton.addEventListener('click', handleDeleteAccount);

el.refreshPricesButton.addEventListener('click', handleRefreshPrices);
el.perfRangePills.forEach((pill) => pill.addEventListener('click', () => setPerfRange(pill.dataset.perfRange)));
el.perfViewButtons.forEach((button) => button.addEventListener('click', () => setPerfView(button.dataset.perfView)));
el.divModeButtons.forEach((button) => button.addEventListener('click', () => setDivMode(button.dataset.divMode)));
el.homeInvestmentsCard.addEventListener('click', () => switchTab('networth'));
el.voiceButton.addEventListener('click', toggleVoiceRecording);
el.closeGroupDetail.addEventListener('click', () => { el.groupDetailModal.hidden = true; openGroupId = null; });
el.closeGroupBill.addEventListener('click', () => { el.groupBillModal.hidden = true; currentGroupBill = null; groupBillSeq += 1; });
el.gbillShares.addEventListener('click', handleGroupBillShareAction);
el.gbillSlipInput.addEventListener('change', handleGroupBillSlip);
el.gbillCancel.addEventListener('click', handleGroupBillCancel);
el.gbillPay.addEventListener('click', handleGroupBillCopy);
el.savePaymentDetails.addEventListener('click', handleSavePaymentDetails);
el.goalSetupButton.addEventListener('click', openGoalModal);
el.goalEditButton.addEventListener('click', openGoalModal);
el.goalTableToggle.addEventListener('click', toggleGoalTable);
el.goalForm.addEventListener('submit', handleGoalSubmit);
el.cancelGoal.addEventListener('click', closeGoalModal);
el.goalDelete.addEventListener('click', handleDeleteGoal);
el.addHoldingButton.addEventListener('click', () => openHoldingModal(null));
el.cancelHolding.addEventListener('click', closeHoldingModal);
el.holdingForm.addEventListener('submit', handleHoldingSubmit);
el.holdingFieldType.addEventListener('change', () => {
  updateHoldingFieldsForType();
  syncHoldingCurrencyDefault();
});
el.holdingFieldSymbol.addEventListener('input', syncHoldingCurrencyDefault);
el.holdingFieldCurrency.addEventListener('change', () => {
  holdingCurrencyTouched = true;
});
el.holdingAddLot.addEventListener('click', () => openLotModal(null));
el.holdingDetailEdit.addEventListener('click', () => openHoldingModal(detailHolding));
el.holdingDetailDelete.addEventListener('click', () => handleDeleteHolding(detailHolding.id));
el.closeHoldingDetail.addEventListener('click', closeHoldingDetail);
el.lotSideButtons.forEach((button) => button.addEventListener('click', () => setLotSide(button.dataset.lotSide)));
el.lotForm.addEventListener('submit', handleLotSubmit);
el.cancelLot.addEventListener('click', closeLotModal);
el.lotDelete.addEventListener('click', handleDeleteLot);

el.addRecurringButton.addEventListener('click', openRecurringModal);
el.cancelRecurring.addEventListener('click', closeRecurringModal);
el.recurringForm.addEventListener('submit', handleRecurringSubmit);
el.recurringFieldType.addEventListener('change', () =>
  populateRecurringCategoryOptions().catch((error) => showModalError(el.recurringModalError, error.message))
);


el.addEventButton.addEventListener('click', () => openEventModal().catch((error) => showModalError(el.eventModalError, error.message)));
el.cancelEvent.addEventListener('click', closeEventModal);
el.eventForm.addEventListener('submit', handleEventSubmit);


el.connectGoogleButton.addEventListener('click', handleConnectGoogle);
el.disconnectGoogle.addEventListener('click', handleConnectGoogle);

init();
