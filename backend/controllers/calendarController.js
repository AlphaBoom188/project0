// Read-only Google Calendar (services/googleCalendar.js).
const gcal = require('../services/googleCalendar');

const DAY = 86400000;

const calendarController = {
  // GET /api/calendar/:u/status -> { connected, email }
  async status(req, res) {
    try {
      const link = await gcal.loadLink(req.params.line_user_id);
      let configured = true;
      try { require('../services/googleOAuth').requireConfig(); } catch { configured = false; }
      res.json({ configured, connected: !!link, email: link ? link.gcal_email : null });
    } catch (error) {
      console.error('Error in calendar status:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // GET /api/calendar/:u/login-url (open with liff.openWindow({ external: true }))
  loginUrl(req, res) {
    try {
      res.json({ success: true, login_url: gcal.buildCalendarAuthUrl(req.params.line_user_id) });
    } catch (error) {
      if (error.notConfigured) return res.status(501).json({ error: error.message });
      console.error('Error in calendar loginUrl:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // GET /api/calendar/:u/events?from&to (ISO, at most 62 days)
  async events(req, res) {
    try {
      const from = new Date(req.query.from);
      const to = new Date(req.query.to);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from || to - from > 62 * DAY) {
        return res.status(400).json({ error: 'from and to must be ISO date-times, at most 62 days apart' });
      }
      res.json({ events: await gcal.listEvents(req.params.line_user_id, from.toISOString(), to.toISOString()) });
    } catch (error) {
      if (error instanceof gcal.NotLinkedError) return res.status(409).json({ error: error.message, code: 'calendar_not_connected' });
      if (error.notConfigured) return res.status(501).json({ error: error.message });
      console.warn(`[gcal] events failed (${error.message})`);
      res.status(502).json({ error: "Couldn't reach Google Calendar. Try again in a moment." });
    }
  },

  // DELETE /api/calendar/:u
  async disconnect(req, res) {
    try {
      await gcal.unlinkCalendar(req.params.line_user_id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error in calendar disconnect:', error);
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = calendarController;
