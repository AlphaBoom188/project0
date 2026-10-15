# Product Requirements & Architecture Blueprint (Phase 2 & Beyond)

This document synthesizes all refined product requirements into a cohesive strategy, technical architecture, and execution plan for implementation.

---

## 1. System Vision & Core Value Proposition

The product is a **Multi-Channel Personal & Shared Wealth Management Platform** operating across **LINE Messaging API (Webhook Relay), LIFF Web Application, and Native iOS (Xcode/SwiftUI)**.

```
                  +-----------------------------------+
                  |         Unified Engine            |
                  |     (Supabase Postgres / Node)    |
                  +-----------------+-----------------+
                                    |
        +---------------------------+---------------------------+
        |                           |                           |
  +-----+-----+               +-----+-----+               +-----+-----+
  | LINE Bot  |               | LIFF Web  |               | Native iOS|
  |  (Chat)   |               |   (UI)    |               |   (App)   |
  +-----------+               +-----------+               +-----------+
```

---

## 2. Comprehensive Requirements Matrix

### 1. Ingestion Channels & Multi-Modal Processing
* **LINE Messaging API (Webhook Relay)**:
  * Users record transactions directly in the LINE chat window via natural language parsing (e.g., `"Coffee 80 BTS 40"`).
  * Webhook receives payload $\rightarrow$ Parses transactions $\rightarrow$ Saves to Supabase $\rightarrow$ Sends immediate LINE push reply.
* **Multi-Modal Receipt Reader**:
  * **Phase 1**: Manual text input + OCR scanning of payment receipts / e-slips uploaded via chat or Web/App.
  * **Phase 2 (Expansion)**: Automated email receipt ingestion (reads incoming bank e-slips directly from linked email accounts).

### 2. Design System & UX Standards ("Claude Design System")
* **UI/UX Refinement**:
  * Professional typography-first layout, high-contrast structural card hierarchy, strict grid padding, clean border highlights, zero clutter, and zero emoji reliance.
* **Performance Enhancements**:
  * Client-side optimistic UI, background pre-fetching, local storage caching (MMKV/IndexedDB), and lazy analytics evaluation.
* **Theme Support**:
  * Native **Dark Mode** and **Light Mode** engine adhering to system preference with explicit user override toggle.

### 3. Dual Budget Detection & Channel-Aware Reminders
* **Dual Exceedance Detection**:
  * **Channel A (Manual / Slip via LINE Chat)**: Asynchronous check. Webhook records expense $\rightarrow$ background worker evaluates budget limits $\rightarrow$ sends LINE push alert if budget is exceeded.
  * **Channel B (Native App / LIFF UI)**: Client-side real-time evaluation. Triggers instant alert banner / local push notification upon form submission.
* **Adaptive Reminders & Channel Awareness**:
  * Configurable scheduled reminders (e.g., Afternoon 12:00 PM, Evening 8:00 PM) prompting expense recording.
  * System tracks active channel state (**LIFF-only**, **App-only**, or **Dual-active**) and routes notifications through the active channel to eliminate duplicate alerts.

### 4. Account, Card & Multi-Wallet Tracking
* **Account & Card Tracking**:
  * Tracks bank accounts, credit cards, and debit cards (masked numbers) to attribute funding sources.
  * Supports internal account-to-account transfers without misclassifying transfers as net income or expenses.
* **Multi-Wallet Balance Tracking**:
  * Direct balance tracking for e-wallets (TrueMoney, GrabPay, ShopeePay, LINE Pay).
  * Top-ups are recorded as **Wallet Transfers** (Main Bank Account $\rightarrow$ E-Wallet) to maintain accurate liquid balances.

### 5. Advanced Cash Flow & Dynamic Subscriptions
* **Flexible Date-Range Recurring Engine**:
  * Recurring bills support custom date windows (e.g., rent payment window from the 1st to the 5th of every month).
* **Breakdown Budgeting & One-Time Expected Costs**:
  * Supports temporary budget adjustments or planned one-off expenses for specific months (e.g., regular skincare budget + one-off clinic visit next month).
  * Directly reflects and recalculates upcoming cash flow forecasts.

### 6. Authentication & Secure Data Export
* **Google OAuth Integration**:
  * Removes manual text input for target export emails to eliminate data leakage risks.
  * Requires **Google Sign-In**. CSV exports automatically deliver to the verified Google account email tied to the session.

### 7. Reverse-Engineered Shared-Bill Engine ("KhunThong" Architecture)
* **Bill Splitting Mechanics**:
  * Equal split, itemized per-person assignment, and custom amount allocation.
  * Receipt OCR maps specific line items directly to group members.
* **Group Settlement & Tracking**:
  * Automated payment reminderssent to group members.
  * QR Code / e-slip verification auto-settles outstanding balances.

