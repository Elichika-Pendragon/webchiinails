-- Additive admission controls. Apply before enabling the hardened HTTP handler.
-- Proof accounting follows physical BLOB INSERT/DELETE, including scheduled cleanup.
CREATE TABLE IF NOT EXISTS booking_proof_storage (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  stored_bytes INTEGER NOT NULL CHECK(stored_bytes >= 0),
  stored_count INTEGER NOT NULL CHECK(stored_count >= 0),
  request_count INTEGER NOT NULL CHECK(request_count >= 0)
);
INSERT OR IGNORE INTO booking_proof_storage(id, stored_bytes, stored_count, request_count)
  SELECT 1, coalesce(sum(length(content)), 0), count(*), (SELECT count(*) FROM booking_requests) FROM booking_payment_proofs;

CREATE TRIGGER IF NOT EXISTS booking_request_count_limit BEFORE INSERT ON booking_requests
BEGIN
  SELECT CASE WHEN (SELECT request_count FROM booking_proof_storage WHERE id = 1) >= 20000
    THEN RAISE(ABORT, 'booking metadata capacity') END;
END;
CREATE TRIGGER IF NOT EXISTS booking_request_count_insert AFTER INSERT ON booking_requests
BEGIN
  UPDATE booking_proof_storage SET request_count = request_count + 1 WHERE id = 1;
END;
CREATE TRIGGER IF NOT EXISTS booking_request_count_delete AFTER DELETE ON booking_requests
BEGIN
  UPDATE booking_proof_storage SET request_count = request_count - 1 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS booking_proof_storage_limit BEFORE INSERT ON booking_payment_proofs
BEGIN
  SELECT CASE WHEN (SELECT stored_bytes FROM booking_proof_storage WHERE id = 1) + length(NEW.content) > 268435456
    THEN RAISE(ABORT, 'booking receipt capacity') END;
END;
CREATE TRIGGER IF NOT EXISTS booking_proof_storage_insert AFTER INSERT ON booking_payment_proofs
BEGIN
  UPDATE booking_proof_storage SET stored_bytes = stored_bytes + length(NEW.content), stored_count = stored_count + 1 WHERE id = 1;
END;
CREATE TRIGGER IF NOT EXISTS booking_proof_storage_delete AFTER DELETE ON booking_payment_proofs
BEGIN
  UPDATE booking_proof_storage SET stored_bytes = stored_bytes - length(OLD.content), stored_count = stored_count - 1 WHERE id = 1;
END;
-- Receipts are immutable. Replacing a BLOB would evade insertion bookkeeping.
CREATE TRIGGER IF NOT EXISTS booking_proof_storage_immutable BEFORE UPDATE OF content ON booking_payment_proofs
BEGIN
  SELECT RAISE(ABORT, 'booking receipt immutable');
END;

CREATE TABLE IF NOT EXISTS booking_admission_counters (
  bucket TEXT PRIMARY KEY NOT NULL CHECK(length(bucket) BETWEEN 1 AND 180),
  hits INTEGER NOT NULL CHECK(hits >= 0),
  burst_window INTEGER NOT NULL DEFAULT 0,
  burst_hits INTEGER NOT NULL DEFAULT 0 CHECK(burst_hits >= 0),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS booking_admission_counter_expiry ON booking_admission_counters(expires_at);
-- A transient gate exists only inside a D1 batch. It makes all client/global
-- counters advance together, so rejected clients cannot consume others' quota.
CREATE TABLE IF NOT EXISTS booking_admission_gates (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id) = 64)
);

CREATE TABLE IF NOT EXISTS booking_admission_reservations (
  idempotency_hash TEXT PRIMARY KEY NOT NULL CHECK(length(idempotency_hash) = 64),
  reservation_id TEXT NOT NULL UNIQUE CHECK(length(reservation_id) = 64),
  payload_hash TEXT NOT NULL CHECK(length(payload_hash) = 64),
  session_hash TEXT NOT NULL CHECK(length(session_hash) = 64),
  max_bytes INTEGER NOT NULL CHECK(max_bytes BETWEEN 4 AND 512000),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK(expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS booking_admission_reservation_expiry ON booking_admission_reservations(expires_at);
CREATE INDEX IF NOT EXISTS booking_admission_reservation_session ON booking_admission_reservations(session_hash, expires_at);
CREATE INDEX IF NOT EXISTS booking_requests_created ON booking_requests(created_at);
