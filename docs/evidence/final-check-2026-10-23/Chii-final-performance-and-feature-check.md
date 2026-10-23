> Historical audit of `2e9d852`. Its receipt-restoration finding was fixed and verified in `1543b21`; see [the current release checkpoint](../../RELEASE-CHECKPOINT-2026-10-23.md).

# Chii final performance and feature check

23 October 2026, Asia/Jakarta. Release source: `2e9d852`.

No functional blocker was found within this test scope. One non-blocking visual issue was observed during restored-receipt loading. This was a bounded stability check, not a maximum-capacity benchmark or a security certification.

## Stability results

| Check | Result | Meaning |
|---|---|---|
| Existing Node regression suite | 527 passed, 0 failed/skipped | Actual server and browser-controller logic, with local/synthetic adapters for external systems |
| Monthly-photo tests | 11 passed | Ten-photo batches, shared rolling retention, originals aging out, fixed About asset preservation, no Reel covers, duplicate checks, failed refresh preservation, optimization |
| Local production build and asset guards | Passed, 8 pages | No React browser hydration/runtime; booking proof/minimum-payment and privacy guards passed |
| Live static-route burst | 100/100 HTTP 200; maximum 5 concurrent clients | Median 48.2 ms, p95 73.9 ms, maximum 84.8 ms, 5.06 seconds total from this machine |
| Heavier local static-route burst | 500/500 HTTP 200; 20 clients | Median 11.6 ms, p95 33.3 ms, 0.63 seconds total; localhost only |
| Live routes | All 8 HTTP 200 | Home, Services, Custom Sets, About, Visit, Book, Approval, Prices |
| Referenced live assets | 42/42 HTTP 200 | Image variants, fonts and scripts referenced by the initial rendered HTML |
| HTML integrity | Passed | One H1 per route, no duplicate IDs, no missing image alt attributes, no broken internal route/fragment links among these pages |
| Unknown route | HTTP 404 | No false success for a nonexistent page |

Initial route responses and live burst timings are HTTP response measurements, not visual load times. The heavier test intentionally stayed on localhost. The asset check does not claim every historical or unreferenced deployed file was requested. The build guard also verifies that every current photo-pool variant exists locally.

## Feature coverage

| Feature | Current verification |
|---|---|
| Responsive pages | All eight live routes checked with a 390px requested phone viewport, 375px usable content width: no horizontal overflow or broken visible images |
| Narrow phone | Menu/contact at 320px requested, 305px content width; restored booking and receipt fit without overflow |
| Navigation | Mobile menu opens, Escape closes it; normal route and anchor destinations resolve |
| Sticky header | Header remained at top while calculator/map sections were in view |
| Contact panel | WhatsApp, Instagram, Shopee link destinations present; title Shopee and subtitle Checkout Our Shopee correct; no messages sent |
| Calculator | All 21 choices present; live nail art + ten extensions + glitter + ten gel removals = Rp83,000; Cat Eye plus kit = Rp62,000; controller/server regression suite checks quantities, ranges, alternatives, invalid values, owner price updates and stale revisions |
| Price editor | Live owner sign-in gate renders; anonymous price-data request returns 401; actual save/revision/authorization logic covered in isolated tests |
| Gallery | Live grid has 15 photos; fixed About picture remains separately; batched loading and fifty-photo limit covered by actual-controller/importer tests |
| Automatic mosaic | Slow-network mobile browser observed the next photo layer arrive automatically; no third-party iframe mounted at initial homepage view; regression tests verify random openings, fade completion, hidden/offscreen pause and reduced-motion behavior |
| Instagram | Archive endpoint returns 279 saved public links; actual Instagram post content rendered in browser; next-post control exercised; 3 recent + 9 random selection covered by controller tests |
| Maps | Actual Google map content and controls rendered automatically on Visit; direct directions/place links remain available |
| Booking rules | Native payment-rule disclosure opens; existing six rules remain |
| Live booking service | `enabled: true`; month calendar and per-date availability returned HTTP 200 and sanitized JSON |
| Services/duration | Live form contains Plain, Gel, Removal, Simple Design and Full Art choices with their supported durations |
| Payment validation | In isolated real-browser form, DP 19,999 blocked Book; DP 20,000 accepted with otherwise valid fields; invalid phone and missing/removed proof blocked Book |
| Large image | Native browser picker selected a synthetic 4,383,515-byte PNG; browser prepared a 1600 x 889 image and enabled Book only after completion |
| Connection loss | Local API sockets deliberately dropped: after reload, name, phone, quote, DP, date and prepared receipt recovered; Book remained disabled |
| Reconnection | Explicit retry rechecked service/availability, restored 10:00 selection and enabled Book; receipt remained available |
| Booking safety | Existing regression suite covers parallel submissions/reservations, idempotency, lost responses, rate controls, conflicts, bounded timeouts, owner allowlist/signature/CSRF, private receipts and Calendar reconciliation |
| Private APIs | Anonymous owner-price, booking-review and proof reads all returned 401 with no private data |
| Search exclusion | Live Book, Approval and Prices HTML contain noindex/nofollow; all excluded from the five-public-route sitemap |

