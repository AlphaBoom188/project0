# Production Readiness

Goal: a product that serves hundreds, then thousands, of users reliably. This file tracks what's done, how the app runs today, and what's planned (owner decisions from 2026-11-19).

## How it runs today (self-hosted on the owner's Mac)

| Piece | How |
|---|---|
| Backend | `node backend/index.js` on port 3000 |
| Public URL | ngrok **static** free domain (`https://<domain>.ngrok-free.dev`); LINE webhook, LIFF endpoint and Google redirect point here, so restarts don't change them |
| Supervision | `deploy/macos/install.sh <domain>` installs three LaunchAgents: backend and tunnel (restart on crash, start at login) and keep-awake (`caffeinate -s -i`: no sleep on AC power). Logs go to `~/Library/Logs/expense-tracker/`. `deploy/macos/uninstall.sh` reverses it. |
| Database | Supabase (free tier). It pauses when idle and keeps no backups of its own, so `jobs/nightlyBackup.js` copies the database and storage to `~/Backups/expense-tracker` at 03:00 (last 14 kept; `npm run backup` by hand; restore with `node scripts/restore.js <folder> [--confirm] [--user <id>]`). |

**Before installing the services:** stop the backend and ngrok you started by hand (port 3000 must be free), then run the installer with your static domain.

## Done (Phase 1: code)

- **Ops agent** (`backend/services/opsAgent.js`, migration 017):
  - Records every logged error (it wraps `console.error`, plus unhandled rejections and uncaught exceptions), grouped by fingerprint in `error_events`.
  - A 5-minute watchdog checks the database and classifies each error. Small ones are marked handled: transient upstream timeouts, 429s and 5xxs, the post-migration schema-cache blip, a known error recurring a little.
  - Big ones go to the owner's LINE (`OWNER_LINE_USER_ID`): crashes, failed jobs, a new kind of error, repeats of 5 or more in 15 minutes, a dependency failing 20 or more times, a missing table after 15 minutes, a spike of 50 or more, or the database unreachable for 10 minutes. There's a 6-hour cooldown per problem.
  - With `ANTHROPIC_API_KEY` set and `@anthropic-ai/sdk` installed, each alert includes a short diagnosis from Claude Opus 5.5 (effort `low`, server-side refusal fallback enabled). Without them, alerts are a structured summary.
- **Run-once jobs:** `opsAgent.runOnce(job, slot)` plus the `job_runs` primary key, so the digest, recurring rules, reminders and the watchdog run once per slot even across restarts or several processes. If the table is missing, jobs still run (unguarded).
- **Startup checks:** a missing required setting exits with a clear message.
- **Graceful shutdown on SIGTERM/SIGINT:** stop cron, finish in-flight requests, flush the error buffer.
- **Security headers** (`nosniff`, referrer policy, permissions policy), no `X-Powered-By`, and **CORS off by default** (`CORS_ORIGINS` to allow).
- **Composite index** `transactions(line_user_id, transaction_date DESC)` for the main read path.
- **Delete my account (PDPA):** `DELETE /api/users/:u` with `{ confirm: "DELETE" }` erases every table and the receipt thumbnails; Settings → Danger Zone → Delete My Account (two confirmations).
- **Group-ledger consent** (migration 018): group shares reach personal ledgers only for app users who haven't opted out.
- Earlier the same day: **API authentication** (LINE tokens), **rate limits** on paid AI endpoints, the security-review fixes. See `FEATURES.md`.

## To do now (owner)

1. Run migration `017_ops_watchdog.sql`, then `NOTIFY pgrst, 'reload schema';`.
2. Stop the hand-started backend and ngrok, then run `deploy/macos/install.sh <your-static-domain>`.
3. Set up a free external uptime monitor (e.g. UptimeRobot) on `https://<domain>/health` with email alerts. The ops agent can't alert you if the whole Mac or tunnel is down.
4. Optional: add `ANTHROPIC_API_KEY` to `backend/.env` and run `npm install @anthropic-ai/sdk` in `backend/` for AI diagnoses in alerts.

## Planned

**Before real growth (hundreds of users):**
- **Supabase Pro** (no pausing, daily backups; consider point-in-time recovery).
- **A LINE Official Account plan** sized to push volume (digest, reminders, alerts).
- **OpenAI monthly spend limit** and billing alerts.

**Moving off the Mac:**
- **Render, Singapore** (the earlier recommendation): Docker web service, auto-deploy from GitHub, the host's subdomain first, then the owner's domain.
- Set `AUTH_TEST_BYPASS=false` there.
- Update the LINE webhook, the LIFF endpoint and the Google redirect URL.

**More than one server instance:**
- Move in-memory state to Postgres (or Redis): the bot's pending Confirm/Cancel (`pendingConfirmations.js`) and the rate-limit buckets (`rateLimit.js`).
- Caches can stay per instance: the token cache, the group cache, `seen` members.
- The cron jobs are already safe via `job_runs`.

**Operations:**
- An ops **dashboard** (owner: future) over `error_events`, `ops_alerts`, `job_runs` and usage.
- A **full AI ops agent** (owner: future): Claude investigates each new error type (logs and code) and proposes fixes, behind human approval.
- Log rotation for `~/Library/Logs/expense-tracker/`, and an orphaned-thumbnail sweep.

**Privacy and legal:**
- **Finalize the legal pages** (drafts exist in English and Thai: `liff-app/privacy.html`, `privacy-th.html`, `terms.html`, `terms-th.html`). Fill in the [bracketed] items (operator name, address, contact email, bot name, Supabase region, effective date, backup retention), have them reviewed under Thai law, remove the draft notices, then set the privacy policy URL in the LINE Developers Console (LIFF app and Official Account).
- A data export for users (PDPA access right), building on the CSV export.
