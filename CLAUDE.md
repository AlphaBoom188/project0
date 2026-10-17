# Expense Tracker System - Development Guide

This document provides essential commands and architecture notes for the Expense Tracker System for Claude Code and AI assistants.

## Project Overview

A comprehensive expense tracking system with:
- **Backend**: Node.js Express API with Supabase database
- **iOS App**: SwiftUI application with LINE Login authentication
- **Integration**: LINE OAuth flow for secure authentication

## Quick Start Commands

### Backend (Node.js Express)

```bash
cd backend
npm install
cp .env.example .env  # Configure your credentials
npm start  # Starts server on port 3000
```

**Note:** The backend connects to Supabase using `SUPABASE_SERVICE_ROLE_KEY`, not the anon key — it's a trusted server, so it bypasses RLS and enforces per-user access control itself (every query is scoped by `line_user_id` in the controllers). Keep this key secret; never ship it to the iOS app. `OPENAI_API_KEY` must also be set (with billing credits) for the OCR endpoint and LINE Bot text/image parsing to work.

**LINE Bot setup:** Set `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` in `.env` (issued separately from `LINE_MESSAGING_CHANNEL_SECRET`, in the LINE Developers Console) — required to send reply messages. For local development, the webhook needs a public HTTPS URL (e.g. via `ngrok http 3000`) registered as `https://<your-domain>/api/line/webhook` in the Messaging API channel's webhook settings. The LINE Login channel and the Messaging API channel must be linked (Messaging API channel settings → Linked OA) so `line_user_id` from app login matches `source.userId` from webhook events.

**LIFF setup:** Set `LIFF_ID` in `.env` (create the LIFF app under the Messaging API channel's LIFF tab). Endpoint URL registered in the LINE Developers Console should be `https://<your-domain>/liff/` — same public tunnel as the webhook, no separate hosting needed.

**Backend Endpoints:**
- `GET /` - API status
- `GET /health` - Database health check
- `POST /api/users` - Create/update user
- `GET /api/users/:line_user_id` - Get user profile
- `PATCH /api/users/:line_user_id/preferences` - Update `notifications_enabled`/`thumbnails_enabled`
- `POST /api/categories/:line_user_id` - Create category
- `GET /api/categories/:line_user_id` - Get categories
- `POST /api/transactions/:line_user_id` - Create transaction (`category_id` optional for an expense with a `description` -- auto-categorized). Optional `channel: 'liff'` returns a crossed `budget_alert` in the response instead of pushing it via LINE (see Dual-Channel Alert Routing below)
- `GET /api/transactions/:line_user_id` - Get transactions (`type`/`category_id`/`start_date`/`end_date`, plus `q` for a case-insensitive substring search on `description` and `account_id` (comma-separated, matches either side of a transfer); the export endpoints accept both too)
- `DELETE /api/transactions/:line_user_id/all` - Delete every transaction for a user (irreversible; client must confirm first)
- `GET/PUT/DELETE /api/transactions/:line_user_id/:transaction_id` - Single transaction. **ID validation applies across the API:** every router with an id param (`transaction_id`, `bill_id`, `participant_id`, `account_id`, `recurring_id`, `category_id`, `holding_id`, `event_id`) registers `router.param(name, requireUuidParam(label))` from `services/uuid.js`, so a malformed id gets `400 "Invalid <label> id"` before any handler runs, instead of Postgres's raw `invalid input syntax for type uuid` error as a 500. Every update handler maps PostgREST `PGRST116` (`.single()` matched zero rows: unknown id, or another user's) to `404 "<X> not found"` instead of a 500 "Cannot coerce the result to a single JSON object". Deletes of an unknown id still silently succeed, as before (`bills_test` relies on that). `isUuid` is also used by the transactions `account_id` filter
- `GET /api/transactions/:line_user_id/export` - Export transactions as CSV (UTF-8 BOM), accepts `type`/`category_id`/`start_date`/`end_date` filters
- `POST /api/transactions/:line_user_id/export/email` - Same filtered export, emailed via the Apps Script relay (501 if not configured)
- `GET/POST /api/recurring/:line_user_id`, `PUT/DELETE /api/recurring/:line_user_id/:recurring_id` - Recurring expense/income rules (now with optional `pay_start_day`/`pay_end_day`)
- `GET/POST /api/accounts/:line_user_id`, `PUT/DELETE /api/accounts/:line_user_id/:account_id` - Bank/credit card/e-wallet/cash accounts; `POST /api/transactions/:line_user_id` with `type: "transfer"` moves money between two of them
- `GET/POST /api/bills/:line_user_id`, `GET/DELETE /api/bills/:line_user_id/:bill_id`, `PATCH /api/bills/:line_user_id/:bill_id/participants/:participant_id` - Shared bills (equal/custom/itemized split), creator-scoped
- `POST /api/bills/:line_user_id/scan-items` - OCR a receipt into itemized line items for an itemized split (no transaction/dedup involved)
- `GET /api/bills/public/:bill_id`, `PATCH /api/bills/public/:bill_id/participants/:participant_id` - Unauthenticated bill view + self-serve mark-paid, for participants who never open the app (bill_id is the access token)
- `GET/POST /api/portfolio/:line_user_id`, `PUT/DELETE /api/portfolio/:line_user_id/:holding_id` - Investment holdings (stock/etf/crypto/mutual_fund/gold) with computed market value/gain and allocation %; GET also returns emergency fund status
- `POST /api/portfolio/:line_user_id/:holding_id/refresh-price`, `POST /api/portfolio/:line_user_id/refresh-all` - Live price refresh (Yahoo Finance for stock/etf, CoinGecko for crypto); 400s for mutual_fund/gold, which have no live source
- `PUT /api/users/:line_user_id/emergency-fund` - Set the emergency fund goal amount and/or which existing account tracks progress
- `GET/POST /api/budget-events/:line_user_id` (`?month=YYYY-MM-01`), `PUT/DELETE /api/budget-events/:line_user_id/:event_id` - One-off, single-month event/occasion budget buckets layered on a category, with computed `spent`/`remaining`/`percent`
- `GET /api/google/login-url/:line_user_id`, `GET /api/google/callback` - Google OAuth used *only* to verify the CSV-export email (not a login method); 501 if not configured
- `GET /api/line/login-url` - Generate LINE Login URL
- `GET /api/line/callback` - Handle LINE OAuth callback
- `POST /api/ocr/scan/:line_user_id` - Scan a receipt image (OpenAI Vision), extract amount/date/merchant/category, and check `slip_hash` for duplicates
- `POST /api/line/webhook` - LINE Bot webhook (signature-verified). Handles `follow` (provisions the user), text messages (free-text expense parsing, e.g. "coffee 120", plus a "summary"/"สรุป" command), image messages (same OCR pipeline as the REST endpoint), and `postback` (Confirm/Cancel on the resulting Flex card)

### Tests

```bash
cd backend
npm start                 # in another terminal -- suites go through the real HTTP API
npm test                  # api + liff suites, free (~3 min)
npm test -- bills         # only suites whose path contains "bills"
npm test -- -v            # full output of every suite
npm run test:openai       # line_webhook + preferences_opt_out: real OpenAI calls (a few cents)
```

