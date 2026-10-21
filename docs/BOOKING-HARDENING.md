# Booking hardening contract

Implementation authorized on 21 October 2026. Publication and edge CPU checks
are separate release gates; local tests alone do not prove Cloudflare capacity.

Production activation completed on 22 October 2026 after those gates were
checked. See [the release evidence](BOOKING-CPU-RELEASE-2026-10-22.md).

## Identity and request compatibility

Only the exact, Google-verified `BOOKING_OWNER_EMAIL` may review receipts or
accept/cancel. The review link is a lookup token, never approval authority.
Owner routes retain their existing core readiness checks even when new upload
resources are unavailable. The configured owner address must match the address
confirmed by the owner before release; never publish credentials in this file.

New submissions use two multipart fields: `booking` (at most 4096 UTF-8 bytes of
JSON metadata) and `proof` (one JPEG, 4–512000 bytes). The complete request stream
is bounded before multipart parsing. Unknown, repeated, missing or wrong-type
parts are rejected. The filename is a fixed `receipt.jpg`; the original device
filename is not sent. Metadata has the existing canonical booking strings,
idempotency key and a fresh `turnstileToken`. `X-Booking-Nonce` binds the request
to a signed, HttpOnly anonymous session. Admission runs before reading the body.

The Turnstile token is not part of the immutable booking fingerprint. The
fingerprint continues to use canonical booking values and SHA-256 of the
original browser-compressed JPEG. The stored normalized JPEG has a separate
integrity digest. A matching existing request returns before a new challenge
validation, image transform or Calendar read. A retry never mutates old records.

Old open JSON/base64 forms receive `BOOKING_UPDATE_REQUIRED` (409) without
parsing their large payload. Reload restores the existing 24-hour draft and
original idempotency key, then sends the same source JPEG in binary. Metadata
storage remains compatible with v1. New IndexedDB receipt records are v2 Blobs;
v1 base64 records remain readable only after bounded validation and digest
verification. Challenge/session tokens and owner links are never draft data.

## Admission and private images

The anonymous session does not prove phone ownership or payment. Indonesian
phone syntax validation remains, but supplying somebody else's number cannot
consume that person's hard quota. Signed sessions, coarse trusted-edge IP
limits, server-side Turnstile checks and atomic aggregate budgets work together.

Migration 0007 adds bounded, expiring admission accounting and reservations.
Successful receipt INSERT/DELETE triggers account for actual retained bytes,
including existing receipts and future appointments. Cleanup retains its
30-day appointment-end policy and deletes only receipt bytes. New requests
reserve worst-case storage and at most two transformation attempts before work;
expired reservations cannot authorize a late write. Failed client limits do not
spend another client's allowance or allocate new counter buckets.

`BOOKING_IMAGES` is a Pages service binding to a private Worker with an `IMAGES`
binding. It has no public routes, workers.dev URL or preview URL. New receipt
pixels are decoded and re-encoded, with bounded dimensions and output bytes.
Metadata inspection alone is insufficient. Invalid input, quota/provider
failure and oversized output fail closed; unchecked originals are not stored.
No public image cache, hosted Images bucket or automatic payment verification
is introduced.

Required new configuration: `BOOKING_TURNSTILE_SITE_KEY`, encrypted
`BOOKING_TURNSTILE_SECRET_KEY`, `BOOKING_IMAGES`, and migrations 0007–0008.
Demonstration Turnstile keys must never enable production booking. No paid plan
or billing activation is authorized by this implementation.

CPU integration additionally requires a private `BOOKING_PROCESSOR` Durable
Object binding. Pages transfers the untouched upload stream over RPC; the
object runs the existing creation workflow and image validator with its own D1
and Images bindings. The owner's login signing secret remains in Pages. There
is no stateless fallback for new submissions. See [processor deployment and
recovery](BOOKING-CPU-PROCESSOR.md) for the staged activation order.

## Calendar freshness and budget

Public day/month views share private occupancy snapshots across every service.
Five physical slots cover the inclusive 90-day horizon, including the rare
five-month span. Snapshots expire after 15 seconds, with atomic refresh leases,
bounded contention and failure cooldown. Cache hits perform no writes.
Request status transitions invalidate snapshots transactionally and fence
in-flight stale refreshes. Current application claims are overlaid afresh.

All-day and timed events block regardless of Busy/Free. Google failures do not
produce free time. Booking creation and acceptance use the authoritative,
uncached provider and retain durable overlap claims. External Calendar edits
reach an idle visible form within the 15-second cache window plus its existing
45-second refresh interval and provider latency; this is polling, not push.

Five continuously hot snapshots cost at most 57600 routine D1 writes/day before
invalidations. Admission is provisionally budgeted at 30000 writes/day,
including indexed accounting and cleanup headroom under the configured caps.
These are bounds/models, not measured production CPU or an account-wide traffic
guarantee. Other account workloads, denied reads and real edge metrics must be
included in the release assessment.

The HTTP handler also permits at most eight concurrent creation requests per
isolate before admission or body parsing. Public day/month reads share a coarse
300-per-IP-per-minute guard, with at most 2048 in-memory IP entries and minute
expiry. It trusts only the edge-provided `CF-Connecting-IP` and writes no D1
polling counters. These guards bound work within one isolate; they are not a
global or account-wide DDoS allowance.

## Verification and rollback

Release requires server/controller/draft tests, valid/invalid image fixtures,
atomic race/retry/expiry cases, mobile offline/reload checks, owner configuration
confirmation, private helper checks and complete-route edge CPU measurements.
No real customer booking or Calendar event is needed for synthetic verification.

The C-mirror processor integration suite passed **490/490** with no failed, skipped,
or cancelled tests on Node **24.22.0** using `node --test server/*.test.js`.
Its local log is `tmp/booking-processor-suite.log`. This verifies local
contracts and synthetic cases; the deployed Cloudflare runtime, real private
Images binding, owner configuration, and complete-route edge CPU still need
their own release evidence. A local pass is not confirmation of production CPU
headroom or runtime resource configuration.

Apply additive migrations before the hardened request handler, with new
submissions disabled during an incomplete rollout. Keep the updated cleanup
Worker and Calendar-deletion reconciliation code: both count target rows using
`RETURNING`, because D1 `meta.changes` includes the new accounting/cache trigger
writes. The old source can otherwise report false failures after those triggers
run, so a blanket rollback to that source is not verified compatible. A rollback
bundle must preserve these trigger-compatible server fixes; a client-only
rollback must retain the multipart migration response and immutable retry path.
Never remove migrations or delete normalized receipts to roll back source.
Keep the private helper and admission configuration available through rollback
verification. Do not restore broad Google-account access or remove owner/CSRF
checks.
