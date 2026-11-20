# Expense Tracker -- Development Guide

A Thai personal-finance app. **Backend:** Node.js/Express on Supabase (Postgres). **Clients:** a LINE MINI App (LIFF, `liff-app/`, the main client), a LINE Bot (chat, voice, receipt photos, group bill collection), and an older SwiftUI iOS app. LINE Login is the only identity; `line_user_id` is the primary key everywhere.

Detailed per-feature notes (design decisions, edge cases, how each was verified) live in **`docs/FEATURES.md`**. How production runs and what's planned: **`docs/PRODUCTION.md`**. Read the relevant section there before changing a feature. This file covers what every session needs.

## Run it

```bash
cd backend
npm install
cp .env.example .env   # fill in credentials
npm start              # port 3000; also serves the LIFF app at /liff and runs the cron jobs
```

**Environment (`backend/.env`):**
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: the backend is trusted and bypasses RLS, so **every query must scope by `line_user_id`** itself. Never ship this key to a client.
- `OPENAI_API_KEY` (with billing): receipt OCR, text/voice expense parsing, auto-categorization, statement categories, voice fallback.
- `LINE_MESSAGING_CHANNEL_SECRET` + `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` (bot), `LINE_LOGIN_*` (iOS login), `LIFF_ID`.
- Optional: `TYPHOON_API_KEY` (Thai speech-to-text, else OpenAI); `GOOGLE_OAUTH_*` (verified export email and read-only Google Calendar, else 501; `GCAL_TOKEN_KEY` optionally keys the calendar-token encryption); `APPS_SCRIPT_EMAIL_WEBHOOK_URL` + `APPS_SCRIPT_SHARED_SECRET` (CSV email relay, see `docs/APPS_SCRIPT_EMAIL_RELAY.md`, else 501).
- `DISABLE_CRON=1` for any extra server instance (below). It also skips the ops agent there.
- `OWNER_LINE_USER_ID` (who gets production alerts on LINE); optional `ANTHROPIC_API_KEY` (adds a Claude diagnosis to alerts; needs `@anthropic-ai/sdk`); `OPS_AGENT=off`; `CORS_ORIGINS`.
- `AUTH_TEST_BYPASS=false` removes the local `test_` bypass, e.g. behind a proxy that doesn't add `X-Forwarded-For`.
- `AUTH_REQUIRED=false` disables API authentication (default on; see Conventions). `EXPORT_LINK_SECRET` is optional; by default it's derived from the service role key.

**LINE setup:** the LIFF app's scopes must include **openid**, or `liff.getIDToken()` returns null and every API call gets 401. Then a public HTTPS tunnel (e.g. `ngrok http 3000`). Register the webhook as `https://<tunnel>/api/line/webhook` and the LIFF endpoint as `https://<tunnel>/liff/`. The LINE Login and Messaging API channels must be linked, so app logins and webhook events share one `line_user_id`. Group chats need "Allow bot to join group chats" turned on.

**After a migration**, PostgREST may 500 with `Could not find the table ... in the schema cache` for about a minute. Run `NOTIFY pgrst, 'reload schema';` in the SQL Editor to clear it immediately.

## Tests

```bash
cd backend
npm start                 # in another terminal; suites go through the real HTTP API
npm test                  # api + liff suites, free (~6 min)
npm test -- statement     # only suites whose path contains "statement"
npm test -- -v            # full output
npm run test:openai       # tests/openai/: real OpenAI calls (a few cents)
```

