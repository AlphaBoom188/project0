// Bulk e-slip import (History › Export / Import › Bank slips, Home › Scan ›
// Several slips at once, More › Import). Loaded after app.js and shares its
// globals. One image per /slips/:u/read call, 3 at a time; a review list; one
// /import for the approved rows; Undo from the toast. Read results stay in
// memory only (they hold names and account numbers): never localStorage.

const SLIP_MAX = 50;
const SLIP_CONCURRENCY = 3;
const sl = {
  modal: document.getElementById('slip-modal'),
  intro: document.getElementById('slip-intro'),
  pick: document.getElementById('slip-pick'),
  files: document.getElementById('slip-files'),
  working: document.getElementById('slip-working'),
  progress: document.getElementById('slip-progress'),
  stop: document.getElementById('slip-stop'),
  tasks: document.getElementById('slip-tasks'),
  review: document.getElementById('slip-review'),
  lookSec: document.getElementById('slip-look-sec'),
  look: document.getElementById('slip-look'),
  readySec: document.getElementById('slip-ready-sec'),
  ready: document.getElementById('slip-ready'),
  skippedSec: document.getElementById('slip-skipped-sec'),
  skippedSum: document.getElementById('slip-skipped-sum'),
  skipped: document.getElementById('slip-skipped'),
  error: document.getElementById('slip-error'),
  cancel: document.getElementById('slip-cancel'),
  import: document.getElementById('slip-import'),
  choice: document.getElementById('scan-choice-modal'),
};
// items: { n, file, url, state: queued|reading|new|duplicate|not_slip|failed, row, group: look|ready, selected, editing, error, existing }
const slipState = { items: [], categories: [], accounts: [], stopped: false, running: 0, loadSeq: 0, pauseTimer: null };

const SLIP_TYPES = [['expense', 'Expense'], ['income', 'Income'], ['transfer', 'Transfer']];
const slipFmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });
const slipYmd = (iso) => new Date(new Date(iso).getTime() + 7 * 3600000).toISOString().slice(0, 10);
const slipAccountName = (id) => (slipState.accounts.find((a) => a.id === id) || {}).account_name || '';
const slipCategory = (id) => slipState.categories.find((c) => c.id === id);

async function openSlipImport() {
  clearTimeout(slipState.pauseTimer);
  slipState.items.forEach((it) => it.url && URL.revokeObjectURL(it.url));
  Object.assign(slipState, { items: [], stopped: false, running: 0 });
  const seq = ++slipState.loadSeq;
  sl.files.value = '';
  sl.pick.hidden = false;
  sl.intro.hidden = false;
  sl.working.hidden = true;
  sl.review.hidden = true;
  sl.import.hidden = true;
  sl.error.hidden = true;
  sl.cancel.textContent = 'Close';
  sl.modal.hidden = false;
  try {
    const [cats, accounts] = await Promise.all([cachedGet(`/categories/${lineUserId}`), cachedGet(`/accounts/${lineUserId}`)]);
    if (seq !== slipState.loadSeq) return;
    slipState.categories = Array.isArray(cats) ? cats : cats.categories || [];
    slipState.accounts = Array.isArray(accounts) ? accounts : accounts.accounts || [];
  } catch {
    // Reading still works; the review just can't offer the lists until reopened.
  }
}

function slipChooseFiles() {
  const all = [...sl.files.files].filter((f) => f.type.startsWith('image/') || !f.type);
  if (!all.length) return;
  const files = all.slice(0, SLIP_MAX);
  if (all.length > SLIP_MAX) showToast({ title: `Reading the first ${SLIP_MAX} slips`, description: `${all.length - SLIP_MAX} more weren't added. Import them next.`, kind: 'warn' });
  slipState.items = files.map((file, n) => ({ n, file, url: URL.createObjectURL(file), state: 'queued', selected: false }));
  slipState.stopped = false;
  sl.pick.hidden = true;
  sl.intro.hidden = true;
  sl.working.hidden = false;
  sl.stop.hidden = false;
  sl.review.hidden = true;
  sl.cancel.textContent = 'Cancel';
  renderSlipTasks();
  slipPump();
}

