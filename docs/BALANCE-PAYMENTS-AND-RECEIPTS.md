# Optional receipts and later balance payments

Reviewed 24 October 2026. This supersedes the earlier limitation that balance payments could not be recorded. The private invitation code was separately removed in source `d0f07f9`; the optional five-character calculator reference remains.

## Owner workflow

Jessica opens the same private review link from the customer chat and signs in with the existing allowlisted Google account. She checks funds and accepts or cancels the pending booking. Accepting is still the only action that creates the appointment.

- Accepted/full paid: the Lunas receipt link can be sent through the optional wa.me action or left unsent.
- Accepted/DP: optional Belum Lunas receipt shows actual received amount and remaining balance. Jessica can send nothing, return through the same review link after receiving the rest, tick the explicit funds-received checkbox and select Tandai Lunas. The same customer receipt link updates to Lunas; sending it stays optional.
- Cancelled before acceptance: a separate explicit payment-verification checkbox is required before preparing an optional cancellation receipt. It shows Booking dibatalkan and funds received, hides outstanding service balance, and makes no refund assertion. A Calendar-cancelled previously accepted booking retains the prior owner's payment verification.

WhatsApp always requires the owner to press Send. No messaging API or automatic message is introduced. Customers print or save PDFs locally; no PDF files are generated or stored on the server.

## Financial and authorization boundaries

`booking_payment_events` records a unique balance_received or cancelled_payment_verified event per booking/kind. It includes original amount snapshots, trusted server time and the verified owner subject. Original agreed price, submitted DP and booking record remain unchanged. Balance amount is calculated from that snapshot; the caller must confirm exactly the expected remaining amount. Only accepted bookings with a positive original balance can be settled. Concurrent/double-tap/uncertain-response retries cannot record another payment. This flow does not add partial balance installments, refunds, price changes or an undo/correction API.

POST `/api/booking/settle` requires the existing exact-owner Google session, CSRF, same origin, bounded JSON and owner review token. Public calculator references and customer receipt capabilities cannot mutate payments. Receipt data remains a no-store/noindex projection of the original booking plus audited events. The customer capability stays in the URL fragment; the same link displays current state, rather than a separately stored PDF. Names, WhatsApp, payment proof, Calendar IDs and owner identity are never newly exposed by a payment mutation response; public receipts retain their limited existing customer fields and monetary values.

## Schema and release

Additive `0012-booking-payment-events.sql` was applied to existing `chiinails-booking` using the authorized Cloudflare account. It changes no binding, permission, credential or paid plan and updates/deletes no booking/proof/Calendar data. Empty-table count confirmed zero before release. Recovery bookmark: `00000075-00000000-0000510d-c66a0eda33e0ccc5fab620b1560caf1a` (do not restore automatically). No production payment event was manufactured for testing.

The private booking processor remains `645be503-aad8-4c81-93ff-c61edea6c0db`; this owner/receipt change runs in existing Pages Functions and needs no new Worker service. Application release verification is recorded after the Git deployment.

## Evidence

560 regressions pass, including real SQLite audit constraints, balance/cancellation receipt semantics, same-link reads after the service date, original-booking immutability, repeated confirmations, owner login/CSRF/origin denial, malformed-input rejection, code-free booking admission and uncertain-network UI recovery. Production-config build passes; all-route browser JavaScript totals 120,923 raw / 44,298 gzip bytes, not one page's transfer.

Synthetic browser captures cover owner DP, settled, full-payment and cancellation at desktop/mobile/320px, and paid/partial/cancelled receipts. Print button and print CSS are present; no real printer or Save-as-PDF destination was selected. Fresh finish verdict **ship**, documenter complete. [Evidence and sanitized checks](evidence/payment-settlement-2026-10-24/).
