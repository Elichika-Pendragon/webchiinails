# Booking without private access codes

24 October 2026. The owner requested removal of the private invitation-code issue/send step. This supersedes that portion of the earlier order-code release; the five-character calculator reference and Jessica's final approval remain.

## Flow

Customer consults, opens `/book`, optionally pastes the calculator reference, completes details/payment/date/time and uploads proof, then presses Book and manually sends the prepared WhatsApp confirmation. No private booking access code is required. The request remains pending and holds no slot until Jessica checks payment and accepts. Owner-only Google authentication, CSRF, receipt handling and Calendar acceptance are unchanged in this release.

## Abuse limits and compatibility

The existing one-active-request/future-appointment, 15-minute cooldown and three-new-requests-per-rolling-day rules now query indexed `booking_requests` directly by normalized phone. They are repeated in the atomic request/proof insert, preserving simultaneous-submission safety and immutable retries. Phone input is not OTP verification and complements existing Turnstile, signed session/nonce, Origin, IP/global/capacity and image guards. No new database migration, table, public Worker endpoint, credential, billing or notification service is added.

The old `/book/manage` page redirects to `/prices`. Its access/issue APIs return a no-store update-required instruction for stale tabs. Old private-code modules/UI are removed, while historical database tables and customer/appointment/proof records remain untouched.

## Verification

545 regression tests pass, including real SQLite no-code creation, normalized-phone limits, same-phone races, idempotent retries and owner approval boundaries. The production-config build passes all asset/search guards and emits nine HTML routes plus the same five-public-page sitemap. Aggregate browser JS across all routes is 117,405 raw / 43,351 gzip bytes (not a single-page transfer).

Desktop 1280px, mobile 390px and small-phone 320px captures show the remaining optional lookup and no horizontal overflow. Synthetic browser lookup loaded Rp62,000 / Rp20,000 and allowed edits to Rp70,000 / Rp30,000. The original payment fieldset was compared byte-for-byte with the prior source and is unchanged. No live booking, payment, appointment or WhatsApp message was created. [Checks and screenshots](evidence/booking-code-removal-2026-10-24/).

The fresh Impeccable finish review returned **ship** with no material fixes for this narrow existing-form refinement. No new assets or visual system changes.

Private processor version: `645be503-aad8-4c81-93ff-c61edea6c0db`. Production code-free release verified at source `d0f07f9`, Pages `0db9ed12-9422-4de2-9805-d5722da57e0b`; optional calculator field remains and private invitation field is absent. Later payment controls are documented in `BALANCE-PAYMENTS-AND-RECEIPTS.md`.
