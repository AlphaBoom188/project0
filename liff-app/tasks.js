// Tasks tab: reminders, to-dos, notes and (read-only) Google Calendar events.
// Loaded after app.js and shares its globals (el, lineUserId, apiRequest,
// cachedGet, escapeHtml, confirmAction, showError, bangkok helpers).
// Backend: /api/reminders, /api/notes, /api/calendar (migration 020).

const SVG = (inner, size = 20) => `<span class="icon"><svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg></span>`;
const ICONS = {
  work: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
  finance: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  health: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>',
  client: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  order: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  other: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  note: '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/>',
  pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  group: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
};
const CATEGORY_LABELS = { work: 'Work', finance: 'Finance', health: 'Health', client: 'Client', order: 'Order', other: 'Other' };
const IMPORTANCE_LABELS = ['Normal', 'Important', 'Must not miss'];
const IMPORTANCE_HELP = [
  'One reminder at the time you set.',
  'Reminds again after 30 minutes and 90 minutes until you tap Done.',
  'Reminds again after 15, 45, 90 and 180 minutes until you tap Done.',
];
const REPEAT_LABELS = { daily: 'Every day', weekdays: 'Every weekday', weekly: 'Every week', monthly: 'Every month' };
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_MS = 86400000;

const t = {
  kicker: document.getElementById('tasks-kicker'),
  date: document.getElementById('tasks-date'),
  monthButton: document.getElementById('tasks-month-button'),
  week: document.getElementById('week-strip'),
  summary: document.getElementById('tasks-summary'),
  summaryRepeat: document.getElementById('tasks-summary-repeat'),
  summaryNext: document.getElementById('tasks-summary-next'),
  dayTitle: document.getElementById('tasks-day-title'),
  dayCount: document.getElementById('tasks-day-count'),
  status: document.getElementById('tasks-status'),
  timeline: document.getElementById('tasks-timeline'),
  empty: document.getElementById('tasks-empty'),
  todoHeader: document.getElementById('tasks-todo-header'),
  todoCount: document.getElementById('tasks-todo-count'),
  todos: document.getElementById('tasks-todos'),
  addNote: document.getElementById('tasks-add-note'),
  notes: document.getElementById('tasks-notes'),
  notesEmpty: document.getElementById('tasks-notes-empty'),
  calendarHint: document.getElementById('tasks-calendar-hint'),
  // add/edit sheet
  modal: document.getElementById('task-modal'),
  kind: document.getElementById('task-kind'),
  form: document.getElementById('task-form'),
  title: document.getElementById('task-title'),
  details: document.getElementById('task-details'),
  repeatMode: document.getElementById('task-repeat-mode'),
  presets: document.getElementById('task-presets'),
  repeatField: document.getElementById('task-repeat-field'),
  repeat: document.getElementById('task-repeat'),
  dateLabel: document.getElementById('task-date-label'),
  dateInput: document.getElementById('task-date'),
  timeInput: document.getElementById('task-time'),
  clearTime: document.getElementById('task-clear-time'),
  categories: document.getElementById('task-categories'),
  importance: document.getElementById('task-importance'),
  importanceHelp: document.getElementById('task-importance-help'),
  error: document.getElementById('task-modal-error'),
  cancel: document.getElementById('task-cancel'),
  save: document.getElementById('task-save'),
  del: document.getElementById('task-delete'),
  noteForm: document.getElementById('note-form'),
  noteBody: document.getElementById('note-body'),
  noteDate: document.getElementById('note-date'),
  notePinned: document.getElementById('note-pinned'),
  noteError: document.getElementById('note-modal-error'),
  noteCancel: document.getElementById('note-cancel'),
  noteSave: document.getElementById('note-save'),
  noteDelete: document.getElementById('note-delete'),
  // list sheet
  listModal: document.getElementById('tasks-list-modal'),
  listTabs: document.getElementById('tasks-list-tabs'),
  list: document.getElementById('tasks-list'),
  listEmpty: document.getElementById('tasks-list-empty'),
  doneToggle: document.getElementById('tasks-done-toggle'),
  doneList: document.getElementById('tasks-done-list'),
  closeList: document.getElementById('close-tasks-list'),
  // month sheet
  monthModal: document.getElementById('tasks-month-modal'),
  monthTitle: document.getElementById('month-title'),
  monthGrid: document.getElementById('month-grid'),
  monthPrev: document.getElementById('month-prev'),
  monthNext: document.getElementById('month-next'),
  monthToday: document.getElementById('month-today'),
  // settings
  gcalText: document.getElementById('gcal-status-text'),
  gcalConnect: document.getElementById('gcal-connect'),
  gcalDisconnect: document.getElementById('gcal-disconnect'),
  gcalStatus: document.getElementById('gcal-status'),
};