- **Suites run against the real Supabase project** in `backend/.env`; there's no separate test database. Every suite only creates users with a `test_` prefix (or a random `U<hex>` id), deletes everything it created, and the runner runs suites one at a time. When adding a suite, keep both rules, and never call a job's all-users entry point without scoping it. `processDueRecurringTransactions`, `sendDailyDigest` and `sendActivityReminder` all take `{ lineUserId }` for exactly that, so a test can't fire real users' rules or digests; the crons pass nothing.
- **Layout.** `backend/tests/api/` holds REST/backend suites. `tests/liff/` holds headless-Chrome suites (`playwright-core` with `channel: 'chrome'`, so it needs Google Chrome installed); they route `static.line-scdn.net` to a stub `liff` object, which is how LIFF client code gets tested without a phone. Screenshots go to `tests/.output/` (gitignored). `tests/openai/` holds opt-in suites with real OpenAI calls. `tests/fixtures/receipt.jpg` is a synthetic receipt (GREENLEAF CAFE, 320.00). `tests/lib.js` gives `BASE` (`TEST_BASE_URL`, default `http://localhost:$PORT`), `BACKEND`, `FIXTURES`, `OUTPUT`.
- **Suite contract**: a plain Node script that prints `PASS: ...` / `FAIL: ...` lines and exits non-zero on failure. `tests/run.js` counts those lines, and a suite with zero PASS lines counts as failed.
- **Not included, on purpose**: the old `email_export_test` (it sends a real email), the old full `ocr_harness` (covered by `openai/line_webhook`), and the seed-fixtures helper (`api/ocr_dedup` now sets up its own data). The "ad hoc, not committed" test scripts named in the phase notes below now live here, apart from those exclusions.

### iOS App (Swift/Xcode)

```bash
cd ios-app/ExpenseTracker/ExpenseTracker2
open ExpenseTracker2.xcodeproj
# Or build from command line:
xcodebuild -project ExpenseTracker2.xcodeproj -scheme ExpenseTracker2 -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build
```

**Install on Simulator:**
```bash
xcrun simctl install "iPhone 17 Pro" /Users/boom/Library/Developer/Xcode/DerivedData/ExpenseTracker2-ajjqfjettpxiyegpaeugxkeqpqsd/Build/Products/Debug-ios-simulator/ExpenseTracker2.app
xcrun simctl launch "iPhone 17 Pro" com.expensetracker.app
```

**Test URL Scheme (LINE Callback):**
```bash
xcrun simctl openurl "iPhone 17 Pro" "com.expensetracker.app://line/callback?code=test_code&state=test_state"
```

**Take Screenshot:**
```bash
xcrun simctl io "iPhone 17 Pro" screenshot screenshot.png
```

### Database Setup

1. Go to Supabase SQL Editor: https://supabase.com/dashboard/project/idjofcbwepiufcniaazm
2. Run migration files in order from `backend/supabase/migrations/`:
   - 001_create_users_table.sql
   - 002_create_categories_table.sql
   - 003_create_transactions_table.sql
   - 004_insert_preset_categories.sql
   - 005_add_user_preferences.sql
   - 006_phase3_schema.sql
   - 007_phase4_schema.sql
   - 008_add_user_email.sql
   - 009_phase2a_accounts_transfers.sql
   - 010_shared_bills.sql
   - 011_portfolio.sql
   - 012_budget_events.sql
   - 013_google_email_verification.sql

**Note:** after running a migration in the SQL Editor, the REST API layer (PostgREST) caches the schema and can take a bit to notice new tables — if the backend immediately 500s with `Could not find the table '...' in the schema cache` right after a migration, that's this cache, not a failed migration; it clears on its own within roughly a minute, or immediately by running `NOTIFY pgrst, 'reload schema';` in the SQL Editor.

## Project Architecture

### Directory Structure

```
project0/
├── docs/                          # Product documentation
│   ├── PRD.md                     # Product Requirements
│   ├── ARCHITECTURE.md            # System Architecture
│   ├── DB_SCHEMA.md               # Database Schema
│   ├── SETUP_GUIDE.md             # Setup Instructions
│   ├── PHASE_3_SPEC.md            # Phase 3 feature spec (reconciled against actual schema, not applied literally)
│   ├── APPS_SCRIPT_EMAIL_RELAY.md # Script to deploy for the email CSV export feature
│   └── phase_2_product_architecture_blueprint.md # Bigger future vision (Google OAuth, shared bills, portfolio tracking) -- reconciled against the actual line_user_id-keyed schema, not applied literally
├── backend/                       # Node.js Express API
│   ├── config/                    # Configuration files
│   │   └── supabase.js          # Supabase connection
│   ├── controllers/               # API controllers
│   │   ├── userController.js    # User management
│   │   ├── categoryController.js # Category management
│   │   ├── transactionController.js # Transaction management
│   │   ├── lineController.js    # LINE Login OAuth
│   │   ├── lineWebhookController.js # LINE Bot webhook (follow/text/image/postback)
│   │   ├── ocrController.js     # Receipt OCR (OpenAI Vision)
│   │   ├── recurringController.js # Recurring expense/income rule CRUD
│   │   ├── accountController.js # Accounts/wallets CRUD
│   │   ├── billController.js    # Shared bills: create/list/detail/delete, settlement, public share view
│   │   └── portfolioController.js # Investment holdings CRUD + computed value/gain/allocation + emergency fund status
│   ├── routes/                    # API routes
│   │   ├── userRoutes.js
│   │   ├── categoryRoutes.js
│   │   ├── transactionRoutes.js
│   │   ├── lineRoutes.js
│   │   ├── lineWebhookRoutes.js  # mounted before express.json() -- needs the raw body
│   │   ├── recurringRoutes.js
│   │   ├── accountRoutes.js
│   │   ├── billRoutes.js        # /public/* registered before /:line_user_id -- same ordering gotcha as /all
│   │   ├── portfolioRoutes.js
│   └── ocrRoutes.js
│   ├── services/                  # Logic shared between REST controllers and the LINE Bot
│   │   ├── userUpsert.js        # create/update user + preset categories
│   │   ├── transactionCreate.js # validate category + insert transaction + fire budget check
│   │   ├── receiptExtraction.js # OpenAI Vision extraction + slip_hash dedup + thumbnail upload
│   │   ├── textExpenseParser.js # OpenAI text parsing ("coffee 120")
│   │   ├── categoryMatch.js     # fetch/match a user's expense categories
│   │   ├── pendingConfirmations.js # in-memory TTL store for bot Confirm/Cancel
│   │   ├── lineMessagingClient.js  # @line/bot-sdk wrapper + Flex card builder (with timeouts)
│   │   ├── receiptThumbnail.js  # resize (sharp) + upload to private Storage bucket
│   │   ├── signedUrl.js         # mint a short-lived signed URL for a stored thumbnail path
│   │   ├── userPreferences.js   # notifications_enabled / thumbnails_enabled, fails open to TRUE
│   │   ├── budgetAlert.js       # evaluateBudgetAlert (pure check) + pushBudgetAlertIfEnabled (LINE push), split so the LIFF channel can skip the push
│   │   ├── autoCategorize.js    # keyword-then-LLM category inference for expenses with no category_id
│   │   ├── csvExport.js         # shared CSV builder (direct-download + email export)
│   │   ├── emailRelay.js        # POSTs a base64 CSV to the Apps Script email relay
│   │   ├── accountBalance.js    # read-modify-write balance adjustment for transfers/account-attributed tx
│   │   ├── billSplit.js         # cent-accurate equal/custom/itemized split math
│   │   ├── billItemExtraction.js # OpenAI Vision -> itemized receipt line items (separate from receiptExtraction.js)
│   │   └── marketPrices.js      # Live prices: Yahoo Finance (stock/etf), CoinGecko (crypto); mutual_fund/gold are manual-only
│   ├── jobs/
│   │   ├── dailyDigest.js       # node-cron, 21:00 Asia/Bangkok, daily income/expense push
│   │   ├── recurringTransactions.js # node-cron, 00:05 Asia/Bangkok, generates due recurring transactions
│   │   └── activityReminders.js # node-cron, 12:00 + 20:00 Asia/Bangkok, nudges users with zero transactions so far today
│   ├── supabase/                  # Database migrations
│   │   └── migrations/
│   ├── .env.example               # Environment template
│   ├── .env                       # Actual credentials (gitignored)
│   ├── index.js                   # Express server entry
│   └── package.json               # Dependencies
└── ios-app/                       # iOS Application
    └── ExpenseTracker2/           # SwiftUI app
        ├── ExpenseTracker2.xcodeproj
        ├── ExpenseTracker2/
        │   ├── Models/            # Data models
        │   │   ├── User.swift
        │   │   ├── Category.swift
        │   │   └── Transaction.swift
        │   ├── Services/          # Network & auth
        │   │   ├── APIService.swift
        │   │   └── LINEAuthService.swift
        │   ├── ViewModels/        # Business logic
        │   │   └── DashboardViewModel.swift
        │   └── Views/             # SwiftUI views
        │       ├── LoginView.swift
        │       ├── DashboardView.swift
        │       ├── AddTransactionView.swift  # includes receipt scan (camera/library) UI
        │       ├── TransactionListView.swift
│   │       └── Components/
│   │           └── ImagePicker.swift  # UIImagePickerController wrapper (camera + library)
        └── README.md
└── liff-app/                      # LINE MINI App (LIFF) -- served by the backend at /liff
    ├── index.html
    ├── app.js                      # liff.init() -> profile -> dashboard; reuses existing REST API
    ├── style.css
    ├── bill.html                   # Public, unauthenticated shared-bill share-link view (no liff.init())
    └── bill.js
```

