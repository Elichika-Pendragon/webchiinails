# Private booking submission processor

Prepared 21 October 2026. Production activation and complete production-path
verification must be recorded separately; synthetic fixtures are not live bookings.

**Activated 22 October 2026, 00:05 WIB.** Code `5e7ea7a` is live in Pages
deployment `48306b4a-617b-4b5f-a6b4-8dc3d9dab2a1`. The private processor,
production namespace binding and additive migrations are installed. See
[release verification](BOOKING-CPU-RELEASE-2026-10-22.md) for measured results,
preserved-data checks and the limits of production verification.

## Effect on the website

The customer uses the existing booking form and WhatsApp handoff. The selected
service, duration, minimum deposit, proof requirement, Calendar checks and
Jessica-only approval rules remain. This server change adds no browser script,
image download, framework hydration, carousel or SEO change.

Pages forwards the original multipart Request stream over private RPC to a
single named SQLite Durable Object. The object performs bounded parsing,
admission, challenge validation, source hashing, image decode/re-encode and the
existing atomic D1 request/receipt transaction. Its Images binding executes the
existing private validator code in the object, avoiding a second stateless
image-helper CPU bottleneck. No receipt moves into Durable Object storage.

There is one additional internal call. Synthetic timings are not a promise for
real phones or Google network latency. RPC failure returns a fixed retryable
error without replaying the upload; the customer's unchanged idempotency key
protects retries after an uncertain response. Draft preservation remains in the
existing browser controller. Eight in-flight creations bound object memory.

## Private configuration boundary

Deploy `workers/booking-processor.wrangler.jsonc` separately. It creates the
`BookingSubmissionProcessor` SQLite class, with the existing production D1 and
an Images binding. workers.dev and preview URLs are disabled; there are no
public routes, cron jobs, owner-review methods, diagnostic methods or secret
variables stored on that Worker.

Add a production Pages Durable Object binding called `BOOKING_PROCESSOR` to
`chii-booking-processor` / `BookingSubmissionProcessor`. The Pages function uses
the fixed object name `booking-v1`. It sends an explicit allowlist of submission
configuration through private RPC for that invocation. Neither URLs nor HTTP
headers carry those secrets. The owner's login signing secret and OAuth login
configuration stay in Pages. Fixed D1/Images bindings cannot be supplied by the
request or replaced by the RPC configuration. New submissions require the
binding; there is no fallback to the CPU-heavy stateless handler.

Invocation telemetry contains CPU/outcome metadata; application code does not
log headers, secrets, receipt bytes or booking values. No billing activation or
paid subscription is part of this release. Free request, duration, D1, image and
admission allowances still apply across the account.

## Release order and recovery

1. Verify isolated Request/Response RPC, exact 512000-byte storage/retry,
   actual Images normalization, safe failures and measured edge CPU.
2. Deploy the private production processor. Prepare Pages source while the
   `BOOKING_PROCESSOR` binding is absent. That source disables new submissions
   but keeps existing owner review/authentication working.
3. Publish that gated Pages source and deploy the trigger-compatible cleanup
   code. Apply additive D1 migrations 0007 and 0008. Never delete customer rows
   or receipts as a migration or rollback technique.
4. Bind the production Pages namespace and redeploy to activate submissions.
   Verify public status/admission/availability, owner auth rejection, private
   processor visibility and actual complete-path edge metrics. Avoid creating
   a real Calendar appointment merely to test a release.
5. Record exact commits, deployment IDs, source hashes, edge results and any
   production verification limitations.

For a safe stop, set production Pages `BOOKING_SUBMISSIONS_DISABLED=true` and
redeploy. New submissions and public readiness stop without disabling owner
review or changing identity checks. Preserve migrations, helper configuration
and trigger-compatible cleanup/reconciliation code. A blanket source rollback
to pre-migration code is not verified compatible. Resume only after fixing and
verifying the private path, then remove the submission-only stop flag.

## Evidence prepared before activation

The local 490-test server suite and static production build passed. Production-
shaped local RPC tests passed exact-limit create/retry, actual image-emulator
normalization, source/stored integrity, conflict rejection, bad-image and
challenge rejection, and no leaked D1 reservations. Remote synthetic RPC create
and retry also passed on the actual free account with the real Images binding.
These use isolated D1 and synthetic Google/Turnstile responses, not production
customer data or physical-device performance measurements.
