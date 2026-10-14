-- Create users table
CREATE TABLE IF NOT EXISTS users (
  line_user_id VARCHAR PRIMARY KEY,
  display_name VARCHAR,
  picture_url TEXT,
  billing_cycle_start_day INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index on created_at for better query performance
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
