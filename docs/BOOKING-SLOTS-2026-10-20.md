# Booking payment choices, durations and occupied slots — 20 October 2026

**Current release status — 21 October:** booking revision `31e7ade` is live; exact artifacts/SEO, four public availability cases and mobile checks pass. Owner sign-in/session and TEST cancellation are verified. Real receipt-upload end-to-end and Calendar acceptance/insertion remain unverified; receipt cleanup is not deployed. [Current report](BOOKING-RELEASE-2026-10-21.md). Earlier numbered checkpoints and captured evidence are historical.

**Historical preparation checkpoint — superseded by the published 21 October revision linked above.** The contracts below supersede the earlier fixed-two-hour/10%-only specification for new requests. The preceding `bccc3a8` deployment, 161-test results, Rp15.501 example and captured bundle timings remain historical; raw evidence has not been rewritten. No combined-feature deployment or Calendar insertion is claimed by this report. The separate auth-only release below verifies owner sign-in and TEST cancellation.

## Payment amount and immutable policy

The customer keeps the original five required booking values: name, WhatsApp, agreed total, date and start time. A defaulted native **Pilihan pembayaran** choice offers **DP · 10%, min. Rp20.000** or **Full payment · Lunas**. The upfront amount is read-only/server-derived:

- `paymentMode=deposit`: `min(total, max(20000, ceil(total / 10)))`.
- `paymentMode=full`: the agreed total, with zero remaining balance.
- Totals at/below Rp20.000 normalize to full payment, so the requested amount never exceeds the quote.

For Rp155.001, a new DP is Rp20.000 and the remaining balance is Rp135.001; full payment is Rp155.001 with zero balance. Rp15.000 becomes full payment of Rp15.000. The summary's existing `deposit` field means the actual selected upfront amount in either mode. Selecting full payment describes what the customer intends to pay; it is not receipt verification. Chii still checks the real transfer/QRIS transaction and agreed quote.

New requests use `paymentPolicy=min20k-v2`; mode, policy and amounts are immutable and take part in idempotency/Calendar fingerprint checks. Preexisting rows use summary mode `legacy` and policy `legacy-10pct-v1`, preserving their stored 10% amount and event fingerprint. The owner sees **DP 10% · ketentuan sebelumnya** for these records. Do not raise an earlier request's deposit retrospectively. Public input accepts only `deposit`/`full`; an omitted old-client mode defaults to deposit, while invalid modes reject.

The owner supplied ShopeePay/blu transfer instructions for /book; exact recipient display names await confirmation. Financial account numbers are intentionally omitted from technical docs/fixtures. No QRIS image was supplied and no API/QR artwork is invented.

## Required private payment proof

New Book submissions must include a validated payment-proof image, stored privately with the immutable request in D1 (JPEG, at most 500 KiB). Creation must save request and receipt atomically. Only authenticated owner review may fetch the image, after an explicit **Lihat bukti** action; summaries expose at most `hasPaymentProof`, never an image/public URL. Pre-receipt legacy requests have no uploaded proof. A screenshot is customer-supplied evidence for Chii to check, not automatic payment verification. No R2, billing or automatic WhatsApp attachment is introduced. Receipt migration 0004 is applied as two successful CREATEs without rewriting old rows; combined feature artifacts/public API/mobile checks are verified and published; real receipt-upload end-to-end, Calendar acceptance and cleanup deployment remain pending.

## Design and agreed duration

Design type and duration must match the consultation. They are customer declarations for Chii to review, not an automatic assessment of design complexity or price. Native controls are **Jenis desain** and **Durasi**. The original five values remain required; payment/design/duration choices are defaulted and valid; the latest revision also requires private payment-proof upload before Book.

| `designType` | Customer label | Allowed `durationMinutes` | Default |
| --- | --- | --- | --- |
| `plain` | Plain / Nail gel / Removal · 1 jam | 60 | 60 |
| `simple` | Simple art · 1–2 jam | 60 or 120 | 120 |
| `full-art` | Full art · 3–5 jam | 180, 240 or 300 | 180 |

The new UI defaults to Simple art/120 minutes and submits duration as a digit string; summaries return a number and the actual ending timestamp. Old cached clients omitting both fields default to Simple/120. If only design is supplied, its category default applies. Invalid combinations reject. Pre-duration records return `designType=legacy` and 120 minutes, preserving the prior consultation/Calendar fingerprint. Payment legacy and duration legacy are separate compatibility concerns.

Mode, design, duration, date/time and quote form one immutable request snapshot. Editing any relevant value or changing the selected mode/duration creates a separate request/link; it does not revoke the older one. Pending replacements require explicit owner cancellation; the website never deletes an accepted Calendar event; deletion in Google Calendar can release its accepted claims after the guarded reconciliation below.