// ---- Bangkok calendar helpers (dates as 'YYYY-MM-DD') ----
const ymdParts = (ymd) => ymd.split('-').map(Number);
const ymdToDate = (ymd) => { const [y, m, d] = ymdParts(ymd); return bangkokMidnight(y, m - 1, d); }; // Bangkok midnight instant
const addDays = (ymd, n) => bangkokYmd(new Date(ymdToDate(ymd).getTime() + n * DAY_MS + 12 * 3600000));
const weekdayOf = (ymd) => { const [y, m, d] = ymdParts(ymd); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const mondayOf = (ymd) => addDays(ymd, -((weekdayOf(ymd) + 6) % 7));
const bkkTime = (iso) => new Date(new Date(iso).getTime() + BANGKOK_OFFSET_MS).toISOString().slice(11, 16);
const bkkYmdOf = (iso) => bangkokYmd(new Date(iso));
const longDate = (ymd) => { const [y, m, d] = ymdParts(ymd); return `${WEEKDAY_SHORT[weekdayOf(ymd)]} ${d} ${MONTHS_LONG[m - 1]}${y !== ymdParts(bangkokYmd())[0] ? ` ${y}` : ''}`; };
// Bangkok date + time -> ISO instant (mirrors backend reminderMath.resolveRemindAt).
function toRemindAt(date, time) {
  if (!date && !time) return null;
  const hm = time || '09:00';
  if (date) return new Date(`${date}T${hm}:00+07:00`).toISOString();
  const today = new Date(`${bangkokYmd()}T${hm}:00+07:00`);
  return (today > new Date() ? today : new Date(today.getTime() + DAY_MS)).toISOString();
}

// ---- State ----
const tasks = {
  selected: null, // 'YYYY-MM-DD'
  data: null, // { from, to, reminders, occurrences, notes, events }
  seq: 0,
  calendar: null, // GET /calendar/:u/status
  listTab: 'next',
  monthCursor: null, // 'YYYY-MM-01'
  editing: null, // reminder being edited (null = new)
  editingNote: null,
  form: { mode: 'once', category: null, importance: 0 },
};

// The 6-week grid around a month: [Monday before the 1st, +42 days).
function gridRange(ymd) {
  const first = `${ymd.slice(0, 8)}01`;
  const start = mondayOf(first);
  return { start, end: addDays(start, 42) };
}

async function fetchTasksWindow(ymd) {
  const { start, end } = gridRange(ymd);
  const from = ymdToDate(start).toISOString();
  const to = ymdToDate(end).toISOString();
  if (!tasks.calendar) tasks.calendar = await cachedGet(`/calendar/${lineUserId}/status`).catch(() => ({ connected: false, configured: false }));
  const [rem, notes, events] = await Promise.all([
    cachedGet(`/reminders/${lineUserId}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    cachedGet(`/notes/${lineUserId}?from=${start}&to=${addDays(end, -1)}`),
    tasks.calendar.connected
      ? cachedGet(`/calendar/${lineUserId}/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then((r) => r.events).catch((error) => ({ error }))
      : Promise.resolve([]),
  ]);
  return { start, end, reminders: rem.reminders, occurrences: rem.occurrences, notes: notes.notes, events };
}

async function loadTasksTab(ymd) {
  if (ymd) tasks.selected = ymd;
  if (!tasks.selected) tasks.selected = bangkokYmd();
  const seq = ++tasks.seq;
  if (!tasks.data) setTasksStatus('Loading…', 'working');
  try {
    const data = await fetchTasksWindow(tasks.selected);
    if (seq !== tasks.seq) return;
    tasks.data = data;
    hideAiStatus(t.status);
    renderTasks();
  } catch (error) {
    if (seq !== tasks.seq) return;
    setTasksStatus(plainError(error), 'error');
  }
}

function setTasksStatus(text, state = 'info') {
  setAiStatus(t.status, state, text);
}

// Re-fetch after a change (any non-GET cleared the cache).
const reloadTasks = () => loadTasksTab().catch((error) => showError(error.message));

// ---- Derived lists ----
const byId = () => new Map(tasks.data.reminders.map((r) => [r.id, r]));
const isMine = (r) => r.line_user_id === lineUserId;

// Everything on one Bangkok day, sorted by time: reminder occurrences and calendar events.
function dayItems(ymd) {
  const map = byId();
  const items = tasks.data.occurrences
    .filter((o) => bkkYmdOf(o.at) === ymd && map.has(o.reminder_id))
    .map((o) => ({ kind: 'reminder', at: o.at, r: map.get(o.reminder_id) }));
  const events = Array.isArray(tasks.data.events) ? tasks.data.events : [];
  for (const e of events) {
    if (e.all_day) {
      if (e.start <= ymd && ymd < (e.end || addDays(e.start, 1))) items.push({ kind: 'event', at: null, e });
    } else if (e.start && bkkYmdOf(e.start) === ymd) items.push({ kind: 'event', at: e.start, e });
  }
  return items.sort((a, b) => (a.at ? new Date(a.at).getTime() : 0) - (b.at ? new Date(b.at).getTime() : 0));
}

function daysWithItems() {
  const marks = new Map(); // ymd -> Set('reminder'|'note'|'event')
  const add = (ymd, k) => { if (!marks.has(ymd)) marks.set(ymd, new Set()); marks.get(ymd).add(k); };
  tasks.data.occurrences.forEach((o) => add(bkkYmdOf(o.at), 'reminder'));
  tasks.data.notes.forEach((n) => add(n.note_date, 'note'));
  (Array.isArray(tasks.data.events) ? tasks.data.events : []).forEach((e) => e.start && add(e.all_day ? e.start : bkkYmdOf(e.start), 'event'));
  return marks;
}

// Is this occurrence the reminder's current one (the only one Done applies to)?
const isCurrent = (r, at) => r.remind_at && new Date(r.remind_at).getTime() === new Date(at).getTime();

function reminderState(r, at) {
  const now = Date.now();
  if (r.status === 'done') return { done: true, label: 'Done' };
  if (r.repeat !== 'none' && !isCurrent(r, at)) return { done: false, past: new Date(at) < now, label: REPEAT_LABELS[r.repeat] };
  if (new Date(at) <= now) return { done: false, label: r.last_fired_at ? 'Reminded' : 'Due' };
  return { done: false, label: r.repeat !== 'none' ? REPEAT_LABELS[r.repeat] : '' };
}

// ---- Render ----
function renderTasks() {
  const today = bangkokYmd();
  const sel = tasks.selected;
  t.kicker.textContent = sel === today ? 'Today' : sel === addDays(today, 1) ? 'Tomorrow' : sel === addDays(today, -1) ? 'Yesterday' : WEEKDAY_SHORT[weekdayOf(sel)];
  t.date.textContent = longDate(sel);
  renderWeekStrip();
  renderTasksSummary();
  renderTimeline();
  renderTodos();
  renderNotes();
  const cal = tasks.calendar || {};
  t.calendarHint.hidden = cal.connected || !cal.configured;
  if (tasks.data.events && tasks.data.events.error) {
    t.calendarHint.hidden = false;
    t.calendarHint.textContent = `Google Calendar: ${plainError(tasks.data.events.error)}`;
  }
}

function renderWeekStrip() {
  const start = mondayOf(tasks.selected);
  const marks = daysWithItems();
  const today = bangkokYmd();
  t.week.innerHTML = Array.from({ length: 7 }, (_, i) => {
    const ymd = addDays(start, i);
    const cls = ['week-day', ymd === tasks.selected ? 'selected' : '', ymd === today ? 'today' : '', ymd < today ? 'past' : ''].join(' ');
    return `<button type="button" class="${cls}" data-ymd="${ymd}" aria-pressed="${ymd === tasks.selected}" aria-label="${longDate(ymd)}">
      <span class="week-day-name">${WEEKDAY_SHORT[weekdayOf(ymd)]}</span>
      <span class="week-day-num">${Number(ymd.slice(8))}</span>
      <span class="week-day-dot"${marks.has(ymd) ? '' : ' hidden'}></span>
    </button>`;
  }).join('');
}

function listGroups() {
  const now = Date.now();
  const open = tasks.data.reminders.filter((r) => r.status === 'open');
  return {
    next: open.filter((r) => r.remind_at && r.repeat === 'none').sort((a, b) => new Date(a.remind_at) - new Date(b.remind_at)),
    repeat: open.filter((r) => r.repeat !== 'none').sort((a, b) => new Date(a.remind_at) - new Date(b.remind_at)),
    todo: open.filter((r) => !r.remind_at),
    done: tasks.data.reminders.filter((r) => r.status === 'done').sort((a, b) => new Date(b.done_at) - new Date(a.done_at)),
    upcoming: open.filter((r) => r.remind_at && new Date(r.remind_at) > now).length,
  };
}

function renderTasksSummary() {
  const g = listGroups();
  t.summaryRepeat.innerHTML = `${SVG(ICONS.repeat, 16)}<span>Repeating ${g.repeat.length}</span>`;
  t.summaryNext.innerHTML = `${SVG(ICONS.clock, 16)}<span>Upcoming ${g.upcoming}</span>`;
}

const categoryIcon = (c) => `<span class="task-icon">${SVG(ICONS[c] || ICONS.bell, 18)}</span>`;
function importanceBadge(i) {
  if (!i) return '';
  return `<span class="task-badge${i === 2 ? ' strong' : ''}">${IMPORTANCE_LABELS[i]}</span>`;
}

function reminderRow(r, at, { showDate = false } = {}) {
  const st = at ? reminderState(r, at) : { done: r.status === 'done', label: '' };
  const canCheck = r.status === 'done' ? r.repeat === 'none' : (r.repeat === 'none' || !at || isCurrent(r, at));
  const meta = [
    showDate && r.remind_at ? `${longDate(bkkYmdOf(r.remind_at))}, ${bkkTime(r.remind_at)}` : '',
    st.label,
    r.group_id ? 'Group' : '',
    r.category ? CATEGORY_LABELS[r.category] : '',
  ].filter(Boolean).join(' · ');
  return `<li class="task-row${st.done ? ' is-done' : ''}" data-id="${r.id}">
    <span class="task-time">${at ? bkkTime(at) : ''}</span>
    ${categoryIcon(r.category)}
    <button type="button" class="task-main" data-open="${r.id}"${isMine(r) ? '' : ' disabled'}>
      <span class="task-title">${escapeHtml(r.title)}</span>
      <span class="task-meta">${importanceBadge(r.importance)}${r.group_id ? SVG(ICONS.group, 14) : ''}<span>${escapeHtml(meta)}</span></span>
    </button>
    ${canCheck ? `<button type="button" class="task-check${st.done ? ' checked' : ''}" data-check="${r.id}" aria-pressed="${st.done}" aria-label="${st.done ? 'Mark not done' : 'Mark done'}: ${escapeHtml(r.title)}">${SVG(ICONS.check, 16)}</button>` : `<span class="task-check-placeholder">${SVG(ICONS.repeat, 16)}</span>`}
  </li>`;
}

function eventRow(e) {
  const time = e.all_day ? 'All day' : bkkTime(e.start);
  const range = !e.all_day && e.end ? `${bkkTime(e.start)}-${bkkTime(e.end)}` : 'All day';
  return `<li class="task-row is-event">
    <span class="task-time">${time}</span>
    <span class="task-icon">${SVG(ICONS.calendar, 18)}</span>
    <span class="task-main"><span class="task-title">${escapeHtml(e.title)}</span><span class="task-meta"><span>Google Calendar · ${range}</span></span></span>
    <span class="task-check-placeholder"></span>
  </li>`;
}

function renderTimeline() {
  const sel = tasks.selected;
  const today = bangkokYmd();
  const items = dayItems(sel);
  t.dayTitle.textContent = sel === today ? 'Today' : longDate(sel);
  t.dayCount.textContent = items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : '';
  t.empty.hidden = items.length > 0;
  t.timeline.hidden = items.length === 0;
  const rows = [];
  let nowShown = sel !== today;
  const nowMs = Date.now();
  for (const item of items) {
    if (!nowShown && item.at && new Date(item.at).getTime() > nowMs) {
      rows.push(nowLine());
      nowShown = true;
    }
    rows.push(item.kind === 'event' ? eventRow(item.e) : reminderRow(item.r, item.at));
  }
  if (!nowShown && items.length) rows.push(nowLine());
  t.timeline.innerHTML = rows.join('');
}

const nowLine = () => `<li class="now-line" aria-label="Now"><span class="now-pill">Now ${bkkTime(new Date().toISOString())}</span><span class="now-rule"></span></li>`;

function renderTodos() {
  const sel = tasks.selected;
  const todos = tasks.data.reminders.filter((r) => !r.remind_at && (r.status === 'open' || (r.done_at && bkkYmdOf(r.done_at) === sel)));
  const open = todos.filter((r) => r.status === 'open').length;
  t.todoHeader.hidden = todos.length === 0;
  t.todos.hidden = todos.length === 0;
  t.todoCount.textContent = open ? `${open} open` : 'All done';
  t.todos.innerHTML = todos.map((r) => reminderRow(r, null)).join('');
}

function renderNotes() {
  const notes = tasks.data.notes.filter((n) => n.note_date === tasks.selected || n.pinned);
  t.notesEmpty.hidden = notes.length > 0;
  t.notes.hidden = notes.length === 0;
  t.notes.innerHTML = notes.map((n) => `<li class="note-row" data-note="${n.id}">
    <button type="button" class="note-main" data-note-open="${n.id}">
      <span class="task-icon">${SVG(n.pinned ? ICONS.pin : ICONS.note, 18)}</span>
      <span class="note-text">${escapeHtml(n.body)}</span>
    </button>
  </li>`).join('');
}

// ---- Actions on rows ----
async function toggleReminderDone(id) {
  const r = byId().get(id);
  if (!r) return;
  const action = r.status === 'done' ? 'reopen' : 'done';
  const row = t.timeline.querySelector(`[data-check="${id}"]`) || t.todos.querySelector(`[data-check="${id}"]`);
  if (row) row.classList.toggle('checked', action === 'done');
  try {
    await apiRequest(`/reminders/${lineUserId}/${id}/${action}`, { method: 'POST' });
  } catch (error) {
    showError(plainError(error));
  }
  await reloadTasks();
}

function handleTaskListClick(event) {
  const check = event.target.closest('[data-check]');
  if (check) return toggleReminderDone(check.dataset.check);
  const open = event.target.closest('[data-open]');
  if (open && !open.disabled) {
    const r = byId().get(open.dataset.open);
    if (r) openTaskModal(r);
    return;
  }
  const note = event.target.closest('[data-note-open]');
  if (note) {
    const n = tasks.data.notes.find((x) => x.id === note.dataset.noteOpen);
    if (n) openNoteModal(n);
  }
}

// ---- Add / edit sheet ----
function setKind(kind) {
  t.kind.querySelectorAll('.segment').forEach((b) => b.classList.toggle('active', b.dataset.kind === kind));
  t.form.hidden = kind !== 'reminder';
  t.noteForm.hidden = kind !== 'note';
}

function setRepeatMode(mode) {
  tasks.form.mode = mode;
  t.repeatMode.querySelectorAll('.segment').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  t.presets.hidden = mode === 'repeat';
  t.repeatField.hidden = mode !== 'repeat';
  t.clearTime.hidden = mode === 'repeat';
  t.dateLabel.textContent = mode === 'repeat' ? 'Starting' : 'Date';
  if (mode === 'repeat' && !t.timeInput.value) t.timeInput.value = '09:00';
  if (mode === 'repeat' && !t.dateInput.value) t.dateInput.value = tasks.selected || bangkokYmd();
}

function renderCategoryChips() {
  t.categories.innerHTML = Object.entries(CATEGORY_LABELS).map(([k, label]) =>
    `<button type="button" class="category-chip${tasks.form.category === k ? ' active' : ''}" data-category="${k}" aria-pressed="${tasks.form.category === k}">${SVG(ICONS[k], 16)}<span>${label}</span></button>`).join('');
}

function setImportance(i) {
  tasks.form.importance = i;
  t.importance.querySelectorAll('.importance-option').forEach((b) => {
    const on = Number(b.dataset.importance) === i;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  t.importanceHelp.textContent = IMPORTANCE_HELP[i];
}

function applyPreset(preset) {
  const now = new Date();
  let at;
  if (preset === 'hour') at = new Date(Math.ceil((now.getTime() + 3600000) / 300000) * 300000);
  else if (preset === 'evening') at = new Date(`${bangkokYmd()}T18:00:00+07:00`);
  else at = new Date(`${addDays(bangkokYmd(), 1)}T09:00:00+07:00`);
  t.dateInput.value = bkkYmdOf(at.toISOString());
  t.timeInput.value = bkkTime(at.toISOString());
}

function refreshPresets() {
  const evening = t.presets.querySelector('[data-preset="evening"]');
  evening.hidden = new Date() >= new Date(`${bangkokYmd()}T17:30:00+07:00`);
}

function openTaskModal(reminder = null) {
  tasks.editing = reminder;
  clearModalError(t.error);
  t.kind.hidden = !!reminder;
  setKind('reminder');
  t.title.value = reminder ? reminder.title : '';
  t.details.value = reminder ? reminder.details || '' : '';
  tasks.form.category = reminder ? reminder.category : null;
  renderCategoryChips();
  setImportance(reminder ? reminder.importance : 0);
  const at = reminder ? reminder.anchor_at || reminder.remind_at : null;
  t.dateInput.value = at ? bkkYmdOf(at) : (!reminder && tasks.selected && tasks.selected !== bangkokYmd() ? tasks.selected : '');
  t.timeInput.value = at ? bkkTime(at) : '';
  t.repeat.value = reminder && reminder.repeat !== 'none' ? reminder.repeat : 'daily';
  setRepeatMode(reminder && reminder.repeat !== 'none' ? 'repeat' : 'once');
  refreshPresets();
  t.del.hidden = !reminder;
  t.save.textContent = reminder ? 'Save' : 'Add';
  t.modal.hidden = false;
  if (!reminder) setTimeout(() => t.title.focus(), 50);
}

function closeTaskModal() {
  t.modal.hidden = true;
  tasks.editing = null;
  tasks.editingNote = null;
}

async function handleTaskSubmit(event) {
  event.preventDefault();
  clearModalError(t.error);
  const title = t.title.value.trim();
  if (!title) return showModalError(t.error, 'Add what to remind you about.');
  const repeat = tasks.form.mode === 'repeat' ? t.repeat.value : 'none';
  const remindAt = toRemindAt(t.dateInput.value, t.timeInput.value);
  if (repeat !== 'none' && !remindAt) return showModalError(t.error, 'A repeating reminder needs a start date and time.');
  const body = { title, details: t.details.value.trim() || null, category: tasks.form.category, importance: tasks.form.importance };
  const r = tasks.editing;
  if (!r) Object.assign(body, { repeat, remind_at: remindAt });
  else {
    // Only send the time when it changed: re-sending a past time is refused.
    const before = r.anchor_at || r.remind_at;
    const sameTime = (before ? new Date(before).toISOString() : null) === remindAt;
    if (!sameTime || r.repeat !== repeat) Object.assign(body, { repeat, remind_at: remindAt });
  }
  t.save.disabled = true;
  try {
    if (r) await apiRequest(`/reminders/${lineUserId}/${r.id}`, { method: 'PUT', body: JSON.stringify(body) });
    else await apiRequest(`/reminders/${lineUserId}`, { method: 'POST', body: JSON.stringify(body) });
    closeTaskModal();
    if (remindAt && !r) tasks.selected = bkkYmdOf(remindAt);
    await reloadTasks();
  } catch (error) {
    showModalError(t.error, plainError(error));
  } finally {
    t.save.disabled = false;
  }
}

async function handleTaskDelete() {
  const r = tasks.editing;
  if (!r || !(await confirmAction(`Delete "${r.title}"?`))) return;
  try {
    await apiRequest(`/reminders/${lineUserId}/${r.id}`, { method: 'DELETE' });
    closeTaskModal();
    await reloadTasks();
  } catch (error) {
    showModalError(t.error, plainError(error));
  }
}

// ---- Notes ----
function openNoteModal(note = null) {
  tasks.editingNote = note;
  tasks.editing = null;
  clearModalError(t.noteError);
  t.kind.hidden = !!note;
  setKind('note');
  t.noteBody.value = note ? note.body : '';
  t.noteDate.value = note ? note.note_date : (tasks.selected || bangkokYmd());
  t.notePinned.checked = note ? note.pinned : false;
  t.noteDelete.hidden = !note;
  t.modal.hidden = false;
  if (!note) setTimeout(() => t.noteBody.focus(), 50);
}

async function handleNoteSubmit(event) {
  event.preventDefault();
  clearModalError(t.noteError);
  const body = { body: t.noteBody.value.trim(), note_date: t.noteDate.value || bangkokYmd(), pinned: t.notePinned.checked };
  if (!body.body) return showModalError(t.noteError, 'Write something first.');
  t.noteSave.disabled = true;
  try {
    const n = tasks.editingNote;
    if (n) await apiRequest(`/notes/${lineUserId}/${n.id}`, { method: 'PUT', body: JSON.stringify(body) });
    else await apiRequest(`/notes/${lineUserId}`, { method: 'POST', body: JSON.stringify(body) });
    closeTaskModal();
    tasks.selected = body.note_date;
    await reloadTasks();
  } catch (error) {
    showModalError(t.noteError, plainError(error));
  } finally {
    t.noteSave.disabled = false;
  }
}

async function handleNoteDelete() {
  const n = tasks.editingNote;
  if (!n || !(await confirmAction('Delete this note?'))) return;
  try {
    await apiRequest(`/notes/${lineUserId}/${n.id}`, { method: 'DELETE' });
    closeTaskModal();
    await reloadTasks();
  } catch (error) {
    showModalError(t.noteError, plainError(error));
  }
}

// ---- "Everything you've set" sheet ----
function renderListSheet() {
  const g = listGroups();
  t.listTabs.querySelectorAll('.segment').forEach((b) => b.classList.toggle('active', b.dataset.list === tasks.listTab));
  t.listTabs.querySelectorAll('[data-count]').forEach((s) => { s.textContent = g[s.dataset.count].length; });
  const rows = g[tasks.listTab];
  t.list.innerHTML = rows.map((r) => reminderRow(r, r.remind_at, { showDate: true })).join('');
  t.list.hidden = rows.length === 0;
  t.listEmpty.hidden = rows.length > 0;
  t.listEmpty.textContent = { next: 'Nothing coming up.', repeat: 'No repeating reminders.', todo: 'No to-dos without a time.' }[tasks.listTab];
  t.doneToggle.hidden = g.done.length === 0;
  t.doneToggle.innerHTML = `<span>Done recently</span><span class="tasks-chip">${g.done.length}</span>`;
  t.doneList.innerHTML = g.done.map((r) => reminderRow(r, null, { showDate: true })).join('');
}

function openListSheet() {
  if (!tasks.data) return;
  renderListSheet();
  t.doneList.hidden = true;
  t.doneToggle.setAttribute('aria-expanded', 'false');
  t.listModal.hidden = false;
}

// ---- Month calendar sheet ----
async function renderMonth() {
  const cursor = tasks.monthCursor;
  const [y, m] = ymdParts(cursor);
  t.monthTitle.textContent = `${MONTHS_LONG[m - 1]} ${y}`;
  // The grid's data: reuse the loaded window when it covers this month.
  let data = tasks.data;
  if (!data || gridRange(cursor).start !== data.start) {
    t.monthGrid.innerHTML = '<p class="empty-state">Loading…</p>';
    try {
      data = await fetchTasksWindow(cursor);
    } catch (error) {
      t.monthGrid.innerHTML = `<p class="empty-state">${escapeHtml(plainError(error))}</p>`;
      return;
    }
    if (cursor !== tasks.monthCursor) return;
  }
  const saved = tasks.data;
  tasks.data = data;
  const marks = daysWithItems();
  tasks.data = saved;
  const { start } = gridRange(cursor);
  const today = bangkokYmd();
  const heads = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<span class="month-head-cell">${d}</span>`).join('');
  const cells = Array.from({ length: 42 }, (_, i) => {
    const ymd = addDays(start, i);
    const k = marks.get(ymd) || new Set();
    const cls = ['month-cell', ymd.slice(0, 7) !== cursor.slice(0, 7) ? 'outside' : '', ymd === today ? 'today' : '', ymd === tasks.selected ? 'selected' : ''].join(' ');
    return `<button type="button" class="${cls}" data-ymd="${ymd}" aria-label="${longDate(ymd)}"><span>${Number(ymd.slice(8))}</span><span class="month-dots">${k.has('reminder') ? '<i class="dot dot-reminder"></i>' : ''}${k.has('note') ? '<i class="dot dot-note"></i>' : ''}${k.has('event') ? '<i class="dot dot-event"></i>' : ''}</span></button>`;
  }).join('');
  t.monthGrid.innerHTML = heads + cells;
}

function openMonthSheet() {
  tasks.monthCursor = `${(tasks.selected || bangkokYmd()).slice(0, 8)}01`;
  t.monthModal.hidden = false;
  renderMonth();
}

function shiftMonth(delta) {
  const [y, m] = ymdParts(tasks.monthCursor);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  tasks.monthCursor = d.toISOString().slice(0, 10);
  renderMonth();
}

function selectDay(ymd) {
  const reload = !tasks.data || gridRange(ymd).start !== tasks.data.start;
  tasks.selected = ymd;
  if (reload) loadTasksTab(ymd);
  else renderTasks();
}

// ---- Settings: Google Calendar ----
let awaitingCalendarReturn = false;
async function renderCalendarSettings() {
  try {
    const s = await cachedGet(`/calendar/${lineUserId}/status`);
    tasks.calendar = s;
    t.gcalConnect.hidden = s.connected || !s.configured;
    t.gcalDisconnect.hidden = !s.connected;
    t.gcalText.textContent = s.connected
      ? `Connected${s.email ? ` as ${s.email}` : ''}. Your events show under Tasks (read-only).`
      : s.configured
        ? 'Show your Google Calendar events under Tasks. Read-only: the app never changes your calendar or stores your events.'
        : 'Google Calendar is not set up on this server yet.';
  } catch (error) {
    t.gcalText.textContent = plainError(error);
  }
}

function setGcalStatus(text, isError = false) {
  t.gcalStatus.hidden = !text;
  t.gcalStatus.textContent = text || '';
  t.gcalStatus.classList.toggle('scan-error', isError);
}

async function handleCalendarConnect() {
  setGcalStatus('Opening Google sign-in in your browser…');
  try {
    const r = await apiRequest(`/calendar/${lineUserId}/login-url`);
    awaitingCalendarReturn = true;
    liff.openWindow({ url: r.login_url, external: true });
    setGcalStatus('After connecting, switch back to this tab.');
  } catch (error) {
    setGcalStatus(plainError(error), true);
  }
}

async function handleCalendarDisconnect() {
  if (!(await confirmAction('Disconnect Google Calendar? Your events will stop showing under Tasks.', 'Disconnect'))) return;
  try {
    await apiRequest(`/calendar/${lineUserId}`, { method: 'DELETE' });
    tasks.calendar = null;
    tasks.data = null;
    setGcalStatus('Disconnected.');
    await renderCalendarSettings();
  } catch (error) {
    setGcalStatus(plainError(error), true);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !awaitingCalendarReturn) return;
  awaitingCalendarReturn = false;
  getCache.clear();
  tasks.calendar = null;
  setGcalStatus('');
  renderCalendarSettings();
});

// ---- Wiring ----
t.week.addEventListener('click', (e) => { const b = e.target.closest('[data-ymd]'); if (b) selectDay(b.dataset.ymd); });
t.timeline.addEventListener('click', handleTaskListClick);
t.todos.addEventListener('click', handleTaskListClick);
t.notes.addEventListener('click', handleTaskListClick);
t.addNote.addEventListener('click', () => openNoteModal(null));
t.summary.addEventListener('click', openListSheet);
t.monthButton.addEventListener('click', openMonthSheet);
t.kind.addEventListener('click', (e) => {
  const b = e.target.closest('[data-kind]');
  if (!b) return;
  if (b.dataset.kind === 'note') openNoteModal(null);
  else openTaskModal(null);
});
t.repeatMode.addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) setRepeatMode(b.dataset.mode); });
t.presets.addEventListener('click', (e) => { const b = e.target.closest('[data-preset]'); if (b) applyPreset(b.dataset.preset); });
t.clearTime.addEventListener('click', () => { t.dateInput.value = ''; t.timeInput.value = ''; });
t.categories.addEventListener('click', (e) => {
  const b = e.target.closest('[data-category]');
  if (!b) return;
  tasks.form.category = tasks.form.category === b.dataset.category ? null : b.dataset.category;
  renderCategoryChips();
});
t.importance.addEventListener('click', (e) => { const b = e.target.closest('[data-importance]'); if (b) setImportance(Number(b.dataset.importance)); });
t.form.addEventListener('submit', handleTaskSubmit);
t.cancel.addEventListener('click', closeTaskModal);
t.del.addEventListener('click', handleTaskDelete);
t.noteForm.addEventListener('submit', handleNoteSubmit);
t.noteCancel.addEventListener('click', closeTaskModal);
t.noteDelete.addEventListener('click', handleNoteDelete);
t.listTabs.addEventListener('click', (e) => { const b = e.target.closest('[data-list]'); if (b) { tasks.listTab = b.dataset.list; renderListSheet(); } });
t.list.addEventListener('click', (e) => {
  const check = e.target.closest('[data-check]');
  if (check) { toggleReminderDone(check.dataset.check).then(() => tasks.data && renderListSheet()); return; }
  const open = e.target.closest('[data-open]');
  if (open && !open.disabled) { t.listModal.hidden = true; openTaskModal(byId().get(open.dataset.open)); }
});
t.doneList.addEventListener('click', (e) => {
  const check = e.target.closest('[data-check]');
  if (check) toggleReminderDone(check.dataset.check).then(() => tasks.data && renderListSheet());
});
t.doneToggle.addEventListener('click', () => {
  const open = t.doneList.hidden;
  t.doneList.hidden = !open;
  t.doneToggle.setAttribute('aria-expanded', String(open));
});
t.closeList.addEventListener('click', () => { t.listModal.hidden = true; });
t.monthPrev.addEventListener('click', () => shiftMonth(-1));
t.monthNext.addEventListener('click', () => shiftMonth(1));
t.monthToday.addEventListener('click', () => { t.monthModal.hidden = true; selectDay(bangkokYmd()); });
t.monthGrid.addEventListener('click', (e) => { const b = e.target.closest('[data-ymd]'); if (b) { t.monthModal.hidden = true; selectDay(b.dataset.ymd); } });
t.monthModal.addEventListener('click', (e) => { if (e.target === t.monthModal) t.monthModal.hidden = true; });
t.gcalConnect.addEventListener('click', handleCalendarConnect);
t.gcalDisconnect.addEventListener('click', handleCalendarDisconnect);
