const API_BASE = '/api';

const el = {
  loading: document.getElementById('loading'),
  app: document.getElementById('app'),
  errorBanner: document.getElementById('error-banner'),
  profilePicture: document.getElementById('profile-picture'),
  profileName: document.getElementById('profile-name'),
  periodLabel: document.getElementById('period-label'),
  summaryIncome: document.getElementById('summary-income'),
  summaryExpense: document.getElementById('summary-expense'),
  summaryNet: document.getElementById('summary-net'),
  transactionList: document.getElementById('transaction-list'),
  emptyState: document.getElementById('empty-state'),
  addExpenseButton: document.getElementById('add-expense-button'),
  addExpenseModal: document.getElementById('add-expense-modal'),
  addExpenseForm: document.getElementById('add-expense-form'),
  cancelAddExpense: document.getElementById('cancel-add-expense'),
  fieldCategory: document.getElementById('field-category'),
  fieldAmount: document.getElementById('field-amount'),
  fieldDescription: document.getElementById('field-description'),
  fieldDate: document.getElementById('field-date'),
};

let lineUserId = null;

function showError(message) {
  el.errorBanner.textContent = message;
  el.errorBanner.hidden = false;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return body;
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

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function renderProfile(profile) {
  el.profileName.textContent = profile.displayName || 'You';
  if (profile.pictureUrl) {
    el.profilePicture.src = profile.pictureUrl;
  }
}

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

function renderTransactionList(transactions) {
  el.transactionList.innerHTML = '';
  el.emptyState.hidden = transactions.length > 0;

  for (const t of transactions) {
    const li = document.createElement('li');
    li.className = 'transaction-row';

    const thumbHtml = t.thumbnail_url ? `<img class="transaction-thumbnail" src="${t.thumbnail_url}" alt="" />` : '';

    li.innerHTML = `
      ${thumbHtml}
      <div class="transaction-details">
        <div class="transaction-category">${escapeHtml(t.categories?.name || 'Uncategorized')}</div>
        ${t.description ? `<div class="transaction-description">${escapeHtml(t.description)}</div>` : ''}
        <div class="transaction-date">${formatDate(t.transaction_date)}</div>
      </div>
      <div class="transaction-amount ${t.type}">${parseFloat(t.amount).toFixed(2)}</div>
    `;
    el.transactionList.appendChild(li);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderCategoryOptions(categories) {
  el.fieldCategory.innerHTML = categories
    .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    .join('');
}

async function loadDashboard() {
  const [userResponse, categoriesResponse] = await Promise.all([
    apiRequest(`/users/${lineUserId}`),
    apiRequest(`/categories/${lineUserId}?type=expense`),
  ]);

  renderCategoryOptions(categoriesResponse.categories);

  const { startISO, endISO } = getBillingCycleRange(userResponse.user.billing_cycle_start_day);
  const periodLabel = `${formatDate(startISO)} – ${formatDate(endISO)}`;

  const transactionsResponse = await apiRequest(
    `/transactions/${lineUserId}?start_date=${encodeURIComponent(startISO)}&end_date=${encodeURIComponent(endISO)}&limit=50`
  );

  renderSummary(transactionsResponse.transactions, periodLabel);
  renderTransactionList(transactionsResponse.transactions);
}

function openAddExpenseModal() {
  el.fieldAmount.value = '';
  el.fieldDescription.value = '';
  el.fieldDate.value = new Date().toISOString().slice(0, 10);
  el.addExpenseModal.hidden = false;
}

function closeAddExpenseModal() {
  el.addExpenseModal.hidden = true;
}

async function handleAddExpenseSubmit(event) {
  event.preventDefault();
  const submitButton = event.submitter;
  submitButton.disabled = true;

  try {
    await apiRequest(`/transactions/${lineUserId}`, {
      method: 'POST',
      body: JSON.stringify({
        category_id: el.fieldCategory.value,
        amount: parseFloat(el.fieldAmount.value),
        type: 'expense',
        description: el.fieldDescription.value || undefined,
        transaction_date: new Date(`${el.fieldDate.value}T12:00:00Z`).toISOString(),
      }),
    });
    closeAddExpenseModal();
    await loadDashboard();
  } catch (error) {
    showError(error.message);
  } finally {
    submitButton.disabled = false;
  }
}

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
    await loadDashboard();

    el.loading.hidden = true;
    el.app.hidden = false;
  } catch (error) {
    el.loading.hidden = true;
    showError(error.message || 'Something went wrong.');
  }
}

el.addExpenseButton.addEventListener('click', openAddExpenseModal);
el.cancelAddExpense.addEventListener('click', closeAddExpenseModal);
el.addExpenseForm.addEventListener('submit', handleAddExpenseSubmit);

init();