- **Auth in tests.** Requests for `test_…` users made directly on this machine (loopback, no `X-Forwarded-For`) skip the LINE token check, so suites must use `test_` ids for any HTTP call. Random `U<hex>` ids are fine only for in-process webhook tests.
- **Real database.** Suites run against the Supabase project in `.env`. Create only `test_`-prefixed or random `U<hex>` users, delete everything you create, and never call a job's all-users entry point unscoped (`processDueRecurringTransactions`, `sendDailyDigest`, `sendActivityReminder` and `sendPayWindowReminders` take `{ lineUserId }`).
- **Testing changed backend code:** run a second instance with `DISABLE_CRON=1 PORT=3100 node index.js` and `TEST_BASE_URL=http://localhost:3100 npm test`. `DISABLE_CRON=1` is mandatory: two processes running the jobs means users get every LINE push twice.
- **Layout:**
  - `tests/api/`: REST, pure-math and webhook-with-stubs suites.
  - `tests/liff/`: headless Chrome via `playwright-core` (`channel: 'chrome'`). They route `static.line-scdn.net` to a stub `liff` object, which is how LIFF code is tested without a phone.
  - `tests/openai/`: paid, opt-in suites.
  - `tests/fixtures/`: synthetic data only (receipt, Thai voice m4a, KBank/BBL statement builders that also write real PDFs, group seed).
  - `tests/.output/`: screenshots (gitignored).
  - `tests/lib.js`: `BASE`, `BACKEND`, `FIXTURES`, `OUTPUT`.
- **Suite contract:** a plain Node script that prints `PASS:` / `FAIL:` lines and exits non-zero on failure. A suite with zero PASS lines counts as failed.
- **Headless gotchas:** `getUserMedia` hangs in headless Chrome on macOS, so `liff/voice_entry` fakes the mic with a WebAudio stream. Elements inside a hidden sheet count as hidden: wait for the sheet before asserting. Assert from the API's own figures where the calendar matters (e.g. dividends projected "this year").
- **Not included on purpose:** a real-email export test, the old full OCR harness (covered by `openai/line_webhook`), password-protected statement PDFs (needs a library to generate).

## Conventions and gotchas

- **Asia/Bangkok calendar everywhere.** Every day, week, month and billing-cycle boundary is Bangkok midnight, never UTC. The backend uses `services/bangkokDay.js` (`bangkokParts`, `bangkokMidnight`, `getBangkokDayRangeISO`, `getBangkokYmd`); `liff-app/app.js` mirrors it. Bangkok has no DST, so +7h is exact. Form dates are stamped `T12:00:00Z` (19:00 Bangkok, same date). Transaction-list day headers and the streak use the phone's local time.
- **API authentication** (`services/lineAuth.js`):
  - Every router registers `router.param('line_user_id', requireOwnUser)`, and `POST /api/users` uses `requireBodyUser`. The request must carry `Authorization: Bearer <token>` for that user: a LIFF **ID token** (verified with LINE against the LIFF_ID prefix channel or `LINE_LOGIN_CHANNEL_ID`) or a LINE Login **access token**. Verified tokens are cached until they expire.
  - Outcomes: 401 `auth_invalid` for a missing or invalid token, 403 `forbidden` for someone else's id, 503 if LINE can't be reached.
  - Public by design: `/health`, the LINE webhook (it has its own signature check), LINE/Google login and callbacks, and `/bills/public/*`.
  - CSV download is a navigation and can't send headers, so the app first `POST`s `/transactions/:u/export-link`, which returns the query HMAC-signed for 2 minutes.
  - The LIFF app sends `liff.getIDToken()` from `apiRequest()`. A 401 `auth_invalid` triggers one silent `liff.login()`, guarded against loops.
  - The iOS app stores the LINE access token from `/line/callback` in the Keychain (`KeychainStore.swift`) and sends it on every request. On a 401 it logs out to the login screen.
