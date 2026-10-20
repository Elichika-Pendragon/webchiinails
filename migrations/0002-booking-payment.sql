-- Additive only: preserve existing rows, original deposit CHECK and slot claims.
-- Apply once after checking PRAGMA table_info(booking_requests). Existing rows
-- become legacy and retain their original 10% payment amount/event fingerprint.
ALTER TABLE booking_requests ADD COLUMN payment_mode TEXT NOT NULL DEFAULT 'legacy'
  CHECK(payment_mode IN ('legacy', 'deposit', 'full'));

ALTER TABLE booking_requests ADD COLUMN payment_amount INTEGER
  CHECK(
    (payment_mode = 'legacy' AND payment_amount IS NULL)
    OR (payment_mode = 'deposit' AND payment_amount IS NOT NULL AND agreed_price > 20000
      AND payment_amount = MAX(20000, (agreed_price / 10) + (agreed_price % 10 != 0)))
    OR (payment_mode = 'full' AND payment_amount IS NOT NULL AND payment_amount = agreed_price)
  );