function slipPump() {
  while (!slipState.stopped && slipState.running < SLIP_CONCURRENCY) {
    const next = slipState.items.find((it) => it.state === 'queued');
    if (!next) break;
    slipState.running += 1;
    next.state = 'reading';
    renderSlipTasks();
    readSlipItem(next).finally(() => {
      slipState.running -= 1;
      renderSlipTasks();
      slipPump();
    });
  }
  if (slipState.running === 0 && !slipState.items.some((it) => it.state === 'reading' || (it.state === 'queued' && !slipState.stopped))) slipFinishReading();
}

async function readSlipItem(item) {
  const seq = slipState.loadSeq;
  try {
    const resized = await resizeImageToJpegBlob(item.file);
    const [{ base64, hashHex }, qr] = await Promise.all([blobToBase64AndHash(resized, item.file), decodeSlipQr(item.file)]);
    const res = await apiRequest(`/slips/${lineUserId}/read`, { method: 'POST', body: JSON.stringify({ image_base64: base64, image_sha256: hashHex, qr }) });
    if (seq !== slipState.loadSeq) return;
    item.state = res.status;
    if (res.status === 'new') {
      item.row = res.row;
      // possible duplicates and rows without an amount start unticked
      item.selected = !res.row.possible_duplicate && res.row.amount != null;
      // the group is fixed when read, so a row doesn't jump while it's being fixed
      item.group = res.row.needs_review || res.row.possible_duplicate || res.row.amount == null ? 'look' : 'ready';
    }
    if (res.status === 'duplicate') item.existing = res.existing;
  } catch (error) {
    if (seq !== slipState.loadSeq) return;
    if (error.status === 429) {
      item.state = 'queued'; // read again after the break
      slipPause(error.retryAfter || 600);
    } else {
      item.state = 'failed';
      item.error = plainError(error);
    }
  }
}

// Over the read limit: keep what's read, wait, then carry on.
function slipPause(seconds) {
  if (slipState.stopped) return;
  slipState.stopped = true;
  const until = Date.now() + seconds * 1000;
  const tick = () => {
    const left = Math.max(0, Math.ceil((until - Date.now()) / 60000));
    sl.progress.textContent = `Taking a short break, resuming in ${left} min`;
    if (Date.now() >= until) {
      slipState.stopped = false;
      slipPump();
      return;
    }
    slipState.pauseTimer = setTimeout(tick, 15000);
  };
  tick();
}

function renderSlipTasks() {
  const items = slipState.items;
  const done = items.filter((it) => !['queued', 'reading'].includes(it.state)).length;
  if (!slipState.pauseTimer || !slipState.stopped) sl.progress.textContent = done < items.length ? `Reading ${Math.min(done + 1, items.length)} of ${items.length}` : `Read ${items.length} ${items.length === 1 ? 'slip' : 'slips'}`;
  const label = {
    queued: 'Waiting', reading: 'Reading', duplicate: 'Already recorded', not_slip: 'Not a bank slip', failed: "Couldn't read",
  };
  sl.tasks.innerHTML = items.map((it) => {
    const icon = it.state === 'reading' ? `<span class="pixel-loader">${'<i></i>'.repeat(9)}</span>`
      : it.state === 'new' ? '<span class="task-dot is-done"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>'
      : it.state === 'failed' ? '<span class="task-dot is-fail"></span>' : '<span class="task-dot"></span>';
    const detail = it.state === 'new' ? `${it.row.amount != null ? formatBaht(it.row.amount) : 'Amount unreadable'} · ${it.row.description}` : label[it.state] || '';
    return `<li class="row stmt-task slip-task" data-state="${it.state}">
      <img class="slip-thumb" src="${it.url}" alt="" />
      <span class="row-main"><span class="row-title">Slip ${it.n + 1}</span><span class="row-meta${it.state === 'failed' ? ' amount-over' : ''}">${escapeHtml(detail)}</span></span>
      <span class="task-icon" aria-hidden="true">${icon}</span>
    </li>`;
  }).join('');
}

function slipFinishReading() {
  sl.stop.hidden = true;
  renderSlipTasks();
  renderSlipReview();
}

function slipTypeChips(it) {
  return `<div class="seg slip-type" role="group" aria-label="Type">${SLIP_TYPES.map(([v, l]) => `<button type="button" data-slip-type="${v}" data-n="${it.n}" aria-pressed="${it.row.type === v}">${l}</button>`).join('')}</div>`;
}

