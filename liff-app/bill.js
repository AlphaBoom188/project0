const API_BASE = '/api';

const el = {
  loading: document.getElementById('loading'),
  errorBanner: document.getElementById('error-banner'),
  view: document.getElementById('bill-view'),
  viewTitle: document.getElementById('view-title'),
  viewMeta: document.getElementById('view-meta'),
  viewParticipants: document.getElementById('view-participants'),
};

function showError(message) {
  el.errorBanner.textContent = message;
  el.errorBanner.hidden = false;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getBillId() {
  return new URLSearchParams(location.search).get('id');
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`[${response.status}] ${body.error || response.statusText || 'Request failed'}`);
  }
  return body;
}

function renderBill(bill) {
  el.viewTitle.textContent = bill.title;
  const creator = bill.creator_display_name ? ` — paid by ${bill.creator_display_name}` : '';
  el.viewMeta.textContent = `${parseFloat(bill.total_amount).toFixed(2)} total${creator}`;

  el.viewParticipants.innerHTML = '';
  for (const participant of bill.participants) {
    const li = document.createElement('li');
    li.className = 'category-row';
    li.innerHTML = `
      <div class="bill-participant-detail-row">
        <span class="category-name">${escapeHtml(participant.display_name)}</span>
        <span>${parseFloat(participant.amount_owed).toFixed(2)}</span>
        <button type="button" class="bill-participant-toggle ${participant.is_paid ? 'active' : ''}">${participant.is_paid ? 'Paid' : 'Mark Paid'}</button>
      </div>
    `;
    li.querySelector('.bill-participant-toggle').addEventListener('click', () => markPaid(bill.id, participant.id, !participant.is_paid));
    el.viewParticipants.appendChild(li);
  }
}

async function markPaid(billId, participantId, isPaid) {
  try {
    await apiRequest(`/bills/public/${billId}/participants/${participantId}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_paid: isPaid }),
    });
    const response = await apiRequest(`/bills/public/${billId}`);
    renderBill(response.bill);
  } catch (error) {
    showError(error.message);
  }
}

async function init() {
  const billId = getBillId();
  if (!billId) {
    el.loading.hidden = true;
    showError('No bill link provided.');
    return;
  }
  try {
    const response = await apiRequest(`/bills/public/${billId}`);
    renderBill(response.bill);
    el.loading.hidden = true;
    el.view.hidden = false;
  } catch (error) {
    el.loading.hidden = true;
    showError(error.message);
  }
}

init();