- **Ops agent** (`services/opsAgent.js`, migration 017): `console.error` is wrapped, so every logged error is recorded in `error_events` without changes at call sites. A 5-minute watchdog alerts the owner on LINE about big problems (6-hour cooldown per problem) and quietly handles small ones. Run scheduled jobs through `opsAgent.runOnce(job, slot, fn)` (the `job_runs` primary key makes each slot run once). Log failures with `console.error` so they're captured, and prefix a job's errors with `job:` to mark them critical.
- **Startup and shutdown:** required settings are checked at boot (exit with a clear message). SIGTERM/SIGINT stops cron, finishes in-flight requests and flushes the error buffer. Security headers are on, and CORS is off unless `CORS_ORIGINS` is set.
- **Rate limits** (`services/rateLimit.js`, in memory, per user, per 10 minutes) on everything that spends money: receipt OCR, bill item scans, 50 ทวิ scans and bot photos (30), voice parse plus bot voice (30), bot free text including reminder parsing in 1:1 and groups (60), statement preview (30). Over the limit, REST returns 429 `rate_limited` with `Retry-After`, and the bot replies asking the user to wait. Add a limit to any new paid endpoint.
- **CSV exports** prefix text starting with `= + - @` (or a tab/CR) with `'`, which stops formula injection from statement merchant names or group members' descriptions.
- **OAuth `state`** that round-trips a user id must be signed (`lineAuth.signState`/`verifyState`, 10 min), as the Google export-email link is. A bare id lets someone attach their Google email to another account.
- **IDs and errors.** Every router with an id param registers `router.param(name, requireUuidParam(label))` (`services/uuid.js`), so a malformed id gets `400 "Invalid <label> id"`. Update handlers map PostgREST `PGRST116` to `404 "<X> not found"`. Deletes of an unknown id succeed silently.
- **Route order.** Literal paths are registered before `/:id` wildcards: `/transactions/:u/all`, `/bills/public/*`, `/portfolio/:u/lots|performance|dividends|goal`.
- **Body size.** `express.json({ limit: '10mb' })` for base64 photos and audio. The LINE webhook route is mounted *before* `express.json()` because signature verification needs the raw body.
- **Shared paths.** All transaction inserts go through `services/transactionCreate.js` (category validation, budget alerts, account attribution). Bot and REST OCR share `services/receiptExtraction.js`.
- **Budget alerts route by channel, never both.** `channel: 'liff'` returns `budget_alert` / `event_budget_alerts` in the response (shown as an in-app banner); any other channel pushes via LINE (gated by `notifications_enabled`).
- **Account balances** are a read-modify-write in `services/accountBalance.js`: best-effort, after the insert. Statement imports never adjust balances.
- **Thumbnails.** `transactions.thumbnail_url` stores a private Storage *path*, signed fresh (1 h) on every read. It must be `<own line_user_id>/<ms>-<8 hex>.jpg` (`isOwnThumbnailPath`).
- **Outbound calls** (OpenAI, LINE, Yahoo, CoinGecko, Typhoon) always have a 10-45 s timeout and degrade to a logged failure.
- **LINE groups.** Events with `source.type` `group`/`room` go to `controllers/lineGroupHandler.js`, never the 1:1 flows. In groups the bot answers only exact commands, or expenses starting with `+` or @mentioning it.
- **LIFF app rules** (`liff-app/`: plain HTML/JS/CSS, no build step):
  - No emoji anywhere in `liff-app/`; all labels in English.
  - Colors, spacing and radii only through the CSS tokens on `:root`, with dark mode under `prefers-color-scheme` plus `[data-theme]`. Theme choice is stored in `localStorage`.
  - Inputs at least 16px (stops iOS zoom); tap targets at least `--tap-min` (44px).
  - Reads go through `cachedGet()`; any non-GET `apiRequest()` clears the cache. `apiRequest` errors start with `[status]`.
  - Async renders use a sequence-number stale guard (`txnLoadSeq`, `perfLoadSeq`, ...).
  - Chart.js 4.4.1 and pdf.js 3.11.174 load from cdnjs. Pages must still work ("Chart unavailable", "Couldn't load the PDF reader") when a CDN is blocked.
  - Modals stack at z-index 20, the confirm modal at 30, the FAB at 15, the nav at 10.
- **Legal pages must stay true.** `liff-app/privacy.html` (+ `privacy-th.html`) states what is collected, who it goes to and how long it's kept: error reports 90 days, alerts 180 days, job records 30 days, server logs 30 days (`deploy/macos/logrotate.sh`). When a change sends data somewhere new, stores something new or changes retention, update both languages. Never log message text, transcripts or receipt contents.
- **Privacy.** Never commit real user data, including from statements the owner shares for testing: names, account numbers, last-4 digits, counterparties. Keep extracted data in the session scratchpad and use the synthetic fixtures in tests. Run a grep sweep before committing.

## Architecture

