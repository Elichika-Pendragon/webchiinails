# Booking preview and integration handoff — 20 October 2026

## Delivered locally

`/book` is a standalone Astro page with the existing Chii theme, header and footer. There is **no Book/Booking header or menu destination**. Jessica shares the same form URL after consultation. The route is `noindex, nofollow` and absent from the five-page SEO sitemap.

The six inputs are name, WhatsApp, agreed total, DP, date and time. The page validates a two-hour WIB appointment against studio hours, shows a review and remaining balance, and lets the customer edit without losing values. A customer action opens an encoded WhatsApp message to the existing Chii contact; the customer still taps Send. No message was sent during testing.

The current page explicitly says it is a preview. It has no database, payment collection/verification, slot hold, approval link or Calendar write. Its controller uses no local/session storage or automatic form submission. Fields are disabled until the controller initializes, with a WhatsApp alternative when JavaScript is unavailable. E-wallet receiving details have not been supplied and are not invented.

## Latest intended automation

The owner's latest direction supersedes the earlier zero-extra-clicks/calendar-request ideas:

1. Jessica consults and shares the constant form link.
2. The customer completes the six fields; a future backend records a request and generates a unique approval URL.
3. The customer sends the prepared summary/link and transfer evidence through WhatsApp.
4. Jessica checks the actual incoming DP, opens the request, authenticates as the allowed Google account and explicitly approves.
5. The backend rechecks the full appointment interval, reserves it atomically and creates one event in the existing **Nail Art** calendar.

Opening a link is read-only; WhatsApp previews must never cause approval. A customer-visible URL is not authorization. The approval action requires an authenticated owner, CSRF protection and idempotency. Conflict, expiry and Calendar failure remain explicit states. A screenshot alone does not establish payment. No Meta messaging API is required for a customer-sent message; unattended WhatsApp sending is a separate integration and is not implemented.

## Calendar preparation

The owner supplied the Calendar ID, and its Nail Art name, ownership and Asia/Jakarta time zone were checked in Google Calendar. Account details stay in local project state, outside the distributable source. The current Calendar sharing screen shows public free/busy only; no sharing permissions were changed.

The owner accepted Google Cloud's first-use terms herself. Google Cloud shows Calendar API **Enabled** in the existing project. The credential wizard is open. No service account/key, Calendar access grant, Cloudflare secret, booking Function or D1 resource has been created. No paid-trial or billing action was taken.

An isolated, inactive `server/google-calendar.js` adapter is prepared: native WebCrypto service-account JWT, bounded free/busy queries, cached tokens, private two-hour events, stable event IDs, verified duplicate reconciliation and sanitized errors. It is not imported by browser code and exposes no public endpoint. Its trusted caller must supply authenticated Jessica approval, DP verification and a transactional reservation ledger. The app has not made a real Calendar API call.

## Verification

- **59/59 Node tests passed**, including 17 booking-rule and 14 synthetic Calendar-adapter cases. Calendar tests use a generated test key and fake HTTP responses.
- Production static build and SEO/asset guards passed for five public pages plus the unlisted preview. Guards check booking noindex, sitemap exclusion, no header link, unique element IDs and absence of runtime React/Calendar credentials in browser bundles.
- Chrome functional checks: blank-form errors, DP above total rejected, weekday 15.00–17.00 and weekend 10.00–12.00, review totals, editing with values retained, correctly encoded WhatsApp destination/message. The draft was inspected without opening/sending it.
- Desktop 1280, mobile 390 and narrow 320 layouts inspected; no horizontal overflow at 390/320, six input targets 50px high, and no iframe on the booking page. Mobile menu contains only the existing destinations.
- Browser QA caught a duplicated phone/action ID which made the WhatsApp link inert. The action now has a separate ID; retesting verified its actual URL, and the build checks enforce unique IDs.
- A fresh independent general review agent substituted for the unavailable packaged Impeccable reviewer. It passed the local preview's visual/usability scope and requested one documentation correction. Its verdict pass marked that correction resolved and said **ship the local preview**. The Impeccable detector could not run because its engine is unavailable; manual review was used.

Screenshots: [desktop](evidence/booking-preview/desktop.png), [mobile](evidence/booking-preview/mobile.png), [320px](evidence/booking-preview/user-320.png), [mobile review](evidence/booking-preview/mobile-review.png). Physical older Android, physical Safari, assistive-technology testing and live Calendar behavior are unverified.

## Asset cost and speed limits

No package dependency, image, font or framework hydration was added. The booking page reuses the shared native controller; its Instagram poll and map initialization stay inactive because this page contains no hero/gallery/map.

| Built output | Raw bytes | Gzip estimate |
| --- | ---: | ---: |
| Shared existing controller | 12,126 | 4,879 |
| Booking validation/review controller | 8,087 | 3,444 |
| Per-page import wrapper | 29 | 49 |
| Booking HTML, including inline CSS | 39,895 | 9,620 |

The booking route loads the first three JavaScript items: **20,242 bytes raw / 8,372 bytes gzip estimate**. Sharing the existing controller adds a 29-byte import wrapper and one module request to the other pages; their controller contents remain unchanged. Gzip sizes are file estimates, not measured network transfers. No new throttled loading-time benchmark was run, so this report does **not** claim the new route loads below one second. Earlier site benchmarks in `PERFORMANCE.md` remain historical and do not certify this preview.

## Publication and remaining work

The owner authorized pushing this prepared preview on **20 October 2026**. At this report's pre-push capture, deployment verification is still pending. Publication of the preview does not activate booking automation. Figma remains deferred. Before automation activation: finish the authenticated approval UI/backend, decide request/hold expiry and capacity rules, authorize Calendar credentials/access, add server-side persistence/reservations, then test owner approval, spoofing, duplicate clicks, competing requests and Calendar recovery with synthetic data. Review real wallet instructions/costs before publishing them. Do not claim the automation is live from the static preview or from the API's Enabled label.