### Technology Stack

- **Database**: Supabase / PostgreSQL
- **Backend**: Node.js 14+, Express
- **iOS**: iOS 17.0+, SwiftUI, Swift 5.0
- **Authentication**: LINE Login OAuth 2.0
- **AI**: OpenAI API (for future OCR features)

### Key Configuration

**Backend:**
- Base URL: `http://localhost:3000/api`
- Database: Supabase PostgreSQL
- LINE Channel ID: 2011983707
- LINE Callback: `http://localhost:3000/api/line/callback`

**iOS App:**
- Bundle ID: `com.expensetracker.app`
- URL Scheme: `com.expensetracker.app://line/callback`
- Backend URL: `http://localhost:3000/api`

### Data Models

**User:**
- `line_user_id` (VARCHAR, PRIMARY KEY) - LINE user ID
- `display_name` (VARCHAR) - Display name
- `picture_url` (TEXT) - Profile picture
- `billing_cycle_start_day` (INTEGER) - Billing cycle day (1-31)

**Category:**
- `id` (UUID, PRIMARY KEY)
- `line_user_id` (VARCHAR, FK) - User reference
- `name` (VARCHAR) - Category name
- `type` (VARCHAR) - 'income' or 'expense'
- `budget_amount` (DECIMAL) - Budget limit
- `budget_period` (VARCHAR) - 'daily', 'weekly', 'monthly', 'yearly'
- `is_preset` (BOOLEAN) - Preset category flag

**Transaction:**
- `id` (UUID, PRIMARY KEY)
- `line_user_id` (VARCHAR, FK) - User reference
- `category_id` (UUID, FK) - Category reference
- `amount` (DECIMAL) - Transaction amount
- `type` (VARCHAR) - 'income' or 'expense'
- `description` (TEXT) - Transaction description
- `slip_hash` (VARCHAR, UNIQUE) - Duplicate prevention
- `thumbnail_url` (TEXT) - Slip thumbnail
- `transaction_date` (TIMESTAMP) - Transaction date

### Authentication Flow

1. User taps "Login with LINE" in iOS app
2. App opens LINE OAuth URL in Safari/LINE app
3. User authenticates with LINE
4. LINE redirects to `com.expensetracker.app://line/callback?code=...`
5. iOS app intercepts callback via `onOpenURL`
6. App calls backend `/api/line/callback?code=...`
7. Backend exchanges code for access token with LINE API
8. Backend fetches user profile from LINE
9. Backend creates/updates user in Supabase
10. Backend returns user data to iOS app
11. iOS app saves session and navigates to Dashboard

### Important Notes

- **Security**: Never commit `.env` files - they contain sensitive API keys
- **Database**: Run migrations before first use
- **LINE Login**: Configure callback URL in LINE Developers Console
- **iOS Simulator**: Use Mac's IP address instead of localhost for physical device testing
- **Duplicate Prevention**: `slip_hash` UNIQUE constraint prevents duplicate receipts

### Development Workflow

1. Start backend: `cd backend && npm start`
2. Build iOS app: Open in Xcode or use xcodebuild
3. Run and test in simulator
4. Make changes and iterate

### Phase 1 Status

✅ Backend API (Node.js/Express)
✅ Database Schema (Supabase migrations)
✅ iOS App (Swift/SwiftUI)
✅ LINE Login Integration (OAuth flow)
✅ Core Features (Dashboard, Transactions, Categories)

### Phase 2

✅ **OCR slip scanning** — iOS camera/photo-library capture (`AddTransactionView` + `ImagePicker`) → `POST /api/ocr/scan/:line_user_id` extracts amount/date/merchant/category via OpenAI Vision (`gpt-4o-mini`) → form auto-fills → `slip_hash` (SHA-256, computed client-side) is checked both as a fast pre-check in the OCR endpoint and as a DB-level `UNIQUE` constraint on `transactions.slip_hash`, so the same receipt can't be recorded twice.

✅ **LINE Bot webhook** — `POST /api/line/webhook`, signature-verified via `@line/bot-sdk`. `follow` provisions the user (and any first message lazily provisions one too, in case the Official Account was already friended before the webhook existed); a receipt photo runs through the same Vision extraction + `slip_hash` dedup as the REST OCR endpoint; free text (e.g. "coffee 120") is parsed into an expense via OpenAI; both reply with a Flex confirmation card (Confirm/Cancel postback, with a receipt thumbnail as the hero image) before anything is saved — the pending transaction lives in an in-memory, 10-minute-TTL store (`services/pendingConfirmations.js`), not a DB table. A "summary"/"สรุป" text command replies with the current billing-cycle's income/expense/net. Every outbound call (OpenAI, LINE reply/push/blob) is wrapped with a 10-20s timeout so a slow upstream degrades to a logged failure instead of hanging a webhook request.

✅ **Receipt thumbnails** — `services/receiptThumbnail.js` resizes (`sharp`, ~320px JPEG) and uploads to a **private** Supabase Storage bucket (`receipt-thumbnails`), used by both the REST OCR endpoint and the bot's image handler. `transactions.thumbnail_url` stores the raw storage *path*, not a usable URL — `services/signedUrl.js` mints a fresh 1-hour signed URL every time transactions are read (`transactionController.js`'s get/list/create/update) or shown in a bot confirmation card. Thumbnails upload at scan time, not confirm time, so a scan that's never saved leaves a small orphaned object in storage — accepted as a low-cost tradeoff rather than building save-time-only upload plumbing.

✅ **Notifications** — split by trigger, not both scheduled: budget-threshold alerts (`services/budgetAlert.js`) are event-driven, checked immediately after each expense insert in `transactionCreate.js` (fire-and-forget; fires exactly once on crossing a category's `budget_amount`/`budget_period`, not on every subsequent over-budget transaction); the daily digest (`jobs/dailyDigest.js`, `node-cron`) runs once at 21:00 Asia/Bangkok, pushing that day's income/expense/net to every opted-in user with activity that day. Both respect per-user preferences below. Only reaches users who've messaged the bot at least once; be mindful of LINE's free-tier monthly push message cap at scale.

✅ **User preferences** (migration `005_add_user_preferences.sql`) — `users.notifications_enabled` and `users.thumbnails_enabled`, both default `TRUE`. `services/userPreferences.js` reads them and **fails open to both defaults** if the columns are ever missing, so rollout ordering can't break anything. Toggleable from the LIFF Settings screen (Phase 3).

✅ **LINE MINI App (LIFF)** — `liff-app/` (plain HTML/JS, no build step), served by the backend itself at `/liff` (same server, same tunnel as the webhook — no separate hosting). `liff.init()` → `liff.getProfile()` gets `userId`/`displayName`/`pictureUrl` directly inside LINE's in-app browser, no OAuth redirect needed; provisions via the existing `POST /api/users`. Shows the current billing-cycle summary and recent transactions (with thumbnails), a manual "Add Expense" form (now with in-browser camera/file receipt OCR, Phase 3), and a Settings screen (Phase 3). Needs `LIFF_ID` set and the LIFF app's Endpoint URL registered to `https://<tunnel>/liff/` in the LINE Developers Console.

### Phase 3

Scoped against `docs/PHASE_3_SPEC.md` — note that spec's own SQL migration assumed a schema we don't actually have (`users.id` UUID PK, a from-scratch `categories` table) and was reconciled rather than applied literally; see migration `006_phase3_schema.sql`'s header comment.

✅ **LIFF Settings screen** — originally a gear-icon-accessed view, now the ตั้งค่า tab (see Phase 5): toggles for `notifications_enabled`/`thumbnails_enabled` (`PATCH /api/users/:line_user_id/preferences`), budget cycle start day (reuses the existing `PUT /api/users/:line_user_id/billing-cycle` — deliberately *not* the spec's separate `budget_cycle_start_day` column, to avoid two columns meaning the same thing), and a "Clear Transaction History" destructive action gated behind a custom confirm modal (`DELETE /api/transactions/:line_user_id/all` — registered before the `:transaction_id` wildcard route so `/all` isn't swallowed by it).

✅ **In-LIFF receipt OCR** — the Add Expense modal's `<input type="file" accept="image/*" capture="environment">` resizes the photo client-side (canvas, ~1280px JPEG q0.7, mirroring the iOS app's approach), hashes it (`crypto.subtle.digest`), and POSTs to the same `/api/ocr/scan/:line_user_id` the REST/bot paths already use — no new backend endpoint, same dedup and thumbnail pipeline.