```
backend/
  index.js              Express entry: routes, /liff static, cron jobs (unless DISABLE_CRON)
  config/supabase.js
  routes/               one file per resource (+ router.param id checks)
  controllers/          user, category, transaction, line (login), lineWebhook, lineGroupHandler,
                        ocr, recurring, account, bill, portfolio, budgetEvent, google,
                        statement, group, voice, reminder (+ notes), calendar, lineReminderHandler, tax
  services/             shared logic; pure modules have no DB and have their own tests:
                        billSplit, lotMath, performanceMath, dividendMath, goalMath,
                        groupSplitMath, groupBillMath, groupBillFlex, promptpay, statementParser, payWindow, bangkokDay,
                        reminderMath, tax/taxMath, tax/taxSuggest, tax/taxPlan, tax/taxHalfYear, tax/rulesCheck (+ tax/rules/2568, 2569: rules as data)
  jobs/                 dailyDigest (21:00), recurringTransactions (00:05),
                        activityReminders (12:00, 20:00), payWindowReminders (09:00), groupBillReminders (19:00), all Bangkok time;
                        reminderDispatch (every minute), taxRulesCheck (10 Jan, 1 Mar: tells the owner
                        when tax rules need the yearly refresh, docs/TAX_RULES_REFRESH.md)
  supabase/migrations/  001-022 (run in order in the Supabase SQL Editor)
  tests/                see Tests
liff-app/               index.html, app.js, style.css, tasks.js (Tasks tab), tax.js (Tax tab); bill.html/bill.js = public shared-bill page;
                        privacy(-th).html, terms(-th).html + legal.css = public legal pages (drafts)
ios-app/                SwiftUI app (LINE Login, dashboard, receipt scan), largely untouched since Phase 2
docs/                   FEATURES.md (detailed notes), PRODUCTION.md (ops), PRD, specs, Apps Script relay
deploy/macos/           LaunchAgents for self-hosting (backend, ngrok tunnel, keep-awake): install.sh <domain>
```

**Endpoints** (all under `/api`, `:u` = `line_user_id`):
- **Users:** `POST /users`, `GET /users/:u`, `DELETE /users/:u` (with `{ confirm: "DELETE" }`: erases all data and thumbnails, for PDPA), `PATCH /users/:u/preferences`, `PUT /users/:u/billing-cycle`, `PUT /users/:u/emergency-fund`.
- **Categories:** `GET|POST /categories/:u`, `PUT|DELETE /categories/:u/:category_id`.
- **Transactions:** `GET|POST /transactions/:u`.
  - GET filters: `type`, `category_id`, `start_date`, `end_date`, `q` (description search), `account_id` (comma-separated, either side of a transfer).
  - POST: `category_id` is optional for an expense with a description (auto-categorized); `channel: 'liff'` returns alerts in the response.
  - Also `GET|PUT|DELETE /transactions/:u/:transaction_id` and `DELETE /transactions/:u/all`.
  - `GET /transactions/:u/export` (CSV with a UTF-8 BOM; Account column last) and `POST /transactions/:u/export/email`, with the same filters as the list.
- **Recurring:** `GET|POST /recurring/:u`, `PUT|DELETE /recurring/:u/:recurring_id`, `PATCH /recurring/:u/:recurring_id/paid`.
- **Accounts:** `GET|POST /accounts/:u`, `PUT|DELETE /accounts/:u/:account_id`. Transfers are `POST /transactions/:u` with `type: 'transfer'`.
- **Bills:** `GET|POST /bills/:u`, `GET|DELETE /bills/:u/:bill_id`, `PATCH /bills/:u/:bill_id/participants/:participant_id`, `POST /bills/:u/scan-items`; public `GET /bills/public/:bill_id`, `PATCH /bills/public/:bill_id/participants/:participant_id`.
- **Portfolio:**
  - Holdings: `GET|POST /portfolio/:u`, `PUT|DELETE /portfolio/:u/:holding_id`, `POST /portfolio/:u/:holding_id/refresh-price`, `POST /portfolio/:u/refresh-all`.
  - Lots: `GET /portfolio/:u/lots`, `GET|POST /portfolio/:u/:holding_id/lots`, `PUT|DELETE /portfolio/:u/lots/:lot_id`.
  - Views: `GET /portfolio/:u/performance?range=`, `GET /portfolio/:u/dividends?mode=`, `GET|PUT|DELETE /portfolio/:u/goal`.
