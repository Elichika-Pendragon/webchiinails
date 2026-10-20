-- Additive only. Existing bookings retain their original two-hour schedule and
-- Calendar fingerprint; no rows, slot claims or original columns are rewritten.
-- Apply once after confirming these column names are absent with table_info.
ALTER TABLE booking_requests ADD COLUMN design_type TEXT NOT NULL DEFAULT 'legacy'
  CHECK(design_type IN ('legacy', 'plain', 'simple', 'full-art'));

ALTER TABLE booking_requests ADD COLUMN duration_minutes INTEGER NOT NULL DEFAULT 120
  CHECK(
    (design_type = 'legacy' AND duration_minutes = 120)
    OR (design_type = 'plain' AND duration_minutes = 60)
    OR (design_type = 'simple' AND duration_minutes IN (60, 120))
    OR (design_type = 'full-art' AND duration_minutes IN (180, 240, 300))
  );