No production booking was created, approved or cancelled. No real receipt was uploaded, no WhatsApp message was sent, and no production price was changed. External Google sign-in and a successful real booking write were not repeated. Their local regression coverage must not be described as a fresh production transaction test. Hourly scraper scheduling and monthly GitHub delivery were not manually triggered or re-certified in this run.

## Slow-connection measurements

A temporary localhost server served the current build with 400 ms response delay and a shared 400 kbps first-party byte budget. Cache was disabled. Third-party embeds were blocked in this isolated scenario; synthetic booking availability used the real scheduling functions. A small local measurement script observed paint and layout entries. Browser CPU was the current computer's CPU, without an old-phone slowdown.

| Scenario | First contentful paint | Largest contentful paint | DOM ready | Resource transfer, excluding main HTML |
|---|---:|---:|---:|---:|
| Mobile homepage, 390px requested | 0.796 s | 2.364 s | 3.352 s | 93,870 bytes |
| Empty booking, desktop sample | 0.884 s | 0.884 s | 3.104 s | 96,642 bytes |
| Empty booking, phone sample | 1.512 s | 1.512 s | 3.550 s | 90,691 bytes |

These are single scenario samples, not a Lighthouse score, a universal load-time promise, or physical Android/iPhone measurements. DOM ready is not a claim that live Google Calendar/Turnstile completed at that exact time. The public PageSpeed API returned HTTP 429; no new Lighthouse score was obtained. Search Console was not opened or retried, and its obsolete retry automation was removed at the user's request.

The local probes recorded no long task during the empty booking and mobile homepage captures. The restored desktop receipt capture recorded one 51 ms long task. Native file-picker automation itself was unusually slow, including for a tiny fixture; its tool wall time cannot be attributed to image compression or customer upload latency.

Browser JavaScript inventory is 101,201 bytes raw / 36,476 bytes gzip across all eight emitted files and routes. Each route loads its needed scripts; this is not a per-visit transfer claim. Current built image folder: 76 files / 4,103,113 bytes. Neither figure implies all images download on opening.

## Finding: restored-draft layout movement (P2)

One desktop reload with an existing receipt showed noticeable layout movement while the saved draft and preview returned. The sum of observed unexpected layout-shift entries was 0.236; a phone repeat with a smaller restored image measured 0.081. The mobile homepage measured 0.004. These are summed diagnostic entries, not the full session-window calculation used by official CLS reporting.

Receipt restoration and booking recovery both succeeded. This is a visual stability concern, not lost data or an incorrect booking result. The receipt preview is hidden initially and exposed after asynchronous restoration (`src/scripts/booking-client.js`, preview/restore functions); reserve appropriate space when a saved receipt is known to exist, then confirm scroll stability with a targeted browser check. The receipt/calendar restoration sequence should be isolated before attributing all movement to a single element. No UI fix was made during this audit.

## Cleanup and evidence

Tracked release files stayed unchanged. Synthetic draft data was cleared. Temporary browser tab was closed, viewport override reset, and both local test servers stopped. No deployment, permissions, billing, credentials or Calendar changes were made.

Evidence beside this report:

- `chii-final-http-results.json`: live routes/assets/APIs, status codes and all 100 burst results.
- `chii-final-local-stress.json`: 500-request local summary.
- `chii-final-ui-results.json`: browser feature observations.
- `chii-local-slow-probes.json`: raw isolated slow-network samples.
- `chii-final-mobile-home.png`, `chii-final-booking-recovery-mobile.png`: phone captures.
- Disposable local servers and synthetic upload inputs are excluded from this package. Maintained regression tests remain under `server/` and `scripts/`.
