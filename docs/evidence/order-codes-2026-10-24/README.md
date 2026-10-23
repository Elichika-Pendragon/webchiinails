# Order-code and printable-receipt release proof

24 October 2026 · Production released and verified.

- Source commit: [`6453f08`](https://github.com/Elichika-Pendragon/webchiinails/commit/6453f08805f2299d7265baab1613053a91f5b26e).
- Cloudflare Pages project: `chiinails`; deployment `b0443674-ead5-4b60-8e54-38d6cba271ff`.
- Cloudflare's deployment log confirms **Success: Your site was deployed!** at 24 October 2026 **01:05:22 WIB** (`2026-10-23T18:05:22.570985Z`). The build generated 10 routes, the five-page production sitemap, validated all local assets/privacy guards and contained no React client runtime.
- Private booking processor: `4344942e-e65c-484f-8955-f9d0fb40b7cf`, confirmed serving 100% of the deployment. Existing D1, Images and Durable Object bindings retained; public endpoints remain disabled. Bundle 167.70 KiB / 39.97 KiB gzip; reported startup 3 ms.
- Additive schema `0010` and `0011` applied through the existing authorized Cloudflare D1 console after recording the recovery bookmark in [the feature guide](../../ORDER-CODES-AND-RECEIPTS.md). A follow-up SELECT confirmed all three new tables existed and were empty before the release test. No appointment, proof, customer price or Calendar record was edited.

## Checks

All **546** local regression tests passed. Production build and asset/search guards passed. Browser JS totals across all routes: 123,509 bytes raw / 45,842 bytes gzip; this is an aggregate, not the transfer required by a single page.

[Live HTTP evidence](live-http-check.json): **22/22 expected responses**, covering five public routes, five private-page shells, five-page sitemap, booking-enabled status, anonymous owner denial, same-origin anonymous session/nonce handling, missing-reference lookup, invalid-challenge denial, invalid receipt-token denial and blocked unauthenticated booking submission. This is a bounded release smoke check, not a load/capacity certification.

[Live code handoff](live-code-handoff.json): a single non-customer public order reference `S2PG4` was generated using the real production Turnstile/session flow for Nail polos. Pasting it on `/book` loaded its persisted services and seeded total `25000` / DP `20000`. The calculator field was optional; total remained editable; private booking access remained empty and Book stayed disabled. The one small reference is subject to the normal 30-day expiry; it created no customer record, request, hold, payment proof, notification or Calendar event.

Synthetic browser evidence at 1280px, 390px and 320px demonstrates owner edits under the same code, current-version lookup, preservation of typed DP, final amount editing, accepted-only receipt action, correct normalized wa.me target and separate customer receipt link. The fresh [finish review](design-review.md) returned **ship** with no material fixes. Two detector warnings are the existing dynamically populated proof-preview images, rather than new broken images.

The receipt is print-ready HTML and native browser Print / Save as PDF. **No PDF file is generated or stored by the server.** Tests inspected the print rules and document layout; they did not choose a real printer/PDF destination, accept a real payment, create an actual customer booking, sign in as Jessica on production or send a WhatsApp message. Production owner actions continue to require her existing exact Google allowlist and CSRF protections.

## Evidence files

- `pages-deployment.jpg`: actual Cloudflare deployment detail.
- `schema-production.jpg`: successful additive D1 schema and empty new-table counts.
- `live-book-mobile.jpg`, `live-code-book-mobile.jpg`: live optional lookup and payment controls.
- `live-http-check.json`, `live-code-handoff.json`: sanitized production outcomes; no session cookies, nonces or signing credentials.
- `receipt-*`, `book-*`, `owner-*`, `approval-mobile.jpg`, `calculator-*`: synthetic responsive feature checks.
- `impeccable-findings.json`, `design-review.md`: detector and independent design-review scope.

Temporary preview server and agent-created browser tabs were closed after verification; the responsive viewport override was reset. Jessica's existing browser sessions, Google/Cloudflare credentials, other tabs, Figma and indexing were not changed by this release.