- **Event budgets:** `GET|POST /budget-events/:u?month=YYYY-MM-01`, `PUT|DELETE /budget-events/:u/:event_id`.
- **Statements:** `POST /statements/:u/parse` (writes nothing), `POST /statements/:u/import`, `POST /statements/:u/undo`.
- **Groups:** `GET /groups/:u`, `GET /groups/:u/:group_id`, `GET /groups/:u/bills/:bill_id`, `POST /groups/:u/bills/:bill_id/slip`, `POST /groups/:u/bills/:bill_id/shares/:member_id/confirm|reject`, `POST /groups/:u/bills/:bill_id/cancel` (bills are created in the chat). Payment details: `PUT /users/:u/payment-details`.
- **Reminders:** `GET|POST /reminders/:u` (GET `from`/`to`, at most 62 days: open reminders, ones done in the window, occurrences with repeats expanded), `PUT|DELETE /reminders/:u/:reminder_id` (creator only), `POST /reminders/:u/:reminder_id/done|snooze|stop|reopen`.
- **Notes:** `GET|POST /notes/:u` (GET `from`/`to` as YYYY-MM-DD), `PUT|DELETE /notes/:u/:note_id`.
- **Calendar:** `GET /calendar/:u/status`, `GET /calendar/:u/login-url`, `GET /calendar/:u/events?from&to`, `DELETE /calendar/:u` (callback shares `/google/callback`).
- **Tax:** `GET /tax/:u/:year` (the year's rules for the app, profile, claims, incomes and the computed result; years 2568, 2569), `PUT /tax/:u/:year/profile`, `PUT /tax/:u/:year/claims` (merged; null removes), `POST /tax/:u/:year/incomes`, `PUT|DELETE /tax/:u/:year/incomes/:income_id`. Every write returns the whole state with a fresh result. Suggestions: `GET /tax/:u/:year/suggestions`, `POST /tax/:u/:year/suggestions/:suggestion_id/accept|dismiss|restore`. Filing reminders: `POST|DELETE /tax/:u/:year/reminders` (creates real reminders). Documents: `POST /tax/:u/:year/documents` (attach a photo to `incomeId` or `claimKey`), `POST /tax/:u/:year/documents/scan-50tawi` (OpenAI Vision, OCR rate limit; 422 if not a 50 ทวิ), `PUT|DELETE /tax/:u/:year/documents/:document_id`; incomes accept `documentId`. Half-year return: `PUT /tax/:u/:year/half-year` (`amounts` Jan-Jun per income, `prepaid` PND 94 tax, credited on PND 90); the state includes `halfYear`. GET and every write also return `plan` (planner) and `guide` (filing guide).
- **Voice:** `POST /voice/:u/parse` (writes nothing).
- **OCR:** `POST /ocr/scan/:u`.
- **Google:** `GET /google/login-url/:u`, `GET /google/callback` (verifies the export email only; not a login).
- **LINE:** `GET /line/login-url`, `GET /line/callback`, `POST /line/webhook`.
- **Status:** `GET /` and `GET /health`.

**Migrations:**

| # | Adds |
|---|---|
| 001-004 | users, categories, transactions, preset categories |
| 005 | preferences (`notifications_enabled`, `thumbnails_enabled`) |
| 006 | Phase 3 columns |
| 007 | `recurring_transactions` |
| 008 | `users.email` |
| 009 | accounts, transfers, `from/to_account_id`, pay windows |
| 010 | shared bills |
| 011 | `asset_holdings`, emergency fund |
| 012 | `budget_events` |
| 013 | Google email verification |
| 014 | `recurring_transactions.paid_period` |
| 015 | `asset_lots`, `investment_goals` |
| 016 | LINE group split tracker: `line_groups`, `line_group_members`, `group_expenses`, `group_expense_shares` |
| 017 | Ops: `error_events`, `job_runs`, `ops_alerts`; index `transactions(line_user_id, transaction_date DESC)` |
| 018 | `users.group_ledger_copies` (consent for group shares in personal ledgers) |
| 019 | Group bills: `group_expenses.status/closed_at`, share `paid_at/paid_method/slip_*`, `users.promptpay_id/bank_*`, private `payment-slips` bucket |
| 020 | `reminders`, `notes`, `users.gcal_*` (encrypted Google Calendar token) |
| 021 | `tax_profiles` (profile + claims JSON per user per year), `tax_incomes` |
| 022 | `tax_documents`, private `tax-documents` bucket |

## Features (details in `docs/FEATURES.md`)

- **Core:**
  - Transactions, categories with daily/weekly/monthly/yearly budgets, and billing cycles.
  - Auto-categorization: keywords first, then `gpt-4o-mini`, falling back to "Others".
  - CSV export, plus an email export through an Apps Script relay, to a Google-verified address when one is set.
- **Receipt OCR:** OpenAI Vision, from the iOS app, the LIFF app and the bot. A `slip_hash` (UNIQUE) stops the same receipt being recorded twice. A ~320px thumbnail goes to a private bucket.
- **LINE Bot (1:1):**
  - Free text ("coffee 120"), receipt photos and Thai voice messages each produce a Confirm/Cancel Flex card. Pending confirmations live in memory for 10 minutes.
  - "summary"/"สรุป" replies with the current cycle's totals.
  - Voice is transcribed by Typhoon ASR when `TYPHOON_API_KEY` is set, else OpenAI `gpt-4o-mini-transcribe`, then parsed like text. The card's first row shows what was heard.
- **LINE group bills** (KhunThong-style, per bill; owner decision 2026-11-19): `+ข้าว 600` starts a bill split equally among joined members (or `+taxi 300 @Ann`), posted as a Flex card plus a textV2 @mention of those who owe. Pay/See who paid open the LIFF app (`?groupbill=<id>`, `?group=<id>`): PromptPay QR (`services/promptpay.js`) or bank details, then a slip the owner confirms or rejects (or marks paid / cancels). The group gets "X paid" lines, a fully-paid card, a cancelled card, `bills` (reminder digest, also pushed 19:00 daily for bills 20h+ old; `GROUP_REMINDERS=off`), `rank` (fastest payers this month) and `undo` (cancel your last open bill). Pushes count against the OA message quota. Opening the app from a bill link (`via: 'group_bill'`) doesn't count as using the app. A share is copied into a member's personal ledger only if they use the app themselves and haven't turned it off (`users.group_ledger_copies` TRUE: set by `upsertUser` from the LIFF/iOS/1:1-bot paths, never from a group, and never overriding an explicit FALSE; Settings toggle). Group-only members are tracked on the group's bills only. The LIFF Groups card on Home shows what you owe / are owed.
- **Reminders, to-dos, notes** (Abdul-style; owner decision 2026-11-20): set by chat ("พรุ่งนี้ 9 โมง เตือนประชุม", typed or spoken -> Confirm card; "note ..." / "จด ..." saves a note), in the LIFF Tasks tab, or in a group ("เตือน ... @Ann"). Repeats daily/weekdays/weekly/monthly; to-dos have no time. Pushes come from a minute job with Done / Snooze 15 min / Stop quick replies; Important and Must-not-miss reminders follow up (+30/+90 min; +15/+45/+90/+180) until Done. Optional read-only Google Calendar events on the timeline. Reminder pushes ignore the notifications toggle and count against the OA quota.
- **Tax** (Thai personal income tax, years 2568 and 2569; see `docs/TAX_RESEARCH.md` section 8+): rules as data in `services/tax/rules/` (each with `verified`/`source`), a pure calculator `services/tax/taxMath.js`, and the LIFF Tax tab (year switch, pay/refund hero with the filing deadline, profile, income lines with flat or actual expenses and dividend credit, a deduction checklist with each item's limit, the step-by-step breakdown, warnings for unverified rules, and "Found in your data": suggestions from transactions (including one-year measures like Easy E-Receipt spotted by date window), portfolio lots and dividends with their effect on your tax, added or dismissed by the user; a "Lower your tax" planner ranking the deductions still open by tax saved per baht; a filing guide with form, deadline, documents checklist, steps, figures to enter and LINE reminders; documents attached to incomes and deductions, and "Scan a 50 ทวิ" that fills the income sheet; a PND 94 half-year card for 40(5)-(8) income). Rules are refreshed yearly per `docs/TAX_RULES_REFRESH.md`. An estimate, not filing: nothing is sent to the RD.
- **Notifications:** budget-crossing alerts, event-budget alerts at 80% and 100%, a 21:00 daily digest, 12:00/20:00 activity nudges, and pay-window due/overdue reminders. All respect `notifications_enabled`.
- **LIFF app:**
  - Tabs: Home / Tasks / History (transactions) / Budgets / Wealth (net worth) / Tax / Settings. The floating Add button adds a reminder or note on Tasks and an income on Tax.
  - Floating Add button: receipt scan and a Speak (mic) button, both of which fill the form for review.
  - Day-grouped timeline, search, account filter, logging streak.
  - Dark/light themes; English labels.
- **Accounts and transfers:** bank, credit card, e-wallet and cash accounts. Balances update on account-attributed transactions and transfers.
- **Recurring rules:** auto-logged on `next_run_date`. Monthly rules can have a pay window (with Mark Paid) that drives due/overdue reminders.
- **Shared bills:** equal, custom and itemized (OCR) splits, settled with an unauthenticated share link (`bill.html?id=`) or Share to LINE.
- **Event budgets:** a one-off monthly limit layered on a category.
- **Investments:**
  - Holdings with buy/sell lots matched FIFO, realized gains and win rate, THB totals via live USD→THB, and day's gain.
  - Live prices: Yahoo for stocks/ETFs, CoinGecko for crypto; mutual funds and gold are entered manually.
  - A performance chart against the S&P 500 and SET (TWR).
  - Dividends received, a 12-month projection, and yields.
  - A goal tracker using an effective-annual-rate projection (owner decision). The emergency fund points at an existing account.
- **Bank statement import** (Transactions → Import Statement):
  - pdf.js opens the PDF and its password on the phone; only positioned text goes to the server. Supported: **KBank** savings/current (parsed by column positions) and **Bangkok Bank** savings (parsed by line text).
  - Signs come from the running balance, cross-checked against the statement's own totals.
  - The preview flags own transfers, bank transfers, possible duplicates of manual entries, and rows already imported.
  - Own-account transfers import as Transfer entries, and the two banks' sides merge into one ("Bangkok Bank •••1111 → KBank •••2222").
  - Categories come from **learned** (what your own past imported row with the same description and type has now), then keyword rules, then `gpt-4o-mini` in parallel batches of 20.
  - Re-imports are no-ops (`slip_hash` = `stmt:` row key). Undo reverses an import, including separating merged transfers. The last 5 imports are listed on the phone.

## iOS app

```bash
cd ios-app/ExpenseTracker/ExpenseTracker2
xcodebuild -project ExpenseTracker2.xcodeproj -scheme ExpenseTracker2 -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build
xcrun simctl install "iPhone 17 Pro" ~/Library/Developer/Xcode/DerivedData/ExpenseTracker2-*/Build/Products/Debug-iphonesimulator/ExpenseTracker2.app
xcrun simctl launch "iPhone 17 Pro" com.expensetracker.app
xcrun simctl openurl "iPhone 17 Pro" "com.expensetracker.app://line/callback?code=test_code&state=test_state"
```

- Bundle ID `com.expensetracker.app`; URL scheme `com.expensetracker.app://line/callback`.
- The backend URL is `http://localhost:3000/api`; use the Mac's IP address on a physical device.
- The LINE Login channel ID is `2011983707`.
- **API auth:** `LINEAuthService` saves the `access_token` the backend's `/line/callback` returns to the Keychain. `APIService` sends it as `Authorization: Bearer`, and a 401 logs out. Sessions saved before this change have no token, so the user logs in once more.
