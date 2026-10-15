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
- `POST /api/transactions/:line_user_id` - Create transaction (`category_id` optional for an expense with a `description` -- auto-categorized)
- `GET /api/transactions/:line_user_id` - Get transactions
- `DELETE /api/transactions/:line_user_id/all` - Delete every transaction for a user (irreversible; client must confirm first)
- `GET /api/transactions/:line_user_id/export` - Export transactions as CSV (UTF-8 BOM)
- `GET/POST /api/recurring/:line_user_id`, `PUT/DELETE /api/recurring/:line_user_id/:recurring_id` - Recurring expense/income rules
- `GET /api/line/login-url` - Generate LINE Login URL
- `GET /api/line/callback` - Handle LINE OAuth callback
- `POST /api/ocr/scan/:line_user_id` - Scan a receipt image (OpenAI Vision), extract amount/date/merchant/category, and check `slip_hash` for duplicates
- `POST /api/line/webhook` - LINE Bot webhook (signature-verified). Handles `follow` (provisions the user), text messages (free-text expense parsing, e.g. "coffee 120", plus a "summary"/"สรุป" command), image messages (same OCR pipeline as the REST endpoint), and `postback` (Confirm/Cancel on the resulting Flex card)

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

## Project Architecture

### Directory Structure

```
project0/
├── docs/                          # Product documentation
│   ├── PRD.md                     # Product Requirements
│   ├── ARCHITECTURE.md            # System Architecture
│   ├── DB_SCHEMA.md               # Database Schema
│   └── SETUP_GUIDE.md             # Setup Instructions
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
│   │   └── recurringController.js # Recurring expense/income rule CRUD
│   ├── routes/                    # API routes
│   │   ├── userRoutes.js
│   │   ├── categoryRoutes.js
│   │   ├── transactionRoutes.js
│   │   ├── lineRoutes.js
│   │   ├── lineWebhookRoutes.js  # mounted before express.json() -- needs the raw body
│   │   ├── recurringRoutes.js
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
│   │   ├── budgetAlert.js       # event-driven budget-threshold check, fires once on crossing
│   │   └── autoCategorize.js    # keyword-then-LLM category inference for expenses with no category_id
│   ├── jobs/
│   │   ├── dailyDigest.js       # node-cron, 21:00 Asia/Bangkok, daily income/expense push
│   │   └── recurringTransactions.js # node-cron, 00:05 Asia/Bangkok, generates due recurring transactions
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
    └── style.css
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

✅ **LIFF Settings screen** — gear icon in the LIFF header opens a Settings view (`liff-app/` `#settings-view`, no router, just show/hide): toggles for `notifications_enabled`/`thumbnails_enabled` (`PATCH /api/users/:line_user_id/preferences`, new), budget cycle start day (reuses the existing `PUT /api/users/:line_user_id/billing-cycle` — deliberately *not* the spec's separate `budget_cycle_start_day` column, to avoid two columns meaning the same thing), and a "Clear Transaction History" destructive action gated behind a custom confirm modal (`DELETE /api/transactions/:line_user_id/all`, new — registered before the `:transaction_id` wildcard route so `/all` isn't swallowed by it).

✅ **In-LIFF receipt OCR** — the Add Expense modal's `<input type="file" accept="image/*" capture="environment">` resizes the photo client-side (canvas, ~1280px JPEG q0.7, mirroring the iOS app's approach), hashes it (`crypto.subtle.digest`), and POSTs to the same `/api/ocr/scan/:line_user_id` the REST/bot paths already use — no new backend endpoint, same dedup and thumbnail pipeline.

✅ **Auto-categorization** — `services/autoCategorize.js`: cheap keyword matching against the user's category names first (English + Thai hints), an LLM call (`gpt-4o-mini`) only if that misses, falling back to "Others" so a category is always returned. Wired into `transactionController.createTransaction` — `category_id` is now optional for an expense *if* a `description` is given (income still requires an explicit category_id); existing callers that always pass `category_id` are unaffected. In the LIFF Add Expense form the Category field defaults to "✨ Auto-Categorize", not the first real category — leaving it as-is omits `category_id` from the request entirely.

**Note:** `express.json()` has an explicit `limit: '10mb'` — the default is 100kb, which a base64-encoded receipt photo (even resized client-side) routinely exceeds; this surfaced as a 413 once real phone photos were tested (a tiny synthetic test image had been masking it). `apiRequest()` in `liff-app/app.js` always prefixes thrown errors with the real HTTP status (`[413] ...`) for exactly this kind of failure.

- [ ] Analytics charts, custom per-category budget alerts UI, Thai voice-to-text, PDF statement import, multi-user/group support, paywall UI — all named in `docs/PHASE_3_SPEC.md` but out of scope so far

### Phase 4

Scoped down from the literal ask — "Tab Navigation Speed" and "lazy-load the Analytics tab" don't apply, since the LIFF app has only ever had two views (Dashboard, Settings; see Phase 3) and no tab bar or charts exist to speed up or lazy-load. See conversation for the full reconciliation.

✅ **Recurring expenses** (migration `007_phase4_schema.sql`, table `recurring_transactions`) — `controllers/recurringController.js` + `routes/recurringRoutes.js` mounted at `/api/recurring` (CRUD, `line_user_id`-scoped like everything else; `category_id` uses `ON DELETE RESTRICT` like `transactions`, so a category in active use by a rule can't be deleted out from under it). `jobs/recurringTransactions.js` (`node-cron`, 00:05 Asia/Bangkok) finds rows where `next_run_date <= now` and `is_active = true`, creates a real transaction via the same shared `services/transactionCreate.js` every other path uses, advances `next_run_date` by the rule's `frequency`, and pushes a LINE notification (respecting `notifications_enabled`). One rule failing doesn't block the rest — `next_run_date` is only advanced on success, so a failed rule naturally retries next tick. Manager UI lives in the LIFF Settings screen ("ตั้งรายการจดประจำ"), not a separate Transactions screen (doesn't exist).

✅ **CSV export** — `GET /api/transactions/:line_user_id/export`, same `type`/`category_id`/`start_date`/`end_date` filters as the regular list endpoint. Prefixes the response with a UTF-8 BOM (`﻿`) so Thai text opens correctly in Excel instead of as mojibake — verified with an actual Thai description end to end. Wired to a button on the Dashboard's existing "Recent Transactions" section (not a separate Transactions screen) via a plain `window.location.href` navigation, letting the browser handle the `Content-Disposition: attachment` response natively.

✅ **LIFF initial-load parallelization** — `loadDashboard()` used to block the transactions fetch on the user response resolving first (it needs `billing_cycle_start_day` to compute the date range). Now fetches a fixed recent window (`limit=50`, no date filter) in parallel with the user and categories calls, then filters to the current billing cycle client-side for the summary card (using actual `Date` comparisons, not string comparisons — the API's `+00:00`-suffixed timestamps and the client's `Z`-suffixed ones are different string shapes for the same instant). Side effect: "Recent Transactions" now shows genuinely recent activity across cycle boundaries rather than being clipped to the current cycle.