✅ **Auto-categorization** — `services/autoCategorize.js`: cheap keyword matching against the user's category names first (English + Thai hints), an LLM call (`gpt-4o-mini`) only if that misses, falling back to "Others" so a category is always returned. Wired into `transactionController.createTransaction` — `category_id` is now optional for an expense *if* a `description` is given (income still requires an explicit category_id); existing callers that always pass `category_id` are unaffected. In the LIFF Add Expense form the Category field defaults to "Auto-Categorize" (no emoji, see Phase 5), not the first real category — leaving it as-is omits `category_id` from the request entirely.

**Note:** `express.json()` has an explicit `limit: '10mb'` — the default is 100kb, which a base64-encoded receipt photo (even resized client-side) routinely exceeds; this surfaced as a 413 once real phone photos were tested (a tiny synthetic test image had been masking it). `apiRequest()` in `liff-app/app.js` always prefixes thrown errors with the real HTTP status (`[413] ...`) for exactly this kind of failure.

- [ ] Analytics charts, custom per-category budget alerts UI, Thai voice-to-text, PDF statement import, multi-user/group support, paywall UI — all named in `docs/PHASE_3_SPEC.md` but out of scope so far

### Phase 4

Originally scoped down — "Tab Navigation Speed" and "lazy-load the Analytics tab" didn't apply yet, since the LIFF app only had two views (Dashboard, Settings). **Superseded by Phase 5 below**, which built the full 5-tab shell these referred to.

✅ **Recurring expenses** (migration `007_phase4_schema.sql`, table `recurring_transactions`) — `controllers/recurringController.js` + `routes/recurringRoutes.js` mounted at `/api/recurring` (CRUD, `line_user_id`-scoped like everything else; `category_id` uses `ON DELETE RESTRICT` like `transactions`, so a category in active use by a rule can't be deleted out from under it). `jobs/recurringTransactions.js` (`node-cron`, 00:05 Asia/Bangkok) finds rows where `next_run_date <= now` and `is_active = true`, creates a real transaction via the same shared `services/transactionCreate.js` every other path uses, advances `next_run_date` by the rule's `frequency`, and pushes a LINE notification (respecting `notifications_enabled`). One rule failing doesn't block the rest — `next_run_date` is only advanced on success, so a failed rule naturally retries next tick. Manager UI lives in the LIFF Settings screen ("ตั้งรายการจดประจำ"), not a separate Transactions screen (doesn't exist).

✅ **CSV export** — `GET /api/transactions/:line_user_id/export`, same `type`/`category_id`/`start_date`/`end_date` filters as the regular list endpoint. Prefixes the response with a UTF-8 BOM (`﻿`) so Thai text opens correctly in Excel instead of as mojibake — verified with an actual Thai description end to end. Wired to a button on the Dashboard's existing "Recent Transactions" section (not a separate Transactions screen) via a plain `window.location.href` navigation, letting the browser handle the `Content-Disposition: attachment` response natively.

✅ **LIFF initial-load parallelization** — `loadDashboard()` used to block the transactions fetch on the user response resolving first (it needs `billing_cycle_start_day` to compute the date range). Now fetches a fixed recent window (`limit=50`, no date filter) in parallel with the user and categories calls, then filters to the current billing cycle client-side for the summary card (using actual `Date` comparisons, not string comparisons — the API's `+00:00`-suffixed timestamps and the client's `Z`-suffixed ones are different string shapes for the same instant). Side effect: "Recent Transactions" now shows genuinely recent activity across cycle boundaries rather than being clipped to the current cycle.

### Phase 5

Full LIFF rewrite: 5-tab bottom-nav shell, emoji removal, and email CSV export. `liff-app/index.html`/`app.js`/`style.css` were rewritten wholesale rather than patched incrementally, given the scale (restructuring Dashboard+Settings into 5 named tabs plus two brand-new ones) — every existing feature (OCR capture, recurring manager, preferences, clear history) was carried over, not dropped.

✅ **5-tab bottom nav** — `.bottom-nav` (fixed position) with สรุป/วิเคราะห์/หมวด-งบ/รายการ/ตั้งค่า. Tab switching (`switchTab()`) is synchronous show/hide first, then each tab's load function runs *after* (not blocking the switch) and reads through `cachedGet()` — see caching note below.

✅ **No emojis anywhere in `liff-app/`** — verified via a full-file emoji-range regex sweep post-build, zero matches across all three files. (Scoped to the LIFF app only, per the request; the LINE Bot's own messages — e.g. the ⚠️ budget alert, 🔁 recurring notification — are a separate surface and weren't touched.)

✅ **วิเคราะห์ (Analytics) tab** — lazy-loaded on first visit: one `cachedGet` of the last 6 months of transactions (`limit=1000`), aggregated **client-side** into (a) a hand-rolled CSS bar chart (no charting library added) of monthly income-vs-expense, and (b) a horizontal-bar category breakdown for the current billing cycle. One fetch feeds both charts rather than two separate summary calls.

✅ **หมวด/งบ (Categories & Budgets) tab** — type toggle (reuses existing `GET /api/categories/:id?type=`), each category's current-period spend vs. `budget_amount` rendered as a progress bar (red once over budget) using the same per-period-start-date logic as `services/budgetAlert.js`, ported to JS (`getPeriodStartDate()`). Tapping a row opens budget editing (existing `PUT /api/categories/:id/:category_id`, unchanged); "+Add Category" reuses the existing create endpoint. Preset categories can't be deleted from here (no delete button rendered for `is_preset` rows) — deleting a non-preset category still goes through the existing safety check (blocks if it has transactions).

✅ **รายการ (Transactions) tab** — type filter + date range, re-queries `GET /api/transactions/:id` with those as query params on every change, card-list rendering (reused `renderTransactionList()`, now with an opt-in Payment Method line). Both export buttons live here and pass the exact same filter params through to their respective endpoints.

✅ **Email CSV export** — `email` column on `users` (migration `008_add_user_email.sql`), editable in Settings, validated both client- and server-side. `POST /api/transactions/:line_user_id/export/email` (`services/emailRelay.js`) builds the identical filtered CSV (`services/csvExport.js`, shared with the direct-download endpoint so the two export paths can't drift) and POSTs it base64-encoded to a **Google Apps Script Web App** acting as the send relay — see `docs/APPS_SCRIPT_EMAIL_RELAY.md` for the script to deploy and the `APPS_SCRIPT_EMAIL_WEBHOOK_URL`/`APPS_SCRIPT_SHARED_SECRET` env vars (the shared secret isn't optional: an Apps Script Web App's "who has access: Anyone" setting is required for POST triggers, so without a secret check anyone who found the URL could send arbitrary mail through the deploying user's Gmail). Missing webhook URL → clean `501`, not a silent failure or a 500.

