# Booking revision — 21 October 2026

**Combined booking revision PUBLISHED.** GitHub commit `31e7ade018089ee24ef6f84a9c27da269cfab7f1` is live in successful Cloudflare deployment `ea7e5e0b-79d3-4612-8cf0-34e15a01e535`. The 17:30:25 UTC GET probe verifies seven routes, six exact JS assets, enabled booking, all five public SEO pages, sitemap/robots/ownership and private noindex boundaries. The 17:32:23 UTC API probe verifies four canonical date/design/duration availability responses and anonymous proof denial. Mobile 390px/320px checks observed no horizontal overflow, minimum-DP/full-payment behavior and invalid-phone feedback. The native receipt chooser could not be completed in the connected browser, so the native client chooser path remains UNVERIFIED. The receipt API/idempotency and authenticated owner-image path have since passed live with a synthetic fixture. Owner sign-in/reload and TEST cancellation are already verified; acceptance/Calendar insertion remains UNVERIFIED, with 0 recorded live writes. No new load-time, CPU or physical Safari result is claimed.

Receipt cleanup setup checkpoint: the deployed Worker uses the existing repository/main branch. Source connection was created with builds disabled; the renamed Active token **Chii cleanup builds** was verified to contain only one-account **D1 Read** and **Workers Scripts Edit** before production builds were enabled. Empty build command; deploy `npx wrangler deploy --config workers/booking-cleanup.wrangler.jsonc`; root `/`; preview builds OFF. Worker-only `SKIP_DEPENDENCY_INSTALL=true` is saved for future builds; no Pages or runtime functionality change. Deployed code, runtime D1 binding and daily cron are verified; first scheduled execution/actual expiry deletion is still unobserved.

The 260-test exact release-checkout suite, production build and independent source review passed. Migrations 0001–0005 are applied; additive 0003/0004/0005 did not rewrite old booking rows.

## What changes

New requests select minimum DP or full payment, consulted design/duration and a required private receipt. DP is min(total, max(Rp20.000, ceil(total/10))); full is total and quotes at/below Rp20.000 normalize to full. The server stores immutable values, preserving previous payment/duration fingerprints. Plain/Nail gel/Removal is 60 minutes, Simple is 60/120, Full art is 180/240/300. Regular Last book is 14:00 weekdays / 10:00 weekends; full art caps at 12:00 and must finish by closing, so weekend 3h latest 09:00, 4h 08:00 and 5h unavailable.

Receipt images are re-encoded locally, limited to 500 KiB JPEG server-side and stored atomically with the request. Only the signed-in owner can explicitly load the private image. Access expires 30 days after actual appointment end. The daily receipt-only cleanup code, D1 binding and cron are deployed and verified, with first execution/real deletion still unobserved; no R2/billing. Customer metadata, claims and Calendar events remain. Payment receipt/quote checks are manual; no screenshot establishes payment automatically.

