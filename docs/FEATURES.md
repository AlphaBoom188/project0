# Feature Notes (detailed)

The detailed build notes for every feature: design decisions, scoping calls, edge cases, how each was verified, and the debugging stories behind the gotchas. Moved here from CLAUDE.md on 2026-11-19 to keep CLAUDE.md short; CLAUDE.md has the conventions and a one-paragraph summary per feature. Older sections describe the state at the time they were written; where they disagree with the code, the code wins (for example, event-budget months and cycle labels now use Bangkok time, not UTC).

---

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
- `GET/POST /api/recurring/:line_user_id`, `PUT/DELETE /api/recurring/:line_user_id/:recurring_id` - Recurring expense/income rules (optional `pay_start_day`/`pay_end_day`; monthly rules with a window come back with a computed `pay_status`)
- `PATCH /api/recurring/:line_user_id/:recurring_id/paid` - `{ paid: true|false }` for the rule's *current* pay period (computed server-side); 400 for rules without a monthly pay window
- `GET/POST /api/accounts/:line_user_id`, `PUT/DELETE /api/accounts/:line_user_id/:account_id` - Bank/credit card/e-wallet/cash accounts; `POST /api/transactions/:line_user_id` with `type: "transfer"` moves money between two of them
- `GET/POST /api/bills/:line_user_id`, `GET/DELETE /api/bills/:line_user_id/:bill_id`, `PATCH /api/bills/:line_user_id/:bill_id/participants/:participant_id` - Shared bills (equal/custom/itemized split), creator-scoped
- `POST /api/bills/:line_user_id/scan-items` - OCR a receipt into itemized line items for an itemized split (no transaction/dedup involved)
- `GET /api/bills/public/:bill_id`, `PATCH /api/bills/public/:bill_id/participants/:participant_id` - Unauthenticated bill view + self-serve mark-paid, for participants who never open the app (bill_id is the access token)
- `GET/POST /api/portfolio/:line_user_id`, `PUT/DELETE /api/portfolio/:line_user_id/:holding_id` - Investment holdings (stock/etf/crypto/mutual_fund/gold) with computed market value/gain and allocation %; GET also returns emergency fund status
- `POST /api/portfolio/:line_user_id/:holding_id/refresh-price`, `POST /api/portfolio/:line_user_id/refresh-all` - Live price refresh (Yahoo Finance for stock/etf, CoinGecko for crypto); 400s for mutual_fund/gold, which have no live source
- `PUT /api/users/:line_user_id/emergency-fund` - Set the emergency fund goal amount and/or which existing account tracks progress
- `GET/POST /api/budget-events/:line_user_id` (`?month=YYYY-MM-01`), `PUT/DELETE /api/budget-events/:line_user_id/:event_id` - One-off, single-month event/occasion budget buckets layered on a category, with computed `spent`/`remaining`/`percent`
- `POST /api/voice/:line_user_id/parse` - LIFF mic button: `{ audio_base64, mime_type }` (audio/mp4, webm, ogg, mpeg, wav; max 3 MB) -> `{ transcript, provider, expense: { is_expense, amount, description, category_id, category_name } }`; writes nothing (422 when nothing was heard)
- `GET /api/groups/:line_user_id`, `GET /api/groups/:line_user_id/:group_id` - Read-only LINE group split-tracker views for the LIFF Groups card (group ids must be `C`/`R` + 32 hex, else 400; 404 unless the user is or was a member)
- `POST /api/statements/:line_user_id/parse`, `POST /api/statements/:line_user_id/import`, `POST /api/statements/:line_user_id/undo` - Bank statement import (KBank savings/current, Bangkok Bank savings) and undoing one import: preview from pdf.js text pieces, then insert the kept rows (see Bank Statement Import below)
- `GET /api/google/login-url/:line_user_id`, `GET /api/google/callback` - Google OAuth used *only* to verify the CSV-export email (not a login method); 501 if not configured
- `GET /api/line/login-url` - Generate LINE Login URL
- `GET /api/line/callback` - Handle LINE OAuth callback
- `POST /api/ocr/scan/:line_user_id` - Scan a receipt image (OpenAI Vision), extract amount/date/merchant/category, and check `slip_hash` for duplicates
- `POST /api/line/webhook` - LINE Bot webhook (signature-verified). Handles `follow` (provisions the user), text messages (free-text expense parsing, e.g. "coffee 120", plus a "summary"/"สรุป" command), image messages (same OCR pipeline as the REST endpoint), audio messages (Thai voice, transcribed then parsed like text; see Thai Voice Messages below), and `postback` (Confirm/Cancel on the resulting Flex card). Events from a **group or room** go to the split tracker instead (`controllers/lineGroupHandler.js`, see LINE Group Split Tracker below)

### Calendar: Asia/Bangkok everywhere

Every calendar boundary uses **Bangkok midnight**, never UTC midnight. The backend gets it from `services/bangkokDay.js` (`bangkokParts`, `bangkokMidnight`, `getBangkokDayRangeISO`, `getBangkokYmd`); the LIFF app (`app.js`) mirrors the same helpers, so the result doesn't depend on the phone's timezone setting. Bangkok has no DST, so the fixed +7h offset is exact. Covered:
- category budget periods (`budgetAlert.js` and the LIFF budget bars; weeks start Sunday);
- billing cycles (the LIFF app and the bot's "summary" command);
- event-budget months (alert check and progress bar);
- the daily digest and activity reminders;
- pay windows;
- the Monthly Pulse month buckets;
- the Transactions Custom date range;
- form date defaults.

UTC midnight used to make daily budgets reset at 07:00 and pushed midnight-to-7am spending into the previous day or month (`tests/api/bangkok_periods.test.js` fails 7 checks on the old code). Dates the forms submit are stamped `T12:00:00Z` (19:00 Bangkok, same date), which is intentional and safe. The day headers in transaction lists and the streak still use the phone's local time, which is the same thing for a phone set to Thailand.

### Tests

```bash
cd backend
npm start                 # in another terminal -- suites go through the real HTTP API
npm test                  # api + liff suites, free (~3 min)
npm test -- bills         # only suites whose path contains "bills"
npm test -- -v            # full output of every suite
npm run test:openai       # line_webhook + preferences_opt_out + voice_message: real OpenAI calls (a few cents)
```

- **Suites run against the real Supabase project** in `backend/.env`; there's no separate test database. Every suite only creates users with a `test_` prefix (or a random `U<hex>` id), deletes everything it created, and the runner runs suites one at a time. When adding a suite, keep both rules, and never call a job's all-users entry point without scoping it. `processDueRecurringTransactions`, `sendDailyDigest` and `sendActivityReminder` all take `{ lineUserId }` for exactly that, so a test can't fire real users' rules or digests; the crons pass nothing.
- **Layout.** `backend/tests/api/` holds REST/backend suites. `tests/liff/` holds headless-Chrome suites (`playwright-core` with `channel: 'chrome'`, so it needs Google Chrome installed); they route `static.line-scdn.net` to a stub `liff` object, which is how LIFF client code gets tested without a phone. Screenshots go to `tests/.output/` (gitignored). `tests/openai/` holds opt-in suites with real OpenAI calls. `tests/fixtures/receipt.jpg` is a synthetic receipt (GREENLEAF CAFE, 320.00). `tests/lib.js` gives `BASE` (`TEST_BASE_URL`, default `http://localhost:$PORT`), `BACKEND`, `FIXTURES`, `OUTPUT`.
- **Testing changed backend code without touching the live server:** start a second instance with `DISABLE_CRON=1 PORT=3100 node index.js`, then run `TEST_BASE_URL=http://localhost:3100 npm test`. **`DISABLE_CRON=1` is mandatory** for any extra instance; only one process may run the scheduled jobs, or users get every LINE push twice.
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
   - 014_recurring_paid_period.sql
   - 015_investment_lots_goals.sql
   - 016_line_groups.sql

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
│   │   ├── lineWebhookController.js # LINE Bot webhook (follow/text/image/audio/postback); routes group/room events to lineGroupHandler
│   │   ├── lineGroupHandler.js  # LINE group split tracker: join/leave, passive members, expenses, balance, settle, undo
│   │   ├── ocrController.js     # Receipt OCR (OpenAI Vision)
│   │   ├── recurringController.js # Recurring expense/income rule CRUD
│   │   ├── accountController.js # Accounts/wallets CRUD
│   │   ├── billController.js    # Shared bills: create/list/detail/delete, settlement, public share view
│   │   ├── portfolioController.js # Investment holdings CRUD + computed value/gain/allocation + emergency fund status
│   │   ├── statementController.js # Bank statement import: parse (preview) + import
│   │   ├── groupController.js   # Read-only LINE group balances for the LIFF Groups card
│   │   └── voiceController.js   # LIFF mic: transcribe + parse a recording into expense fields
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
│   │   ├── voiceTranscription.js # voice -> text: Typhoon ASR (m4a converted to WAV) if TYPHOON_API_KEY, else/fallback OpenAI
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
│   │   ├── marketPrices.js      # Live prices: Yahoo Finance (stock/etf), CoinGecko (crypto); mutual_fund/gold are manual-only
│   │   ├── groupSplitMath.js    # pure: group message parsing, equal splits, net balances, who-pays-whom
│   │   ├── groupLedger.js       # group/member/expense DB ops + each member's share into their personal ledger
│   │   ├── statementParser.js   # pure: positioned PDF text -> KBank statement rows, signs from the running balance, totals cross-check
│   │   ├── statementImport.js   # preview: row keys, own-transfer/duplicate/imported status, keyword-then-LLM categories
│   │   └── statementTransfers.js # own-account transfers across statements: Transfer entries, matching and merging
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

✅ **Receipt thumbnails** — `services/receiptThumbnail.js` resizes (`sharp`, ~320px JPEG) and uploads to a **private** Supabase Storage bucket (`receipt-thumbnails`), used by both the REST OCR endpoint and the bot's image handler. `transactions.thumbnail_url` stores the raw storage *path*, not a usable URL — `services/signedUrl.js` mints a fresh 1-hour signed URL every time transactions are read (`transactionController.js`'s get/list/create/update) or shown in a bot confirmation card. Thumbnails upload at scan time, not confirm time, so a scan that's never saved leaves a small orphaned object in storage — accepted as a low-cost tradeoff rather than building save-time-only upload plumbing. **`thumbnail_url` is validated on create and update** (`isOwnThumbnailPath()` in `services/receiptThumbnail.js`): it must be exactly `<own line_user_id>/<ms timestamp>-<8 hex>.jpg`, the shape `uploadThumbnail()` produces. The server signs whatever path is stored, so without the check a client could point its own transaction at another user's receipt and get a working link to it (`tests/api/thumbnail_path.test.js`).

✅ **Notifications** — split by trigger, not both scheduled: budget-threshold alerts (`services/budgetAlert.js`) are event-driven, checked immediately after each expense insert in `transactionCreate.js` (fire-and-forget; fires exactly once on crossing a category's `budget_amount`/`budget_period`, not on every subsequent over-budget transaction); the daily digest (`jobs/dailyDigest.js`, `node-cron`) runs once at 21:00 Asia/Bangkok, pushing that day's income/expense/net to every opted-in user with activity that day. Both respect per-user preferences below. Only reaches users who've messaged the bot at least once; be mindful of LINE's free-tier monthly push message cap at scale.

✅ **User preferences** (migration `005_add_user_preferences.sql`) — `users.notifications_enabled` and `users.thumbnails_enabled`, both default `TRUE`. `services/userPreferences.js` reads them and **fails open to both defaults** if the columns are ever missing, so rollout ordering can't break anything. Toggleable from the LIFF Settings screen (Phase 3).

✅ **LINE MINI App (LIFF)** — `liff-app/` (plain HTML/JS, no build step), served by the backend itself at `/liff` (same server, same tunnel as the webhook — no separate hosting). `liff.init()` → `liff.getProfile()` gets `userId`/`displayName`/`pictureUrl` directly inside LINE's in-app browser, no OAuth redirect needed; provisions via the existing `POST /api/users`. Shows the current billing-cycle summary and recent transactions (with thumbnails), a manual "Add Expense" form (now with in-browser camera/file receipt OCR, Phase 3), and a Settings screen (Phase 3). Needs `LIFF_ID` set and the LIFF app's Endpoint URL registered to `https://<tunnel>/liff/` in the LINE Developers Console.

### Phase 3

Scoped against `docs/PHASE_3_SPEC.md` — note that spec's own SQL migration assumed a schema we don't actually have (`users.id` UUID PK, a from-scratch `categories` table) and was reconciled rather than applied literally; see migration `006_phase3_schema.sql`'s header comment.

✅ **LIFF Settings screen** — originally a gear-icon-accessed view, now the ตั้งค่า tab (see Phase 5): toggles for `notifications_enabled`/`thumbnails_enabled` (`PATCH /api/users/:line_user_id/preferences`), budget cycle start day (reuses the existing `PUT /api/users/:line_user_id/billing-cycle` — deliberately *not* the spec's separate `budget_cycle_start_day` column, to avoid two columns meaning the same thing), and a "Clear Transaction History" destructive action gated behind a custom confirm modal (`DELETE /api/transactions/:line_user_id/all` — registered before the `:transaction_id` wildcard route so `/all` isn't swallowed by it).

✅ **In-LIFF receipt OCR** — the Add Expense modal's `<input type="file" accept="image/*" capture="environment">` resizes the photo client-side (canvas, ~1280px JPEG q0.7, mirroring the iOS app's approach), hashes it (`crypto.subtle.digest`), and POSTs to the same `/api/ocr/scan/:line_user_id` the REST/bot paths already use — no new backend endpoint, same dedup and thumbnail pipeline.

