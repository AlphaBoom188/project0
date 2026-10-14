# Supabase Database Migrations

This directory contains SQL migration files for setting up the Expense Tracker database.

## Migration Files

1. `001_create_users_table.sql` - Creates the users table with LINE user ID as primary key
2. `002_create_categories_table.sql` - Creates the categories table with foreign key to users
3. `003_create_transactions_table.sql` - Creates the transactions table with foreign keys to users and categories
4. `004_insert_preset_categories.sql` - Creates a function to generate preset categories for new users

## How to Apply Migrations

### Option 1: Using Supabase Dashboard (Recommended for initial setup)

1. Go to your Supabase project dashboard: https://supabase.com/dashboard/project/idjofcbwepiufcniaazm
2. Navigate to SQL Editor
3. Open each migration file and run the SQL statements in order (001 → 002 → 003 → 004)

### Option 2: Using Supabase CLI

If you have the Supabase CLI installed:

```bash
# Link your project
supabase link --project-ref idjofcbwepiufcniaazm

# Apply migrations
supabase db push
```

### Option 3: Using psql (PostgreSQL command line)

```bash
psql -h db.idjofcbwepiufcniaazm.supabase.co -U postgres -d postgres -f supabase/migrations/001_create_users_table.sql
psql -h db.idjofcbwepiufcniaazm.supabase.co -U postgres -d postgres -f supabase/migrations/002_create_categories_table.sql
psql -h db.idjofcbwepiufcniaazm.supabase.co -U postgres -d postgres -f supabase/migrations/003_create_transactions_table.sql
psql -h db.idjofcbwepiufcniaazm.supabase.co -U postgres -d postgres -f supabase/migrations/004_insert_preset_categories.sql
```

## Database Schema

### Users Table
- `line_user_id` (VARCHAR, PRIMARY KEY): Unique identifier from LINE Login
- `display_name` (VARCHAR): User display name from LINE profile
- `picture_url` (TEXT): Profile picture URL
- `billing_cycle_start_day` (INTEGER, DEFAULT 1): User's custom billing cycle start day
- `created_at` (TIMESTAMP): Account creation timestamp

### Categories Table
- `id` (UUID, PRIMARY KEY): Unique category identifier
- `line_user_id` (VARCHAR, FK): References users table
- `name` (VARCHAR): Category name
- `type` (VARCHAR): 'income' or 'expense'
- `budget_amount` (DECIMAL, NULLABLE): Budget limit
- `budget_period` (VARCHAR, NULLABLE): 'daily', 'weekly', 'monthly', 'yearly'
- `is_preset` (BOOLEAN): Whether this is a preset category
- `created_at` (TIMESTAMP): Category creation timestamp

### Transactions Table
- `id` (UUID, PRIMARY KEY): Unique transaction identifier
- `line_user_id` (VARCHAR, FK): References users table
- `category_id` (UUID, FK): References categories table
- `amount` (DECIMAL): Transaction amount
- `type` (VARCHAR): 'income' or 'expense'
- `description` (TEXT, NULLABLE): Transaction description
- `slip_hash` (VARCHAR, UNIQUE, NULLABLE): Prevents duplicate slip entry
- `thumbnail_url` (TEXT, NULLABLE): Compressed slip thumbnail URL
- `transaction_date` (TIMESTAMP): When the transaction occurred
- `created_at` (TIMESTAMP): When the record was created

## Important Notes

- The `slip_hash` field has a UNIQUE constraint to prevent duplicate receipt processing
- Deleting a category with active transactions requires reassigning those records first (enforced by ON DELETE RESTRICT)
- The `create_preset_categories` function should be called by the backend when a new user signs up