function slipMeta(r) {
  const parts = [];
  const cat = slipCategory(r.category_id);
  if (r.type === 'transfer') parts.push(`${slipAccountName(r.from_account_id) || 'From ?'} to ${slipAccountName(r.to_account_id) || 'To ?'}`);
  else if (cat) parts.push(cat.name);
  parts.push(slipFmtDate(r.transaction_date));
  const acc = r.type === 'expense' ? r.from_account_id : r.type === 'income' ? r.to_account_id : null;
  if (acc && slipAccountName(acc)) parts.push(slipAccountName(acc));
  return parts.join(' · ');
}

function slipEditor(it) {
  const r = it.row;
  const cats = slipState.categories.filter((c) => c.type === (r.type === 'income' ? 'income' : 'expense'));
  const accOpts = (sel) => `<option value="">None</option>${slipState.accounts.map((a) => `<option value="${escapeHtml(a.id)}"${a.id === sel ? ' selected' : ''}>${escapeHtml(a.account_name)}</option>`).join('')}`;
  return `<div class="slip-editor" data-n="${it.n}">
    ${slipTypeChips(it)}
    <label class="field">Amount (THB)<input type="text" inputmode="decimal" data-slip-field="amount" value="${r.amount ?? ''}" autocomplete="off" /></label>
    <label class="field">Description<input type="text" maxlength="200" data-slip-field="description" value="${escapeHtml(r.description || '')}" autocomplete="off" /></label>
    ${r.type === 'transfer' ? '' : `<label class="field">Category<select data-slip-field="category_id">${cats.map((c) => `<option value="${escapeHtml(c.id)}"${c.id === r.category_id ? ' selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select></label>`}
    ${r.type === 'income' ? '' : `<label class="field">${r.type === 'transfer' ? 'From account' : 'Paid from'}<select data-slip-field="from_account_id">${accOpts(r.from_account_id)}</select></label>`}
    ${r.type === 'expense' ? '' : `<label class="field">${r.type === 'transfer' ? 'To account' : 'Paid into'}<select data-slip-field="to_account_id">${accOpts(r.to_account_id)}</select></label>`}
    <label class="field">Date<input type="date" data-slip-field="date" value="${slipYmd(r.transaction_date)}" /></label>
    <button type="button" class="btn btn-outline slip-edit-done" data-slip-done="${it.n}">Done</button>
  </div>`;
}

function slipRowHtml(it, { card }) {
  const r = it.row;
  const amount = r.amount != null ? (r.type === 'income' ? formatBaht(r.amount, { sign: true }) : formatBaht(r.type === 'expense' ? -r.amount : r.amount)) : '—';
  const cat = slipCategory(r.category_id);
  const check = `<input type="checkbox" class="slip-check" data-slip-check="${it.n}" aria-label="Import ${escapeHtml(r.description)}"${it.selected ? ' checked' : ''}${r.amount == null ? ' disabled' : ''} />`;
  const head = `<div class="slip-row-head">${check}${categoryTile(cat ? cat.name : r.description)}
      <button type="button" class="slip-row-main" data-slip-edit="${it.n}" aria-label="Edit ${escapeHtml(r.description)}"><span class="row-title">${escapeHtml(r.description)}</span><span class="row-meta">${escapeHtml(slipMeta(r))}</span></button>
      <span class="row-value slip-amount${r.type === 'income' ? ' amount-income' : ''}">${amount}</span></div>`;
  if (!card) return `<li class="row slip-row" data-n="${it.n}">${head}${it.editing ? slipEditor(it) : ''}</li>`;
  const dup = r.possible_duplicate;
  const notes = [r.reason, dup && `Matches ${formatBaht(r.amount)} · ${dup.description || 'an entry'} · ${slipFmtDate(`${dup.date}T12:00:00Z`)}`].filter(Boolean);
  return `<div class="card approval-card slip-card" data-n="${it.n}">${head}
    <p class="row-meta slip-reason">${escapeHtml(notes.join('. '))}</p>
    ${it.editing ? slipEditor(it) : slipTypeChips(it)}
  </div>`;
}

function renderSlipReview() {
  const items = slipState.items;
  const fresh = items.filter((it) => it.state === 'new');
  const look = fresh.filter((it) => it.group === 'look');
  const ready = fresh.filter((it) => it.group !== 'look');
  const dups = items.filter((it) => it.state === 'duplicate');
  const notSlip = items.filter((it) => it.state === 'not_slip');
  const failed = items.filter((it) => it.state === 'failed' || (it.state === 'queued' && slipState.stopped));
  sl.review.hidden = false;
  sl.lookSec.hidden = !look.length;
  sl.look.innerHTML = look.map((it) => slipRowHtml(it, { card: true })).join('');
  sl.readySec.hidden = !ready.length;
  sl.ready.innerHTML = ready.map((it) => slipRowHtml(it, { card: false })).join('');
  const parts = [dups.length && `${dups.length} already recorded`, notSlip.length && `${notSlip.length} ${notSlip.length === 1 ? "photo wasn't a bank slip" : "photos weren't bank slips"}`, failed.length && `${failed.length} couldn't be read`].filter(Boolean);
  sl.skippedSec.hidden = !parts.length;
  sl.skippedSum.textContent = `Skipped: ${parts.join(', ')}`;
  sl.skipped.innerHTML = [...dups.map((it) => `<li class="row"><img class="slip-thumb" src="${it.url}" alt="" /><span class="row-main"><span class="row-title">Slip ${it.n + 1}</span><span class="row-meta">Already recorded${it.existing ? ` · ${formatBaht(it.existing.amount)} · ${escapeHtml(slipFmtDate(`${it.existing.date}T12:00:00Z`))}` : ''}</span></span></li>`),
    ...notSlip.map((it) => `<li class="row"><img class="slip-thumb" src="${it.url}" alt="" /><span class="row-main"><span class="row-title">Slip ${it.n + 1}</span><span class="row-meta">Not a bank slip. Use Scan for receipts.</span></span></li>`),
    ...failed.map((it) => `<li class="row"><img class="slip-thumb" src="${it.url}" alt="" /><span class="row-main"><span class="row-title">Slip ${it.n + 1}</span><span class="row-meta amount-over">${escapeHtml(it.error || 'Not read yet')}</span></span><button type="button" class="btn btn-outline btn-sm slip-retry" data-slip-retry="${it.n}">Try again</button></li>`)].join('');
  if (failed.length) sl.skippedSec.open = true;
  const n = fresh.filter((it) => it.selected).length;
  sl.import.hidden = !fresh.length;
  sl.import.disabled = n === 0;
  sl.import.textContent = `Import ${n}`;
  sl.cancel.textContent = fresh.length ? 'Cancel' : 'Close';
  if (!fresh.length && !failed.length) sl.progress.textContent = 'Nothing new to import';
}

const slipItem = (n) => slipState.items.find((it) => it.n === Number(n));

function slipSetType(it, type) {
  const r = it.row;
  if (r.type === type) return;
  r.type = type;
  if (type !== 'transfer') {
    const cats = slipState.categories.filter((c) => c.type === type);
    if (!cats.some((c) => c.id === r.category_id)) r.category_id = (cats.find((c) => /^others?\b|other income/i.test(c.name)) || cats[0] || {}).id || null;
  }
  if (type === 'expense') r.to_account_id = null;
  if (type === 'income') r.from_account_id = null;
  r.needs_review = false; // the user decided
  r.reason = null;
}

function slipApplyField(it, field, value) {
  const r = it.row;
  if (field === 'amount') {
    const v = Number(String(value).replace(/[,\s฿]/g, ''));
    r.amount = Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
    if (r.amount == null) it.selected = false;
  } else if (field === 'date') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value) && slipYmd(r.transaction_date) !== value) r.transaction_date = `${value}T12:00:00.000Z`;
  } else {
    r[field] = value || null;
  }
}

