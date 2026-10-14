-- This migration provides a function to create preset categories for a new user
-- It will be called by the backend when a new user signs up

CREATE OR REPLACE FUNCTION create_preset_categories(user_line_id VARCHAR)
RETURNS VOID AS $$
BEGIN
  -- Expense categories
  INSERT INTO categories (line_user_id, name, type, is_preset)
  VALUES
    (user_line_id, 'Food', 'expense', TRUE),
    (user_line_id, 'Transport', 'expense', TRUE),
    (user_line_id, 'Accommodation', 'expense', TRUE),
    (user_line_id, 'Utilities', 'expense', TRUE),
    (user_line_id, 'Shopping', 'expense', TRUE),
    (user_line_id, 'Telecom', 'expense', TRUE),
    (user_line_id, 'Others', 'expense', TRUE);

  -- Income category
  INSERT INTO categories (line_user_id, name, type, is_preset)
  VALUES
    (user_line_id, 'Income', 'income', TRUE);
END;
$$ LANGUAGE plpgsql;
