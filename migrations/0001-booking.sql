-- Inactive schema: apply only after the owner authorizes D1 activation.
-- Pending requests do not reserve time or verify a payment. Times are epoch ms.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS booking_requests (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash) = 64),
  idempotency_hash TEXT NOT NULL UNIQUE CHECK(length(idempotency_hash) = 64),
  payload_hash TEXT NOT NULL CHECK(length(payload_hash) = 64),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 80),
  whatsapp TEXT NOT NULL CHECK(length(whatsapp) BETWEEN 10 AND 15),
  agreed_price INTEGER NOT NULL CHECK(agreed_price BETWEEN 1 AND 10000000),
  deposit INTEGER NOT NULL CHECK(deposit = (agreed_price / 10) + (agreed_price % 10 != 0)),
  date TEXT NOT NULL CHECK(length(date) = 10),
  time TEXT NOT NULL CHECK(length(time) = 5),
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL CHECK(end_ms - start_ms = 7200000),
  start_iso TEXT NOT NULL,
  end_iso TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK(expires_at > created_at AND expires_at <= start_ms),
  updated_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approving', 'reconcile', 'accepted', 'cancelled', 'expired')),
  approval_operation TEXT,
  approval_lease_until INTEGER,
  decided_by TEXT,
  calendar_event_id TEXT,
  CHECK(status != 'accepted' OR calendar_event_id IS NOT NULL)
);

-- One operator, four 30-minute cells per two-hour appointment. D1 batch is
-- transactional: an overlapping cell rolls back the complete claim operation.
CREATE TABLE IF NOT EXISTS booking_slot_claims (
  slot_start INTEGER PRIMARY KEY NOT NULL CHECK(slot_start % 1800000 = 0),
  request_id TEXT NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
  claimed_at INTEGER NOT NULL,
  UNIQUE(request_id, slot_start)
);

CREATE INDEX IF NOT EXISTS booking_requests_phone_created ON booking_requests(whatsapp, created_at);
CREATE INDEX IF NOT EXISTS booking_requests_pending_expiry ON booking_requests(status, expires_at);
CREATE INDEX IF NOT EXISTS booking_slot_claims_request ON booking_slot_claims(request_id);
