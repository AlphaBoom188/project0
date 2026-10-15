// Sends an email with a CSV attachment via a Google Apps Script Web App acting
// as the relay (it sends through the deploying user's own Gmail account via
// GmailApp.sendEmail -- see docs/APPS_SCRIPT_EMAIL_RELAY.md for the script to
// deploy and APPS_SCRIPT_EMAIL_WEBHOOK_URL/APPS_SCRIPT_SHARED_SECRET setup).
async function sendCsvByEmail({ to, subject, filename, csv }) {
  const webhookUrl = process.env.APPS_SCRIPT_EMAIL_WEBHOOK_URL;
  if (!webhookUrl) {
    const err = new Error('Email export is not configured yet. Set APPS_SCRIPT_EMAIL_WEBHOOK_URL in .env.');
    err.notConfigured = true;
    throw err;
  }

  // Apps Script Web Apps can be slow to cold-start; give this more room than
  // the other outbound calls in this codebase.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  let response;
  try {
    response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: process.env.APPS_SCRIPT_SHARED_SECRET || '',
        to,
        subject,
        filename,
        // Field name matches the deployed Apps Script's data.csv_base64 (snake_case,
        // not csvBase64 -- see docs/APPS_SCRIPT_EMAIL_RELAY.md for the deployed script).
        // UTF-8 BOM prefix so Thai text renders correctly once the attachment is opened.
        csv_base64: Buffer.from('\uFEFF' + csv, 'utf8').toString('base64'),
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    throw new Error(body.error || `Email relay request failed (${response.status})`);
  }
}

module.exports = { sendCsvByEmail };
