# Mobile performance and booking recovery — 21 October 2026

The booking form now keeps a bounded, temporary recovery draft in the same browser tab. A dropped connection or reload can recover the entered details, selected service/date/time intent, prepared receipt and identical retry identity. Availability is always checked again; a recovered time is never treated as a reservation. No request is automatically submitted on reconnect.

## Changes

- Small form metadata uses session storage; the prepared JPEG is written separately to IndexedDB. Typing does not repeatedly serialize the receipt. Restored receipt bytes are checked against their SHA-256 digest.
- Recovery expires 24 hours after the draft was created. Storage is best effort: denied storage, quota failure or browser eviction shows accurate recovery feedback and does not disable an otherwise usable open form. Expired receipt records are purged on a subsequent booking visit, rather than by a background browser scheduler.
- An Indonesian notice explains temporary recovery and shared-device cleanup. **Hapus isian tersimpan** removes the draft. A validated successful server acknowledgement clears it before WhatsApp navigation. Authentication data and owner approval URLs are never stored in the draft.
- Offline pauses periodic availability work. Reconnection refreshes service/month/day state without automatically booking or opening WhatsApp. Changing availability can invalidate the restored selection.
- Client submission and server receipt-body timeouts now allow 120 seconds. A maximum 500 KiB image becomes about 667 KiB of base64, needing roughly 43 seconds at 128 kbit/s before latency/server work. Small server JSON requests retain their 5-second budget; status/availability client calls retain their 12-second budget.
- Receipt decode, encode, byte reading and digest waits are bounded and cancel safely. Late bitmap results close, stale results are ignored, and canvas memory is released. Existing source limits, JPEG limit and server validation remain in force.
- Browser-shared rules no longer require `Object.hasOwn`; month validation no longer requires `Array.prototype.at`. This reduces avoidable older-WebView incompatibility without claiming support for every obsolete browser.

## Measured mobile baseline

These public PageSpeed reports measured the preceding release `1b8b0d0` before recovery changes. Both used Lighthouse 13.5.0, emulated Moto G Power, slow 4G and an initial page load. They contain no real-user field data and are not physical Android measurements.

| Page | Performance | FCP | LCP | Total blocking time | CLS | Speed Index |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| [Booking](https://pagespeed.web.dev/analysis/https-chiinails-pages-dev-book/th6ixv6jk5?form_factor=mobile) | 100 | 0.9 s | 1.3 s | 0 ms | 0.011 | 2.2 s |
| [Home](https://pagespeed.web.dev/analysis/https-chiinails-pages-dev/x9ppgtn1xn?form_factor=mobile) | 90 | 1.0 s | 1.4 s | 0 ms | 0.017 | 12.2 s |

The Home report's Speed Index is retained alongside its fast first/main-content measurements; changing hero imagery may affect visual-completion analysis, but this run does not establish its exact contribution. The owner-requested automatic photo behavior is preserved. Booking remains intentionally noindex, so its SEO score of 58 is not a public-page search regression. Accessibility and Best Practices in its baseline report measured 100.

## Verification and boundaries

- **357/357 tests pass**, including 76 focused draft/client cases and 13 receipt-preparation cases. They cover slow/stalled uploads, response loss after atomic database commit, exact-key retries, draft expiry, denied/quota storage, corrupt receipts, reconnect, fresh availability and interrupted history restoration. The production build passes asset, privacy and SEO guards: six browser JavaScript files, 74,253 raw bytes / 26,741 gzip bytes across the complete site, with no React client runtime. This is 2,844 additional gzip bytes compared with the previous release, not a per-route transfer claim. [Release evidence](evidence/mobile-recovery/release-checks.json).
- Live 360 px layout inspection found no horizontal overflow. Ordinary booking inputs/selects were 50 px high with 16 px text.
- An isolated local fixture served the generated build with a shared 400 kbit/s download budget, a 128 kbit/s simulated request-body read budget and 400 ms response latency. A synthetic 4,094,334-byte PNG was processed by the real browser codecs into a 1200×750 JPEG. After reload, the browser visibly recovered the name, price, date and receipt preview. Automated tests verify exact phone/time/retry identity preservation.
- The connected browser's native file-chooser event timed out. A clearly labelled local-only helper selected the synthetic file for codec/recovery testing; this is not evidence that the native picker was tested. External WhatsApp navigation was stubbed only in the isolated fixture, and no WhatsApp message, production booking or Google event was created.
- Further UI testing stopped when Windows Computer Use could not verify the current browser URL with enough confidence. The simulated lost-response browser submission was not completed; its atomic retry behavior is covered by automated fault-injection tests. No UI automation continued after that stop.
- No physical older Android, iPhone, Instagram in-app browser, actual carrier outage or device-memory pressure test was performed. Browser storage may be cleared earlier than its recovery TTL. Previously unverified real owner acceptance→Google Calendar insertion remains a separate launch check.

This release adds no dependency, service worker, paid plan, background browser submission or new Calendar access.
