-- Additive: receipt deletion never removes booking metadata or Calendar claims.
-- Expiration is the actual appointment end plus 30 days, not upload date.
CREATE TABLE IF NOT EXISTS booking_payment_proofs (
  request_id TEXT PRIMARY KEY NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK(content_type = 'image/jpeg'),
  content BLOB NOT NULL CHECK(typeof(content) = 'blob' AND length(content) BETWEEN 4 AND 512000),
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK(expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS booking_payment_proofs_expiry ON booking_payment_proofs(expires_at);