✅ **Auto-categorization** — `services/autoCategorize.js`: cheap keyword matching against the user's category names first (English + Thai hints), an LLM call (`gpt-4o-mini`) only if that misses, falling back to "Others" so a category is always returned. Wired into `transactionController.createTransaction` — `category_id` is now optional for an expense *if* a `description` is given (income still requires an explicit category_id); existing callers that always pass `category_id` are unaffected. In the LIFF Add Expense form the Category field defaults to "Auto-Categorize" (no emoji, see Phase 5), not the first real category — leaving it as-is omits `category_id` from the request entirely.

**Note:** `express.json()` has an explicit `limit: '10mb'` — the default is 100kb, which a base64-encoded receipt photo (even resized client-side) routinely exceeds; this surfaced as a 413 once real phone photos were tested (a tiny synthetic test image had been masking it). `apiRequest()` in `liff-app/app.js` always prefixes thrown errors with the real HTTP status (`[413] ...`) for exactly this kind of failure.

- [ ] Custom per-category budget alerts UI, Thai voice-to-text, PDF statement import, multi-user/group support, paywall UI — all named in `docs/PHASE_3_SPEC.md` but out of scope so far

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

✅ **Flexible recurring date windows** — `recurring_transactions.pay_start_day`/`pay_end_day` (optional, 1-31), exposed in the LIFF recurring form. **Behavior (decided later):** auto-logging is unchanged and still fires on `next_run_date`. On top of it, **monthly** rules with a window get pay reminders from `jobs/payWindowReminders.js` (09:00 Asia/Bangkok, gated by `notifications_enabled`): "due between X and Y" on the start day, and "overdue" the day after the end day unless that month is marked paid. All date math lives in `services/payWindow.js`, on Bangkok calendar dates as `YYYY-MM-DD` strings:
  - A window can wrap the month end (28 to 3); the period is the month it starts in.
  - Days clamp to short months (31 becomes Feb 28).
  - With only an end day, the window starts on the 1st (no due reminder, overdue only). With only a start day, the window ends that same day.

  Paid tracking is a single `paid_period DATE` column (migration 014): the first day of the period last marked paid. A new month simply doesn't match it, so no reset job is needed. LIFF Budgets → Advanced shows "Due Oct 1 – Oct 5" with Unpaid/Overdue/Paid and Mark Paid/Undo. `sendPayWindowReminders({ lineUserId, now })` is scopable for tests. Tests: `tests/api/pay_window.test.js` (27) and `tests/liff/pay_window_list.test.js` (7).

✅ **LIFF UI** — Accounts section folded into the existing หมวด/งบ tab (list with live balances, "+Add Account", "Transfer Between Accounts") rather than a 6th nav tab.

**Verified**: new `accounts_test.js` (ad hoc, not committed) — full account CRUD, a transfer correctly moving money between two account balances, an account-attributed expense/income adjusting the right side, same-account transfer rejected, deletion blocked while in use, pay-window validation (including rejecting a day outside 1-31), and a regression check that a plain expense with no account still works exactly as before. Full `line_webhook_harness.js` suite still 19/19 unaffected (nothing in the shared `transactionCreate` path broke for the LINE Bot). The Supabase PostgREST explicit-FK-disambiguation syntax (`accounts!transactions_from_account_id_fkey`), needed because `transactions` now has two FKs to the same `accounts` table, was guessed from Postgres's default constraint-naming convention and confirmed correct by the passing test rather than inspected directly (no raw catalog access via the JS client).

### Design System — Dark/Light Theme Engine

Pure LIFF frontend work (`liff-app/style.css`, `index.html`, `app.js`); no backend or migration involved. Zero-emoji rule re-verified, not relaxed.

✅ **Design tokens** — every hardcoded color in `style.css` replaced with CSS custom properties on `:root` (`--color-bg`, `--color-surface`, `--color-surface-alt`, `--color-track`, `--color-border`, `--color-text-primary`, `--color-text-secondary`, `--color-text-on-accent`, `--color-accent`, `--color-income`, `--color-expense`, `--color-danger-bg`/`-text`/`-border`, `--color-overlay`, `--shadow-card`), plus a small spacing/radius scale (`--radius-card`, `--radius-control`, `--radius-input`, `--space-page`). Deliberately consolidated several near-duplicate grays from the old file (`#eee`/`#f0f0f0`/`#f5f5f5`/`#ddd`) into the smaller token set rather than giving every literal its own 1:1 variable — that consolidation is itself part of what makes it a design system instead of a mechanical find-replace. One literal intentionally left as-is: `.profile-picture`'s `rgba(255,255,255,0.3)` placeholder tint, since it's a translucent overlay on the header's fixed accent color in both themes, not a themed surface. The `[hidden] { display: none !important; }` rule from the earlier modal-close bug fix was preserved exactly.

✅ **Dark theme values** — layered two ways so the more specific one always wins: `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {...} }` for following system preference, and `:root[data-theme="dark"] {...}` for an explicit user override (same values in both blocks). Brand/semantic colors (accent green, income, expense) intentionally stay constant across themes; only surface/text/border/overlay/shadow tokens change. Card shadows are turned off in dark mode (`--shadow-card: none`) since shadows don't read well on dark backgrounds — card definition there comes from the `--color-border` outline already added to every card-like element.

✅ **Theme toggle + persistence** — System/Light/Dark control (`.theme-toggle` buttons) in Settings → new "Appearance" section, above Preferences. Persisted to `localStorage` only (explicit choice, not a new `users` column — this is a device preference, not account data). A small inline script in `index.html`'s `<head>`, before the stylesheet's render, reads `localStorage` and sets `data-theme` on `<html>` pre-paint to avoid a flash of the wrong theme on load. `app.js` owns the live toggle (`applyTheme()`/`setTheme()`), runs independent of `liff.init()`/login so it works even before the network round-trip completes.

**Verified**: `node --check app.js` clean; grep sweep confirmed every hex/rgba literal in `style.css` now lives only inside the three token-definition blocks (plus the one intentional exception above); emoji-range regex swept `index.html`/`app.js`/`style.css` clean. Full `accounts_test.js` regression (14/14) re-run after these changes — expected to be unaffected since this is pure frontend CSS/JS, confirmed rather than assumed. Visual confirmation (actual light/dark rendering, toggle behavior in the LINE in-app browser) still needs the user's phone — no browser automation was available this session to render LIFF's authenticated context.

### Shared-Bill Engine ("KhunThong"-style bill splitting)

Reconciled against `docs/phase_2_product_architecture_blueprint.md` section 7 — see migration `010_shared_bills.sql`'s header comment for the full rationale. The blueprint's own schema links participants back to a `users.id UUID` row; this project made a different, deliberate call: participants are plain display names, not linked LINE accounts, since the entire point of splitting a bill is working with people who may never open this app. Linking a participant to a real account and pushing them LINE notifications server-side is an intentionally deferred decision, same pattern as `pay_start_day`/`pay_end_day` in Phase 2A — not built, not guessed at.

✅ **Three split types** (`services/billSplit.js`) — all math done in integer cents to avoid float drift, only converting back to decimal at the end. **Equal**: total divided among the creator + every participant; the creator's own slot is computed but intentionally dropped (this app only tracks what *other* people owe the creator). **Custom**: the creator names each participant's amount directly with no sum-to-total requirement ("you owe me 200, you owe me nothing" is valid). **Itemized**: each item is assigned to one participant or left shared (split evenly across everyone including the creator, same dropped-creator-slot rule); `total_amount` must equal the sum of all item amounts exactly, validated server-side.

✅ **Itemized OCR mapping** — `services/billItemExtraction.js`, a second OpenAI Vision prompt separate from `services/receiptExtraction.js` (that one extracts a single total+category for recording *one* expense; this one extracts itemized line items for *splitting* a bill — no slip_hash dedup or thumbnail upload, since a bill split isn't itself a transaction). `POST /api/bills/:line_user_id/scan-items` is read-only — nothing is written until the bill itself is created.

✅ **Settlement without a second LINE account** — `shared_bills.status` auto-flips between `'active'`/`'settled'` (`refreshBillStatus()` in `billController.js`) every time a participant's `is_paid` changes, in either direction (un-marking a payment reopens the bill). Two ways to mark paid: the creator directly in the LIFF app (`PATCH /api/bills/:line_user_id/:bill_id/participants/:participant_id`), or the participant themselves via a share link — `GET/PATCH /api/bills/public/:bill_id[/participants/:participant_id]`, deliberately unauthenticated, the bill's UUID acting as the access token (same trust model as any payment-split link). These public routes are registered *before* the `/:line_user_id` routes in `billRoutes.js` so `"public"` isn't swallowed as a `line_user_id` value — the same ordering gotcha the `/all` transactions route hit in Phase 3.

✅ **LIFF UI** — folded into the Dashboard (สรุป) tab as a new "Shared Bills" section (list + "+ Split a Bill"), not a 6th nav tab, same pattern as Accounts living inside หมวด/งบ. The create modal's participant/item rows are built dynamically (add/remove), with the itemized item-assignment `<select>` kept in sync with participant names live via an `input` listener. `liff-app/bill.html`/`bill.js` is a *separate*, intentionally login-free static page (no `liff.init()`) for the share-link recipient — reuses `style.css` for visual consistency but is otherwise independent of `app.js`.

**Verified**: new `bills_test.js` (ad hoc, not committed) — all three split types including cent-remainder distribution on equal splits, itemized total/participant_index validation, custom split's negative-amount rejection, status auto-settle/reopen on payment toggle, public view + public self-serve mark-paid, 404 on an unknown bill_id, and a check that deleting with the wrong `line_user_id` silently no-ops rather than deleting someone else's bill — 26/26. Full `accounts_test.js` regression (14/14) re-run, unaffected. Hit one real deployment snag along the way: right after running the migration, the backend 500'd with `Could not find the table 'public.shared_bills' in the schema cache` — not a failed migration, but PostgREST's schema cache not yet having picked up the new tables; resolved itself within about a minute (now called out in the Database Setup section above so it doesn't look like a broken migration next time). Zero-emoji sweep re-verified across all five LIFF files including the two new ones.

### Dual-Channel Alert Routing & Smart Reminders

Maps to `docs/phase_2_product_architecture_blueprint.md` section 3. One honest scoping note up front: "channel-aware routing" is only meaningful for an alert that's a *response to a live request* — the budget-crossing check below. A *scheduled* reminder has no live request to respond through, and there is no way to push a notification into a closed/backgrounded LIFF web page (no service worker/PWA infra here), so the activity-reminder job below can only ever deliver via LINE push. That's called out in its own code comment rather than pretending a fake "dual channel" exists for it.

✅ **Budget alerts now route by channel, never both** — `services/budgetAlert.js` was split into `evaluateBudgetAlert()` (pure DB-only check, cheap enough to `await` inline) and `pushBudgetAlertIfEnabled()` (the actual LINE push, still fire-and-forget). `transactionCreate.js` takes a new optional `channel` param: `channel: 'liff'` means the result is handed back in the create-transaction response as `budget_alert` instead of being pushed — the LIFF frontend shows it as an instant in-app banner (`showBudgetAlert()` in `app.js`, auto-hides after 8s). Every other value (`'line_chat'` from the bot webhook, `'system'` from the recurring-transactions job, or simply omitted — e.g. the iOS app, untouched) keeps the original LINE-push behavior unchanged. The two paths are mutually exclusive by construction (one `if (channel !== 'liff')`), so one budget crossing can never produce two alerts — directly the blueprint's "eliminate duplicate alerts" goal, achieved by trusting which endpoint handled the request rather than building a separate presence/heartbeat system to guess which channel the user is "active" on.

✅ **Activity-detection reminders** (`jobs/activityReminders.js`, new) — two fixed `node-cron` times, 12:00 and 20:00 Asia/Bangkok (matching the blueprint's own example), each pushing a nudge via LINE to any opted-in user who hasn't logged a single transaction yet today. "Yet today" is computed against the actual Bangkok calendar day (hardcoded +7h offset — Asia/Bangkok has no DST, so this is always correct), via `services/bangkokDay.js`'s `getBangkokDayRangeISO()`. That helper is now also used by `dailyDigest.js`, which used to count "today" as the UTC day: at its 21:00 Bangkok run that window was 07:00 today to 07:00 tomorrow, so anything logged between midnight and 7am Bangkok time was missing from the evening digest. That is fixed, and covered by `tests/api/daily_jobs.test.js`, which was confirmed to fail on the old code. No per-user-configurable times were built (the blueprint's "configurable" is a bigger lift: a settings UI + DB columns + dynamic per-user cron registration) — two fixed times ship the real value now; configurability is a deferred enhancement, same pattern as other scoped-down items in this project.

**Verified**: new `alerts_test.js` (ad hoc, not committed) — an under-budget expense returns `budget_alert: null`; a budget-crossing expense with `channel: 'liff'` returns the alert with correct category/total and the server log shows zero push attempts for it; a budget-crossing expense with `channel: 'line_chat'` still returns the alert *and* the log shows exactly one push attempt (which 400s for the fake test user, expected — same failure mode confirms the push was genuinely attempted, not skipped); a third expense while already over budget confirms the one-time-only crossing behavior is unchanged — 6/6. `activityReminders.js`'s `sendActivityReminder()` called directly against a user with a transaction logged today (zero push attempts, confirmed via log) and a user with none (one push attempt, confirmed via log) — activity detection correctly distinguishes the two. Full `accounts_test.js` (14/14) and `bills_test.js` (26/26) regressions re-run after the `transactionCreate.js` signature change — unaffected, since `channel` is a new optional field with no default-behavior change for any value other than exactly `'liff'`. Zero-emoji sweep re-verified across all LIFF files (the new budget-alert banner text has none; the bot's own `⚠️` push message is the pre-existing, intentionally untouched non-LIFF surface).

### Investment Portfolio & Asset Tracking

Maps to `docs/phase_2_product_architecture_blueprint.md` section 8. One deliberate, explicit scope cut up front: **live prices only exist for `stock`/`etf` (Yahoo Finance's unofficial, keyless chart endpoint) and `crypto` (CoinGecko's public API)** — `mutual_fund` and `gold` have no reliable free global pricing API (Thai mutual fund NAVs in particular are on neither service), so those two are manual-price-entry only, by design, not as a stopgap. This is called out in migration `011_portfolio.sql`'s header comment, `services/marketPrices.js`'s header comment, and surfaces to the user directly (a 400 with a clear message on refresh, a hint string in the LIFF add/edit form).

✅ **Holdings CRUD with computed fields** — `asset_holdings` (migration `011_portfolio.sql`), `line_user_id`-keyed like everything else. `portfolioController.js`'s `withComputedFields()` derives `cost_basis`, `market_value`, `gain`, `gain_percent` on every read rather than storing them (they're pure functions of `quantity`/`average_cost`/`current_price`, so storing them would just be a cache that could drift). `market_value` falls back to `cost_basis` when there's no price yet, so the frontend never has to null-check it before summing.

