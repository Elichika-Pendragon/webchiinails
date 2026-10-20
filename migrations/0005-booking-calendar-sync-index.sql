-- Bound each requested-day Calendar reconciliation to the accepted start range.
CREATE INDEX IF NOT EXISTS booking_requests_status_start ON booking_requests(status, start_ms);