// Valid enough to send (the server checks again).
function slipRowError(r) {
  if (!(r.amount > 0)) return 'an amount';
  if (r.type === 'transfer' && (!r.from_account_id || !r.to_account_id || r.from_account_id === r.to_account_id)) return 'two different accounts';
  if (r.type !== 'transfer' && !r.category_id) return 'a category';
  return null;
}

async function slipImportSelected() {
  const chosen = slipState.items.filter((it) => it.state === 'new' && it.selected);
  for (const it of chosen) {
    const missing = slipRowError(it.row);
    if (missing) {
      it.editing = true;
      renderSlipReview();
      showModalError(sl.error, `"${it.row.description}" needs ${missing}.`);
      return;
    }
  }
  sl.error.hidden = true;
  sl.import.disabled = true;
  try {
    const rows = chosen.map(({ row: r }) => ({ slip_key: r.slip_key, type: r.type, amount: r.amount, transaction_date: r.transaction_date, description: r.description, category_id: r.type === 'transfer' ? null : r.category_id, from_account_id: r.from_account_id, to_account_id: r.to_account_id }));
    const res = await apiRequest(`/slips/${lineUserId}/import`, { method: 'POST', body: JSON.stringify({ rows }) });
    const imported = res.imported || [];
    const skippedNote = [res.skipped && `${res.skipped} already recorded`, res.errors && res.errors.length && `${res.errors.length} not saved`].filter(Boolean).join(', ');
    sl.modal.hidden = true;
    showToast({
      title: `Imported ${imported.length} ${imported.length === 1 ? 'slip' : 'slips'}`,
      description: skippedNote,
      kind: 'ok',
      undo: imported.length ? async () => {
        await apiRequest(`/slips/${lineUserId}/undo`, { method: 'POST', body: JSON.stringify({ rows: imported }) });
        TAB_LOADERS[currentTab]().catch(() => {});
      } : null,
    });
    showBudgetAlerts(res.budget_alerts || [], res.event_budget_alerts || []);
    TAB_LOADERS[currentTab]().catch(() => {});
  } catch (error) {
    showModalError(sl.error, plainError(error));
  } finally {
    sl.import.disabled = false;
  }
}

