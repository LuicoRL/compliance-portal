ALTER TABLE clients ADD COLUMN rejected_at TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN rejection_fields TEXT;