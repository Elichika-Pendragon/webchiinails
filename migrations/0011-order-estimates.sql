-- Additive only. Public service estimates contain no customer or booking data.
CREATE TABLE IF NOT EXISTS order_estimates (
  code TEXT PRIMARY KEY NOT NULL CHECK(length(code)=5),
  choices TEXT,
  estimate TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  request_hash TEXT NOT NULL UNIQUE,
  session_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK(expires_at>created_at)
);
CREATE INDEX IF NOT EXISTS order_estimates_expiry ON order_estimates(expires_at);
CREATE INDEX IF NOT EXISTS order_estimates_created ON order_estimates(created_at);
CREATE INDEX IF NOT EXISTS order_estimates_session ON order_estimates(session_hash,created_at);
