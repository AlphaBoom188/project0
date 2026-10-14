# Expense Tracker Backend API

Node.js Express backend for the Expense Tracker System with Supabase database and LINE Login integration.

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Supabase project with tables created (see `supabase/migrations/`)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key
- `OPENAI_API_KEY` - Your OpenAI API key
- `LINE_LOGIN_CHANNEL_ID` - LINE Login channel ID
- `LINE_LOGIN_CHANNEL_SECRET` - LINE Login channel secret
- `LINE_MESSAGING_CHANNEL_ID` - LINE Messaging API channel ID
- `LINE_MESSAGING_CHANNEL_SECRET` - LINE Messaging API channel secret
- `LINE_LOGIN_REDIRECT_URI` - Callback URL for LINE Login (default: http://localhost:3000/api/line/callback)
- `PORT` - Server port (default: 3000)

3. Set up the database:
   - Go to Supabase SQL Editor
   - Run the migration files in order from `supabase/migrations/`:
     - 001_create_users_table.sql
     - 002_create_categories_table.sql
     - 003_create_transactions_table.sql
     - 004_insert_preset_categories.sql

## Running the Server

Development:
```bash
npm run dev
```

Production:
```bash
npm start
```

The server will start on `http://localhost:3000`

## API Endpoints

### Health Check
- `GET /` - API status
- `GET /health` - Database health check

### Users
- `POST /api/users` - Create or update user after LINE Login
  - Body: `{ line_user_id, display_name, picture_url }`
- `GET /api/users/:line_user_id` - Get user profile
- `PUT /api/users/:line_user_id/billing-cycle` - Update billing cycle
  - Body: `{ billing_cycle_start_day }`
- `DELETE /api/users/:line_user_id` - Delete user account

### Categories
- `GET /api/categories/:line_user_id` - Get all categories for a user
  - Query params: `type` (income/expense)
- `POST /api/categories/:line_user_id` - Create a new category
  - Body: `{ name, type, budget_amount, budget_period }`
- `PUT /api/categories/:line_user_id/:category_id` - Update a category
  - Body: `{ name, budget_amount, budget_period }`
- `DELETE /api/categories/:line_user_id/:category_id` - Delete a category
- `POST /api/categories/:line_user_id/reassign` - Reassign transactions between categories
  - Body: `{ from_category_id, to_category_id }`

### Transactions
- `GET /api/transactions/:line_user_id` - Get all transactions for a user
  - Query params: `type`, `category_id`, `start_date`, `end_date`, `limit`, `offset`
- `GET /api/transactions/:line_user_id/summary` - Get transaction summary by category
  - Query params: `start_date`, `end_date`, `type`
- `GET /api/transactions/:line_user_id/:transaction_id` - Get a single transaction
- `POST /api/transactions/:line_user_id` - Create a new transaction
  - Body: `{ category_id, amount, type, description, slip_hash, thumbnail_url, transaction_date }`
- `PUT /api/transactions/:line_user_id/:transaction_id` - Update a transaction
  - Body: `{ category_id, amount, type, description, thumbnail_url, transaction_date }`
- `DELETE /api/transactions/:line_user_id/:transaction_id` - Delete a transaction

### LINE Login
- `GET /api/line/login-url` - Generate LINE Login URL
  - Query params: `state`
- `GET /api/line/callback` - Handle LINE Login callback
  - Query params: `code`, `state`
- `POST /api/line/verify` - Verify LINE access token
  - Body: `{ access_token }`
- `POST /api/line/logout` - Logout (revoke token)
  - Body: `{ access_token }`

## Database Schema

### Users
- `line_user_id` (VARCHAR, PRIMARY KEY) - LINE user ID
- `display_name` (VARCHAR) - User display name
- `picture_url` (TEXT) - Profile picture URL
- `billing_cycle_start_day` (INTEGER) - Billing cycle start day (1-31)
- `created_at` (TIMESTAMP) - Account creation timestamp

### Categories
- `id` (UUID, PRIMARY KEY) - Category ID
- `line_user_id` (VARCHAR, FK) - User ID
- `name` (VARCHAR) - Category name
- `type` (VARCHAR) - 'income' or 'expense'
- `budget_amount` (DECIMAL) - Budget limit
- `budget_period` (VARCHAR) - 'daily', 'weekly', 'monthly', 'yearly'
- `is_preset` (BOOLEAN) - Whether this is a preset category
- `created_at` (TIMESTAMP) - Creation timestamp

### Transactions
- `id` (UUID, PRIMARY KEY) - Transaction ID
- `line_user_id` (VARCHAR, FK) - User ID
- `category_id` (UUID, FK) - Category ID
- `amount` (DECIMAL) - Transaction amount
- `type` (VARCHAR) - 'income' or 'expense'
- `description` (TEXT) - Transaction description
- `slip_hash` (VARCHAR, UNIQUE) - Slip hash for duplicate prevention
- `thumbnail_url` (TEXT) - Slip thumbnail URL
- `transaction_date` (TIMESTAMP) - Transaction date
- `created_at` (TIMESTAMP) - Record creation timestamp

## Important Notes

- All API endpoints use `line_user_id` as the user identifier
- Deleting a category with existing transactions requires reassigning those transactions first
- Duplicate slip detection is enforced via the `slip_hash` UNIQUE constraint
- Preset categories are automatically created for new users on signup