✅ **In-memory response caching** — `apiRequest()` clears a module-level `Map` on every non-`GET` call (simplest-correct for this scale, vs. tracking exactly which keys a given write affects); `cachedGet()` wraps every cacheable read through it. Net effect: first visit to a tab this session does a real fetch, every revisit is instant until something mutates, satisfying both "cache so tab switches are instant" and "lazy-load on first visit" from the same mechanism.

**Verified**: full `line_webhook_harness.js` regression suite 19/19 (shared `transactionCreate` path untouched). New backend coverage (`phase5_backend_test.js`, not committed — ad hoc): category create/update with budget, full recurring-engine lifecycle against the now-applied migration 007 (generates once, advances `next_run_date` by exactly one `frequency` unit, does *not* regenerate on a second run, respects `is_active = false` even when due, pushes a LINE notification), filtered CSV export (confirmed real `ef bb bf` BOM bytes on the wire — a Node `fetch().text()` call silently strips a leading BOM per the WHATWG decoding spec, so that has to be checked via raw bytes, not decoded text), and the email-export endpoint's current state (migration 008 isn't applied yet, so it correctly surfaces a clear "column does not exist" 500 rather than crashing — expected, not a bug). All HTML element IDs cross-checked against `app.js`, zero mismatches; emoji-range regex swept all three files clean.

Migration 008, the Apps Script relay, and a live phone test of the whole tab shell were all completed and confirmed working after this was written — see Phase "2A" below for the email relay's actual debugging story (the real bug was a field-name mismatch, not auth/deployment/network as it first appeared).

### Phase 2A — Accounts, Transfers, Flexible-Window Recurring

From `docs/phase_2_product_architecture_blueprint.md` — that doc's own migration assumes a `users.id` UUID primary key with Google OAuth as primary auth and `line_user_id` demoted to a linked column, which would require migrating every foreign key in the system (categories, transactions, recurring_transactions) and touching nearly every file in the project. Explicitly decided **not** to do that identity migration; `line_user_id` stays the actual primary key everywhere, and this phase adapts the blueprint's new features to reference it instead of a UUID `users.id`. The blueprint's Phase 2B (dark-mode design system), 2C (shared-bill splitting, dual-channel alerts), Phase 3 (iOS shell), and Phase 4 (investment portfolio tracking) are untouched — each is a standalone effort warranting its own scoping pass.

✅ **Accounts & multi-wallet balances** (migration `009_phase2a_accounts_transfers.sql`) — `accounts` table (`bank`/`credit_card`/`e_wallet`/`cash`), `line_user_id`-keyed, full CRUD at `/api/accounts`. Deletion is blocked while any transaction references the account (`from_account_id` or `to_account_id`), same safety-check pattern as category deletion.

✅ **Transfers** — `transactions.type` now also accepts `'transfer'` (widened the existing CHECK constraint; `services/transactionCreate.js` skips the category requirement entirely for transfers and instead requires both `from_account_id` and `to_account_id`, verified to belong to the user and be different accounts from each other). `from_account_id`/`to_account_id` are also optional on ordinary income/expense transactions, for attributing a normal transaction to an account without making it a transfer.

✅ **Balance tracking** — `services/accountBalance.js` adjusts both sides of a transfer and the relevant side of an account-attributed income/expense. Deliberately a read-modify-write, not an atomic Postgres increment function — acceptable at this app's scale (single user per `line_user_id`, low write concurrency); called out in code as a place to revisit if that assumption ever breaks. Runs *after* the transaction row is committed and is best-effort (logged loudly on failure, doesn't roll back the transaction) — losing a balance update on a rare failure is preferable to losing the transaction record itself.

✅ **Flexible recurring date windows** — `recurring_transactions.pay_start_day`/`pay_end_day` (optional, 1-31), exposed in the LIFF recurring form. Stored as metadata only so far — `jobs/recurringTransactions.js`'s engine still fires purely off `next_run_date`, unchanged. What the window should actually *do* (fire the reminder on the start day but not treat it as overdue until after the end day? something else?) is a real product decision intentionally left for when that behavior is actually built, not guessed at now.

✅ **LIFF UI** — Accounts section folded into the existing หมวด/งบ tab (list with live balances, "+Add Account", "Transfer Between Accounts") rather than a 6th nav tab.

**Verified**: new `accounts_test.js` (ad hoc, not committed) — full account CRUD, a transfer correctly moving money between two account balances, an account-attributed expense/income adjusting the right side, same-account transfer rejected, deletion blocked while in use, pay-window validation (including rejecting a day outside 1-31), and a regression check that a plain expense with no account still works exactly as before. Full `line_webhook_harness.js` suite still 19/19 unaffected (nothing in the shared `transactionCreate` path broke for the LINE Bot). The Supabase PostgREST explicit-FK-disambiguation syntax (`accounts!transactions_from_account_id_fkey`), needed because `transactions` now has two FKs to the same `accounts` table, was guessed from Postgres's default constraint-naming convention and confirmed correct by the passing test rather than inspected directly (no raw catalog access via the JS client).

### Design System — Dark/Light Theme Engine

Pure LIFF frontend work (`liff-app/style.css`, `index.html`, `app.js`); no backend or migration involved. Zero-emoji rule re-verified, not relaxed.

✅ **Design tokens** — every hardcoded color in `style.css` replaced with CSS custom properties on `:root` (`--color-bg`, `--color-surface`, `--color-surface-alt`, `--color-track`, `--color-border`, `--color-text-primary`, `--color-text-secondary`, `--color-text-on-accent`, `--color-accent`, `--color-income`, `--color-expense`, `--color-danger-bg`/`-text`/`-border`, `--color-overlay`, `--shadow-card`), plus a small spacing/radius scale (`--radius-card`, `--radius-control`, `--radius-input`, `--space-page`). Deliberately consolidated several near-duplicate grays from the old file (`#eee`/`#f0f0f0`/`#f5f5f5`/`#ddd`) into the smaller token set rather than giving every literal its own 1:1 variable — that consolidation is itself part of what makes it a design system instead of a mechanical find-replace. One literal intentionally left as-is: `.profile-picture`'s `rgba(255,255,255,0.3)` placeholder tint, since it's a translucent overlay on the header's fixed accent color in both themes, not a themed surface. The `[hidden] { display: none !important; }` rule from the earlier modal-close bug fix was preserved exactly.

✅ **Dark theme values** — layered two ways so the more specific one always wins: `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {...} }` for following system preference, and `:root[data-theme="dark"] {...}` for an explicit user override (same values in both blocks). Brand/semantic colors (accent green, income, expense) intentionally stay constant across themes; only surface/text/border/overlay/shadow tokens change. Card shadows are turned off in dark mode (`--shadow-card: none`) since shadows don't read well on dark backgrounds — card definition there comes from the `--color-border` outline already added to every card-like element.

✅ **Theme toggle + persistence** — System/Light/Dark control (`.theme-toggle` buttons) in Settings → new "Appearance" section, above Preferences. Persisted to `localStorage` only (explicit choice, not a new `users` column — this is a device preference, not account data). A small inline script in `index.html`'s `<head>`, before the stylesheet's render, reads `localStorage` and sets `data-theme` on `<html>` pre-paint to avoid a flash of the wrong theme on load. `app.js` owns the live toggle (`applyTheme()`/`setTheme()`), runs independent of `liff.init()`/login so it works even before the network round-trip completes.

**Verified**: `node --check app.js` clean; grep sweep confirmed every hex/rgba literal in `style.css` now lives only inside the three token-definition blocks (plus the one intentional exception above); emoji-range regex swept `index.html`/`app.js`/`style.css` clean. Full `accounts_test.js` regression (16/16) re-run after these changes — expected to be unaffected since this is pure frontend CSS/JS, confirmed rather than assumed. Visual confirmation (actual light/dark rendering, toggle behavior in the LINE in-app browser) still needs the user's phone — no browser automation was available this session to render LIFF's authenticated context.

