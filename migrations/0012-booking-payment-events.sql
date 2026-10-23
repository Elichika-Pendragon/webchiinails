-- Additive payment audit. Original booking/DP snapshots remain immutable.
CREATE TABLE IF NOT EXISTS booking_payment_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('balance_received','cancelled_payment_verified')),
  amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 10000000),
  initial_payment INTEGER NOT NULL CHECK(initial_payment BETWEEN 1 AND agreed_price),
  agreed_price INTEGER NOT NULL CHECK(agreed_price BETWEEN 1 AND 10000000),
  recorded_by TEXT NOT NULL CHECK(length(recorded_by) BETWEEN 1 AND 256),
  recorded_at INTEGER NOT NULL CHECK(recorded_at>0),
  UNIQUE(request_id,kind),
  CHECK((kind='balance_received' AND amount=agreed_price-initial_payment) OR (kind='cancelled_payment_verified' AND amount=initial_payment))
);
