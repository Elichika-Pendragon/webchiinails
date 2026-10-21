# Manual DP and service names — 21 October 2026

New requests use `manual-min20k-v3`: the customer types a whole-Rupiah DP of at least Rp20.000 and at most the agreed total. There is no percentage calculation. Full payment derives the total; quotes at or below Rp20.000 normalize to full payment. Switching payment modes preserves the typed DP, and tab recovery stores it alongside the prepared receipt. Changing the actual DP changes retry identity.

The service/duration dropdown offers Plain, Gel and Removal at one hour each; Simple Design at one or two hours; Full Art at three, four or five hours. Existing duration cadence, studio closing times and cutoffs remain enforced. New Calendar v5 events retain the full customer phone, clickable wa.me link, exact service and actual payment amount. Historical v1–v4 Calendar presentations, stored payments and retries retain their original snapshots.

All fields and fresh availability must be valid and a receipt must finish preparation before Book enables. Receipt removal, processing, failure, offline state and an invalid DP block submission. Book uploads the receipt and creates the request atomically in D1; preparation is not a pre-upload or payment verification. Jessica still checks the actual payment.

## Database rollout

Migration `0006-booking-manual-payment.sql` is additive. `service_type` and `custom_payment_amount` provide paired actual snapshots with amount, service and duration CHECK constraints. Existing financial/design columns remain historical CHECK-compatible storage; old rows, receipt bytes and slot claims are preserved.

Both ALTER statements succeeded in the existing production D1 console before code publication. The service column query took 1.33 ms; the amount column query took 0.88 ms. A subsequent schema query confirmed TEXT and INTEGER respectively. No customer records were changed by the migration.

## Verification

- Complete release-checkout test suite: 391 passing tests (279 backend/shared and 112 browser-controller/draft tests).
- Production build and asset checks pass: seven routes; six browser JavaScript files, 75,376 raw bytes / 27,004 gzip bytes; no React client runtime. This is 263 compressed bytes above the preceding release.
- The exact production build was served through an isolated 400 Kbps / 400 ms-latency fixture, without real bookings, Calendar writes or WhatsApp messages. Browser inspection confirmed editable DP, the five service names, valid amount/receipt gating and inline below-minimum feedback. Receipt preparation uses the actual browser codec path with a clearly synthetic fixture image.
- Automated regression coverage includes missing, processing, failed and removed proof; missing/below-minimum/above-total/malformed DP; an entered Rp20.000 on a Rp1.000.000 total; full-payment switching; draft recovery; changed-DP retry identity; historical retries and snapshots; all eight service/duration choices; SQL preservation/constraints; Calendar v5 contents and v1–v4 reconciliation.

This revision does not add a physical-device or live Calendar acceptance test. Figma was not updated.
