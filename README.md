# Chii Nails — Astro static website

Astro generates static HTML pages using the existing React presentation components **only at build time**, with an additional unlisted `/book` preview. A small native JavaScript controller handles navigation, chat, Instagram, and Maps. There is no browser React hydration. Desktop retains the long scrolling homepage; mobile gets a shorter homepage and dedicated Services, Custom Sets & Prices, Visit, and About pages.

## Run locally

Use Node **22.22.0 or newer** on a supported even-numbered release. Local and successful Cloudflare production builds use Node 24.19.0 and pnpm 11.25.0; Cloudflare is already configured. The site is live at https://chiinails.pages.dev.

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd test
pnpm.cmd dev
```

Build and inspect a production-origin artifact:

```powershell
$env:SITE_URL = 'https://chiinails.pages.dev'
pnpm.cmd build
pnpm.cmd check:assets
pnpm.cmd preview
```

`dist/` is the static output. Without `SITE_URL`, or on a non-production Cloudflare branch, pages use `noindex` and the sitemap is omitted. Keep `public/googlefe4df279dce4c32d.html`: it retains Google Search Console ownership verification.

## Editing

- `src/App.jsx`, `src/PriceList.jsx`: build-time presentation; no `client:*` directives.
- `src/styles.css`: shared responsive visual design.
- `src/content.js`: contacts, hours, booking rules, services, and owner-supplied prices.
- `src/pages/`, `src/layouts/Page.astro`: static routes and document metadata.
- `src/scripts/client.js`: native browser interactions and five-minute public feed refresh.
- `src/pages/book.astro`, `src/booking.css`, `src/scripts/booking-client.js`, `server/booking.js`: consultation-first preview; five editable fields plus read-only calculated 10% DP, rounded up to whole Rp1. Canonical validation ignores supplied/legacy DP. Review/edit and explicit WhatsApp summary only; no header/menu link, storage, payment verification or Calendar write. The prepared message includes contacts, total, DP, requested date/time range and a pending-approval note; the remaining balance is shown on-page. Read [docs/BOOKING.md](docs/BOOKING.md) before activating automation.
- `server/google-calendar.js`: isolated trusted-server Calendar adapter under implementation, unactivated and without a booking route. Its presence does not authorize writes or verify payment.
- `scripts/seo.mjs`: unique metadata, canonical URLs, WebSite/NailSalon schema, robots and sitemap helpers.
- `functions/api/instagram.js`, Instagram handlers in `server/`, `workers/`: server-side Instagram API and encrypted token renewal system.

## Private booking preview and Calendar status

Chii shares the same `/book` link privately after consultation; do not add a Book/Booking section or header/menu link. The customer edits **name, WhatsApp, agreed total, date and time**. DP is **read-only `ceil(total / 10)`**, always 10% rounded up to whole Rp1; canonical validation recalculates it and ignores forged/legacy supplied DP. Remaining balance is total minus calculated DP. Appointments default to two hours in WIB. Weekday opening hours remain 08.00–17.00, **Last book 14.00**; weekend hours remain 08.00–12.00, **Last book 10.00**. The latest two-hour appointments end at 16.00/12.00 respectively.

Use visible contact **Chii** and payment wording **transfer atau QRIS**, checked manually through WhatsApp. This supersedes the earlier custom-DP, wallet-only and no-QRIS choices; it does **not** authorize a payment API/gateway, merchant setup or billing. **Future direction, not implemented:** the website prepares an approval link in the WhatsApp message; the customer taps Send; Chii checks the agreed total/actual calculated DP and explicitly approves as her authenticated Google identity; then a fresh conflict check precedes one idempotent Calendar event. No dashboard or detail re-entry is required. No Meta/WhatsApp API is needed for this customer-sent handoff.

Release snapshot: the initial preview `f41ca3e` was published in Cloudflare `02097797`. The automatic 10% DP, Chii/contact/payment wording and Last book correction **`387e4a6`** is now confirmed live in successful deployment **`9b08261a`**, checked against exact CSS/JS and SEO artifacts on all six routes. See [the correction report](docs/BOOKING-RULES-2026-10-20.md). This publishes the static preview only; approval and Calendar automation remain inactive.

**Current preview remains narrower:** it prepares only the customer-clicked WhatsApp summary. It does not persist data, generate an authenticated approval link, check live availability, reserve, verify payment or write Calendar. No draft database, Google sign-in/owner authorization flow or approval endpoint is implemented yet.

The owner selected the **existing Nail Art calendar**. Keep its exact account address, Calendar ID and embed URL in private setup state. On 20 October 2026 the owner accepted Google's first-use terms and Google Calendar API became enabled in the existing **My First Project**. The credential wizard is open, but no credentials, Calendar sharing grant or working site authorization exists; no billing/free-trial action was taken. An embed URL and API enablement are not API-write credentials.

The customer also sees the approval URL, so its bearer token alone must never authorize approval. Future **GET** review/link previews have no booking effects; only Chii's Google-authenticated, CSRF-protected explicit **POST Approve** may trigger a fresh full-interval conflict check, durable claim and one idempotent Calendar event. The isolated adapter is unactivated and has no booking route. The earlier automatic **request / DP unverified** Calendar proposal is superseded: no event is created before approval. Google sign-in identity and Calendar write permissions are separate, both unfinished. [BOOKING.md](docs/BOOKING.md) records the precise boundary, service-account/OAuth alternatives, official sources and remaining implementation work.

## Instagram and hosting

Instagram authorization remains pending owner setup. Local curated posts and photographs work while `/api/instagram` returns its sanitized unavailable response. Astro never requests Instagram during the build. Once the official API is configured, the hero and gallery refresh in the browser immediately and every five minutes while the page is visible; unchanged embeds are retained.

Deploy to **Cloudflare Pages**, with build command `pnpm build`, output `dist`, and the root `functions/` directory. This is static Astro with **no Cloudflare Astro adapter**. Keep the existing Pages Functions/KV bindings and separate scheduled renewal Worker. `pnpm build:worker` and `pnpm seed:instagram` remain available; never commit credentials or `.private/`.

Read [MIGRATION-ASTRO.md](MIGRATION-ASTRO.md) for architecture and rollback, [REQUIREMENTS.md](REQUIREMENTS.md) for the consolidated decisions, and [PERFORMANCE.md](PERFORMANCE.md) for measured results. Mobile Home includes automatic Maps after core loading as the section approaches the viewport. EmDash was cancelled; no CMS or billing subscription was activated. All previous operational documents are preserved. [README-REACT.md](README-REACT.md) retains historical React instructions; its Vite/prerender commands are superseded here.