## Hours, cutoffs and actual occupied slots

Studio hours remain 08:00–17:00 Monday–Friday and 08:00–12:00 Saturday–Sunday, WIB. Plain/Simple retain regular **Last book 14:00** weekdays/**10:00** weekends. Full art has a base cap of 12:00, additionally constrained so the entire appointment finishes before closing.

| Full-art duration | Latest weekday start | Latest weekend start |
| --- | --- | --- |
| 3 hours | 12:00 | 09:00 |
| 4 hours | 12:00 | 08:00 |
| 5 hours | 12:00 | Not available within 08:00–12:00 |

Use 30-minute starts. The cutoff is not permission to finish after closing. A weekend five-hour request must show **Durasi ini tidak muat dalam jam studio** rather than an invented slot. Existing horizon/notice defaults remain technical choices, not additional approved staff capacity.

The current public endpoint is POST-only because it can reconcile externally deleted accepted events:

```text
POST /api/booking/availability with JSON {date,designType,durationMinutes:string}
```

It returns `{date, designType, durationMinutes, timeZone:'Asia/Jakarta', slots:[{time, available:boolean}]}` only. It exposes no customer identity, event title, Calendar ID, raw busy interval or private request identifier. Past/occupied candidates are false. Google busy periods and D1 accepted/approving/reconcile claims block overlapping candidates. Pending requests do not hold a slot.

Online loading/error states block Book and do not label unknown occupancy as free. An explicitly disabled backend retains a clearly labelled hours-only WhatsApp preview. The native time select stays the fallback until the slot grid renders. Busy/elapsed choices are disabled; selection uses rose, with 46px targets. A returned available slot is a snapshot, not a reservation: final acceptance must check again.

To close an entire day, Chii uses an ordinary all-day **Busy** event in the existing Nail Art Calendar. Removing it reopens the day subject to other busy events/claims. Availability is checked on the chosen date/design/duration, freshly again on Book, and again on owner acceptance; a cached free result never reserves the slot.

## Acceptance, claims and recovery

An authenticated owner decision checks the immutable quote, selected upfront payment, design and agreed duration. D1 atomically claims `durationMinutes / 30` consecutive cells under the fenced operation/lease: 2 cells for 60 minutes through 10 cells for 300 minutes. Legacy two-hour requests still use 4 cells. A fresh full-interval Calendar check precedes insertion. No event is created on customer Book, WhatsApp handoff, review GET or availability synchronization.

Before a possible write, the request becomes `reconcile`. Uncertain writes retain claims. After the 60-second fence, explicit owner recovery first performs lookup only; a matching event is recovered, or proven absence permits a fresh busy check before insertion. A status refresh does not retry a write. Definite failures before writing can release unwritten claims back to pending/expired. Google and D1 cannot share a transaction, so staff Calendar edits remain an external race requiring honest conflict handling.

`accepted` requires the matching Calendar acknowledgment/recovery. The event's actual end is start plus the immutable selected duration. A full-payment choice, customer screenshot or pending database row never establishes paid/accepted status by itself.

## Additive migration compatibility

- Payment metadata migration 0002 has already been applied successfully (two statements). Do not rerun it or rebuild/delete existing rows/claims.
- `migrations/0003-booking-duration.sql` is applied and verified: two additive ALTERs succeeded, with no old rows rewritten. It adds design/duration metadata with legacy defaults and valid category/duration constraints.
- Existing `end_ms`/`end_iso` columns retain the version-one two-hour compatibility representation. For new API summaries, availability, claims and Calendar events, the authoritative ending time is derived from stored start plus the immutable `durationMinutes`. Never read a short/long appointment's real finish directly from those legacy end columns.
- No payment API or scheduled Calendar retry job is introduced. Metadata retention/deletion policy remains undecided; the latest approved receipt-only cleanup is specified separately below.

- Migration 0004 is applied: two successful CREATEs added private receipt storage/index without rewriting legacy rows; old requests remain without receipts.

## Authentication diagnosis and verification boundary

A concrete Cloudflare Worker compatibility bug was identified: JWKS fetch was called as `config.fetcher(...)`, giving native fetch the wrong receiver and causing an illegal invocation before Google network verification. The narrow local fix calls fetch with `globalThis` as receiver, preserving caching and all signature/nonce/owner/CSRF checks. A receiver-sensitive regression reproduced 503 before the fix, then correctly rejected an intentionally forged signature with 401. Local auth 20 plus HTTP 18 focused tests passed at that stage. [Cloudflare invocation guidance](https://developers.cloudflare.com/workers/observability/errors/#illegal-invocation-errors), [workerd receiver issue](https://github.com/cloudflare/workerd/issues/6904).

The remaining native Worker incompatibility was `redirect: error`: workerd rejects that RequestInit value before network I/O. JWKS now uses `redirect: manual` and rejects redirects/non-200 responses without following Location; browser-only credentials are omitted, the global receiver is retained and all signature/nonce/owner/CSRF checks remain. The receiver-only fix had not resolved the failure; the final redirect fix is now verified live. Local auth tests pass 22/22. Public-key rejection, actual owner session persistence and authenticated TEST cancellation were verified separately; none establishes a Calendar event insertion. **Owner sign-in fix verified live.** Commit `654c02809b84f4b3140dbf596a328b00e8bed337` deployed successfully as `20e97b8b-9e6b-4b24-8af9-04e339ccc112` at 16:52 UTC. At 16:53:20.945 UTC, the public synthetic invalid-signature probe returned the expected 401/AUTH_REQUIRED instead of 503. Actual permitted-owner Google login then succeeded, the protected TEST brief displayed, reload retained the owner session, and authenticated cancellation succeeded and remained cancelled after reload. **0 Calendar events were written; acceptance/Calendar insertion remains unverified.** At that auth-only checkpoint the combined features were unpublished; the booking feature revision has since been published at 31e7ade, while receipt cleanup remains separate and pending.

| Combined release check | Status |
| --- | --- |
| New payment/design/duration unit and integration tests | **PENDING — record actual results.** |
| Exact production build and asset/SEO checks | **PENDING — historical counts do not verify this revision.** |
| Browser mobile/desktop/occupied-slot/error checks | **PENDING — record rendered evidence.** |
| Duration migration 0003 | **APPLIED — two additive ALTERs; no old rows rewritten.** |
| Receipt migration 0004 | **APPLIED — two successful CREATEs; no old rows rewritten.** |
| Daily receipt cleanup Worker/cron | **NOT deployed or scheduled.** |
| Pushed code commit and successful Cloudflare deployment | **PENDING — record actual identifiers.** |
| Post-fix public invalid-signature edge diagnostic | **VERIFIED — expected 401/AUTH_REQUIRED at 16:53:20.945 UTC.** |
| Actual owner session/protected review/TEST cancellation | **VERIFIED, including reload persistence.** |
| Acceptance/Calendar event insertion | **UNVERIFIED; 0 events written.** |

No fresh under-one-second, Cloudflare CPU, physical older-Android or real Safari result is claimed. Existing theme, no Book header link, private noindex routes, manual payment checks, customer-tapped WhatsApp Send and deferred Figma/Meta boundaries remain.

**Owner sign-in fix verified live.** Commit `654c02809b84f4b3140dbf596a328b00e8bed337` deployed successfully as `20e97b8b-9e6b-4b24-8af9-04e339ccc112` at 16:52 UTC. At 16:53:20.945 UTC, the public synthetic invalid-signature probe returned the expected 401/AUTH_REQUIRED instead of 503. Actual permitted-owner Google login then succeeded, the protected TEST brief displayed, reload retained the owner session, and authenticated cancellation succeeded and remained cancelled after reload. **0 Calendar events were written; acceptance/Calendar insertion remains unverified.** At that auth-only checkpoint the combined features were unpublished; the booking feature revision has since been published at 31e7ade, while receipt cleanup remains separate and pending.

Receipt-only retention decision — latest revision: Payment-proof access expires 30 days after the actual appointment end. A separate daily Free Worker deletes only expired receipt images, at most 500 per run. With a successful daily run and no backlog above that bound, physical deletion occurs within the following 24 hours; scheduler failure/backlog can delay deletion, while owner image GET refuses expired proof immediately and performs no deletion. Booking metadata, claims and Calendar events are preserved. Migration 0004 includes indexed expires_at; its production application is verified as two successful CREATEs with no old-row rewrite. The starter Worker exists and repository/token/build settings are saved; correct cleanup code, daily cron and runtime D1 binding remain pending deployment/live verification. No R2 or billing is required.

Current auth-only evidence and remaining boundaries: [Verified sign-in fix](SIGN-IN-FIX-2026-10-20.md).

Historical prepared QA checkpoint before Calendar-deletion reconciliation (not published): 232 release-checkout automated tests passed locally. That historical build interruption was resolved before the final 260-test production build and successful 31e7ade publication. Receipt-upload POST has a 30-second client/server body timeout; client status/availability/owner reads remain 12 seconds, and other server JSON bodies remain bounded to 5 seconds.

Calendar deletion release (21 October prepared revision): availability uses exact-origin POST JSON `{date,designType,durationMinutes:string}`; GET returns 405 and cannot release claims. First require healthy free/busy for the same Calendar, then freshly verify writer/owner access before inspecting deterministic event IDs for at most 12 accepted requests overlapping the selected WIB date. Only definite 404/410 or a cancelled-event tombstone permits an atomic accepted→cancelled update and release of that request’s claims. Retain its Calendar event ID and deciding-owner audit. Missing permissions, timeout, malformed/partial response, storage error or uncertain approving/reconcile state never mean deleted and never authorize release. No Calendar event is created/deleted by availability synchronization.

The visible, idle customer form refreshes the selected date every 45 seconds, with no overlapping request and no refresh while proof preparation or submission is running. Hidden/pagehide stops polling. Current time choice and keyboard focus are preserved where valid; a newly unavailable selection disables Book. Book and pending acceptance perform fresh full-interval checks again; a displayed free slot is not a hold. All-day Busy events block the chosen date; removing them reopens it subject to other occupancy.

Latest combined verification and publication status: [21 October booking release](BOOKING-RELEASE-2026-10-21.md).

Accepted retry boundary: repeating accept for an already acknowledged accepted request remains an idempotent no-I/O read of the stored result. It does not inspect Google on that call. Calendar deletion is synchronized by availability POST, a new Book submission or a new pending acceptance. Until such a sync, owner review may still show accepted. After synchronization marks it cancelled, repeat accept is refused and never recreates the deleted event. Ordinary GET never mutates the ledger.

Calendar-deletion final local review: no material security/concurrency blocker found. Independent HTTP/store/real-workflow/provider rerun passed 111/111 tests, including late sync versus replacement approval, batch rollback, role downgrade, partial lookup failure, uncertain-write protection and full five-hour release. The pre-phone-validation C-mirror checkpoint passed 255/255 locally; exact release-checkout build/browser/deployment results still require their final record. Additive index migration `0005-booking-calendar-sync-index.sql` supports the requested-day accepted scan and is applied successfully; it rewrites no old rows.

Final local release-checkout checkpoint (21 October): `pnpm test` passed 260/260 and the exact production-SITE_URL build passed. No React runtime/hydration is emitted. All migrations 0001–0005 are now applied; the additive 0005 status/start index CREATE succeeded (809 ms action, 0.34 ms query), with no old-row rewrite. Combined GitHub/Cloudflare deployment is now successful at 31e7ade/ea7e5e0b. The starter cleanup Worker exists with its owner-approved source/build connection. Its Active build token is restricted to one-account D1 Read plus Workers Scripts Edit before builds are enabled; cleanup code/cron/runtime D1 deployment verification remains pending.

WhatsApp syntax is normalized to `62`-prefixed Indonesian mobile digits using the Google libphonenumber Indonesia pattern: national `8[1-35-9]` followed by 7–10 digits. Local `08`, `62` and `+62` formats with ordinary spaces/parentheses/hyphens are accepted; service prefixes 080/084, wrong lengths, foreign/injected/control/Unicode-digit input reject. This checks syntax only; it neither sends an OTP nor proves WhatsApp/account ownership. [Google phone metadata](https://github.com/google/libphonenumber/blob/master/resources/PhoneNumberMetadata.xml).

**Combined booking revision PUBLISHED.** GitHub commit `31e7ade018089ee24ef6f84a9c27da269cfab7f1` is live in successful Cloudflare deployment `ea7e5e0b-79d3-4612-8cf0-34e15a01e535`. The 17:30:25 UTC GET probe verifies seven routes, six exact JS assets, enabled booking, all five public SEO pages, sitemap/robots/ownership and private noindex boundaries. The 17:32:23 UTC API probe verifies four canonical date/design/duration availability responses and anonymous proof denial. Mobile 390px/320px checks observed no horizontal overflow, minimum-DP/full-payment behavior and invalid-phone feedback. The native receipt chooser could not be completed in the connected browser, so real receipt upload/persistence/owner-image end-to-end is UNVERIFIED. Owner sign-in/reload and TEST cancellation are already verified; acceptance/Calendar insertion remains UNVERIFIED, with 0 recorded live writes. No new load-time, CPU or physical Safari result is claimed.

Receipt cleanup setup checkpoint: the starter Worker `chii-booking-cleanup` exists. With explicit owner approval, the existing repository/main branch was connected while builds were disabled. The generated token was renamed **Chii cleanup builds** and its saved Active profile was verified to contain only **D1 Read** and **Workers Scripts Edit**, scoped to one account, before production builds were enabled. Saved build settings: empty build command; deploy command `npx wrangler deploy --config workers/booking-cleanup.wrangler.jsonc`; root `/`; preview-branch builds OFF. No correct cleanup deployment has completed yet: deployed cleanup code, daily cron and runtime D1 binding remain pending verification. The booking Pages revision is already live and separate.
