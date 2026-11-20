-- 022: Tax documents (Tax Phase 5). Photos of 50 ทวิ withholding
-- certificates, insurance and fund certificates and donation receipts,
-- attached to an income line or a deduction. Stored as JPEG in a private
-- bucket (<line_user_id>/<ms>-<8 hex>.jpg); a PDF is turned into a JPEG of
-- its first page on the phone before upload. `extracted` keeps what OCR read
-- from a 50 ทวิ (payer, amounts), for reference.

CREATE TABLE IF NOT EXISTS tax_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id VARCHAR(64) NOT NULL REFERENCES users(line_user_id) ON DELETE CASCADE,
  tax_year SMALLINT NOT NULL CHECK (tax_year BETWEEN 2560 AND 2600),
  kind VARCHAR(12) NOT NULL DEFAULT 'other' CHECK (kind IN ('50tawi', 'insurance', 'fund', 'donation', 'other')),
  income_id UUID REFERENCES tax_incomes(id) ON DELETE SET NULL,
  claim_key VARCHAR(40),
  storage_path TEXT NOT NULL,
  file_name VARCHAR(200),
  extracted JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tax_documents_user_year ON tax_documents(line_user_id, tax_year, created_at);
ALTER TABLE tax_documents ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES ('tax-documents', 'tax-documents', false)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