### 8. Long-Term Roadmap: Asset & Portfolio Tracking
* **Investment Portfolio Integration (Yahoo Finance Model)**:
  * Asset tracking across Stocks, ETFs, Crypto, Mutual Funds, and Gold.
  * Syncs market values to calculate total Net Worth and asset allocation percentages.
* **Emergency Fund & Surplus Motivation**:
  * Automatically calculates monthly surplus cash and prompts allocation into Emergency Funds or Asset Portfolios.

---

## 3. Database Schema Migration Script (Supabase PostgreSQL)

```sql
-- Migration 009: Phase 2 Schema Expansion

-- 1. USERS & AUTHENTICATION (Google Linked)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_id VARCHAR(255) UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    line_user_id VARCHAR(255) UNIQUE,
    active_channel VARCHAR(32) DEFAULT 'liff', -- 'liff_only', 'app_only', 'both'
    theme_preference VARCHAR(16) DEFAULT 'dark', -- 'dark', 'light'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ACCOUNTS & MULTI-WALLETS
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    account_name VARCHAR(128) NOT NULL,
    account_type VARCHAR(32) NOT NULL, -- 'bank', 'credit_card', 'e_wallet', 'cash'
    bank_code VARCHAR(32),
    account_number_masked VARCHAR(32),
    balance NUMERIC(14, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. EXPENSE & BUDGET CATEGORIES
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(64) NOT NULL,
    type VARCHAR(16) CHECK (type IN ('income', 'expense', 'transfer'))
);

-- 4. MONTHLY & DYNAMIC BREAKDOWN BUDGETS
CREATE TABLE IF NOT EXISTS budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    base_monthly_amount NUMERIC(12, 2) NOT NULL,
    one_off_extra_amount NUMERIC(12, 2) DEFAULT 0.00, -- e.g. Extra clinic cost
    forecast_month DATE NOT NULL, -- First day of target month (YYYY-MM-01)
    UNIQUE(user_id, category_id, forecast_month)
);

-- 5. TRANSACTIONS (Multi-Account & Wallet Transfer Enabled)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    from_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    to_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL, -- Used for transfers/top-ups
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    amount NUMERIC(12, 2) NOT NULL,
    transaction_type VARCHAR(16) CHECK (transaction_type IN ('income', 'expense', 'transfer')),
    channel VARCHAR(32) NOT NULL, -- 'line_chat', 'liff', 'ios_app', 'email_auto'
    receipt_url TEXT,
    note TEXT,
    transaction_date TIMESTAMPTZ DEFAULT NOW()
);

-- 6. RECURRING SUBSCRIPTIONS & DATED PAYMENTS
CREATE TABLE IF NOT EXISTS recurring_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    title VARCHAR(128) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    pay_start_day INT CHECK (pay_start_day BETWEEN 1 AND 31), -- e.g. 1st
    pay_end_day INT CHECK (pay_end_day BETWEEN 1 AND 31),   -- e.g. 5th
    frequency VARCHAR(32) DEFAULT 'monthly',
    is_active BOOLEAN DEFAULT TRUE
);

-- 7. SHARED BILLS (KhunThong Engine)
CREATE TABLE IF NOT EXISTS shared_bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID REFERENCES users(id) ON DELETE CASCADE,
    group_line_id VARCHAR(255),
    title VARCHAR(128) NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL,
    split_type VARCHAR(32) NOT NULL, -- 'equal', 'itemized', 'custom'
    status VARCHAR(32) DEFAULT 'active' -- 'active', 'settled'
);

CREATE TABLE IF NOT EXISTS shared_bill_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID REFERENCES shared_bills(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    display_name VARCHAR(128) NOT NULL,
    amount_owed NUMERIC(12, 2) NOT NULL,
    is_paid BOOLEAN DEFAULT FALSE,
    paid_at TIMESTAMPTZ
);
```

---

## 4. Implementation Phasing Strategy

```
  Phase 2A: Core Engine
  ├── Google OAuth Integration
  ├── Multi-Wallet & Account Migration
  ├── LINE Messaging API Webhook Handler
  └── Flexible Date-Range Recurring Rules

  Phase 2B: Modern UI/UX Refinement
  ├── "Claude Design System" UI Overhaul
  ├── Dark / Light Mode Engine
  └── Performance Optimization & Instant Caching

  Phase 2C: Shared Bills & Notifications
  ├── Shared Bill Engine (KhunThong Architecture)
  ├── Dual Budget Exceedance Alert Engine
  └── Channel-Aware Cron Notification Worker

  Phase 3: Native iOS Shell (Xcode / SwiftUI)
  ├── Native SwiftUI App Frame
  ├── Quick-Record Widgets / Shortcuts
  └── Local-First Sync Engine

  Phase 4: Wealth & Asset Management
  ├── Portfolio Asset Tracker (Stocks, ETFs, Crypto)
  └── Surplus Cash & Emergency Fund Calculator
```