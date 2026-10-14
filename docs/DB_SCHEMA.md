Database ER Diagram & Schema Design (Supabase / PostgreSQL)
1. Tables Overview
Table: users
* line_user_id (VARCHAR, PRIMARY KEY): Unique identifier from LINE Login.
* display_name (VARCHAR): User display name from LINE profile.
* picture_url (TEXT): Profile picture URL.
* billing_cycle_start_day (INTEGER, DEFAULT 1): User's custom billing cycle start day.
* created_at (TIMESTAMP)
Table: categories
* id (UUID, PRIMARY KEY)
* line_user_id (VARCHAR, REFERENCES users(line_user_id) ON DELETE CASCADE)
* name (VARCHAR): Category name (e.g., Food, Transport, Custom).
* type (VARCHAR): 'income' or 'expense'.
* budget_amount (DECIMAL, NULLABLE): Budget limit.
* budget_period (VARCHAR, NULLABLE): 'daily', 'weekly', 'monthly', 'yearly'.
* is_preset (BOOLEAN, DEFAULT FALSE)
* created_at (TIMESTAMP)
Table: transactions
* id (UUID, PRIMARY KEY)
* line_user_id (VARCHAR, REFERENCES users(line_user_id) ON DELETE CASCADE)
* category_id (UUID, REFERENCES categories(id) ON DELETE RESTRICT): Linked category. (Note: Deletion restriction/reassignment handled by backend logic).
* amount (DECIMAL, NOT NULL)
* type (VARCHAR): 'income' or 'expense'.
* description (TEXT, NULLABLE)
* slip_hash (VARCHAR, UNIQUE, NULLABLE): Prevents duplicate slip entry.
* thumbnail_url (TEXT, NULLABLE): Compressed slip thumbnail stored in Supabase Storage.
* transaction_date (TIMESTAMP, NOT NULL)
* created_at (TIMESTAMP)


________________


2. Relationships & Constraints
* 1-to-Many: One user has many categories and transactions.
* Category Deletion Safety: Deleting a category with active transactions requires reassigning records to another active category (enforced by application/backend logic before deleting).
* Duplicate Slip Prevention: slip_hash enforces a UNIQUE constraint to reject duplicate receipt processing.