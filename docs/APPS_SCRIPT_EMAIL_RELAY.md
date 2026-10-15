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
    var data = JSON.parse(e.postData.contents);

    var expectedSecret = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');
    if (data.secret !== expectedSecret) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Unauthorized' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var csvBlob = Utilities.newBlob(
      Utilities.base64Decode(data.csv_base64),
      'text/csv',
      data.filename || 'transactions.csv'
    );

    MailApp.sendEmail({
      to: data.to,
      subject: data.subject || 'Parnuan - Transaction Report',
      body: data.body || 'Here is your requested transaction export file.',
      attachments: [csvBlob]
    });

    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

**Payload contract** (the exact field names the backend sends and this script
expects — mismatching these, e.g. `csvBase64` vs `csv_base64`, is the single
most likely thing to break silently or with a confusing "Argument must not be
null" error if either side is ever rewritten from scratch):

| Field | Sent by backend (`services/emailRelay.js`) | Read by script (`data.*`) |
|---|---|---|
| `secret` | `APPS_SCRIPT_SHARED_SECRET` | `data.secret` |
| `to` | recipient address | `data.to` |
| `subject` | `"Your Expense Export"` | `data.subject` |
| `filename` | `transactions-<line_user_id>.csv` | `data.filename` |
| `csv_base64` | base64-encoded CSV, BOM-prefixed | `data.csv_base64` |

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
- **To update already-deployed code**: use **Deploy → Manage deployments →
  edit the existing deployment → New version**. Clicking **Deploy → New
  deployment** instead creates a *second, separate* `/exec` URL — your edits
  won't take effect at the URL already configured in `.env`, and you'll see
  confusingly inconsistent behavior (old code still running) until you either
  update `.env` to the new URL or redo the edit via "Manage deployments".
