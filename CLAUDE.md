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

**Backend Endpoints:**
- `GET /` - API status
- `GET /health` - Database health check
- `POST /api/users` - Create/update user
- `GET /api/users/:line_user_id` - Get user profile
- `POST /api/categories/:line_user_id` - Create category
- `GET /api/categories/:line_user_id` - Get categories
- `POST /api/transactions/:line_user_id` - Create transaction
- `GET /api/transactions/:line_user_id` - Get transactions
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
│   │   └── ocrController.js     # Receipt OCR (OpenAI Vision)
│   ├── routes/                    # API routes
│   │   ├── userRoutes.js
│   │   ├── categoryRoutes.js
│   │   ├── transactionRoutes.js
│   │   ├── lineRoutes.js
│   │   ├── lineWebhookRoutes.js  # mounted before express.json() -- needs the raw body
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
│   │   └── budgetAlert.js       # event-driven budget-threshold check, fires once on crossing
│   ├── jobs/
│   │   └── dailyDigest.js       # node-cron, 21:00 Asia/Bangkok, daily income/expense push
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

✅ **User preferences** (migration `005_add_user_preferences.sql`) — `users.notifications_enabled` and `users.thumbnails_enabled`, both default `TRUE`. `services/userPreferences.js` reads them and **fails open to both defaults** if the columns are ever missing, so rollout ordering can't break anything. No settings UI exists yet to actually flip them (DB-only for now, by design) — a real settings screen (iOS or LIFF) is deferred rather than bolting on a bot text command.

- [ ] LINE MINI App (LIFF)
- [ ] AI-powered expense categorization (beyond the category-matching already done during OCR/text parsing)
- [ ] A settings UI (iOS or LIFF) to actually toggle `notifications_enabled`/`thumbnails_enabled`
