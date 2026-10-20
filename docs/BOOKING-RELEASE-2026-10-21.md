# Booking revision — 21 October 2026

**Prepared; 260 tests, exact production build and source review passed. Final browser checks and publication pending.** The owner resumed publishing all prepared booking features. No release SHA, successful combined deployment, receipt-cleanup deployment or Calendar insertion is claimed here until verified. Migrations 0001–0005 are applied; additive 0003/0004/0005 did not rewrite old booking rows.

## What changes

New requests select minimum DP or full payment, consulted design/duration and a required private receipt. DP is min(total, max(Rp20.000, ceil(total/10))); full is total and quotes at/below Rp20.000 normalize to full. The server stores immutable values, preserving previous payment/duration fingerprints. Plain/Nail gel/Removal is 60 minutes, Simple is 60/120, Full art is 180/240/300. Regular Last book is 14:00 weekdays / 10:00 weekends; full art caps at 12:00 and must finish by closing, so weekend 3h latest 09:00, 4h 08:00 and 5h unavailable.

Receipt images are re-encoded locally, limited to 500 KiB JPEG server-side and stored atomically with the request. Only the signed-in owner can explicitly load the private image. Access expires 30 days after actual appointment end. The separate daily receipt-only cleanup is approved but NOT deployed/scheduled; no R2/billing. Customer metadata, claims and Calendar events remain. Payment receipt/quote checks are manual; no screenshot establishes payment automatically.

WhatsApp syntax is normalized to `62`-prefixed Indonesian mobile digits using the Google libphonenumber Indonesia pattern: national `8[1-35-9]` followed by 7–10 digits. Local `08`, `62` and `+62` formats with ordinary spaces/parentheses/hyphens are accepted; service prefixes 080/084, wrong lengths, foreign/injected/control/Unicode-digit input reject. This checks syntax only; it neither sends an OTP nor proves WhatsApp/account ownership. [Google phone metadata](https://github.com/google/libphonenumber/blob/master/resources/PhoneNumberMetadata.xml).

## Calendar deletions and freshness

Calendar deletion release (21 October prepared revision): availability uses exact-origin POST JSON `{date,designType,durationMinutes:string}`; GET returns 405 and cannot release claims. First require healthy free/busy for the same Calendar, then freshly verify writer/owner access before inspecting deterministic event IDs for at most 12 accepted requests overlapping the selected WIB date. Only definite 404/410 or a cancelled-event tombstone permits an atomic accepted→cancelled update and release of that request’s claims. Retain its Calendar event ID and deciding-owner audit. Missing permissions, timeout, malformed/partial response, storage error or uncertain approving/reconcile state never mean deleted and never authorize release. No Calendar event is created/deleted by availability synchronization.

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
| Mobile/desktop slot/proof/polling/rendered checks | Pending final record. |
| Migrations 0001–0005 | **APPLIED**; 0005 index CREATE succeeded (809 ms action, 0.34 ms query), with no old-row rewrite. |
| Combined GitHub/Cloudflare release | Pending. |
| Daily receipt-only cleanup Worker/cron | NOT deployed or scheduled; narrowly scoped Git Build token creation awaits owner approval. Broad default token avoided. |
| Acceptance/Calendar insertion | Unverified; 0 recorded writes. |

## Exact-build JavaScript comparison

| Route/import graph | Gzip estimate | Change from previous released approval build |
| --- | ---: | ---: |
| Each public page (Home, Services, Custom sets, Visit, About) | 5,022 B | Unchanged |
| `/book` | 16,945 B | +5,075 B |
| `/book/approve` | 7,541 B | +4,004 B |
| Whole build, each file counted once | 21,555 B | Previous build 15,456 B |

Whole-build raw JavaScript is 57,453 B. The public pages retain their existing shared graph; booking logic and proof work are isolated to the private booking routes. [Sanitized exact-build byte evidence](evidence/booking-approval/js-budget-2026-10-21.json). Figures are deterministic gzip estimates from static HTML/module imports, not network observations; third-party Maps and explicit-owner-click Google sign-in are excluded.

No new sub-one-second, Cloudflare CPU, physical older-Android or real Safari performance result is claimed. Public site pages remain static Astro, private booking pages stay unlisted/noindex, and no booking link is added to the header. Figma and Meta remain separate deferred work.
