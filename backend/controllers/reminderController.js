// REST for reminders and notes (migration 020). Every route is scoped to the
// authenticated :line_user_id (router.param requireOwnUser).
const store = require('../services/reminderStore');
const { occurrencesBetween } = require('../services/reminderMath');
const { getBangkokYmd, bangkokMidnight, bangkokParts } = require('../services/bangkokDay');

const bad = (res, error) => res.status(400).json({ error });
const DAY = 86400000;

// ?from=&to= (ISO) -> a window of at most 62 days; default: this Bangkok week +- 31 days.
function windowOf(query) {
  const now = new Date();
  const { year, month, day } = bangkokParts(now);
  const from = query.from ? new Date(query.from) : new Date(bangkokMidnight(year, month, day).getTime() - 31 * DAY);
  const to = query.to ? new Date(query.to) : new Date(from.getTime() + 62 * DAY);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return { error: 'from and to must be ISO date-times with from before to' };
  if (to - from > 62 * DAY) return { error: 'The window can be at most 62 days' };
  return { from, to };
}

// Group reminders the user is only mentioned in can be acted on (Done,
// Snooze) but only their creator edits or deletes them.
async function loadOwn(req, res, { ownerOnly = false } = {}) {
  const r = await store.getReminder(req.params.reminder_id);
  const userId = req.params.line_user_id;
  if (!r || !(r.line_user_id === userId || (r.group_id && r.mention_ids.includes(userId)))) {
    res.status(404).json({ error: 'Reminder not found' });
    return null;
  }
  if (ownerOnly && r.line_user_id !== userId) {
    res.status(403).json({ error: 'Only the person who set this reminder can change it' });
    return null;
  }
  return r;
}

const withOccurrences = (reminders, from, to) => ({
  reminders,
  occurrences: reminders.flatMap((r) => occurrencesBetween(r, from, to).map((at) => ({ reminder_id: r.id, at: at.toISOString() }))),
});

const reminderController = {
  // GET /api/reminders/:u?from&to -> open reminders, ones done in the window,
  // and every occurrence inside the window (repeats expanded).
  async list(req, res) {
    try {
      const w = windowOf(req.query);
      if (w.error) return bad(res, w.error);
      const reminders = await store.listForUser(req.params.line_user_id, { fromISO: w.from.toISOString(), toISO: w.to.toISOString() });
      res.json(withOccurrences(reminders, w.from, w.to));
    } catch (error) {
      console.error('Error in listReminders:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // POST /api/reminders/:u { title, details?, category?, importance?, repeat?, remind_at? }
  async create(req, res) {
    try {
      const { reminder, error } = await store.createReminder(req.params.line_user_id, req.body || {});
      if (error) return bad(res, error);
      res.status(201).json({ success: true, reminder });
    } catch (error) {
      console.error('Error in createReminder:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // PUT /api/reminders/:u/:reminder_id
  async update(req, res) {
    try {
      const r = await loadOwn(req, res, { ownerOnly: true });
      if (!r) return;
      const { reminder, error } = await store.updateReminder(r, req.body || {});
      if (error) return bad(res, error);
      res.json({ success: true, reminder });
    } catch (error) {
      console.error('Error in updateReminder:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // DELETE /api/reminders/:u/:reminder_id (unknown id: success, like other deletes)
  async remove(req, res) {
    try {
      const r = await store.getReminder(req.params.reminder_id);
      if (r && r.line_user_id === req.params.line_user_id) await store.deleteReminder(r.id);
      else if (r && r.group_id && r.mention_ids.includes(req.params.line_user_id)) {
        return res.status(403).json({ error: 'Only the person who set this reminder can delete it' });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error in deleteReminder:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // POST /api/reminders/:u/:reminder_id/(done|snooze|stop|reopen) { minutes? }
  async act(req, res) {
    try {
      const { action } = req.params;
      if (!['done', 'snooze', 'stop', 'reopen'].includes(action)) return res.status(404).json({ error: 'Unknown action' });
      const r = await loadOwn(req, res);
      if (!r) return;
      const minutes = req.body && req.body.minutes !== undefined ? Number(req.body.minutes) : undefined;
      const { reminder, error } = await store.act(r, action, new Date(), minutes !== undefined ? { minutes } : {});
      if (error) return bad(res, error);
      res.json({ success: true, reminder });
    } catch (error) {
      console.error('Error in reminder action:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // ---- Notes ----
  // GET /api/notes/:u?from=YYYY-MM-DD&to=YYYY-MM-DD
  async listNotes(req, res) {
    try {
      const ymd = /^\d{4}-\d{2}-\d{2}$/;
      const { from, to } = req.query;
      if ((from && !ymd.test(from)) || (to && !ymd.test(to))) return bad(res, 'from and to must be YYYY-MM-DD');
      res.json({ notes: await store.listNotes(req.params.line_user_id, { from, to }) });
    } catch (error) {
      console.error('Error in listNotes:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // POST /api/notes/:u { body, note_date?, pinned? }
  async createNote(req, res) {
    try {
      const { note, error } = await store.createNote(req.params.line_user_id, req.body || {}, getBangkokYmd());
      if (error) return bad(res, error);
      res.status(201).json({ success: true, note });
    } catch (error) {
      console.error('Error in createNote:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // PUT /api/notes/:u/:note_id
  async updateNote(req, res) {
    try {
      const { note, error } = await store.updateNote(req.params.line_user_id, req.params.note_id, req.body || {});
      if (error) return bad(res, error);
      if (!note) return res.status(404).json({ error: 'Note not found' });
      res.json({ success: true, note });
    } catch (error) {
      console.error('Error in updateNote:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // DELETE /api/notes/:u/:note_id
  async deleteNote(req, res) {
    try {
      await store.deleteNote(req.params.line_user_id, req.params.note_id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error in deleteNote:', error);
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = reminderController;
