-- Optional email address for the CSV-export-by-email feature.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email VARCHAR(255);
