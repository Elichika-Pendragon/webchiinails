-- Additive only: existing appointments, receipts and approval tokens are unchanged.
CREATE TABLE IF NOT EXISTS booking_access_codes (
  id TEXT PRIMARY KEY,
  whatsapp TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revoked_at INTEGER,
  last_request_at INTEGER
);
CREATE TABLE IF NOT EXISTS booking_code_requests (
  request_id TEXT PRIMARY KEY REFERENCES booking_requests(id) ON DELETE CASCADE,
  code_id TEXT NOT NULL REFERENCES booking_access_codes(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS booking_code_request_window ON booking_code_requests(code_id, created_at);
CREATE INDEX IF NOT EXISTS booking_requests_customer_created ON booking_requests(whatsapp, created_at);