### Shared-Bill Engine ("KhunThong"-style bill splitting)

Reconciled against `docs/phase_2_product_architecture_blueprint.md` section 7 — see migration `010_shared_bills.sql`'s header comment for the full rationale. The blueprint's own schema links participants back to a `users.id UUID` row; this project made a different, deliberate call: participants are plain display names, not linked LINE accounts, since the entire point of splitting a bill is working with people who may never open this app. Linking a participant to a real account and pushing them LINE notifications server-side is an intentionally deferred decision, same pattern as `pay_start_day`/`pay_end_day` in Phase 2A — not built, not guessed at.

✅ **Three split types** (`services/billSplit.js`) — all math done in integer cents to avoid float drift, only converting back to decimal at the end. **Equal**: total divided among the creator + every participant; the creator's own slot is computed but intentionally dropped (this app only tracks what *other* people owe the creator). **Custom**: the creator names each participant's amount directly with no sum-to-total requirement ("you owe me 200, you owe me nothing" is valid). **Itemized**: each item is assigned to one participant or left shared (split evenly across everyone including the creator, same dropped-creator-slot rule); `total_amount` must equal the sum of all item amounts exactly, validated server-side.

✅ **Itemized OCR mapping** — `services/billItemExtraction.js`, a second OpenAI Vision prompt separate from `services/receiptExtraction.js` (that one extracts a single total+category for recording *one* expense; this one extracts itemized line items for *splitting* a bill — no slip_hash dedup or thumbnail upload, since a bill split isn't itself a transaction). `POST /api/bills/:line_user_id/scan-items` is read-only — nothing is written until the bill itself is created.

✅ **Settlement without a second LINE account** — `shared_bills.status` auto-flips between `'active'`/`'settled'` (`refreshBillStatus()` in `billController.js`) every time a participant's `is_paid` changes, in either direction (un-marking a payment reopens the bill). Two ways to mark paid: the creator directly in the LIFF app (`PATCH /api/bills/:line_user_id/:bill_id/participants/:participant_id`), or the participant themselves via a share link — `GET/PATCH /api/bills/public/:bill_id[/participants/:participant_id]`, deliberately unauthenticated, the bill's UUID acting as the access token (same trust model as any payment-split link). These public routes are registered *before* the `/:line_user_id` routes in `billRoutes.js` so `"public"` isn't swallowed as a `line_user_id` value — the same ordering gotcha the `/all` transactions route hit in Phase 3.

✅ **LIFF UI** — folded into the Dashboard (สรุป) tab as a new "Shared Bills" section (list + "+ Split a Bill"), not a 6th nav tab, same pattern as Accounts living inside หมวด/งบ. The create modal's participant/item rows are built dynamically (add/remove), with the itemized item-assignment `<select>` kept in sync with participant names live via an `input` listener. `liff-app/bill.html`/`bill.js` is a *separate*, intentionally login-free static page (no `liff.init()`) for the share-link recipient — reuses `style.css` for visual consistency but is otherwise independent of `app.js`.

**Verified**: new `bills_test.js` (ad hoc, not committed) — all three split types including cent-remainder distribution on equal splits, itemized total/participant_index validation, custom split's negative-amount rejection, status auto-settle/reopen on payment toggle, public view + public self-serve mark-paid, 404 on an unknown bill_id, and a check that deleting with the wrong `line_user_id` silently no-ops rather than deleting someone else's bill — 27/27. Full `accounts_test.js` regression (16/16) re-run, unaffected. Hit one real deployment snag along the way: right after running the migration, the backend 500'd with `Could not find the table 'public.shared_bills' in the schema cache` — not a failed migration, but PostgREST's schema cache not yet having picked up the new tables; resolved itself within about a minute (now called out in the Database Setup section above so it doesn't look like a broken migration next time). Zero-emoji sweep re-verified across all five LIFF files including the two new ones.

### Dual-Channel Alert Routing & Smart Reminders

Maps to `docs/phase_2_product_architecture_blueprint.md` section 3. One honest scoping note up front: "channel-aware routing" is only meaningful for an alert that's a *response to a live request* — the budget-crossing check below. A *scheduled* reminder has no live request to respond through, and there is no way to push a notification into a closed/backgrounded LIFF web page (no service worker/PWA infra here), so the activity-reminder job below can only ever deliver via LINE push. That's called out in its own code comment rather than pretending a fake "dual channel" exists for it.

✅ **Budget alerts now route by channel, never both** — `services/budgetAlert.js` was split into `evaluateBudgetAlert()` (pure DB-only check, cheap enough to `await` inline) and `pushBudgetAlertIfEnabled()` (the actual LINE push, still fire-and-forget). `transactionCreate.js` takes a new optional `channel` param: `channel: 'liff'` means the result is handed back in the create-transaction response as `budget_alert` instead of being pushed — the LIFF frontend shows it as an instant in-app banner (`showBudgetAlert()` in `app.js`, auto-hides after 8s). Every other value (`'line_chat'` from the bot webhook, `'system'` from the recurring-transactions job, or simply omitted — e.g. the iOS app, untouched) keeps the original LINE-push behavior unchanged. The two paths are mutually exclusive by construction (one `if (channel !== 'liff')`), so one budget crossing can never produce two alerts — directly the blueprint's "eliminate duplicate alerts" goal, achieved by trusting which endpoint handled the request rather than building a separate presence/heartbeat system to guess which channel the user is "active" on.

✅ **Activity-detection reminders** (`jobs/activityReminders.js`, new) — two fixed `node-cron` times, 12:00 and 20:00 Asia/Bangkok (matching the blueprint's own example), each pushing a nudge via LINE to any opted-in user who hasn't logged a single transaction yet today. "Yet today" is computed against the actual Bangkok calendar day (hardcoded +7h offset — Asia/Bangkok has no DST, so this is always correct), via `services/bangkokDay.js`'s `getBangkokDayRangeISO()`. That helper is now also used by `dailyDigest.js`, which used to count "today" as the UTC day: at its 21:00 Bangkok run that window was 07:00 today to 07:00 tomorrow, so anything logged between midnight and 7am Bangkok time was missing from the evening digest. That is fixed, and covered by `tests/api/daily_jobs.test.js`, which was confirmed to fail on the old code. No per-user-configurable times were built (the blueprint's "configurable" is a bigger lift: a settings UI + DB columns + dynamic per-user cron registration) — two fixed times ship the real value now; configurability is a deferred enhancement, same pattern as other scoped-down items in this project.

**Verified**: new `alerts_test.js` (ad hoc, not committed) — an under-budget expense returns `budget_alert: null`; a budget-crossing expense with `channel: 'liff'` returns the alert with correct category/total and the server log shows zero push attempts for it; a budget-crossing expense with `channel: 'line_chat'` still returns the alert *and* the log shows exactly one push attempt (which 400s for the fake test user, expected — same failure mode confirms the push was genuinely attempted, not skipped); a third expense while already over budget confirms the one-time-only crossing behavior is unchanged — 6/6. `activityReminders.js`'s `sendActivityReminder()` called directly against a user with a transaction logged today (zero push attempts, confirmed via log) and a user with none (one push attempt, confirmed via log) — activity detection correctly distinguishes the two. Full `accounts_test.js` (16/16) and `bills_test.js` (27/27) regressions re-run after the `transactionCreate.js` signature change — unaffected, since `channel` is a new optional field with no default-behavior change for any value other than exactly `'liff'`. Zero-emoji sweep re-verified across all LIFF files (the new budget-alert banner text has none; the bot's own `⚠️` push message is the pre-existing, intentionally untouched non-LIFF surface).

### Investment Portfolio & Asset Tracking

Maps to `docs/phase_2_product_architecture_blueprint.md` section 8. One deliberate, explicit scope cut up front: **live prices only exist for `stock`/`etf` (Yahoo Finance's unofficial, keyless chart endpoint) and `crypto` (CoinGecko's public API)** — `mutual_fund` and `gold` have no reliable free global pricing API (Thai mutual fund NAVs in particular are on neither service), so those two are manual-price-entry only, by design, not as a stopgap. This is called out in migration `011_portfolio.sql`'s header comment, `services/marketPrices.js`'s header comment, and surfaces to the user directly (a 400 with a clear message on refresh, a hint string in the LIFF add/edit form).

✅ **Holdings CRUD with computed fields** — `asset_holdings` (migration `011_portfolio.sql`), `line_user_id`-keyed like everything else. `portfolioController.js`'s `withComputedFields()` derives `cost_basis`, `market_value`, `gain`, `gain_percent` on every read rather than storing them (they're pure functions of `quantity`/`average_cost`/`current_price`, so storing them would just be a cache that could drift). `market_value` falls back to `cost_basis` when there's no price yet, so the frontend never has to null-check it before summing.

