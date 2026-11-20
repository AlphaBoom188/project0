const { verifyState } = require('../services/lineAuth');
const supabase = require('../config/supabase');
const { buildAuthUrl, exchangeCodeForVerifiedEmail } = require('../services/googleOAuth');
const gcal = require('../services/googleCalendar');

const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function htmlPage(rawTitle, rawMessage) {
  const title = escapeHtml(rawTitle);
  const message = escapeHtml(rawMessage);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title><style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:24px;text-align:center;background:#f4f5f7;color:#1a1a1a;}</style></head>
<body><div><h2>${title}</h2><p>${message}</p></div></body></html>`;
}

const googleController = {
  // GET /api/google/login-url/:line_user_id -- opened via liff.openWindow({ url, external: true }),
  // never inline inside the LIFF webview (see services/googleOAuth.js header comment).
  getLoginUrl(req, res) {
    try {
      const { line_user_id } = req.params;
      const loginUrl = buildAuthUrl(line_user_id);
      res.json({ success: true, login_url: loginUrl });
    } catch (error) {
      if (error.notConfigured) return res.status(501).json({ error: error.message });
      console.error('Error in getLoginUrl:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // GET /api/google/callback -- runs in the system browser, not LIFF, so this
  // responds with a plain HTML page (no JSON, nothing to parse it) rather than
  // trying to hand control back into the LIFF app directly. The Settings tab
  // picks up the new google_email next time it loads.
  async handleCallback(req, res) {
    try {
      const { code, state } = req.query;
      if (!code || !state) {
        return res.status(400).send(htmlPage('Something went wrong', 'Missing code or state. You can close this tab and try again.'));
      }
      const stateValue = verifyState(state);
      if (!stateValue) {
        return res.status(400).send(htmlPage('Link expired', 'This sign-in link is invalid or has expired. Go back to the app and tap Connect Google again.'));
      }
      // Calendar consent (services/googleCalendar.js) shares this redirect URI.
      if (stateValue.startsWith('gcal:')) {
        const email = await gcal.linkCalendar(stateValue.slice(5), code);
        return res.send(htmlPage('Google Calendar connected', `${email ? `${email}: your` : 'Your'} events now show under Tasks in the app (read-only). You can close this tab.`));
      }
      const lineUserId = stateValue;

      const email = await exchangeCodeForVerifiedEmail(code);

      const { error } = await supabase
        .from('users')
        .update({ google_email: email, google_linked_at: new Date().toISOString() })
        .eq('line_user_id', lineUserId);
      if (error) throw error;

      res.send(htmlPage('Google account connected', `${email} will be used for CSV exports. You can close this tab and return to the app.`));
    } catch (error) {
      console.error('Error in Google handleCallback:', error);
      res.status(500).send(htmlPage('Could not connect Google account', `${error.message} You can close this tab and try again.`));
    }
  },
};

module.exports = googleController;
