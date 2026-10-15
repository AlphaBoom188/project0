# Phase 3 Feature & Architecture Specification: Parnuan (ป้านวล) Parity

## 1. Feature Breakdown & Overview (ป้านวล Parity)

### 1.1 Input & Recording Methods
- **Text Chat Parsing**: Natural Thai text recognition (e.g., "กินกาแฟ 80") via LINE bot.
- **Receipt & Slip OCR**: Image upload of receipts/slips with multi-item extraction, thumbnail creation, and signed URL generation.
- **Voice-to-Text Recording**: Audio snippet transcription into structured expense logs.
- **PDF File Support**: Extracting transactions from bank statements or PDF invoices.
- **Recurring Expenses**: Scheduled recurring entries (subscriptions, rent, bill payments).

### 1.2 Budgeting & Analytics
- **Auto-Categorization**: AI-driven categorization for ambiguous text and receipt items.
- **Budgeting & Category Limits**: Set global monthly caps or category-specific thresholds with non-blocking alerts.
- **Custom Budget Cycle**: Support custom month start dates (e.g., paydays on 1st or 25th).
- **Data Export**: Export transaction history to CSV/Excel formats.

### 1.3 Notifications & System Features
- **Daily Reminders / Digest**: Scheduled daily background notifications (node-cron at 21:00 Asia/Bangkok).
- **Multi-User / Group Support**: Shared expense logging inside LINE group chats.
- **Tiered Feature Locks (Paywall UI)**: UI badges (`🔒 Pro`) for premium capabilities.

---

## 2. SRS & UI/UX Breakdown (LIFF MINI App)

### 2.1 Navigation & Screen Architecture
1. **Dashboard (`สรุป`)**: Profile header, budget cycle selector, Net Balance / Income / Expense cards, recent transactions list.
2. **Analytics (`วิเคราะห์`)**: Monthly trend charts (Income vs Expense), category breakdown pie/donut charts.
3. **Categories & Budgets (`หมวด / งบ`)**: Income/Expense toggle, budget cycle setup, category listing with budget status.
4. **Transactions (`รายการ`)**: Filterable transaction history (Date range, Income/Expense filters, CSV Export button) + Bottom Sheet Add Modal.
5. **Settings (`ตั้งค่า`)**: Profile & tier banner, recording preferences, notification toggles, general preferences, destructive "Delete All Data" action.

---

## 3. Database Schema Extensions (Supabase SQL)

```sql
-- Migration: 006_phase3_schema.sql

-- Add budget cycle & default currency preferences to users
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS budget_cycle_start_day INT DEFAULT 1,
ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'THB',
ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) DEFAULT 'Asia/Bangkok';

-- Create Categories Table
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('EXPENSE', 'INCOME')),
  budget_amount DECIMAL(12, 2) DEFAULT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add Category reference and payment method to transactions
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'CASH';