✅ **Live price refresh** — `services/marketPrices.js`: `fetchStockOrEtfPrice()` (Yahoo Finance, plain ticker) and `fetchCryptoPrice()` (CoinGecko, which needs its own coin id like `"bitcoin"` — NOT a ticker like `"BTC"`, since tickers aren't unique across coins there). Both are public/keyless, which also means unofficial and best-effort — every call is wrapped with a 10s timeout and a clear thrown message, never a crash. `POST /api/portfolio/:line_user_id/refresh-all` refreshes every live-priced holding, one failure doesn't block the rest, and failures are reported back per-symbol rather than silently dropped.

✅ **Emergency Fund points at an existing account, not a new ledger** — `users.emergency_fund_goal_amount` + `users.emergency_fund_account_id` (FK to `accounts`, Phase 2A). "Current amount saved" is read live from that account's real `balance` rather than duplicated into a second number that could drift out of sync — exactly one source of truth for any given pile of money. Configured via `PUT /api/users/:line_user_id/emergency-fund` (validates the account actually belongs to the user); surfaced via `GET /api/portfolio/:line_user_id`'s `emergency_fund` field (`goal_amount`, `current_amount`, `percent_funded`) since that's where the LIFF Portfolio section actually renders it.

✅ **Surplus allocation nudge** — computed client-side only (no new backend endpoint): the Analytics tab's existing current-billing-cycle transaction fetch is reused to compute net surplus, and if an emergency fund is configured and under its goal, a one-line suggestion renders ("Surplus this period: X. Consider adding it to \"Account\" (Y% funded) or your portfolio."). At goal, the suggestion flips to recommending the portfolio instead. With no emergency fund configured, the whole card stays hidden — there's nothing true to say about progress toward a goal that doesn't exist yet.

✅ **LIFF UI** — folded into the Analytics (วิเคราะห์) tab as a new "Portfolio & Net Worth" section (value/cost/gain summary, allocation-by-type bars reusing the existing category-breakdown chart markup, emergency fund progress bar, holdings list, "+ Add Holding"/"Refresh Prices" buttons), not a new tab — same pattern as Accounts folding into หมวด/งบ and Shared Bills folding into สรุป. The add/edit holding modal locks `asset_type`/`symbol` once editing (same UX precedent as the Category edit modal locking name/type) and swaps between a live-price hint and a manual current-price field depending on the selected type. Emergency Fund goal/account configuration lives in Settings, next to Budget Cycle and Email — same precedent as every other account-level setting.

**Verified**: new `portfolio_test.js` (ad hoc, not committed) — holding creation across types including a manual `current_price` on a gold holding; `market_value` falling back to `cost_basis` with no price; validation (bad `asset_type`, negative `quantity`); totals and allocation-percentage math; an update recomputing `cost_basis`; `refresh-price` correctly rejecting a manual-only type (gold, 400) while a **real, live call to Yahoo Finance for AAPL succeeded** and returned a real-looking market price; `refresh-all` attempting exactly the one live-priced holding and skipping gold; emergency fund status starting unset, then correctly reading a real linked account's balance and computing `percent_funded`, rejecting an account that doesn't belong to the user, and clearing cleanly — 21/21. A separate direct call to `fetchCryptoPrice('bitcoin')` also succeeded live against CoinGecko, and an invalid coin id failed with the intended clear message rather than crashing. Full `accounts_test.js` (16/16), `bills_test.js` (27/27), and `alerts_test.js` (6/6) regressions re-run after these changes — all unaffected. Zero-emoji sweep re-verified across all LIFF files.

### Event Budgets, Verified Export Email, LIFF Nav Restructure

✅ **Event/occasion budget buckets** (migration `012_budget_events.sql`, blueprint section 5) — a category's existing `budget_amount`/`budget_period` stays the recurring "normal" limit; `budget_events` is a one-off limit for one specific month (`period_month`, always the 1st) layered on top, always tied to an existing category. `budgetEventController.js`'s `withSpent()` computes `spent`/`remaining`/`percent` on read by summing that category's expenses within the month (UTC month bounds) — no transaction-tagging column added. Display-only for now: deliberately **not** wired into `services/budgetAlert.js`'s push alerts (deferred product decision). LIFF: "Event & Occasion Budgets" section in the Budgets tab, current month only.

✅ **Google OAuth for verified export email** (migration `013_google_email_verification.sql`) — narrow and secondary: LINE Login remains the only identity. `services/googleOAuth.js` (scope `openid email`, `state` carries `line_user_id`, rejects unverified emails) stores `users.google_email`/`google_linked_at`; the email-export endpoint prefers `google_email` over the legacy free-text `email`, which stays as a fallback and is hidden in Settings once Google is connected. Google blocks its consent screen in embedded webviews (403 `disallowed_useragent`), so the LIFF app opens it with `liff.openWindow({ url, external: true })`; the callback renders a plain "close this tab" HTML page, and a `visibilitychange` listener re-fetches the user when the LIFF tab regains focus. Needs `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET`/`GOOGLE_OAUTH_REDIRECT_URI` (must be the public tunnel URL + `/api/google/callback`, registered in Google Cloud Console) — without them, a clean 501.

✅ **LIFF nav restructure** — bottom nav is now Home / Transactions / Budgets / Net Worth / Settings (English labels, inline stroke SVG icons using `currentColor` — no icon library). Analytics charts and category breakdown moved into Budgets; Portfolio + Emergency Fund into Net Worth. Zero-emoji sweep re-verified across all LIFF files.

**Verified**: new `budget_events_test.js` (ad hoc, not committed), run after migrations 012/013 were applied — `spent` counts only the event's own category within its own month (a previous-month expense and another category's expense are both excluded), over-budget caps `percent` at 100 with a negative `remaining`, validation (missing/negative/zero amount, another user's category), month filter, update recomputing `percent`, update/delete with the wrong `line_user_id` not touching the row, `google_email` round-tripping through `GET /api/users/:id`, the Google callback's 400 page with no `code`, and the email export still 400ing with neither email set — 19/19. The `accounts_test.js`, `bills_test.js`, `alerts_test.js` and `portfolio_test.js` regressions were re-run with zero failures. The full Google consent round-trip was then confirmed live on the user's phone (connect → system browser → callback → Settings shows the verified address). One bug was found during that phone test: the first version called `liff.openWindowExternal()`, which isn't a real LIFF SDK function. It is now `liff.openWindow({ url, external: true })`. The backend tests couldn't catch it because they never run LIFF client code.

### UX/UI Batch 1 (from `docs/master_uxui_specification.md`)

The spec describes three other apps (Pa Nual, KhunTong, MeowJot). Only their general patterns were adopted, never their brand palettes, mascots or emoji microcopy. All LIFF labels are English by decision. Batch 1 is frontend-only:

- **16px form controls.** iOS WebKit, LINE's in-app browser included, zooms the page when a field under 16px gets focus, so a global `input, select, textarea { font-size: 16px }` plus the class-specific rules enforce it.
- **44×44 tap targets** via a `--tap-min` token on text and icon buttons (`.link-button`, `.category-delete`, `.row-icon-button`, `.bill-participant-toggle`, etc.).
- **Day-grouped timeline.** `renderTransactionList()` groups by local calendar day under "Today" / "Yesterday" / "Fri, Oct 16" headers with that day's spending, building rows with `buildTransactionRow()`. Used on Home and Transactions; transfers show as "Transfer".
- **Transactions range control.** Cycle / 3 Months / All / Custom pills. "Cycle" shows a `<  >` navigator stepping through billing cycles (`getBillingCycleRange(day, offset)`), labelled in UTC because cycle bounds are UTC midnights. In local UTC+7 the label would read "Oct 1 – Nov 1". Both CSV exports reuse `buildTransactionFilterQuery()`, so exports always match the screen. A `txnLoadSeq` guard drops stale responses when arrows are tapped quickly. The type filter gained "Transfer".
- **Amber budget warning.** `--color-warning` (light and dark); `budgetFillClass()` makes category and event bars amber from 80% and red once over.
- **Bill settlement progress.** Bill detail shows "X of N paid · Y outstanding" with a progress bar, per-participant Paid/Unpaid pills, and Mark Paid / Undo buttons.
- **Fixed in passing (all predate this batch):** `.modal` had no z-index, so the fixed bottom nav covered every sheet's bottom buttons. `.quick-action-button`/`.quick-actions-row` had no CSS at all and rendered as browser-default buttons. Modal titles and lists were double-indented. Add Category and the Advanced toggle had no side gutter. An empty event list drew an empty bordered card. The first block of each tab touched the header.

**Verified**: `uxui_batch1_test.js` (ad hoc, not committed) renders the real LIFF page in headless Chrome via Playwright, with `static.line-scdn.net` routed to a stub `liff` object and data seeded through the API, then checks every item above. That includes the stale-response guard under rapid taps, computed font sizes and button bounding boxes, and zero page JS errors — 23/23. Light and dark screenshots were reviewed. Zero-emoji sweep clean. This stub-SDK harness is how LIFF client code can be tested without a phone; it would have caught the earlier `liff.openWindowExternal` bug if it had existed then.

### UX/UI Batch 2

- **Share bill to LINE** (KhunTong's nudge loop). Bill detail's "Share to LINE" calls `liff.shareTargetPicker()` with a text message: title, outstanding amount, and the public `bill.html?id=` link. Participants are plain names, not LINE accounts, so the bot can't message them; posting the link into the group chat is the substitute. The button is guarded by `liff.isApiAvailable('shareTargetPicker')` and falls back to copying the link with an explanatory message, both outside the LINE app and when shareTargetPicker isn't enabled in the LIFF console (Messaging API channel → LIFF tab → app → shareTargetPicker).
- **Transaction search.** The backend `applySearch()` in `transactionController.js` adds `ilike` on `description` for both the list and export queries. `\`, `%` and `_` in the user's text are escaped so they match literally, and input is capped at 100 chars. A PostgREST quirk: `*` in a like pattern still acts as a wildcard and can't be escaped there; this was accepted. In the LIFF app the search box is debounced 300ms, goes through `buildTransactionFilterQuery()` (so CSV exports match the screen), and the empty state names the search.
- **Floating Add button** (`#fab-add`, z-index 15: above the nav's 10, below `.modal`'s 20). It opens Add Expense from every tab except Settings and replaced Home's duplicate "Add Expense" quick action. `.tab-content` bottom padding was raised so the last row can scroll clear of it.
- **Breakdown total.** The Budgets tab breakdown follows the existing Expense/Income toggle (`categoriesTabType`), deliberately with no second switcher, and shows a large "Spent / Earned this cycle" total.
- **Tap-to-assign chips** replace the itemized split's per-item `<select>`. Each item row stores its assignment in `data-participant` and renders Shared plus participant chips via `renderAssignChips()`. Chips re-render on participant add/rename/remove; an assignment past the end of the list falls back to Shared.

**Verified**: `uxui_batch2_test.js` (ad hoc, not committed, same stub-LIFF headless-Chrome harness; the stub records `shareTargetPicker` calls and can flip `isApiAvailable`) — 29/29. That covers literal `%`/`_` search at the REST level, Add button placement above the nav and visibility per tab, search plus export param parity plus the no-match state, the breakdown under both toggles, the share message contents, the copy-link fallback (checked via clipboard), and chip assign/rename/remove including what `collectItems()` sends. The Batch 1 browser test, `accounts_test.js` and `alerts_test.js` were re-run with no failures. The real share sheet still needs a phone.

### UX/UI Batch 3

- **Spacing and radius scale.** `--space-xs/sm/md/lg/xl` (4/8/16/24/32, with `--space-page` = `--space-md`) and `--radius-input/control/card/modal/pill` (8/12/16/24/999). Every gap/margin/padding literal exactly matching a scale value was swapped for its token, a pure rename with no visual change. The radius values did change: cards 12→16, controls 10→12, sheets 16→24.
- **Account filter.** The backend `applyAccountFilter()` turns `account_id=<uuid>[,<uuid>...]` into a PostgREST `or(from_account_id.eq.X,to_account_id.eq.X,...)`. **Every id is UUID-validated first** because it's interpolated into that filter expression; anything else (including injection attempts like `<uuid>,line_user_id.neq.x`) gets `InvalidFilterError` → 400 on list, CSV and email export alike. In the LIFF app, the "All accounts" button next to the type filter opens a bottom-sheet checklist. Selections apply only on "Show Records", so dismissing via the backdrop changes nothing, and "All Accounts" clears. The button label shows "All accounts" / the one account's name / "N accounts", and the selection flows through `buildTransactionFilterQuery()` into exports. Filtering by account naturally hides transactions with no account attributed.
- **Logging streak** (a stripped-down MeowJot "Salmon Streak": no mascot, no emoji, no penalty modal). `computeStreak()` counts consecutive *local* calendar days with at least one transaction, from Home's existing 6-month fetch (no new request). A streak is still alive if only yesterday is logged, with a hint to log today. "Best" is the longest run in that same window and is labelled "(6 mo)" rather than implying all-time. The 7-day dot row marks today's unlogged dot with a dashed accent outline.
- **Fixed in passing:** Home's cycle label sat unstyled against the page edge and had the same UTC/local end-date bug as the Transactions label ("Oct 1 – Nov 1"). Both now use a shared `formatCycleLabel()`.

**Verified**: `uxui_batch3_test.js` (ad hoc, same harness) — 27/27. That covers account_id matching both transfer sides, OR across multiple ids, 400s on a non-UUID and on an injection attempt, CSV export honouring and validating account_id, streak current/best/7-dot/alive-yesterday/zero cases, computed 16px/24px radii, sheet list/backdrop-dismiss/apply/two-selection label/clear, and zero JS errors. The Batch 1 and 2 browser suites and `accounts_test.js` / `alerts_test.js` / `bills_test.js` were re-run with no failures.

**Account label fix (follow-up):** rows used to show `payment_method`, which defaults to "CASH", even when an account was attributed, so a Kbank expense read "CASH". The transaction list/get/update selects now embed `from_account`/`to_account` names (`accounts!transactions_from_account_id_fkey` / `..._to_account_id_fkey`, the same hint `transactionCreate.js` already used), and `transactionSourceLabel()` in the LIFF app shows the account, `From → To` for transfers, falling back to `payment_method` only when no account is attributed. Covered by 5 added assertions in `uxui_batch3_test.js` (32/32). The CSV export (download and email both, via the shared `services/csvExport.js`) gained an **Account** column, appended last so position-based spreadsheets keep working: account name, `From → To` for transfers, blank when none. The Payment Method column still exports the raw `payment_method`. `uxui_batch3_test.js` checks the header, BOM, per-row values and column count (39/39).