function slipStop() {
  slipState.stopped = true;
  clearTimeout(slipState.pauseTimer);
  slipState.pauseTimer = null;
  sl.stop.hidden = true;
  if (slipState.running === 0) slipFinishReading();
}

function slipClose() {
  slipState.stopped = true;
  clearTimeout(slipState.pauseTimer);
  slipState.pauseTimer = null;
  slipState.loadSeq += 1; // late reads are ignored
  slipState.items.forEach((it) => it.url && URL.revokeObjectURL(it.url));
  slipState.items = [];
  sl.modal.hidden = true;
}

// ---- Wiring ----
sl.files.addEventListener('change', slipChooseFiles);
sl.stop.addEventListener('click', slipStop);
sl.cancel.addEventListener('click', slipClose);
sl.import.addEventListener('click', slipImportSelected);
sl.review.addEventListener('click', (e) => {
  const t = e.target;
  const type = t.closest('[data-slip-type]');
  if (type) { slipSetType(slipItem(type.dataset.n), type.dataset.slipType); renderSlipReview(); return; }
  const edit = t.closest('[data-slip-edit]');
  if (edit) { const it = slipItem(edit.dataset.slipEdit); it.editing = !it.editing; renderSlipReview(); return; }
  const done = t.closest('[data-slip-done]');
  if (done) { slipItem(done.dataset.slipDone).editing = false; renderSlipReview(); return; }
  const retry = t.closest('[data-slip-retry]');
  if (retry) {
    const it = slipItem(retry.dataset.slipRetry);
    it.state = 'queued';
    it.error = null;
    slipState.stopped = false;
    sl.stop.hidden = false;
    renderSlipTasks();
    slipPump();
  }
});
sl.review.addEventListener('change', (e) => {
  const check = e.target.closest('[data-slip-check]');
  if (check) { slipItem(check.dataset.slipCheck).selected = check.checked; renderSlipReview(); return; }
  const field = e.target.closest('[data-slip-field]');
  if (field) {
    const it = slipItem(field.closest('.slip-editor').dataset.n);
    slipApplyField(it, field.dataset.slipField, field.value);
    if (field.dataset.slipField === 'amount' && it.row.amount != null && !it.row.possible_duplicate) it.selected = true;
    renderSlipReview();
  }
});
document.getElementById('import-slips-button').addEventListener('click', () => {
  document.getElementById('data-modal').hidden = true;
  openSlipImport();
});
// Home › Scan: one receipt (the entry sheet, as before) or several slips.
document.getElementById('scan-choice-one').addEventListener('click', () => {
  sl.choice.hidden = true;
  openAddExpenseModal().catch((error) => showError(error.message));
  el.fieldReceiptImage.click(); // same tick as the tap, or iOS blocks the picker
});
document.getElementById('scan-choice-many').addEventListener('click', () => {
  sl.choice.hidden = true;
  openSlipImport();
  sl.files.click(); // same tick as the tap
});
document.getElementById('scan-choice-cancel').addEventListener('click', () => { sl.choice.hidden = true; });
