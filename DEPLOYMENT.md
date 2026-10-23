# Deployment and recovery

Reviewed **23 October 2026**. This is the existing Cloudflare Pages/GitHub setup, not a request to recreate resources. Production: https://chiinails.pages.dev/, Pages project `chiinails`, private repository `Elichika-Pendragon/webchiinails`, branch `main`. Keep the established old-domain redirect and Google verification file.

## Static build

Use Git integration with root `package.json`, `pnpm build`, output `dist`, Node 24 and pnpm 11.25.0. Node must satisfy the package engine >=22.22.0. Keep `functions/` at repository root; a plain static upload is not the full application. The generated HTML has no React client hydration. `public/_routes.json` scopes Functions to API routes.

Production build settings: `SITE_URL=https://chiinails.pages.dev`, `SEO_PRODUCTION_BRANCH=main`, `SEO_INDEXABLE=true`. A missing origin/non-production branch deliberately produces noindex and no sitemap. Preview builds must not use live write credentials. `pnpm preview` alone cannot validate bound backend behavior.

## Runtime values and bindings

Use [.env.example](.env.example) for names and placeholders. Store real secrets only in the appropriate private environment settings; never publish them or copy account sessions.

| Pages setting | Purpose |
| --- | --- |
| `BOOKING_ENABLED` | Explicit booking enable flag |
| `BOOKING_SUBMISSIONS_DISABLED` | Set `true` to stop new submissions while retaining owner review |
| `SITE_URL` | Exact HTTPS production origin used by server origin checks |
| `BOOKING_LINK_SECRET` | Independent server signing material for booking/admission |
| `BOOKING_AUTH_SECRET` | Owner-session signing secret, kept in Pages |
| `BOOKING_OWNER_EMAIL` | Exact allowed verified Google owner identity |
| `GOOGLE_OAUTH_CLIENT_ID` | Public Google Identity Services web client ID; no client secret |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `GOOGLE_CALENDAR_ID` | Private calendar integration configuration |
| `BOOKING_TURNSTILE_SITE_KEY`, `BOOKING_TURNSTILE_SECRET_KEY` | Public site key / private verification secret for the restricted widget |
| `GOOGLE_SITE_VERIFICATION` | Optional public build-time HTML-tag verification value |

These bindings are objects, not env strings:

| Runtime | Binding | Target |
| --- | --- | --- |
| Pages | `BOOKING_DB` | Existing migrated D1 database |
| Pages | `BOOKING_PROCESSOR` | Durable Object namespace, `BookingSubmissionProcessor`, script `chii-booking-processor` |
| Pages | `BOOKING_IMAGES` | Private `chii-booking-images` service, also needed for readiness |
| Pages | `INSTAGRAM_LINKS` | Existing public-links-only archive KV |
| Booking processor | `BOOKING_DB`, `IMAGES`, `BOOKING_PROCESSOR` | Existing D1, Images and its SQLite Durable Object namespace |
| Image helper | `IMAGES` | Images binding |
| Cleanup | `BOOKING_DB` | Existing D1 |
| Instagram collector | `BROWSER`, `INSTAGRAM_LINKS` | Browser Rendering and archive KV |

Use the committed configs in `workers/booking-processor.wrangler.jsonc`, `booking-images.wrangler.jsonc`, `booking-cleanup.wrangler.jsonc` and `instagram-links.wrangler.jsonc` for resource identities. Do not create replacement databases/namespaces or substitute the legacy `workers/wrangler.jsonc` token-renewal config. Processor/image/cleanup public endpoints are disabled. Pages passes only the strict processor allowlist per private RPC call; do not add owner-session credentials to that payload or persistent object storage.

## Release order

1. Inspect branch/diff and existing bindings. Back up before any intended schema change. `migrations/0001` through `0009` are already part of the released setup; apply only unapplied additive migrations in numeric order. Do not reset booking/price data or repeat resource creation.
2. Run relevant tests and `pnpm build`. Include Python tests when importer behavior changes. Use isolated providers/bindings for write tests.
3. For private-worker changes, deploy the intended config and verify its existing bindings before activating dependent Pages code. Retain authorization boundaries and disabled public URLs. Do not activate billing as an incidental deploy step.
4. Commit and push to `main` through normal Git integration. Confirm the actual Pages deployment succeeded; a pushed commit alone is not production proof. A docs-only `[skip ci]` commit does not require a runtime deployment.
5. Read-only smoke checks: five public routes, private route search directives, sitemap/robots, public price/archive APIs, anonymous private denial and booking readiness. Browser checks should cover responsive controls and draft restoration. Creating appointments, changing live prices and manual scraper runs need their own intended operational purpose.

## Schedules and recovery

- Instagram collector: hourly `17 * * * *`; verify archive success state, not just delivery.
- Receipt cleanup: daily `15 0 * * *` (07:15 WIB), bounded expired-image batches.
- Monthly photos: GitHub Actions `43 2 1 * *` (first day, 09:43 WIB); schedule delivery may be late. A verified asset/catalog commit triggers a normal Pages build.

For upload trouble, use the new-submission stop flag and investigate without replaying customer submissions server-side. Existing idempotency identities protect explicit client retries. For scraper/import failure, keep the last good archive/images. For a bad code release, choose a compatible known-good revision without rolling back D1/customer state or discarding concurrent work. Removing a schema change requires a reviewed migration plan, not an automatic reverse operation.

## Limits

Pages static assets, Functions/Workers CPU and requests, D1 storage/operations, Images, Browser Rendering, KV and GitHub Actions each have separate quotas. Some account quotas are shared with other projects. The code's caps and caches reduce use but do not establish the account's current remaining allowance. Inspect the authorized dashboard and current provider documentation before capacity decisions; old screenshot counts and test latencies are dated evidence. No R2 receipt bucket, paid feed subscription or VPS is used by this setup.
