# Email export relay (Google Apps Script)

The backend has no email-sending infrastructure of its own. The "Email CSV"
feature in LIFF Settings works by POSTing a base64 CSV to a Google Apps
Script Web App, which sends it through *your* Gmail account via
`GmailApp.sendEmail`.

## 1. Create the script

1. Go to [script.google.com](https://script.google.com) → New project.
2. Replace the default code with:

```javascript
// Set this once: Project Settings -> Script Properties -> add SHARED_SECRET
// with a long random value. Never hardcode it in the script body, since the
// script source isn't private the way an .env file is.
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var expectedSecret = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');

    if (!expectedSecret || payload.secret !== expectedSecret) {
      return respond({ success: false, error: 'Unauthorized' });
    }
    if (!payload.to || !payload.csvBase64) {
      return respond({ success: false, error: 'to and csvBase64 are required' });
    }

    var blob = Utilities.newBlob(
      Utilities.base64Decode(payload.csvBase64),
      'text/csv',
      payload.filename || 'export.csv'
    );

    GmailApp.sendEmail(payload.to, payload.subject || 'Your Expense Export', 'Your requested expense export is attached.', {
      attachments: [blob],
    });

    return respond({ success: true });
  } catch (error) {
    return respond({ success: false, error: error.message });
  }
}

function respond(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
```

3. **Project Settings** (gear icon) → **Script Properties** → add a property
   named `SHARED_SECRET` with a long random value you generate yourself. This
   is required -- without it, anyone who finds your Web App URL could send
   email through your Gmail account with arbitrary attachments.

## 2. Deploy as a Web App

1. **Deploy** → **New deployment** → type **Web app**.
2. Execute as: **Me**. Who has access: **Anyone** (the shared-secret check is
   what actually gates access, not this setting -- Apps Script doesn't offer
   a "authenticated API callers only" option for this trigger type).
3. Deploy, authorize the permissions it asks for (it needs Gmail send access),
   and copy the resulting URL (`https://script.google.com/macros/s/.../exec`).

## 3. Configure the backend

In `backend/.env`:

```
APPS_SCRIPT_EMAIL_WEBHOOK_URL=https://script.google.com/macros/s/.../exec
APPS_SCRIPT_SHARED_SECRET=<the same random value you put in Script Properties>
```

Restart the backend. The Settings screen's "Email CSV" button will now
actually send; until these are set, it returns a clear "not configured yet"
error instead of failing silently.

## Notes

- Emails send from *your* Gmail account (whoever deployed the script), with
  a daily quota (~100/day on a free Gmail account, higher on Workspace).
  Fine for a personal/small-scale tool; not meant for high volume.
- Redeploying the script (vs. managing versions) changes the Web App URL --
  update `APPS_SCRIPT_EMAIL_WEBHOOK_URL` if that happens.
