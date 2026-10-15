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
  modalError: document.getElementById('modal-error'),
  fieldReceiptImage: document.getElementById('field-receipt-image'),
  receiptPreview: document.getElementById('receipt-preview'),
  scanStatus: document.getElementById('scan-status'),
  dashboardView: document.getElementById('dashboard-view'),
  settingsView: document.getElementById('settings-view'),
  settingsButton: document.getElementById('settings-button'),
  backToDashboard: document.getElementById('back-to-dashboard'),
  settingNotifications: document.getElementById('setting-notifications'),
  settingThumbnails: document.getElementById('setting-thumbnails'),
  settingCycleDay: document.getElementById('setting-cycle-day'),
  saveCycleDay: document.getElementById('save-cycle-day'),
  settingsStatus: document.getElementById('settings-status'),
  clearHistoryButton: document.getElementById('clear-history-button'),
  confirmModal: document.getElementById('confirm-modal'),
  confirmMessage: document.getElementById('confirm-message'),
  confirmOk: document.getElementById('confirm-ok'),
  confirmCancel: document.getElementById('confirm-cancel'),
};

let lineUserId = null;
let currentUser = null;
let scannedThumbnailPath = null;

function showError(message) {
  el.errorBanner.textContent = message;
  el.errorBanner.hidden = false;
}

// The modal is a fixed, full-screen overlay, so the top-level error banner would be
// rendered underneath it and never seen -- errors from inside the modal need their
// own visible spot instead of (or in addition to) the global banner.
function showModalError(message) {
  el.modalError.textContent = message;
  el.modalError.hidden = false;
}

function clearModalError() {
  el.modalError.hidden = true;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || body.message || `Request failed (${response.status})`);
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

  currentUser = userResponse.user;
  renderCategoryOptions(categoriesResponse.categories);

  const { startISO, endISO } = getBillingCycleRange(currentUser.billing_cycle_start_day);
  const periodLabel = `${formatDate(startISO)} – ${formatDate(endISO)}`;

  const transactionsResponse = await apiRequest(
    `/transactions/${lineUserId}?start_date=${encodeURIComponent(startISO)}&end_date=${encodeURIComponent(endISO)}&limit=50`
  );

  renderSummary(transactionsResponse.transactions, periodLabel);
  renderTransactionList(transactionsResponse.transactions);
}

// ---- Add Expense modal ----

function resetReceiptScanState() {
  el.fieldReceiptImage.value = '';
  el.receiptPreview.hidden = true;
  el.receiptPreview.removeAttribute('src');
  el.scanStatus.hidden = true;
  el.scanStatus.classList.remove('scan-error');
  scannedThumbnailPath = null;
}

function openAddExpenseModal() {
  el.fieldAmount.value = '';
  el.fieldDescription.value = '';
  el.fieldDate.value = new Date().toISOString().slice(0, 10);
  clearModalError();
  resetReceiptScanState();
  el.addExpenseModal.hidden = false;
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

  clearModalError();
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
  clearModalError();

  try {
    await apiRequest(`/transactions/${lineUserId}`, {
      method: 'POST',
      body: JSON.stringify({
        category_id: el.fieldCategory.value,
        amount: parseFloat(el.fieldAmount.value),
        type: 'expense',
        description: el.fieldDescription.value || undefined,
        thumbnail_url: scannedThumbnailPath || undefined,
        transaction_date: new Date(`${el.fieldDate.value}T12:00:00Z`).toISOString(),
      }),
    });
    closeAddExpenseModal();
    await loadDashboard();
  } catch (error) {
    // Shown inside the modal, not the top-level banner -- the modal overlay would
    // otherwise hide the banner from view while still open.
    showModalError(error.message);
  } finally {
    submitButton.disabled = false;
  }
}

// ---- Settings view ----

function openSettingsView() {
  if (currentUser) {
    el.settingNotifications.checked = currentUser.notifications_enabled !== false;
    el.settingThumbnails.checked = currentUser.thumbnails_enabled !== false;
    el.settingCycleDay.value = currentUser.billing_cycle_start_day || 1;
  }
  el.settingsStatus.hidden = true;
  el.dashboardView.hidden = true;
  el.settingsView.hidden = false;
}

function closeSettingsView() {
  el.settingsView.hidden = true;
  el.dashboardView.hidden = false;
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
    await loadDashboard(); // the dashboard's period label depends on this
  } catch (error) {
    showSettingsStatus(error.message);
  } finally {
    el.saveCycleDay.disabled = false;
  }
}

// Generic yes/no confirmation, used for the destructive clear-history action.
function confirmAction(message) {
  return new Promise((resolve) => {
    el.confirmMessage.textContent = message;
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

async function handleClearHistory() {
  const confirmed = await confirmAction('Permanently delete every transaction in your history? This cannot be undone.');
  if (!confirmed) return;

  el.clearHistoryButton.disabled = true;
  try {
    await apiRequest(`/transactions/${lineUserId}/all`, { method: 'DELETE' });
    showSettingsStatus('Transaction history cleared.');
    await loadDashboard();
  } catch (error) {
    showSettingsStatus(error.message);
  } finally {
    el.clearHistoryButton.disabled = false;
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
el.fieldReceiptImage.addEventListener('change', handleReceiptFileChange);

el.settingsButton.addEventListener('click', openSettingsView);
el.backToDashboard.addEventListener('click', closeSettingsView);
el.settingNotifications.addEventListener('change', () => handlePreferenceToggle('notifications_enabled', el.settingNotifications));
el.settingThumbnails.addEventListener('change', () => handlePreferenceToggle('thumbnails_enabled', el.settingThumbnails));
el.saveCycleDay.addEventListener('click', handleSaveCycleDay);
el.clearHistoryButton.addEventListener('click', handleClearHistory);

init();
