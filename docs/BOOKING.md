# Booking contract

Current source contract, reviewed **23 October 2026**. [Release checkpoint](RELEASE-CHECKPOINT-2026-10-23.md) and dated booking reports distinguish implemented rules, isolated tests and production observations.

## Customer and owner flow

Jessica first agrees on the service/design and price through normal WhatsApp consultation, then shares the constant `/book` link. Keep that route outside navigation and the sitemap. The form requires name, a syntactically valid Indonesian WhatsApp number, agreed total, payment choice/amount, service/duration, appointment date/time, prepared payment proof and fresh online availability before Book is enabled. The server independently validates all inputs.

Submission saves a pending immutable request and private receipt atomically in D1, then prepares WhatsApp text with the owner review link. The customer still sends the message. There is no WhatsApp API, chat reading, automatic message sending or payment gateway. Phone syntax validation does not prove number ownership or an active WhatsApp account.

Jessica opens `/book/approve`, signs in with the exact verified Google identity configured in `BOOKING_OWNER_EMAIL`, inspects the details/receipt and actual transaction, then explicitly accepts or cancels. Other Google accounts cannot approve. The review URL only identifies a request; possession does not grant authority. Authenticated mutations require same-origin and session CSRF checks. Receipt bytes load only after the owner requests **Lihat bukti**.

Accepted Calendar events include the customer's full phone number, service and a normalized `https://wa.me/` link. Screenshots are evidence for Jessica to review, not automated proof that money arrived.

## Payments and service choices

New requests use `manual-min20k-v3`: editable whole-Rupiah DP of at least Rp20,000 and no more than the agreed total. There is **no 10% calculation**. Full payment equals the agreed total and is read-only. Totals at or below Rp20,000 normalize to full payment. Existing `legacy-10pct-v1` and `min20k-v2` requests keep their original amounts, labels, fingerprints and policy; never recompute them during review or deployment.

The eight choices are Plain, Gel and Removal at 60 minutes each; Simple Design at 60 or 120 minutes; Full Art at 180, 240 or 300 minutes. Pricing estimates do not silently alter the agreed price stored in a booking.

## Availability and concurrency

All appointment rules use Asia/Jakarta (WIB), with a 90-day horizon. Start choices advance by the selected duration from 08:00. Weekday hours are 08:00–17:00 with regular last start 14:00; weekends 08:00–12:00 with regular last start 10:00. Full Art has a 12:00 last-start cap and must finish before closing; a five-hour weekend session is unavailable.

Calendar occupancy uses actual event intervals regardless of Busy/Free. All-day events close their covered dates regardless of transparency. Pending requests do not reserve slots. Acceptance rechecks availability and uses atomic slot claims plus deterministic Calendar event identity for safe retries/concurrent decisions.

Deletion reconciliation releases accepted occupancy only after a definite cancelled/404/410 provider result with healthy authorization checks. Timeouts, malformed responses or permission errors must not reopen a slot. Repeated acceptance of an accepted request returns the stored acknowledgement; ordinary review GET is read-only.

## Proof, recovery and CPU path

The browser accepts bounded images up to 10 MiB and prepares a JPEG up to 500 KiB; HEIC/HEIF needs browser decoding support. Server Images validation independently decodes/normalizes the image. This checks the uploaded file, not banking authenticity. Receipts stay private in D1, never public image URLs, Calendar attachments or logs.

Draft metadata stays per tab in sessionStorage for up to 24 hours; the prepared receipt uses IndexedDB. Recovery never restores stale availability or owner credentials. An uncertain submission keeps its idempotency identity for an explicit retry. Reconnection does not automatically submit. Reserve the existing calendar, receipt and routine status space so restore remains smooth.

Visible idle month/date checks refresh every 45 seconds without overlap and pause during hidden-page/preparation/submission states. Background closure/reopening is subject to fresh provider checks and existing claims.

Pages forwards the original multipart request through private Durable Object RPC; it does not parse/re-encode the image itself. See [processor design](BOOKING-CPU-PROCESSOR.md) and [deployment](../DEPLOYMENT.md). `BOOKING_SUBMISSIONS_DISABLED=true` provides a stop for new submissions without changing the owner identity or deleting pending data. Configuration failures fail closed; do not add a CPU-heavy fallback.

Receipt access expires 30 days after the actual appointment end. The private daily cleanup removes expired image data in bounded batches of 500; scheduling errors or backlog can delay physical deletion. It preserves request metadata, claims and Calendar records. This is separate from the 50-photo public gallery retention policy.

## Operations and verification

Do not create real appointments or alter customer data merely to test a release. Use the Node provider/storage/auth fixtures, build checks, browser recovery fixtures and read-only production smoke tests. Existing production proof verifies specific owner-session, synthetic receipt and cancellation paths; successful isolated tests are not a claim that a fresh real Calendar acceptance was executed. See [22 October processor release](BOOKING-CPU-RELEASE-2026-10-22.md) and [23 October checkpoint](RELEASE-CHECKPOINT-2026-10-23.md).
