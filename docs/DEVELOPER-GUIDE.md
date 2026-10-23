# Developer guide

Source review: **23 October 2026**. This describes the implementation; use the [release checkpoint](RELEASE-CHECKPOINT-2026-10-23.md) for dated production proof.

## Architecture

Astro emits eight HTML routes. Shared React components render only during the build. Native browser controllers activate interactions without client React hydration. Static pages, fonts and optimized images are served by Pages; `public/_routes.json` limits Functions routing to the API paths.

Booking submissions stream through Pages to `BOOKING_PROCESSOR`, a Durable Object namespace for `BookingSubmissionProcessor` in the private `chii-booking-processor` Worker. Pages calls the named `booking-v1` instance through Request/Response RPC, passing only the explicit configuration allowlist in `server/booking-processor.js`. The object performs bounded parsing, admission, Turnstile checks, image normalization and the atomic D1 save. It stores receipts in D1, not Durable Object storage. Owner login signing secrets remain in Pages. There is no automatic retry or fallback to the previous CPU-heavy stateless handler.

Separate private Workers perform image readiness/validation and daily receipt cleanup. The hourly Instagram link Worker uses anonymous Browser Rendering and public-links-only KV. GitHub Actions performs monthly photo downloads/optimization at build time; visitors do not trigger scraping or monthly image processing.

## Where to change things

| Concern | Source |
| --- | --- |
| Shared layout, header, chat, gallery, Meet Chii | `src/App.jsx`, `src/styles.css` |
| Routes and document shell | `src/pages/`, `src/layouts/Page.astro` |
| Business copy, contacts, opening rules | `src/content.js` |
| Price defaults, calculation rules, menu UI | `src/pricing.js`, `src/PriceList.jsx` |
| Browser navigation, carousel, deferred Maps/Instagram | `src/scripts/client.js` |
| Customer booking and recovery | `src/scripts/booking-client.js`, `booking-calendar.js`, `booking-proof.js`, `booking-draft.js`, `booking-challenge.js` in the same directory |
| Owner review and price editor | `src/scripts/approval-client.js`, `price-client.js`, `price-editor.js` |
| Canonical booking rules and HTTP boundary | `server/booking.js`, `server/booking-http.js` |
| Atomic requests/claims, Calendar, owner auth | `server/booking-requests.js`, `google-calendar.js`, `booking-auth.js` |
| Upload admission, private RPC, proof validation | `server/booking-admission.js`, `booking-processor.js`, `booking-proofs.js` |
| Persistent shared prices | `server/prices.js`, `migrations/0009-site-prices.sql` |
| Instagram archive, public link discovery, selection | `server/instagram-archive.js`, `instagram-links.js`, `src/instagram-showcase.js` |
| Monthly photo import | `scripts/monthly_photos.py`, `.github/workflows/monthly-photos.yml` |
| Managed pool, presentation and fixed About photo | `src/studio-collection.json`, `studio-photo-catalog.json`, `studio-fixed-photos.json`, `studio-photos.js` |
| SEO generation and build assertions | `scripts/seo.mjs`, `scripts/postbuild.mjs`, `scripts/check-assets.mjs` |

Paths abbreviated after a directory share that directory. `src/studio-collection.json` is repository retention/source metadata; the public presentation does not publish original image CDN URLs. Optimize published assets in `public/images`; do not add original multi-megabyte exports.

## HTTP surface

| Endpoint | Method and purpose |
| --- | --- |
| `/api/booking/status` | GET: sanitized booking readiness |
| `/api/booking/calendar` | POST: month closure metadata for a selected service/duration |
| `/api/booking/availability` | POST: current slots for a date/service/duration |
| `/api/booking/admission` | GET: signed anonymous submission admission |
| `/api/booking/requests` | POST: multipart `booking` JSON field and `proof` image Blob |
| `/api/booking/auth/session` | GET/POST/DELETE: owner session challenge, verified sign-in, sign-out |
| `/api/booking/review` | GET/POST: authenticated review and explicit accept/cancel |
| `/api/booking/proof` | GET: authenticated private receipt |
| `/api/prices` | GET: sanitized public price catalog, revision and timestamp |
| `/api/booking/prices` | GET/POST: authenticated catalog read/save with CSRF and revision checks |
| `/api/instagram-archive` | GET: saved public permalinks; never starts a scrape |
| `/api/instagram` | Retained legacy official-API adapter; not the active gallery dependency |

Public availability does not expose customer names, numbers, receipt bytes or event details. Approval links are lookup identifiers, not authorization. Owner mutations require the verified allowlisted identity, session, same-origin and CSRF checks. Do not document the private owner email, Calendar ID or production secrets in distributable examples.

## Configuration and data

See [deployment](../DEPLOYMENT.md) and [.env.example](../.env.example). Cloudflare bindings are runtime objects, not strings in an env file. The active Pages integration uses `BOOKING_DB`, `BOOKING_PROCESSOR`, `BOOKING_IMAGES` and `INSTAGRAM_LINKS`. Processor/cleanup Workers use the existing D1 database; processor/image helper use `IMAGES`; the collector uses `BROWSER` and `INSTAGRAM_LINKS`.

Migrations `0001` through `0009` are additive and belong to the existing database. They cover bookings, immutable payment/service snapshots, private receipts, Calendar synchronization indexes, manual DP, admission/storage accounting, occupancy cache and site prices. Never replay setup by replacing the database, resetting rows or recalculating old request amounts. Back up before schema changes and apply only unapplied migrations in numeric order.

## Verification workflow

Use `pnpm test` for the Node suite and `pnpm build` for HTML/SEO/assets assertions. The monthly importer has separate Python tests documented in the [README](../README.md). Exercise customer controls at desktop, 390px and 320px, including restore with receipt, failed preparation, stale/offline availability and explicit retry. Keep the reserved calendar/receipt/status space that prevents restore layout movement.

Use isolated bindings/provider fixtures for write and failure tests. Production smoke checks should read public endpoints, verify unauthorized private access is denied and inspect the deployed assets. Real bookings, Calendar writes, price changes or manual scraper invocations are operational actions, not default smoke tests. Do not claim physical Android/iPhone or actual bank-payment verification from browser simulations.