✅ **Live price refresh** — `services/marketPrices.js`: `fetchStockOrEtfPrice()` (Yahoo Finance, plain ticker) and `fetchCryptoPrice()` (CoinGecko, which needs its own coin id like `"bitcoin"` — NOT a ticker like `"BTC"`, since tickers aren't unique across coins there). Both are public/keyless, which also means unofficial and best-effort — every call is wrapped with a 10s timeout and a clear thrown message, never a crash. `POST /api/portfolio/:line_user_id/refresh-all` refreshes every live-priced holding, one failure doesn't block the rest, and failures are reported back per-symbol rather than silently dropped.

✅ **Emergency Fund points at an existing account, not a new ledger** — `users.emergency_fund_goal_amount` + `users.emergency_fund_account_id` (FK to `accounts`, Phase 2A). "Current amount saved" is read live from that account's real `balance` rather than duplicated into a second number that could drift out of sync — exactly one source of truth for any given pile of money. Configured via `PUT /api/users/:line_user_id/emergency-fund` (validates the account actually belongs to the user); surfaced via `GET /api/portfolio/:line_user_id`'s `emergency_fund` field (`goal_amount`, `current_amount`, `percent_funded`) since that's where the LIFF Portfolio section actually renders it.

✅ **Surplus allocation nudge** — computed client-side only (no new backend endpoint): the Analytics tab's existing current-billing-cycle transaction fetch is reused to compute net surplus, and if an emergency fund is configured and under its goal, a one-line suggestion renders ("Surplus this period: X. Consider adding it to \"Account\" (Y% funded) or your portfolio."). At goal, the suggestion flips to recommending the portfolio instead. With no emergency fund configured, the whole card stays hidden — there's nothing true to say about progress toward a goal that doesn't exist yet.

✅ **LIFF UI** — folded into the Analytics (วิเคราะห์) tab as a new "Portfolio & Net Worth" section (value/cost/gain summary, allocation-by-type bars reusing the existing category-breakdown chart markup, emergency fund progress bar, holdings list, "+ Add Holding"/"Refresh Prices" buttons), not a new tab — same pattern as Accounts folding into หมวด/งบ and Shared Bills folding into สรุป. The add/edit holding modal locks `asset_type`/`symbol` once editing (same UX precedent as the Category edit modal locking name/type) and swaps between a live-price hint and a manual current-price field depending on the selected type. Emergency Fund goal/account configuration lives in Settings, next to Budget Cycle and Email — same precedent as every other account-level setting.

**Verified**: new `portfolio_test.js` (ad hoc, not committed) — holding creation across types including a manual `current_price` on a gold holding; `market_value` falling back to `cost_basis` with no price; validation (bad `asset_type`, negative `quantity`); totals and allocation-percentage math; an update recomputing `cost_basis`; `refresh-price` correctly rejecting a manual-only type (gold, 400) while a **real, live call to Yahoo Finance for AAPL succeeded** and returned a real-looking market price; `refresh-all` attempting exactly the one live-priced holding and skipping gold; emergency fund status starting unset, then correctly reading a real linked account's balance and computing `percent_funded`, rejecting an account that doesn't belong to the user, and clearing cleanly — 20/20. A separate direct call to `fetchCryptoPrice('bitcoin')` also succeeded live against CoinGecko, and an invalid coin id failed with the intended clear message rather than crashing. Full `accounts_test.js` (14/14), `bills_test.js` (26/26), and `alerts_test.js` (6/6) regressions re-run after these changes — all unaffected. Zero-emoji sweep re-verified across all LIFF files.

### Investments Phase A — Lots & Gains

Spec: `docs/master_uxui_specification_finance.md` (the owner's adaptation decisions are at the top). Migration `015_investment_lots_goals.sql`. Built by a subagent from a written brief, then reviewed and re-verified by the lead before commit.

✅ **Lots are the source of truth.** `asset_lots` stores one row per buy or sell: quantity to 6 decimals, price and fee in the holding's currency, and `trade_date` as a Bangkok calendar date.
- `asset_holdings.quantity`/`average_cost` are a server-maintained cache of the open position, rewritten after every lot create, update or delete. A fully sold holding stays listed with quantity 0 and its realized gain.
- `services/lotMath.js` (pure, no DB) replays lots in trade order (trade_date, then created_at) and matches sells to buys **FIFO**. Buy fees add to cost basis; sell fees reduce proceeds. Realized gain = proceeds − matched cost. A buy lot is "closed" once fully consumed. Win rate = closed lots with a positive realized gain ÷ closed lots (null when there are none). Quantities are matched in integer micro-shares so fractional shares never drift.
- Every lot write first replays the whole history with the change applied. A create, edit or delete that would leave a sell exceeding the shares held at its date returns 400 and writes nothing. Future trade dates are rejected.

✅ **Endpoints.** The literal `lots` routes are registered before `/:u/:holding_id`, with a `router.param('lot_id')` UUID check.
- `GET /api/portfolio/:u/lots`: all lots, newest first, each with its holding's symbol, name, currency and asset type, plus `total`.
- `GET|POST /api/portfolio/:u/:holding_id/lots`.
- `PUT|DELETE /api/portfolio/:u/lots/:lot_id`.
- `POST /api/portfolio/:u` still takes the old body (quantity + average_cost, plus optional `currency` and `trade_date`) and creates the holding plus one opening buy lot (default today, Bangkok).
- `PUT` on a holding changes only name, current_price and currency. Sending quantity or average_cost returns 400 ("add or edit a lot instead").

✅ **Currency and THB totals.** `asset_holdings.currency` is 'THB' or 'USD'; it defaults to THB for `.BK` symbols, mutual funds and gold, otherwise USD.
- `services/fxRates.js` gets USD→THB from Yahoo `USDTHB=X`, cached in memory for 15 minutes. It keeps the last good rate if a refresh fails and backs off before retrying; concurrent fetches are merged into one. If no rate has ever been fetched, it throws: a portfolio GET with USD holdings then returns 502 rather than treating USD as THB.
- `GET /api/portfolio/:u` returns per holding, computed from lots: quantity, average_cost, cost_basis, market_value, unrealized_gain (+%), realized_gain, fees, day_gain (+%), total_gain (+%, against total buy cost), win_rate, lots_open/closed, plus `*_thb` versions.
- The top level carries `fx_usd_thb`. `totals` are in THB: `total_value`, `total_cost_basis`, `unrealized_gain`, `realized_gain`, `total_gain`, `day_gain`, `fees`. **`totals.total_gain` now means unrealized + realized**; the old value-minus-cost figure is `totals.unrealized_gain`. Allocation is by THB value.

✅ **Day's gain.** A price refresh also stores `previous_close` (Yahoo `chartPreviousClose`; for CoinGecko it's derived from `usd_24h_change`). Day's gain = (current_price − previous_close) × open quantity, or null if either is missing. Crypto is priced in the holding's own currency. A Yahoo quote in a different currency than the holding is rejected with a clear message.

✅ **LIFF.**
- **Net Worth:** holding rows show market value (in the holding's currency), total gain and today's gain. Totals are in ฿, with a Today / Realized / USD-THB line underneath.
- **Holding detail sheet** (tap a holding): a My Holdings card (Day's gain, Total gain, Shares to 5 decimals, Average cost, Market value, Realized gain, Win rate, "Lots: N open / M closed"), the lot list, Add Lot, and Edit/Delete holding.
- **Add/Edit Lot sheet:** Buy | Sell toggle, Bangkok date defaulting to today, shares, cost per share (prefilled with the current price), fee, comment. Delete is in the edit sheet, through `confirmAction()`; `#confirm-modal` now has `z-index: 30` so it stacks above other sheets.
- **Add Holding:** a THB/USD select that follows the symbol and type until the user touches it.
- **Transactions tab:** an "Investments" type option lists lots, filtered client-side (range pills by `trade_date`, search by symbol, name or comment). The account filter and CSV exports are hidden in that view, since exports cover cash transactions only.

**Tests:**
- `api/lot_math` (37): pure FIFO, covering fees, partial and multi-lot closes, win rate, 6-decimal fractions, overselling, same-day ordering.
- `api/lots` (63): endpoints, cache recompute, realized gain and win rate via the API, validation, cross-user 404s, currency defaults, day's gain, THB totals against `fx_usd_thb`, cascade on holding delete.
- `liff/holdings_lots` (23): detail card numbers, adding a buy and a sell through the UI, the inline oversell error, the Investments filter and date range.
- `api/portfolio` was updated: THB totals via `fx_usd_thb`, and quantity/average_cost changes now go through a lot.

**Accepted limitations:** lot writes are read-validate-write, not transactional (same tradeoff as `accountBalance.js`). Investments rows on the Transactions tab can't be tapped; lots are edited from the holding sheet.

### Investments Phase B — Benchmark Performance Chart

Spec: `docs/master_uxui_specification_finance.md` Screen 2.1, adapted. No migration. Built by a subagent, then reviewed and re-verified by the lead (25/25 suites, plus a read-only check against a real portfolio: the last point equals `totals.total_value` exactly).

✅ **Endpoint.** `GET /api/portfolio/:u/performance?range=1m|3m|6m|ytd|1y|3y|5y|all` (default 1y; anything else → 400). The response has:
- `points`: `date`, `value_thb`, `invested_thb`, `twr_pct`, `sp500_pct`, `set_pct`; at most 120, first and last always kept;
- `summary`: Today / Yesterday / All gains in THB with %, plus `total_value_thb`;
- `benchmarks.sp500|set`: `level`, `day_change_pct`, `range_change_pct`, `history_start`;
- `missing`: symbols with no history.

A user with no lots gets `points: []` with no network calls. The literal route is registered before `/:u/:holding_id`, like `lots`.

✅ **Math (`services/performanceMath.js`, pure).**
- **Valuation:** every Bangkok day from the first trade is valued as Σ open quantity (lots replayed with `trade_date <= day`) × that day's close × that day's USD→THB. Missing closes are forward-filled. Net invested = buys − sells, each at that day's rate.
- **Return:** chain-linked daily TWR, each day = (end value + sells − buys − start value) / (start value + buys). Benchmarks are rebased to 0% at the range start. Ranges are clipped to the first trade; YTD starts on Bangkok Jan 1. Only TWR for now: the spec's MWR/SR toggles and "Deposits" benchmark are deferred.
- **Today is pinned to the live figures** (`current_price`, else average cost, plus cached FX), so the last point equals the portfolio total. Today and All reuse `loadPortfolio()` (the same code as `GET /api/portfolio/:u`). All % is against total buy cost in THB. Yesterday = the change on yesterday's Bangkok date, net of that day's lot cash flows.
- **Lot dates matter:** a buy priced well below that day's close shows the whole difference as that day's gain. The migrated "Opening balance" lots are dated when the holding was added in the app, so owners should set them to the real purchase date.

✅ **History (`services/priceHistory.js`),** cached in memory for 6h per (source, symbol, window), with concurrent requests merged and the 10s timeout. All limits below were re-verified by the lead:
- **Stocks/ETFs, `USDTHB=X`, `^GSPC`:** Yahoo daily bars with `User-Agent: Mozilla/5.0`; a full Chrome UA gets HTTP 429. `range=max` with daily bars returns 3-month bars, so a fixed range or `period1=0` is used instead.
- **`^SET.BK`:** Yahoo has no daily bars for it (every daily range returns 1 point), so daily closes are rebuilt from hourly bars (`range=730d`), which reach back only to Oct 2023. Benchmark days before their history are `null`, not back-filled.
- **Crypto:** CoinGecko `market_chart`; the free tier refuses more than 365 days (401), so crypto history is capped at a year.
- **Mutual funds, gold, and failed fetches:** drawn flat at `current_price` (else average cost). A failed symbol goes in `missing` instead of failing the request.

✅ **LIFF.**
- **Net Worth** has a Performance card at the top of Investments: total ฿, a Today / Yesterday / All row, range pills, a Value | Return toggle, a Chart.js line chart, and S&P 500 and SET cards. The pills and toggle inside the card meet `--tap-min`.
- **Chart.js 4.4.1** loads from cdnjs. If it's blocked, the card shows "Chart unavailable" and everything else still renders.
- **Colours** come from tokens: portfolio accent, S&P 500 warning, SET text-primary, invested dashed text-secondary. The chart is destroyed and redrawn on theme change (`applyTheme()` and the OS dark-mode listener). Axis labels are Bangkok dates. Data goes through `cachedGet` with a `perfLoadSeq` stale guard.
- **Home** shows a compact Investments card (total + today's gain) only when the user has holdings; tapping it opens Net Worth.
- **Range row:** the 8 range pills are a segmented control with equal-width segments (`.perf-range-pills`). All of them fit inside the card down to a 360px phone with no sideways scroll; each segment is 44px tall and about 35px wide. The Transactions tab's pill handlers select `.range-pill[data-range]` only: they used to grab every `.range-pill`, so tapping a Performance pill reset the Transactions range to `undefined`.

**Tests:**
- `api/performance_math` (41, pure).
- `api/performance` (42, the real endpoint): structure, invariants, a deterministic flat gold portfolio whose TWR stays 0% across a 9× top-up, isolation between users, and `missing`.
- `liff/performance_chart` (25): includes the CDN-blocked fallback and light/dark screenshots.

### Investments Phase C — Dividends

Spec: `docs/master_uxui_specification_finance.md` Screen 2.3, adapted. No migration. Built by a subagent, then reviewed and re-verified by the lead: 28/28 suites, the Yahoo key/ex-date finding re-checked, and a read-only hand-check on a real AAPL holding (4 projected payouts × 20 shares × FX = ฿708.50, matching the endpoint to the satang).

✅ **Endpoint.** `GET /api/portfolio/:u/dividends?mode=monthly|quarterly|annual` (default monthly; anything else → 400). The response has:
- `summary`: `trailing_12m_thb`, `yoy_pct`, `projected_12m_thb`, `portfolio_yield_pct`, `yield_on_cost_pct`, `avg_monthly_thb`, `avg_daily_thb`;
- `series`: `label`, `period_start`, `received_thb`, `projected_thb`;
- `holdings`: `received`, `received_thb`, `projected_12m_thb`, and `events` (`ex_date`, `amount_per_share`, `shares`, `amount`, `amount_thb`, `kind: received|projected`);
- `missing`: symbols whose dividends couldn't be fetched;
- `unsupported_holdings`: crypto, mutual funds and gold, which have no dividend source.

A user with nothing that can pay a dividend gets zeros with no dividend fetches. The literal route is registered next to `performance`, before `/:u/:holding_id`.

✅ **Math (`services/dividendMath.js`, pure).**
- **Received:** for each event with Bangkok ex-date D, shares = open quantity replayed from lots with `trade_date < D` (a buy on D doesn't qualify; a sell on D still does) × amount per share × that day's USD→THB (forward-filled; 1 for THB).
- **Projected:** each event from the last 12 months, moved one calendar year forward, × today's open shares × today's rate. Only dates after today count.
- **Gross amounts, before withholding tax:** Thai 10% / US 15% depends on the account, so it isn't modeled.
- **Summary:** trailing 12m = received in the last 365 days. YoY compares it with the 365 days before that (null when there was nothing). Portfolio yield = projected / `totals.total_value`. Yield on cost = projected / `totals.total_cost_basis`. Average monthly = trailing ÷ 12; average daily = trailing ÷ 365.
- **Bars, on Bangkok calendar periods:** monthly = 11 past months + this month + 12 ahead; quarterly = 3 + this quarter + 4; annual = the first lot's year through next year. The current period stacks received and projected.
- **Not handled:** stock splits. Yahoo's amounts are split-adjusted and lots aren't.

✅ **Data (`services/priceHistory.js`).** Yahoo chart `range=max&interval=1mo&events=div`, cached 12h per symbol, with the same merge, timeout and `User-Agent: Mozilla/5.0` as Phase B.
- **Event dates:** with `interval=1mo`, events are **keyed by the monthly bar start, not the ex-date** (e.g. AAPL key 2026-06-01, ex-date 2026-08-10), so the ex-date comes from each event's own `date` field.
- **Non-payers vs failures:** a non-payer (BRK-B) returns no events; a bogus symbol 404s and goes in `missing`.
- **Shared FX history:** USD→THB uses the same cache key as `/performance`.
- **Portfolio GET stays fast:** `GET /api/portfolio/:u` adds `dividends_received` and `dividends_received_thb` per holding, only from already-cached history (`peekHoldingDividends`/`peekYahooDailyCloses`, which never fetch). Otherwise they are null, so that read never waits on Yahoo. `totals` are unchanged.

✅ **LIFF.**
- **Net Worth:** a Dividends card below the Performance card shows trailing-12m ฿ with YoY, a Portfolio yield / Yield on cost / Avg monthly / Avg daily grid, and a Monthly | Quarterly | Annually toggle (`.type-toggle`, buttons at `--tap-min`).
- **Chart:** a stacked Chart.js bar chart. Received bars use `--color-income`; projected bars are the same token at 0.35 alpha, derived in JS. The tooltip shows ฿ to 2 decimals.
- **Notes under the chart:** "Before tax", and "Crypto, funds and gold aren't included" when relevant.
- **Behaviour:** same `cachedGet` + `divLoadSeq` stale guard, theme redraw and "Chart unavailable" fallback as Phase B. The card is hidden when there is no stock or ETF holding.
- **Holding detail:** Dividends (received, all-time) and Next dividend. Next dividend is a projected ex-date; Yahoo gives no pay dates.

**Tests:**
- `api/dividend_math` (44, pure).
- `api/dividends` (45, the real endpoint): AAPL bought 2023-01-03 then partly sold, PTT.BK, a bogus symbol, a crypto/gold-only user, the empty user, isolation, and series sums matching summary figures.
- `liff/dividends_card` (26): includes the CDN-blocked fallback and light/dark screenshots.

### Investments Phase D — Goal Tracker

Spec: `docs/master_uxui_specification_finance.md` Screen 2.4, adapted. Table `investment_goals` from migration 015 (one row per user, `line_user_id` PK; percents stored as percents). Built by a subagent, then reviewed and re-verified by the lead: 31/31 suites, and the projection convention recomputed independently.

✅ **Endpoints.** `GET|PUT|DELETE /api/portfolio/:u/goal`, literal routes registered next to `dividends`, before `/:u/:holding_id`.
- **GET** returns `{ goal: row|null, projection: null|{...} }`. The projection has `target_value`, `target_is_projected`, `end_date`, `current_value_thb`, `progress_pct`, `status`, `expected_now_thb`, `difference_thb`, `points` (`date 'YYYY-MM'`, `projected_value`, `contributed`; at most 120, first and last kept) and `yearly` (`year_index`, `end_date`, `contributed_total`, `projected_value`).
- **PUT** upserts the one goal per user after validating every field against the DB constraints, including the NUMERIC sizes; a failure is a 400 with nothing written. `monthly_contribution`/`contribution_growth` default to 0; `target_value` is optional. A missing users row gives 404. Returns the GET shape.
- **DELETE** removes the goal.

✅ **Math (`services/goalMath.js`, pure).**
- **Projection:** monthly steps over years × 12 Bangkok calendar months from `start_date`. Monthly rate = (1 + annual%)^(1/12) − 1, i.e. the annual rate is an effective rate. Each month the value grows, then the contribution is added (end of month). The contribution steps up by `contribution_growth`% at each anniversary.
- **Target and progress:** target = `target_value`, else the projected end value. Progress % = `loadPortfolio()` `totals.total_value` ÷ target; not capped (the bar is).
- **Status:** current value vs the projection after the whole months elapsed by today (Bangkok). Within ±2% = `on_track`, otherwise `ahead`/`behind`; before `start_date` it is `not_started`.
- **The spec example** (฿736,500, 30y, 10%, ฿1,000/month, +10%/yr) gives **฿18,819,435.72** under this convention (independently recomputed by the lead). The spec quotes ฿21,270,360 with 3.49% progress, but those two numbers don't agree with each other (736,500 / 21,270,360 = 3.46%), and no standard convention reproduces them. The closest is a nominal 10%/12 monthly rate with contributions at the start of the month, which gives ฿21,029,969. Switching to that is a one-line change if the owner prefers the nominal-rate reading.

✅ **LIFF.** Net Worth has a Goal card below Dividends, shown even with no holdings.
- **No goal:** a one-line prompt and Set up goal.
- **With a goal:** target ฿ (marked "projected" when no explicit target), progress % with a budget-style bar (green; amber when behind by up to 10% of plan; red beyond), and status text.
- **Chart:** projected line in accent, contributed dashed, today's value as one warning-colour point.
- **Also:** a collapsible year-by-year table and Edit goal.
- **Goal sheet:** start date (default today), start value (default the current portfolio value), years, return %, monthly contribution, growth %, optional target. Delete goes through `confirmAction()`, and server 400s show inline. Same `cachedGet` stale guard, theme redraw and "Chart unavailable" fallback as Phases B and C.

**Follow-ups (owner kept the effective-annual-rate convention):**
- **Target line:** an explicit `target_value` is drawn as a flat dashed `--color-text-primary` "Target" line. Tests should find chart datasets by label, not index, because the Target line shifts the indexes.
- **Goal card independent of the portfolio:** `loadGoal()` starts before the Net Worth `Promise.all` instead of after it. If `loadPortfolio()` throws in `goalResponse()` (e.g. a USD→THB 502), GET/PUT still return the goal and projection, with `current_value_thb`/`progress_pct`/`difference_thb` null, `status: 'unknown'` and `current_value_error`. The card then shows "—", "Current value unavailable" and a "Progress unavailable" note. The setup sheet's default start value awaits `portfolioPromise` (0 if it failed), since the card can now render first.

**Tests:** `api/goal_math` (37), `api/goal` (44), `liff/goal_card` (42, including the target line and a 502 on `GET /portfolio/:u`).

### Thai Voice Messages (LINE Bot)

✅ **Voice → expense.** A LINE `audio` message (m4a/AAC) is downloaded, transcribed, and the transcript goes through the same path as a typed message (`handleExpenseText()` in `lineWebhookController.js`): the "summary"/"สรุป" command, `parseExpenseText()`, and the Confirm/Cancel card. That card gets a first **Heard** row showing the transcript (capped at 200 chars), so a misheard amount is visible before anything is saved. A non-expense reply starts with `I heard: "..."`. Messages over 60 s (`event.message.duration`) are refused before download. A transcription failure or an empty transcript gets a plain reply.

✅ **Transcription (`services/voiceTranscription.js`).**
- **Typhoon ASR** (SCB 10X, Thai-first) when `TYPHOON_API_KEY` is set. Its hosted API is OpenAI-compatible: base `https://api.opentyphoon.ai/v1`, model `typhoon-asr-realtime`, via the `openai` SDK. It accepts only wav/mp3/flac/ogg/opus: m4a/mp4 gets a 400 ("File type audio/mp4 not supported", found in the QA run of 2026-11-23, so until then every voice message silently used the fallback). `toWav` converts m4a/mp4 (LINE voice, iOS LIFF) to 16 kHz mono 16-bit WAV with macOS's built-in `/usr/bin/afconvert` (production self-hosts on a Mac; no ffmpeg dependency), through 0600 temp files deleted straight after. webm (Android LIFF) or a host without afconvert skips Typhoon and goes straight to OpenAI. Verified: the fixture as m4a → 400, as WAV → "กาแฟหนึ่งร้อยยี่สิบบาท". `tests/api/voice_wav` covers the conversion for free.
- **Terms:** the hosted Typhoon API is a free, as-is beta (100 req/min) that collects usage data. Its docs ask real production users to go through Together AI or contact them. The model is also Apache-2.0 for self-hosting (`pip install typhoon-asr`).
- **Fallback / default:** OpenAI `gpt-4o-mini-transcribe` with `language: 'th'` (accepts m4a), using the existing `OPENAI_API_KEY`. Any Typhoon error or empty result falls through to it.

**Tests:** `api/voice_message` (14, free: LINE, transcription and parser stubbed; refusals, Heard row, confirm → transaction, spoken "สรุป", typed text unchanged). `openai/voice_message` (5, plus 1 when a Typhoon key is set): real transcription of `tests/fixtures/voice_coffee_120_th.m4a` ("กาแฟ หนึ่งร้อยยี่สิบ บาท", made with macOS `say -v Kanya` + `afconvert`), bogus-key fallback, and the full webhook producing a 120 card.

✅ **LIFF mic button** (Add Expense, next to Scan Receipt). The flow:
- `MediaRecorder` records; the preferred type is the first of audio/mp4, webm/opus, ogg/opus that the browser supports. iOS records mp4/AAC; desktop and Android Chrome record `audio/mp4;codecs=opus`. OpenAI accepts both (checked with real Chrome recordings).
- The button shows "Stop 0:07" while recording and stops automatically at 60 s.
- `POST /api/voice/:u/parse` runs the same `transcribeVoice()` (now takes `{ mimeType }`) and `parseExpenseText()` as LINE voice messages.
- The form gets the amount, description and category, with `Heard: "…"` in the status line. Nothing is saved until Save, the same as receipt scanning.

Edge cases:
- No amount found: the status shows the transcript, in the error style.
- Under 0.6 s: rejected locally, no request.
- Microphone permission denied: a hint to allow it for LINE in the phone's settings.
- No `MediaRecorder`: the button is hidden.
- Closing the form while recording discards the recording.

**Tests:**
- `api/voice_endpoint` (6, free: validation only).
- `openai/voice_message`: now 7, adding the endpoint with the real Thai m4a.
- `liff/voice_entry` (19). `getUserMedia` hangs in headless Chrome on macOS even with `--use-fake-device-for-media-stream`, so the page gets a WebAudio-tone MediaStream through an init script. The real `MediaRecorder` records it, and the voice endpoint is stubbed.

### Reminders, To-dos, Notes and Google Calendar (2026-11-20, migration 020)

Modelled on the owner's Abdul screenshots. Owner decisions (2026-11-20): build before Tax Phase 1; follow-ups only for important reminders; chat creation, a Tasks tab, repeats and no-time to-dos, group reminders, notes and read-only Google Calendar all in scope.

- **Model** (`reminders`): `remind_at` is the current occurrence (NULL = a to-do with no time); `anchor_at` is the first occurrence of a repeating one (time of day, weekday, day of month); `next_fire_at` is the next push (the occurrence, a follow-up or a snooze); `fire_count` counts pushes for this occurrence. Status is only `open`/`done`: Stop just silences the current occurrence.
- **Scheduling** (`services/reminderMath.js`, pure, Bangkok wall clock):
  - Repeats: daily, weekdays, weekly, monthly. Monthly clamps to short months without drifting (31 Jan -> 28 Feb -> 31 Mar), because every occurrence is computed from the anchor.
  - Follow-ups, minutes after the occurrence: Normal none, Important 30 and 90 (09:00 -> 09:30 -> 10:30, as in the screenshots), Must not miss 15, 45, 90 and 180. They're time-based, so a late job run or a snooze skips follow-ups already in the past.
  - Done on a repeating reminder moves it to the next occurrence (done early = skip this one). Reopen re-arms a future one-off.
  - A one-off more than a minute in the past is refused on create.
- **Dispatch** (`jobs/reminderDispatch.js`): every minute. Each due row is advanced with an optimistic update on `next_fire_at` before the push, so two server instances can't push the same reminder twice and a failing push isn't retried in a loop. Reminders ignore the notifications toggle (the user asked for them). Pushes carry Done / Snooze 15 min / Stop reminding quick replies (Stop only for important or repeating ones).
- **Chat** (`controllers/lineReminderHandler.js`):
  - 1:1: a message matching a keyword gate (เตือน, อย่าลืม, นัด, ต้องทำ, remind, todo...) goes to `services/reminderParser.js` (gpt-4o-mini extracts title/date/time/repeat/importance/category; reminderMath turns them into an instant). A Confirm/Cancel card follows. If the model says it isn't a reminder, the text carries on to the expense parser, so "นัดกินข้าว 300" still logs an expense. Voice uses the same path. The gate means "กาแฟ 120" never costs a reminder parse.
  - "note ..." / "จด ..." saves a note for today without AI. "reminders" / "todo" / "เตือน" lists what's coming.
  - Groups: "เตือน ..." / "remind ..." (prefix plus more text; "remind" alone is still the bills digest) creates the reminder at once, @mentioning whoever the message mentions, with a Cancel quick reply for its creator. "reminders" lists the group's. The creator and the mentioned people can tap Done / Snooze / Stop; only the creator cancels.
  - Rate limit: the shared bot text budget (60 per 10 minutes).
- **API:** `/api/reminders/:u` (window of at most 62 days; returns open reminders, ones done in the window, and every occurrence in the window with repeats expanded), edit/delete (creator only; mentioned people get 404 on edit and 403 on delete), and `/done|snooze|stop|reopen`. `/api/notes/:u`.
- **Tasks tab** (`liff-app/tasks.js`, second tab; "Transactions" became "History" in the nav so six labels fit at 360px):
  - Header date, a Mon-Sun week strip with dots, a "Set: Repeating N, Upcoming N" row that opens the Everything-you've-set sheet (Upcoming / Repeating / No time, plus Done recently).
  - A day timeline of occurrences and calendar events with a Now line on today, to-dos, and notes (pinned notes show on every day). A month sheet has dots for reminders, notes and events.
  - The Add button on this tab opens the reminder/note sheet: presets (In 1 hour, This evening 18:00 until 17:30, Tomorrow 09:00), Once/Repeat, date and time, "No time (to-do)", category chips (Work, Finance, Health, Client, Order, Other) and the three importance cards with what each does.
  - Edits only send the time when it changed (re-sending a past time is refused). Repeating reminders show a checkbox only on their current occurrence.
- **Google Calendar** (`services/googleCalendar.js`): its own consent with scope `calendar.events.readonly`, offline access, same OAuth client and redirect URI as the export email; the callback tells them apart by the signed state `gcal:<id>`. The refresh token is AES-256-GCM encrypted (key from `GCAL_TOKEN_KEY`, else derived from the service role key). Events (title and times only) are read on demand and never stored. `invalid_grant` clears the link. Disconnect and account deletion revoke the token with Google. Until the Google OAuth consent screen is verified for this scope, only the project's test users can connect.
- **Verified:** `api/reminder_math` (42), `api/reminders_api` (43, including the dispatch race), `api/line_reminders` (30, 1:1 and group with stubs), `liff/tasks_tab` (36), and `openai/reminder_parser` (7, paid) on six Thai and English phrasings.

### LINE Group Bills (2026-11-19, migration 019)

Replaces the running tab below (owner: "per-bill only"), modelled on the owner's KhunThong screenshots.

- **Flow:**
  1. `+ข้าว 600` creates a bill; the payer is the owner and their own share is paid at creation.
  2. The bot replies with a Flex bill card (title, total, "Requested by", member rows tagged Host or Paid) plus a textV2 message @mentioning everyone who owes.
  3. **Pay** and **See who paid** open `liff.line.me/<LIFF_ID>?groupbill=<id>`.
  4. The bill sheet shows the owner's PromptPay QR (EMVCo payload with the exact share, from `services/promptpay.js`, rendered by qrcode-generator 1.4.4 from cdnjs, falling back to "QR unavailable") and bank details with Copy buttons.
  5. The member uploads a slip: resized JPEG in the private `payment-slips` bucket at `<payer>/<ms>-<hex>.jpg`. The owner gets a 1:1 push, or a group mention if 1:1 fails.
  6. The owner taps **Confirm**, **Reject** (slip deleted, payer told) or **Mark paid** (no slip).
  7. Each payment posts "X paid ฿162.00 to Y (slip confirmed) / Bill "…": paid 2nd. N still to pay." in the group. The last one also posts the fully-paid card.
- **Cancel:** the owner cancels via `undo` in the chat or **Cancel collection** in the sheet. The bill is kept with status `cancelled`, a cancelled card shows the total and the unpaid amount, and personal-ledger copies and slips are removed.
- **Reminders:** `bills` / `ทวงเงิน` / `ยอด` replies with the "Don't forget to pay" digest (per-member owed across open bills) plus mentions. `jobs/groupBillReminders.js` pushes the same digest at 19:00 to active groups with an open bill at least 20 hours old (`runOnce` per day; `GROUP_REMINDERS=off` disables it).
- **Leaderboard:** `rank` shows fastest payers for the Bangkok month: counts of 1st/2nd/3rd by `paid_at` per bill (cancelled bills ignored), plus the "Top host" with the most bills created.
- **Style:** cards follow the UI rules: one accent `#15803d`, no emoji or mascot. Medals and crown are text labels (1st/2nd/3rd, Host).
- **LINE quota:** replies are free. Pushes (paid lines, fully-paid and cancelled cards, slip notices, the 19:00 digest) count once per group member.
- **Consent:** the LIFF login sends `via: 'group_bill'` when opened from a bill link, so it doesn't flip `group_ledger_copies`.
- **Payment details:** `PUT /users/:u/payment-details` validates PromptPay (10-digit mobile, 13-digit ID or 15-digit e-wallet) and accounts (10-15 digits). They're shown only in `pay_to` to members who still owe on that owner's open bill.
- **Privacy:** slips are signed for the owner and the payer only. Account deletion removes your slips and the slips sent for your bills. Privacy pages are updated in EN and TH.
- **Legacy data:** migration 019 closes all running-tab entries as paid; old `settlement` rows are ignored.
- **Tests:** `api/group_bill_math` (pure math, PromptPay CRC and payload, flex shapes), `api/line_groups` (webhook), `api/groups_api` (REST incl. slip, reject, confirm, cancel, payment details), `liff/group_bills` (Home card, deep links, QR, slip upload, owner confirm and cancel, Settings).

### LINE Group Split Tracker (superseded by Group Bills, kept for history)

Spec: `docs/PHASE_3_SPEC.md` "Multi-User / Group Support: shared expense logging inside LINE group chats". Owner decisions:
- a Splitwise-style split tracker;
- split among all joined members by default, with @mentions to narrow it;
- each member's share goes into their personal ledger.

Migration `016_line_groups.sql` adds four tables: `line_groups`, `line_group_members`, `group_expenses` (kind `expense` | `settlement`) and `group_expense_shares` (with `transaction_id` → the personal copy).

✅ **Routing.** `handleEvent()` sends every event whose `source.type` is `group` or `room` to `lineGroupHandler.handleGroupEvent()`. Before this, a bot added to a group would have run every chat message through the OpenAI 1:1 parser and replied to each one.

✅ **Quiet by default** (`services/groupSplitMath.js`, pure). The bot only answers:
- **Exact command words:** `balance`/`ยอด`/`สรุป`, `settle`/`เคลียร์` (the only command that takes arguments), `undo`/`ยกเลิก`, `members`/`สมาชิก`, `join`/`เข้าร่วม`, `help`.
- **Expenses:** a message starting with `+` (`+ข้าว 600`, `+600 taxi`, `+ค่าที่พัก 1,250.50 บาท`) or one that @mentions the bot (`isSelf`). Plain "ข้าว 600" or "see you at 7" is ignored, and parsing is deterministic with no AI.

✅ **Members.** A standard OA can't list group members, so anyone who sends any message joins silently (`ensureMember`). It fetches their display name with `getGroupMemberProfile` / `getRoomMemberProfile`, creates a `users` row if needed, and caches them in memory for 10 minutes. A `memberLeft` event sets `left_at`, which excludes them from new splits; `join` brings them back. The bot being removed (`leave`) sets `is_active = false`.

✅ **Expenses.** Split equally in cents among all current members, or among the payer plus the @mentioned people. The spare cent goes to someone other than the payer. A mention without a `userId` (LINE omits it unless the person allows it) is matched against members' display names; an unknown mention is refused. Every share, the payer's included, is written to that member's personal ledger via `createTransaction`:
- category from `autoCategorize` (keyword first, then the LLM);
- description `"<desc> · <group name>"`;
- `channel: 'group'`, so budget alerts push via LINE.

That personal copy is best-effort: a failure is logged and the group record stands.

✅ **Balances and settling.** Net = paid − shares. A settlement is a payment from payer to receiver: one share row, never written to personal ledgers. `simplifyDebts()` turns nets into at most n−1 "X pays Y" lines, largest debtor to largest creditor. `settle @Ann` records whatever the sender owes Ann in that plan; `settle @Ann 150` records an explicit amount; `settle` alone lists what you owe. `undo` deletes the sender's most recent entry from the last 7 days, along with its personal-ledger copies.

**LINE console:** Messaging API channel → "Allow bot to join group chats" must be on. Group replies use the reply token, so they don't count against the push quota; budget alerts on members' shares are pushes.

**Tests:** `api/group_split_math` (32, pure) and `api/line_groups` (38: the real webhook controller + DB with LINE stubbed; free, since every description hits a category keyword).

✅ **LIFF Groups card** (`controllers/groupController.js`, read-only). Logging and settling stay in the chat, so the chat remains the one place everyone sees changes happen.
- **`GET /api/groups/:u`:** every group the user is or was in (a member who left still sees past debts), newest activity first, with `my_net` and `my_payments` (their lines from the simplified plan).
- **`GET /api/groups/:u/:group_id`:** the whole plan (`involves_me` flags), every member's net, and the 20 most recent entries with `my_share`.
- **Home:** a Groups section appears only when the user is in a group. Each row shows a pill ("You're owed ฿X" green / "You owe ฿X" red / "Settled up" grey) and "Cee pays you ฿155.00 · …". An unnamed room shows as "LINE chat".
- **Detail sheet:** tap a row for the summary, who pays whom, members with nets, recent entries, and a hint with the chat commands.
- The groups fetch starts at the top of `loadHomeTab()`, in parallel with the 6-month fetch rather than after it.
- `groupBalances()` now also returns `members` and `entries` (newest first).
- **Tests:** `api/groups_api` (20) and `liff/group_balances` (16), both on `tests/fixtures/groupSeed.js`.

**Not built:** uneven/itemized group splits (the separate Shared Bills feature covers itemized), and multiple currencies.

### Bank Statement Import (KBank)

✅ **Flow.** Transactions tab → Import Statement. The LIFF app loads **pdf.js 3.11.174** from cdnjs on first use and opens the PDF on the phone, including the password (KBank: date of birth, DDMMYYYY), which never leaves the device. It sends each page's text pieces as `{ x, y, w, s }` to `POST /api/statements/:u/parse`, which returns a preview and writes nothing. The user reviews it (tick/untick, change categories, optionally link an account) and `POST /api/statements/:u/import` inserts the kept rows. Supported: KBank savings/current statements only; anything else gets a 422 naming what's supported.

✅ **Parsing (`services/statementParser.js`, pure, no AI).**
- Rows are rebuilt from positions. Each row starts with a `dd-mm-yy` date at the left; Details wrap onto lines without a date. Every page starts with a "Beginning Balance" carry-over row. Column boundaries come from each page's header labels.
- The amount column doesn't say deposit or withdrawal, so **the sign comes from the running balance** (balance − previous balance = ±amount). A mismatch falls back to the description ("Deposit") and adds a warning.
- **Cross-check:** withdrawal and deposit counts and totals, plus the ending balance, from page 1. The preview says "All N rows match the statement's totals" or lists what doesn't.
- **pdf.js quirks it handles:**
  - It merges nearby pieces into one item, sometimes with no space (`"01-06-26 00:27 Payment"`, `"9,975.00K PLUS"`, `"Account Number123-..."`). Items left of Details are split at date/time/money tokens, with x estimated from the measured width `w`.
  - A long Channel merged with Details is split at the details column's start x, only when `w` is present.
  - Footer text is dropped by content, not position: on a full page the last row shares a line with `KBPDF (...)`.
  - Right-aligned short balances (`4.79`) reach into the Channel x range, so money is classified before columns.
- **Descriptions:** "Paid for Ref X1234", "From/To [bank] X1234" and "++" are stripped. `(A/C Name: ...)` is dropped from the description but kept in the categorization key.
- **Verified by hand** on a real 32-page K PLUS statement: 1,022 rows, all five checks match exactly. That statement is not in the repo; only synthetic data is.

✅ **Preview and import (`services/statementImport.js`, `controllers/statementController.js`).**
- **`row_key`** = `stmt:` + sha256(user | bank | account | date | time | amount | balance-after), stored in `transactions.slip_hash`. Its UNIQUE constraint makes re-importing the same or an overlapping statement a no-op (`upsert … ignoreDuplicates`). The key is per user, and the balance-after keeps two identical same-minute payments distinct.
- **Statuses** (only `new` starts ticked):
  - `imported`: the key is already stored; disabled in the list.
  - `own_transfer`: To/From a name that's a prefix of the account holder's name. KBank truncates names; titles are ignored.
  - `possible_duplicate`: a manually logged transaction on the same Bangkok day with the same amount and type, matched one-to-one.
- **Categories:** keyword rules first, for Thai brands. They are ordered brands before places, so "LAWSON … MRT" is Shopping and "KFC … PTT" is Food. E-wallet top-ups (GrabPay, TrueMoney, LINE Pay, G-Wallet, YouTrip) are left uncategorized (Others), since they move money rather than buy something. The rest goes to `gpt-4o-mini` in batches of 60 unique names, using the user's own categories. Fallbacks are Others / Income. Income skips the LLM when the user has only one income category.
- **Import:** `transaction_date` is the Bangkok date and time (`…T00:27:00+07:00`, noon when there's no time). `payment_method: 'BANK'`. An optional account is linked as from_account (expense) or to_account (income). Account balances are **not** adjusted (owner decision: statement rows are history and the balance is already current), and no budget alerts fire. Every row is validated (key shape, date shape, positive amount, the category belongs to the user and matches the type) before anything is written.
- **Size limits:** parse accepts at most 100 pages / 60,000 pieces; import at most 3,000 rows.

**Tests:**
- `api/statement_parser` (20, pure): the synthetic statement, a tampered balance, an unsupported format, y jitter, and a pdf.js-merge simulation.
- `api/statements` (31, free): no OpenAI calls, since every sample merchant hits a keyword rule.
- `liff/statement_import` (24): a real PDF written by `tests/fixtures/kbankStatement.js` (`statementPdf()`, Helvetica 6.5pt, ASCII rows only) goes through real pdf.js from cdnjs. Also covers an unsupported PDF and the pdf.js CDN blocked.
- Not covered by tests: password-protected PDFs, since generating an encrypted PDF needs a library.

✅ **Bangkok Bank savings** (`parseBbl()`, detected by "Bangkok Bank" + "STATEMENT OF SAVING ACCOUNT"). Parsed by **line text, not columns**: PDFKit returns each table row as a single piece, and pdf.js splits it differently.
- **Rows:** a row is `dd/mm/yy particulars [chq no.] amount balance [via]`. A `B/F` row carries the balance forward (the opening balance, and on each page). The sign comes from the running balance, falling back to the particulars with a warning.
- **Header and totals:** account, period and holder come from page 1. The debit/credit counts and amounts come from wherever they're printed, normally the last page; the credit amount is printed before its own label. No ending balance is printed, so there are four checks, not five.
- **Descriptions:** particulars are bank codes with no counterparty, so they're mapped to readable text ("PMT. PROMPTPAY" → "PromptPay payment", "TRF TO OTH BK" → "Transfer to another bank", …). Generic codes skip the LLM and land in Others.
- **Rows have no time,** so they're stored at noon Bangkok.
- **New status `bank_transfer`:** "TRF TO/FR OTH BK" rows start unticked with "Tick it if it wasn't your own account". No name is printed, and they're typically moves to the holder's own account in another bank (which that bank's statement would also show).
- **Verified by hand** on a real one-page statement: 4 rows, all four checks match. It's not in the repo; `tests/fixtures/bblStatement.js` is synthetic and builds both per-column (pdf.js-like) and per-row (PDFKit) pieces.
- **Tests:** `api/statement_parser` (now 31), `api/statements` (38), `liff/statement_import` (27, including a BBL PDF through real pdf.js).

✅ **Own-account transfers across statements** (`services/statementTransfers.js`; owner's choice: store them as Transfer entries, no migration).
- **Import as Transfers by default.** Own transfers (KBank, by holder name), Bangkok Bank "TRF OTH BK" rows, and matched rows start ticked with `transfer_default: true`. Each row's category select gains "Transfer (between my accounts)" (preselected for those rows, available for any row, e.g. a wallet top-up).
- **How a Transfer is stored:** as `type: 'transfer'` (never income or spending), with no category, the statement's account on its side when one is linked, and a description naming the statement accounts: `"KBank •••2222 → another account"`.
- **Matching:** when another statement contains the other side (same amount, opposite direction, Bangkok dates at most a day apart, transfer-like rows only), the preview marks it `transfer_match`. Import merges it into the existing entry by filling in that side's label and account (`"Bangkok Bank •••1111 → KBank •••2222"`) instead of inserting a second one.
- **Already recorded:** a row whose side already appears in a transfer's description shows as `imported` ("Already recorded: …"). The description is the record of which statements have seen a move, so no extra table is needed.
- **The import body** carries `statement: { bank, account_last4 }` (required when any row has `type: 'transfer'`, with `direction` `'out' | 'in'`). It returns `merged` alongside `imported`/`skipped`.
- **Verified on real data:** with the real KBank statement's 88 own transfers imported as Transfers, the real Bangkok Bank ฿27,130.67 "TRF TO OTH BK" matched KBank's same-day deposit and merged into one "Bangkok Bank •••1111 → KBank •••2222" entry.
- **Tests:** `api/statements` (56, including a two-bank scenario: a +1-day match, a same-amount payment that must not match, re-parse/re-import of both statements, balances untouched) and `liff/statement_import` (28).

✅ **Undo an import** (no migration; owner approved keeping the history on the phone).
- **What import returns:** an `undo` object listing everything it changed: `{ label, inserted_ids, merged: [{ id, side }] }`.
- **`POST /api/statements/:u/undo`** takes that object back:
  - Rows the import inserted are deleted.
  - Transfers it joined lose this statement's side again (`revertSide()`: that side becomes "another account" and its account link is cleared).
  - If a *later* import joined one of this import's own transfers, that row is kept with only the other side, and its slip_hash is retired (`stmt:` + sha of `undone|id`), so this statement's row shows as new on re-import.
  - Only the user's own `stmt:` rows are touched; another user's ids are a no-op.
  - Validation: uuids, side `'from' | 'to'`, label shaped like `KBank •••1234`, at most 5,000 ids. Undoing twice is harmless.
- **LIFF:** after an import the status line has an **Undo** button (through `confirmAction()`). The Import sheet lists **Recent imports on this phone**: the last 5 import records, kept in localStorage under `stmtImports:<line_user_id>`, each with Undo. That's a per-device convenience: if storage is cleared, the imported rows stay and can be deleted individually.
- **Tests:** `api/statements` (74: validation; a foreign user; undoing a joining import, then a joined-since import; a plain import whose rows come back as new) and `liff/statement_import` (37: Undo from the status line and from Recent imports).

**Not built:** other banks, credit card statements, e-wallet exports.

### Event Budgets, Verified Export Email, LIFF Nav Restructure

✅ **Event/occasion budget buckets** (migration `012_budget_events.sql`, blueprint section 5) — a category's existing `budget_amount`/`budget_period` stays the recurring "normal" limit; `budget_events` is a one-off limit for one specific month (`period_month`, always the 1st) layered on top, always tied to an existing category. `budgetEventController.js`'s `withSpent()` computes `spent`/`remaining`/`percent` on read by summing that category's expenses within the month (UTC month bounds) — no transaction-tagging column added. **Alerts** (decided later: 80% and 100%): `services/eventBudgetAlert.js` `evaluateEventBudgetAlerts()` runs after every expense insert in `transactionCreate.js`, next to the category alert. Like category alerts it is stateless: an alert fires only when *this* expense moves a bucket's month total across 80% (`level: 'warning'`) or 100% (`'over'`; reaching exactly 100% counts), and only the highest line crossed fires, so a 0%→120% jump sends only the used-up alert. No migration was needed. The month is the transaction's own UTC month, matching the progress bar, so a back-dated expense alerts on that month's bucket. Routing is identical to category alerts: `channel: 'liff'` returns `event_budget_alerts` (each with a ready-made `message`, the single source of the wording) in the POST response for the LIFF banner, which is amber when everything is a heads-up and red if anything is over. Every other channel gets a fire-and-forget LINE push gated by `notifications_enabled`. Tests: `tests/api/event_budget_alerts.test.js` (17) and `tests/liff/event_alert_banner.test.js` (5, real Add form). LIFF: "Event & Occasion Budgets" section in the Budgets tab, current month only.

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


### API Authentication (2026-11-19)

Before this, every endpoint trusted the `:line_user_id` in the URL: anyone with the tunnel URL and a user's LINE id could read or change that user's data. `services/lineAuth.js` now requires proof of identity on every user route.

- **Accepted tokens:**
  - LIFF ID token (`liff.getIDToken()`), verified with `POST https://api.line.me/oauth2/v2.1/verify` (`id_token` + `client_id`), trying the LIFF app's channel (the numeric prefix of `LIFF_ID`) and then `LINE_LOGIN_CHANNEL_ID`.
  - LINE Login access token, verified with `GET .../verify?access_token=` (the `client_id` must be one of those channels), then `GET /v2/profile` for the user id.
  - A token is treated as an ID token when it has three dot-separated parts.
- **Caching:** results are cached in memory until the token's expiry (access tokens for at most an hour), capped at 2,000 entries.
- **Enforcement:** `router.param('line_user_id', requireOwnUser)` in every router; `requireBodyUser` on `POST /api/users`. Express runs param callbacks in path order, so auth runs before the uuid checks: an unauthenticated request with a malformed id gets 401, not 400.
- **Errors:** 401 `auth_invalid`, 403 `forbidden`, 503 `auth_unavailable` (LINE unreachable), 401 `link_invalid` (bad or expired export link).
- **Public by design:** `/`, `/health`, `/api/line/webhook` (LINE signature), `/api/line/login-url|callback|verify|logout` (these operate on the caller's own token), `/api/google/callback`, `/api/bills/public/*`.
- **Signed export links:** `POST /transactions/:u/export-link { query }` returns `query&exp=<+120s>&sig=<HMAC-SHA256(secret, u|exp|sorted query without exp/sig)>`. `GET .../export` with a valid signature skips the token check. The secret is `EXPORT_LINK_SECRET`, else a hash of the service role key. Comparison is timing-safe.
- **Test bypass:** only for ids starting with `test_` (real LINE ids are `U` + 32 hex), and only when the request reaches the server directly on loopback with no `X-Forwarded-For`/`Forwarded` header. A tunnel such as ngrok adds those headers, so outside traffic never gets the bypass.
- **Switch:** `AUTH_REQUIRED=false` disables enforcement, e.g. for the iOS app until it sends its access token.
- **LIFF:** `apiRequest()` adds the header. On a 401 `auth_invalid` it calls `liff.login({ redirectUri: location.href })` once; a `sessionStorage` timestamp blocks a second redirect within a minute. Download CSV gets a signed link, then navigates.
- **Setup:** the LIFF app needs the `openid` scope for `getIDToken()` to return a token.
- **Tests:** `api/auth` (27: 401s on several routes and on `POST /users`; bogus ID and access tokens rejected by LINE itself; public routes; the bypass locally but not via a tunnel; signed links working, tampered, cross-user and expired; and in-process the 403, an expired cached token, `AUTH_REQUIRED=false`, channel ids) and `liff/auth_client` (8: the header on every request, the signed CSV link, a single re-login). `openai/voice_message`'s REST call moved to a `test_` user.

**iOS (same day):**
- `LINEAuthService` keeps the LINE Login access token returned by `GET /api/line/callback` in the Keychain (`Services/KeychainStore.swift`, `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`), not in UserDefaults.
- `APIService.performRequest` sends it as a Bearer token. A 401 calls `logout()`, which also deletes the token. A saved session without a token counts as logged out.
- The backend verifies it through the access-token path, `client_id` 2011983707 = `LINE_LOGIN_CHANNEL_ID`.
- Verified: an `xcodebuild` simulator build, and a launch showing the login screen for a session with no token. A real LINE login can't be completed in the simulator; it needs a device.


### Security Review Fixes (2026-11-19)

A review of the day's changes (auth, statement import/undo/transfers, groups, voice, signed links) plus the older surfaces they newly depend on.

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | High | Google export-email OAuth used the bare `line_user_id` as `state`, so anyone knowing an id could finish the flow with their own Google account and swap in the victim's id. CSV exports would then go to the attacker. | `state` = `base64url(id).exp.HMAC` (`lineAuth.signState`, 10 min); the callback runs `verifyState` (400 "Link expired"). |
| 2 | Medium | CSV formula injection: statement merchant names and group members' descriptions land in exports verbatim. | `csvExport.toCsvField` prefixes `'` to text starting with `= + - @ \t \r`. Numbers are untouched. |
| 3 | Medium | No rate limits on paid AI endpoints; any LINE user could loop OCR, voice, statement or bill scans. | `services/rateLimit.js`: per-user 10-minute budgets shared by REST and the bot (OCR 30, voice 30, bot text 60, statements 30). 429 / a "please wait" reply. |
| 5 | Low | Statement parse ran regexes over unbounded text. | Pieces capped at 500 chars before parsing; BBL line text capped at 1,000. |
| 6 | Low | The Google callback page interpolated unescaped text. | `htmlPage` escapes its title and message. |
| 7 | Info | The `test_` bypass depends on a tunnel adding `X-Forwarded-For`. | `AUTH_TEST_BYPASS=false` removes it. |

**Finding 4 (open, owner's call):** any member of a shared LINE group can log `+x 99999 @you`, and your share lands in your personal ledger, per the "share into personal ledger" decision. Options: opt-in per member, a "remove me from this expense" command, or a per-expense cap.

**Checked and fine:**
- Ownership scoping on statement import, undo and transfer merge (pool and fetches scoped by `line_user_id`; ids from scoped queries).
- Group detail requires membership.
- The new LIFF screens escape server text (`escapeHtml`; textContent for transcripts).
- Signed export links bind the user and the full query and are compared timing-safe.
- Access tokens must belong to our channels.
- Undo only touches `stmt:` rows of the caller.

**Tests:** `api/security` (15).


### Statement Import Speed-up (2026-11-19)

- **Learned categories** (`learnedCategories()` in `statementImport.js`): before any keyword rule or LLM call, a row whose description and type match one of the user's own statement-imported transactions gets that transaction's current category. The newest one wins, and only categories that still exist and match the type count. Re-categorizing during review, or editing a transaction later, carries forward to future imports. It scans at most 10,000 rows.
- **Batches of 20 instead of 60:** the LLM batches already ran in parallel, so the wait was the slowest single batch. On the real 1,022-row KBank statement, the fresh preview went from 11.1 s to 8.5 s. With June-August imported, 160 of the 454 new September-November rows were from known merchants and skipped the LLM, but the wait barely moved (it's still the slowest remaining batch).
- **Tests:** `api/statements` (77): a merchant imported with an edited category gets that category on the next statement, and a later edit changes the suggestion.


### Group-Ledger Consent (2026-11-19, security review finding 4)

Before this, any member of a shared LINE group could log `+x 99999 @you`, and a share landed in your personal transactions. Owner decision: copy shares only for people who use the app.

- **Migration 018:** `users.group_ledger_copies` BOOLEAN.
  - `NULL` = never decided (someone who only spoke in a group).
  - `TRUE` = copies on: set automatically the first time they use the app themselves, or chosen in Settings.
  - `FALSE` = turned off in Settings.
  - The migration sets TRUE for existing users, except accounts created within a minute of joining their first group.
- **`upsertUser({ appUser })`:** default `true` (REST `/api/users`, the iOS login callback, the bot's follow event and 1:1 messages) sets TRUE only when NULL, so an explicit FALSE is never overridden. `groupLedger.ensureMember` passes `appUser: false`.
  - If the column is missing, upsert retries without it, so logins work before the migration.
- **`groupLedger.writePersonalShares`** copies only to members with `group_ledger_copies === true`. It fails closed (no copies) if the column can't be read. The group's own balances, shares and settlements are unaffected.
- **Settings → Preferences:** "Add my share of LINE group expenses to my transactions" (`PATCH /users/:u/preferences { group_ledger_copies }`).
- **Tests:**
  - `api/line_groups` (42): app users get copies, a group-only member doesn't but still owes their share; opting out stops copies and re-login doesn't re-enable them; a group-only member who opens the app gets copies from then on.
  - `api/security` (18): the preference endpoint.
  - `liff/group_copies_setting` (4).

### UX/UI refresh v5, "Claude style" (2026-11-21, branch `feat/uxui-refresh`)

Spec: the owner's `LIFF_UXUI_REFRESH_SPEC.md` (v5) and the prototype export. LIFF only, no backend changes. Nine commits, one per delivery step.

- **Tokens:** ivory `#FAF9F5` / slate `#141413`, Clay `--brand #D97757` for graphics only, `--brand-text #AE5630` for clay text, slate `--primary` buttons, `--income` green, category tints `--c-*` (owner-approved exception), serif + sans font tokens, 12px cards, 16px sheets. Dark values from the spec; the Tax hero stays inverted. `--qr-bg` keeps QR codes black on white.
- **Helpers (app.js):** `formatBaht(value, { sign })` (U+2212 minus), `entryAmount(t)`, `categoryTile(name)` (`CATEGORY_ICONS`, Lucide paths), `showToast({ title, description, kind, undo })`, a pixel loader inside `setAiStatus` working lines (empty spans, so the status text is unchanged).
- **Colour meaning:** expenses in the foreground colour, income green, transfers muted; red only for over budget and errors.
- **Shell:** page headers (kicker, serif title, avatar with the LINE photo or initials); 5-item nav; Money switch remembered in `localStorage.moneyView`; More panel; Help sheet of bot commands; Settings has a back button to More.
- **Home:** see CLAUDE.md. The hero and Budgets to watch read `/reports/:u/monthly?offset=0` (this cycle's budgets per category). The Tax row shows 1 Oct to 31 Mar. First week = fewer than 7 Bangkok days with entries. The Insights pager was built, then removed at the owner's request (2026-11-21); the monthly report still opens from the push and chat.
- **History:** category filter (`category_id`, also used by exports); rows "Category · Account" with a receipt badge; Export and import sheet with the current filter scope and recent statement imports (Undo).
- **Money:** Budgets hero "Left to spend", category rows with a 4px bar, Delete moved into the category sheet, Breakdown list removed, repeat payments as recommendation cards (Log automatically / Remind me, Not a repeat / Accept; Undo deletes the created rule or reminder; the suggestion stays dismissed because the backend has no un-dismiss). Spec's third option "Track as a subscription only" isn't offered: it needs a backend mode. Recurring rules always visible. Wealth: Net worth hero (account balances, card debt negative, plus portfolio), account type icons, holding rows with % of portfolio, allocation bars removed.
- **Add entry:** empty or zero amount shows "Enter an amount above ฿0."; Undo of a saved entry also reverses the account balance it moved (a plain delete doesn't).
- **Statement flow:** the parser runs in one server call, so "Finding transactions", "Matching transfers" and "Sorting categories" finish together. Rows needing a call: possible duplicates, transfers to an unknown bank, new rows with no category. Skip keeps the default (no-category rows import as Others). The full row list stays under "All rows".
- **Tasks:** timeline rows keep the time in a 44px column outside each card; the Now row; Done chip. Reminder sheet: Repeat switch, importance cards with one-line explanations, "Reminder set: ..." toast.
- **Tax:** jump chips, help button, days left on the filing line, planner top 3 + See all, deductions show claimed items + Browse all, "Scan a 50 ทวิ" button on the tab, section codes on income shortcuts.
- **Tests:** `openTab(page, name)` in `tests/lib.js`; new `liff/uxui_refresh` (32): nav highlight per panel, Money memory across reloads, Add button visibility, More without a header avatar, Export/Import sheet from History and More (export-link), Add entry error / save toast + Undo / budget toast, AI tags and the trace (stubbed OCR), recommendation card + toast (stubbed suggestions), timeline time outside the card, History error state, first-week checklist, screenshots of every tab light and dark into `tests/.output/uxui_*.png`. `liff_html` now also fails on a top-level name declared in two scripts (tasks.js's `renderCategoryChips` had silently replaced a new one). `tests/run.js` runs each suite in its own process group so a timeout also kills its Chrome (a stuck browser used to stall the whole run).

### v5 review fixes (2026-11-22, branch `fix/v5-review`)

From the owner's `LIFF_V5_FIXES.md` review of `main` @ ce84ba7. LIFF only, no backend changes.

- **Recurring rules (Money › Budgets):** standard rows in a card: category tile (income tint for income), meta "Expense · Monthly · next Jan 1 · pay Nov 1–5" (plus "overdue" / "Paused"), the amount with "Mark paid" (`--brand-text`) or "Paid" under it, and a 44px "More actions" button. The action sheet holds the Active switch ("Log this automatically"), "Mark as not paid" (when paid) and Delete. Delete goes through the confirm modal and toasts "Rule deleted" with Undo, which re-creates the rule with the existing POST (same fields, `start_date` = its old next run, paused again if it was). Mark paid toasts with Undo. There's no Edit row: rules have no edit sheet. Paused rows are at 50% opacity.
- **Hero error states:** the Home and Budgets heroes start as skeletons (never a literal ฿0 in the markup). `fetchCycleReport()` returns null when `/reports/:u/monthly?offset=0` fails (logged with `console.error`). Budgets then shows "—" with "Couldn't load this cycle's totals." and Home shows "Couldn't load your budget." (it keeps the spent figure, which comes from transactions); each has a 44px Try again that drops the cached report and re-renders. "No budget set yet" appears only when the report loaded.
- **Tasks:** the summary is three 36px chips (Repeating / Upcoming / Done) with no outer card; each opens "Everything you've set" on its list (Done expands Done recently). `#tax-profile-summary` still uses `.tasks-summary`, untouched.
- **Goals and income (Wealth):** one list card, in this order: Emergency fund (from `currentUser` and the account balance; it needs only `/accounts`, so it renders even when the portfolio fetch fails), Investment goal, each savings goal (money.js), and Dividends (only with holdings). Rows with a target have a 4px bar. Tapping opens the existing card or editor in a sheet: `#ef-modal` (progress plus the settings form, saving toasts and closes), `#inv-goal-modal` (the old goal card; "Set up" opens the goal editor directly), `#div-modal` (the old dividends card), or the savings-goal sheet. Charts render when their sheet opens. Add goal opens a chooser while the investment goal or emergency fund is unset, and otherwise goes straight to a savings goal.
- **Holdings:** rows show the value in baht and the total gain % (one decimal); the meta is "{Type} · x% of portfolio", plus " · USD" for foreign holdings. The detail sheet keeps native figures, with the baht value beside Market value.
- **Sheets:** `addSheetCloseButtons()` puts a 44px close button (`aria-label="Close"`) at the top right of every `.modal` except the confirm dialog. It clicks the sheet's own Cancel/Close (so each sheet's cleanup runs), or hides the sheet. Escape and a backdrop tap do the same. Add entry's Cancel is now a quiet outline button.
- **Home:** Tax row meta "File PND 90 by 31 Mar"; "Save up to" over the amount on the right (the one-line form squeezes the title at 390px; the tip count is in the row's aria-label). Recent rows show "Category · Account" like History. The payment-method fallback shows only for users who track accounts, so users without accounts see just the category. Shared bills: dashed empty state, "New bill" action, bills as standard rows.
- **Fields:** every text input and select is at least 44px (`.field` inputs, History search, task title, bill participant names); chips and segments stay 36px.
- **Tests:** `liff/v5_fixes` covers each fix, including a field-height audit across every tab and sheet, and saves screenshots `tests/.output/v5fix_*.png` (Home, Budgets, Wealth, Tasks in light and dark, the recurring card and sheet, the tax row, the Add entry sheet). Updated: pay_window_list, tasks_tab, money, goal_card, dividends_card, holdings_lots, batch1.

### Recurring: Edit, Track as a subscription only (2026-11-22)

- **Edit rule** (action sheet): the rule sheet opens prefilled; type is locked, the date is the next run, empty pay days clear the window. `PUT /recurring/:u/:id` gained `next_run_date`, an amount > 0 check and a category-ownership check (it used to accept any category id).
- **Track as a subscription only** (repeat-payment cards, migration 026): `accept` with `mode: 'track'` creates a rule with `track_only = true`. It shows under Subscriptions & bills ("Track only") and in Recurring rules ("tracked only"); `jobs/recurringTransactions.js` skips it. Turning "Log this automatically" on in its sheet sets `track_only = false`. Before the migration the accept returns 503 "needs a database update" and nothing else is affected (the overview reads `*`).
- **Home first week:** `renderFirstWeek` called an undefined `getBangkokYmd`, so it threw for any user with entries and the checklist never rendered for them; fixed (`bangkokYmd`).

### Subscriptions & bills: what's due next (2026-11-23)

From the owner's `SUBSCRIPTIONS_NEXT_DUE.md`. No migration.

- **Backend** (`services/subscriptions.js`, still pure; `overview(rules, txns, { today, cycleEnd })`): each item gains `next_due` (Bangkok YYYY-MM-DD), `days_until`, `status` (`overdue` | `due_soon` 0-3 days | `upcoming` | `paid`), `next_amount` (the latest price when it went up), `account` and `auto` (false = track only). The summary gains `next` (first unpaid item), `due_7d` and `left_this_cycle` (`{ count, total }`). Items sort by `next_due`, overdue first; `monthlyTotal`/`yearlyTotal` unchanged.
  - **Next date:** pay-window rules use the window end of the current unpaid period (past = overdue); once paid, the next period's window end. Other rules use `next_run_date` rolled forward to today or later, keeping the anchor day (31 Jan -> 28 Feb -> 31 Mar). Track-only rules never advance `next_run_date`, so rolling forward matters for them. Only pay-window rules can be overdue: an auto-logging rule logs itself.
  - **Counts:** every occurrence counts (a weekly rule can be due 4 times in a cycle), overdue ones included (still owed). "Due in 7 days" is today plus 7 days; "left this cycle" stops before the user's next billing-cycle start (`monthlyReport.cycleRange`), so a bill due on the cycle start day belongs to the next cycle.
  - **Account:** rules have no account column, so it comes from the latest matching expense's `from_account_id` (same description match as price rises), else null.
  - `loadOverview(lineUserId)` gathers the rows (used by `GET /recurring/:u/overview`, the bot summary and the briefing); `due7Line()` and `dueToday()` format the chat lines.
- **LIFF** (money.js): a header card "Next" with "Water ฿300 · overdue 14 days (Tue 10 Nov)", two stats (Due in 7 days, Left this cycle, each "฿total (count)"), and the monthly/yearly totals in a smaller row. Rows: tile, description, meta "Monthly · KBank •••1234 · Logs automatically / Track only", the price-rise note, `formatBaht(next_amount)` with "Today" / "Tomorrow" / "in 5 days" / "Overdue 2 days" (red, the only red) or a muted check "Paid". Unpaid pay-window rows have an inline 44px Mark paid (toast with Undo; refreshes the overview and the Recurring rules list). Sort chips Next due (API order) | Cost (monthly, desc), 44px.
- **Extras:** Home "Next bill: Water" row (when the overview has a `next`; tap opens Budgets scrolled to Subscriptions & bills); the bot "summary" adds "Due in 7 days: ฿1,250 (3 bills)" (best-effort); the 07:30 briefing lists "Bills due today" (unpaid, due today), and bills alone are enough to send it (opt-in and the notifications toggle still apply).
- **Tests:** `api/subscriptions_math` (next dates per frequency, month-end clamp, pay window paid/unpaid/overdue, cycle boundary, billing cycle vs calendar month, Bangkok midnight, price rise, totals, sort, chat lines); `liff/subs_next_due` (stubbed overview: header, labels, meta, sort, Mark paid + Undo, Home row, 44px, no overflow, screenshots light and dark); `api/briefing` (bills-only briefing). Updated: `liff/money_extras` ("Track only").

### Bulk slip import (2026-11-23)

From the owner's `SLIP_BULK_IMPORT.md`. No migration. Entry points: History › Export / Import › Bank slips; Home › Scan (now a chooser: "One receipt or slip" = the entry sheet as before, "Several slips at once"); More › Import (opens the Export / Import sheet).

- **Flow:** pick up to 50 images (`input multiple`; more are dropped with a toast). Each is read on its own `POST /slips/:u/read` (3 at a time): resized to 1280px JPEG, the original file's SHA-256, and the slip QR decoded on the phone. A task row per image (thumbnail from a local object URL, "Reading 12 of 30"); Stop leaves the rest unread with Try again. Then one review list: **Needs a look** (no account match, unreadable amount or date, or a possible duplicate: an approval card with the reason, "Matches ฿250 · Grab · Nov 12", and Expense / Income / Transfer), **Ready** (ticked rows), **Skipped** (already recorded, not a bank slip, couldn't be read with Try again). Rows keep the group they were read into, so fixing one doesn't move it. Tap a row to edit it inline (amount, description, category, account(s), date); this is an inline editor in the slip sheet, not the entry sheet (deviation from the brief: simpler, and nothing is saved by accident). "Import N" sends the ticked rows; toast "Imported 18 slips" with Undo; budget alerts come back combined and show in the in-app banner once (`showBudgetAlerts` now takes a list). Read results live in memory only.
- **Dedupe key** (`services/slipQr.js`, pure): the BOT slip-verification QR is EMV-style TLV (`00` { `00` "000001", `01` sending bank, `02` reference }, `51` TH, `91` CRC-16, checked when present; `000201…` PromptPay QRs are rejected). Keys are built on the server: `slipqr:` sha256(user | bank | ref), else `slip:` sha256(user | image sha256). **Deviation:** `transactions.slip_hash` is UNIQUE across all users (migration 003), so keys include the user id; otherwise the payer and the payee importing the same slip would collide. A read also matches the image key (a slip first saved without its QR) and the raw image hash (bot photos). The QR is only a key: amounts and names come from OCR and the user approves them.
- **QR on the phone:** `BarcodeDetector` when available, else jsQR loaded on first use from **jsDelivr** (`jsqr@1.4.0`; jsQR isn't on cdnjs, deviation from the brief). Blocked CDN or no QR: the image hash, no error.
- **Single scan shares the key:** the Add entry scan now sends `qr` and hashes the original photo; `/ocr/scan` builds the same key, 409s on a known one (QR key, image key or raw hash) before OCR, and returns `slip_key`, which the save sends as `slip_hash`. (Before this, LIFF scans never stored a slip hash, so the same receipt could be saved twice from the app.)
- **Backend** (`services/slipImport.js`, `controllers/slipController.js`, `routes/slipRoutes.js`):
  - `POST /slips/:u/read` `{ image_base64, image_sha256, qr }` writes nothing: duplicate check first (no OpenAI), then `extractSlipFromImage` (gpt-4o-mini Vision, 20 s, Buddhist years converted), `not_slip` for other photos. Direction from the user's accounts by the visible digits of the masked numbers (unique match only): from own = expense, to own = income, both = transfer ("KBank → BBL"), neither = needs a look (defaults to expense). Description = the other side's name without titles. Category: learned (the user's latest row with that description and type), then statement import's keyword rules, then gpt-4o-mini, then Others. Possible duplicate: same amount within ±1 Bangkok day. Time read: that Bangkok time; date only: T12:00:00Z.
  - `POST /slips/:u/import` `{ rows }` (≤ 50): every row re-validated (key format, type, amount, date, category), inserted one by one through `transactionCreate` with `channel: 'liff'` (no LINE pushes), duplicates counted as skipped, bad category/account rows reported in `errors`. **Balances move** like a manual entry (unlike statement imports). Returns `imported` (id, amount, type, accounts), `skipped`, `errors`, `budget_alerts` (latest per category), `event_budget_alerts`.
  - `POST /slips/:u/undo` `{ rows: imported }`: deletes this user's `slip:`/`slipqr:` rows that still match (amount, type, accounts), so an edited row stays, and reverses their balances. (`DELETE /transactions/:u/:id` does not reverse balances, contrary to the brief; undo does it itself.)
  - Limits: `slipRead` 120 / 10 min (duplicates count), `slipImport` 20 / 10 min. Over the read limit the phone keeps what it read, shows "Taking a short break, resuming in X min" from `Retry-After` (API errors now carry `status` and `retryAfter`) and carries on. Errors are logged by class and status only, never slip contents. No thumbnails for bulk rows (v2 idea).
- **Privacy:** privacy.html / privacy-th.html list bank slips (sent to OpenAI, images not stored, fields kept only for imported slips, a fingerprint kept for dedupe).
- **Tests:** `api/slip_qr` (TLV, CRC, PromptPay and garbage rejected, per-user keys), `api/slips_api` (pure direction/account/date/alerts, 401, duplicate reads without OpenAI incl. legacy and image keys, single scan 409 on a bulk key, import validation, one combined alert, balances incl. transfer, re-import no-op, undo keeps the edited and non-slip rows and restores balances, 429), `liff/slip_import` (Home Scan chooser, 6 stubbed images incl. a 500 and Try again, groups and counts, duplicate unticked, type change, inline edit, import body, toast, banner, Undo, jsQR blocked, screenshots light/dark), `openai/slip_read` (synthetic slip `tests/fixtures/slip.js`: amount, Buddhist-year date, time, names, then the endpoint's direction and category; a receipt is not a slip).
- **Not verified:** QR decoding of a real bank slip (no real slips in tests; the TLV layout follows the BOT slip-verification format and should be checked once against a real slip by the owner).

### Groups page (2026-11-28)

Owner asked for a full group view (2026-11-28).

- **Page** `tab-groups` (nav: More; no Add button), opened from More › LINE groups (was a scroll to the Home card), Home's LINE groups "See all", and `?tab=groups`. It has a hero "Across your LINE groups": net (owed − owe, signed), "You owe / Owed to you overall · N open bills" (or "All settled up"), and You owe / Owed to you stats. Below that, one row per group (same rows as the Home card, `groupRowsHtml`) opening the group sheet. With no groups it shows a dashed how-to ("Add the bot to a LINE group, then type +ข้าว 600 ..."). A failed load shows the alert card with Try again. `groupsLoadSeq` stale guard.
- **Group sheet › Members:** current members, me first, then whoever owes most. Each row has an initial tile, the name ("(you)"), "Owes ฿X · N bills" or "All paid up", and this month's paying rank ("Fastest payer", "2nd fastest"); on the right, "Owes you ฿X" or "You owe ฿X" from the viewer's side, over open bills. Under it: "Fastest counts this month's payments. Top host this month: Ann (3 bills)."
- **API:** `GET /groups/:u/:group_id` adds `members` (`name, is_me, owes_me, i_owe, unpaid_total, unpaid_bills, rank, firsts`; no LINE ids) and `top_host`. Pure `groupBillMath.memberBalances(bills, me, memberIds)` (open bills, cents-exact); the rank reuses `leaderboard()` over the Bangkok month, like the chat `rank`.
- **Tests:** `liff/groups_page` (page, hero, sheet members, back, See all, deep link, empty and error states, screenshots `groups_page.png` / `groups_sheet_members.png`), `api/groups_api` (members, no ids, rank, top host), `api/group_bill_math` (memberBalances).

