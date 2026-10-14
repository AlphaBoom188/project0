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
│   │   └── lineController.js    # LINE OAuth
│   ├── routes/                    # API routes
│   │   ├── userRoutes.js
│   │   ├── categoryRoutes.js
│   │   ├── transactionRoutes.js
│   └── lineRoutes.js
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
        │       ├── AddTransactionView.swift
│   │       └── TransactionListView.swift
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

### Phase 2 (Future)

- LINE Bot integration
- LINE MINI App (LIFF)
- OCR slip scanning
- AI-powered expense categorization
