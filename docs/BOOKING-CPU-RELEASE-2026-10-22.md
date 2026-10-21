# Booking CPU integration release

Live at https://chiinails.pages.dev/book on 22 October 2026, approximately
00:05 WIB. User explicitly confirmed production D1/Images access, private
submission-credential transfer and Pages activation before those grants.

## Deployed versions

- Application code: `5e7ea7a2ec7baa7b8d1fbff40de8fff4fde48ad3`.
- Gated Pages deployment: `c9d57b4b-4676-4278-b801-5bc916f0ee48`.
- Activated Pages deployment: `48306b4a-617b-4b5f-a6b4-8dc3d9dab2a1`.
- Private processor Worker: `chii-booking-processor`, version
  `c5446681-9ae0-4697-969b-8cb9ba777638`.
- SQLite class: `BookingSubmissionProcessor`; Pages namespace binding:
  `BOOKING_PROCESSOR`; fixed instance name: `booking-v1`.
- Trigger-compatible daily cleanup Worker: version
  `bb555ff6-89db-4c14-b2f5-5747e57a4202`, same `15 0 * * *` schedule.

The production processor has only D1, Images and its own namespace bindings.
It has no public routes, workers.dev URL, preview URL or persistent credentials.
Pages supplies the strict submission-configuration allowlist through private
Request/Response RPC; the owner's login signing secret stays in Pages. No paid
plan or billing activation was performed.

## Checks and measured CPU

The release checkout passed 490/490 tests and its production static build.
Browser output remains six JavaScript files, 79412 raw / 28305 gzip-estimate
bytes, with no React runtime. The CPU move itself adds no browser dependency;
the combined hardening release includes its small Turnstile controller.

The final production-shaped isolated Cloudflare fixture used the exact
forwarder/processor source, real disposable D1, actual Images for the ordinary
image, and synthetic Google/Turnstile responses. Its final version was
`380c4270-de57-481a-955c-2424ec893e6e`. UI runtime samples recorded:

| Operation | CPU |
| --- | ---: |
| Stateless stream forwarding | 0 ms, rounded telemetry |
| DO 512000-byte identity create | 31 ms |
| Same-key retry | 10 ms |
| DO create with actual image normalization | 32 ms |
| Same-key normalized retry | 9 ms |

The identity case deliberately skips decoding to exercise full-size BLOB
transport. It is not evidence of image validity. Local runtime tests additionally
verified source/stored hashes, immutable retries, conflicts, invalid images,
challenge failures and no leaked upload reservations.

Production verification used an intentionally invalid challenge with a 512000-
byte JPEG. The new private path returned `ADMISSION_CHALLENGE`403 before any
booking or receipt INSERT. Actual production telemetry recorded 21 ms CPU in
the deployed Durable Object. DO RPC summaries carried `canceled`, although
callers received complete responses and synthetic retries found the persisted
records. Those labels are recorded as observed; they are not used to classify
HTTP success or to claim every log outcome is `ok`.

Live readiness and anonymous admission return 200. Older JSON forms receive
`BOOKING_UPDATE_REQUIRED` 409. Cross-origin creation returns 403. Anonymous review
and proof access both return 401 with no-store responses. The real Google
Calendar-backed month view reports October 24–26 closed; four-hour Full Art on
October 30 offers 08:00 and 12:00. Current date/time bounds remain enforced.

## Production data preservation

New submissions were gated before migrations 0007/0008 were applied. Verification
found all five new tables and eight triggers. A database recovery reference was
captured privately before migration. The initial multiline console attempt was
a no-op because its single-line input removed line breaks after SQL comments;
comment-free single-line SQL was then executed and the complete schema verified.

Before migration and after the final rejected-upload/calendar checks:

| Aggregate | Before | After |
| --- | ---: | ---: |
| Booking requests | 10 | 10 |
| Receipt BLOBs | 6 | 6 |
| Receipt bytes | 618826 | 618826 |

Storage-ledger bytes match the BLOB total; no upload reservation remains. No
customer booking was created, accepted or cancelled for release testing, and
no Calendar event was created. Existing receipts and 30-day appointment-end
retention remain. Successful production payment/owner approval was not replayed
with a real customer's appointment; full successful creation/retry is covered
by isolated runtime tests rather than relabeled as production evidence.

Raw non-sensitive results are in [the evidence folder](evidence/booking-processor/production-live-results.json).
The earlier PRE-ACTIVATION file is a timestamped historical snapshot. Recovery
instructions remain in [the processor contract](BOOKING-CPU-PROCESSOR.md).

This is bounded functional and CPU evidence, not a traffic guarantee. Account-
wide request/duration/database/image quotas still apply. No new physical-device
or carrier benchmark is claimed.
