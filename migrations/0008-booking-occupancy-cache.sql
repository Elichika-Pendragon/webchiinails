-- Private advisory occupancy only. The inclusive today+90-day horizon can span
-- five months (January 31 through May 1). Bound growth across old Calendar IDs.
CREATE TABLE booking_occupancy_cache (
  slot INTEGER PRIMARY KEY CHECK (slot BETWEEN 0 AND 4),
  cache_key TEXT NOT NULL CHECK (length(cache_key) = 64),
  calendar_hash TEXT NOT NULL CHECK (length(calendar_hash) = 64),
  month TEXT NOT NULL CHECK (length(month) = 7),
  range_start INTEGER NOT NULL,
  range_end INTEGER NOT NULL CHECK (range_end > range_start),
  payload TEXT CHECK (payload IS NULL OR length(payload) <= 600000),
  expires_at INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  generation INTEGER NOT NULL DEFAULT 0 CHECK (generation >= 0)
);

-- Ledger and invalidation are one transaction. A refresh started before an
-- approval/cancellation cannot publish its older snapshot after this changes
-- the generation and clears its lease. Current claims are still read uncached.
CREATE TRIGGER booking_occupancy_invalidate_status
AFTER UPDATE OF status ON booking_requests
WHEN OLD.status <> NEW.status AND
  (OLD.status IN ('approving', 'reconcile', 'accepted', 'cancelled') OR
   NEW.status IN ('approving', 'reconcile', 'accepted', 'cancelled'))
BEGIN
  UPDATE booking_occupancy_cache
  SET expires_at = 0, generation = generation + 1,
      lease_owner = NULL, lease_until = 0
  WHERE month = substr(NEW.date, 1, 7);
END;