WhatsApp syntax is normalized to `62`-prefixed Indonesian mobile digits using the Google libphonenumber Indonesia pattern: national `8[1-35-9]` followed by 7–10 digits. Local `08`, `62` and `+62` formats with ordinary spaces/parentheses/hyphens are accepted; service prefixes 080/084, wrong lengths, foreign/injected/control/Unicode-digit input reject. This checks syntax only; it neither sends an OTP nor proves WhatsApp/account ownership. [Google phone metadata](https://github.com/google/libphonenumber/blob/master/resources/PhoneNumberMetadata.xml).

## Calendar deletions and freshness

Calendar deletion release (published 21 October revision): availability uses exact-origin POST JSON `{date,designType,durationMinutes:string}`; GET returns 405 and cannot release claims. First require healthy free/busy for the same Calendar, then freshly verify writer/owner access before inspecting deterministic event IDs for at most 12 accepted requests overlapping the selected WIB date. Only definite 404/410 or a cancelled-event tombstone permits an atomic accepted→cancelled update and release of that request’s claims. Retain its Calendar event ID and deciding-owner audit. Missing permissions, timeout, malformed/partial response, storage error or uncertain approving/reconcile state never mean deleted and never authorize release. No Calendar event is created/deleted by availability synchronization.

The visible, idle customer form refreshes the selected date every 45 seconds, with no overlapping request and no refresh while proof preparation or submission is running. Hidden/pagehide stops polling. Current time choice and keyboard focus are preserved where valid; a newly unavailable selection disables Book. Book and pending acceptance perform fresh full-interval checks again; a displayed free slot is not a hold. All-day Busy events block the chosen date; removing them reopens it subject to other occupancy.

Accepted retry boundary: repeating accept for an already acknowledged accepted request remains an idempotent no-I/O read of the stored result. It does not inspect Google on that call. Calendar deletion is synchronized by availability POST, a new Book submission or a new pending acceptance. Until such a sync, owner review may still show accepted. After synchronization marks it cancelled, repeat accept is refused and never recreates the deleted event. Ordinary GET never mutates the ledger.

The owner approval page labels `cancelledViaCalendar` separately. Ordinary review/image GET is read-only; Calendar writes occur only after explicit authenticated acceptance and fresh checks. Uncertain writes retain their claims and require explicit lookup-based recovery.

## Verification boundaries

Owner Google sign-in, session persistence on reload, protected TEST review and authenticated TEST cancellation are already verified live by the auth-only release. See [the sign-in fix](SIGN-IN-FIX-2026-10-20.md). Acceptance and matching Calendar insertion remain unverified; zero Calendar events have been written in the recorded live checks.

| Combined check | Current state |
| --- | --- |
| Exact release-checkout local suite | **260/260 passed**; prior 232/255 checkpoints are historical. |
| Independent focused HTTP/store/workflow/provider rerun | 111/111 passed. |
| Exact release-checkout build | **PASSED** with production SITE_URL; no emitted React runtime/hydration. |
| Deletion-release security/concurrency review | CLEAR; no material blocker. Covers late-sync/replacement races, rollback, partial failures, role downgrade, actual-duration claims and uncertain-write protection. |
| Rendered mobile checks | 390px and 320px: no overflow; minimum DP/full payment and invalid-phone feedback observed. |
| Production receipt API/idempotency/private owner image | **PASS with TEST fixture**: 201/pending, same-booking retry, one request, image complete at natural 960×640, then cancellation persisted on reload. |
| Native browser client file chooser/re-encoding/submission | **UNVERIFIED**: the connected browser could not finish the native chooser; API verification is separate. |
| Migrations 0001–0005 | **APPLIED**; 0005 index CREATE succeeded (809 ms action, 0.34 ms query), with no old-row rewrite. |
| Combined GitHub/Cloudflare release | **PUBLISHED** at `31e7ade018089ee24ef6f84a9c27da269cfab7f1`; deployment `ea7e5e0b-79d3-4612-8cf0-34e15a01e535` successful. |
| Live exact artifact/status/SEO probe | **PASS**: seven routes, six JS assets, enabled status, five SEO pages plus sitemap/robots/ownership/private boundaries. |
| Live availability and anonymous-proof probe | **PASS**: four canonical slot responses; anonymous malformed proof reference denied with 401 before parsing. |
| Daily receipt-only cleanup Worker/cron | **DEPLOYED** at version `eb650530-a417-40be-a6b7-b4e9e53b773c`; BOOKING_DB D1 plus `15 0 * * *` cron verified. First execution/real expiry deletion unobserved. |
| Acceptance/Calendar insertion | Unverified; 0 recorded writes. |

## Live public API checks

| Request | Result | Latest candidate start |
| --- | --- | --- |
| 22 Oct, Simple 120 min | HTTP 200; 13 candidates | 14:00 |
| 22 Oct, Full art 300 min | HTTP 200; 9 candidates | 12:00 |
| 24 Oct, Full art 180 min | HTTP 200; 3 candidates | 09:00 |
| 24 Oct, Full art 300 min | HTTP 200; no fitting candidates | None |

All canonical keys/types and closing constraints passed; no private fields were returned. Anonymous proof GET with a malformed reference returned 401/AUTH_REQUIRED before token parsing. No customer record or Calendar event write was requested. [Public API evidence](evidence/booking-approval/live-api-2026-10-21.json), [exact artifact/SEO evidence](evidence/booking-approval/live-verification-2026-10-21.json). Availability is a snapshot, not a reservation.

## Receipt cleanup deployment and first-run boundary

Receipt cleanup deployment VERIFIED: Worker `chii-booking-cleanup` deployed source `a2ec169850f56294baab4e7b2cdb12c1cf9dbfa7` successfully in build `f67c5cd6-b7e2-4884-98a5-937e354dcb55`, version `eb650530-a417-40be-a6b7-b4e9e53b773c`. Cloudflare confirms deployed `BOOKING_DB` D1 binding and daily cron `15 0 * * *` (07:15 WIB). The original build completed successfully in 34 seconds at 00:40:18 WIB on 21 October; upload 5.33s, trigger deployment 1.82s, code 1.31 KiB / 0.67 KiB gzip, Wrangler 4.151.3. Build duration is not visitor load time. No failed build or retry occurred. The first scheduled run is not yet observed (next window 07:15 WIB); no expired real receipt has been deleted/tested in production verification.

[Sanitized deployment evidence](evidence/booking-approval/cleanup-deployment-2026-10-21.json). Deployment and schedule configuration are verified independently of successful expiry deletion; the daily job deletes only expired receipt images, preserving booking metadata, interval claims and Calendar events.

## Exact-build JavaScript comparison

| Route/import graph | Gzip estimate | Change from previous released approval build |
| --- | ---: | ---: |
| Each public page (Home, Services, Custom sets, Visit, About) | 5,022 B | Unchanged |
| `/book` | 16,945 B | +5,075 B |
| `/book/approve` | 7,541 B | +4,004 B |
| Whole build, each file counted once | 21,555 B | Previous build 15,456 B |

Whole-build raw JavaScript is 57,453 B. The public pages retain their existing shared graph; booking logic and proof work are isolated to the private booking routes. [Sanitized exact-build byte evidence](evidence/booking-approval/js-budget-2026-10-21.json). Figures are deterministic gzip estimates from static HTML/module imports, not network observations; third-party Maps and explicit-owner-click Google sign-in are excluded.

No new sub-one-second, Cloudflare CPU, physical older-Android or real Safari performance result is claimed. Public site pages remain static Astro, private booking pages stay unlisted/noindex, and no booking link is added to the header. Figma and Meta remain separate deferred work.

Live synthetic receipt verification (21 October): one clearly labelled TEST-only production request with a 960×640 fixture JPEG returned 201/pending, agreed total Rp150.000 and upfront Rp20.000. An identical retry returned 201 for the same booking, leaving one persisted booking request. Existing authenticated owner review loaded the private image completely at natural 960×640. The TEST-only request was then cancelled and remained **Dibatalkan** after reload. No WhatsApp message or Calendar event was written. This verifies the receipt API/idempotency/private owner-image path; the browser client’s native file chooser/re-encoding/submission path remains unverified, and the fixture is not payment verification. [Sanitized receipt verification](evidence/booking-approval/live-receipt-2026-10-21.json).

Receipt cleanup deployment VERIFIED: Worker `chii-booking-cleanup` deployed source `a2ec169850f56294baab4e7b2cdb12c1cf9dbfa7` successfully in build `f67c5cd6-b7e2-4884-98a5-937e354dcb55`, version `eb650530-a417-40be-a6b7-b4e9e53b773c`. Cloudflare confirms deployed `BOOKING_DB` D1 binding and daily cron `15 0 * * *` (07:15 WIB). The original build completed successfully in 34 seconds at 00:40:18 WIB on 21 October; upload 5.33s, trigger deployment 1.82s, code 1.31 KiB / 0.67 KiB gzip, Wrangler 4.151.3. Build duration is not visitor load time. No failed build or retry occurred. The first scheduled run is not yet observed (next window 07:15 WIB); no expired real receipt has been deleted/tested in production verification.
