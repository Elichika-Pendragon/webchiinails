-- Additive only. Historical rows retain their original money, service and hashes.
-- The original deposit/payment_amount/design_type columns keep their immutable
-- CHECK-compatible values; these explicit snapshots represent new requests.
ALTER TABLE booking_requests ADD COLUMN service_type TEXT
  CHECK(service_type IS NULL OR service_type IN ('plain', 'gel', 'removal', 'simple', 'full-art'));

ALTER TABLE booking_requests ADD COLUMN custom_payment_amount INTEGER
  CHECK((custom_payment_amount IS NULL AND service_type IS NULL) OR (
    custom_payment_amount IS NOT NULL AND service_type IS NOT NULL
    AND typeof(custom_payment_amount) = 'integer'
    AND ((payment_mode = 'deposit' AND agreed_price > 20000 AND custom_payment_amount >= 20000 AND custom_payment_amount <= agreed_price)
      OR (payment_mode = 'full' AND custom_payment_amount = agreed_price))
    AND ((service_type IN ('plain', 'gel', 'removal') AND design_type = 'plain' AND duration_minutes = 60)
      OR (service_type = 'simple' AND design_type = 'simple' AND duration_minutes IN (60, 120))
      OR (service_type = 'full-art' AND design_type = 'full-art' AND duration_minutes IN (180, 240, 300)))
  ));
