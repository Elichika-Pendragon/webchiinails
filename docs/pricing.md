# Shared prices and press-on estimates

Owner-approved calculation (23 October 2026): use the listed Nail Art / Cat Eye menu price as the design fee, then add the base kit (initial Rp22,000) and optional MXBON glue (initial Rp13,000). A ranged design produces a ranged estimate. Shipping, unselected extras and final design consultation are excluded. The former static Rp25,000–155,000 finished-set headline is replaced by the selected estimate because it is inconsistent with the newly approved formula.

## Jessica's editor

Open https://chiinails.pages.dev/prices and choose the same Google owner account used for booking approval. Edit whole-rupiah amounts without separators. Leave the upper amount empty for a fixed price. Save all prices together. The page has noindex/nofollow metadata and response headers, is absent from the public sitemap, and loads Google Identity Services only after an explicit sign-in action. Search directives are not authentication: every edit is separately authorized on the server.

The exact existing server owner allowlist is reused, with the same signed HttpOnly session and CSRF token under /api/booking. No new account, credential, scope, billing or browser storage of authentication data is introduced. Existing booking agreed prices, receipts, availability and Calendar events are unaffected.

## Persistence and public updates

Apply migrations/0009-site-prices.sql to the existing BOOKING_DB binding before release. It creates only site_prices, a single JSON catalog row with revision and updated_at. No booking table changes. Before the first owner save, the read API returns the owner-supplied source defaults with revision zero. Price changes persist across deployments.

GET /api/prices exposes only prices, revision and timestamp; its Cloudflare Cache API key ignores query strings and expires after 60 seconds. The native public controller fetches when the price guide approaches the viewport. It updates every menu rate, kit/glue amount and calculator from one snapshot. Static HTML remains a useful fallback; if the API fails, visible copy explains that the latest prices could not be checked and offers retry/WhatsApp confirmation. No full-page reload or framework hydration is needed.

GET /api/booking/prices reads the uncached catalog after owner verification. POST requires the real signed owner session, same origin and session CSRF. JSON is bounded to 8 KiB and restricted to the known catalog shape, whole nonnegative rupiah amounts up to Rp10,000,000, and non-inverted ranges. An atomic SQLite compare-and-swap rejects stale revisions with 409. No partial saves or price labels from untrusted input are rendered. A missing/corrupt catalog fails closed. Errors never expose private identities, credentials or database details.

The editor retains entered values after network/service errors. An uncertain save checks the stored catalog before retrying, and a conflict requires explicitly reloading stored prices (discarding the form draft). Unsaved edits warn before navigation. Drafts are kept only in the current page, not persisted on shared devices.

## Verification

524 Node tests passed, including seven new calculator, strict catalog, actual SQLite atomic save/conflict, real signed-owner/CSRF/unauthorized-account and sanitized error cases. Production build and Pages Functions compilation passed. Desktop and 390px mobile browser checks showed native 48px controls and no horizontal overflow in the editor/calculator. A localhost synthetic fixture intentionally failed the first save: the edited kit price remained, retry saved it, and a fresh public page showed the changed kit/estimate. This fixture does not establish a real Google login or authenticated production save.

A real authenticated production price change is intentionally not used as a test, to avoid temporarily changing customer prices. Release verification checks the real public read, unauthenticated private API rejection and search headers. Jessica can make her first intended price edit using /prices.

## Production release — 23 October 2026

Source eaeb15c deployed successfully in 44 seconds at https://b70ce3f2.chiinails.pages.dev. The Cloudflare dashboard applied the isolated table migration successfully (0.60ms SQL). CLI import access was unavailable; the existing authorized dashboard session was used without changing credentials or permissions. The production public API returned the default 21 menu rates, kit Rp22,000 and glue Rp13,000 in 895 bytes; the existing real owner session opened all 21 editable rates. Anonymous private reads returned 401. /prices returned both noindex/nofollow directives and no-store, and remained outside the production sitemap. Cat Eye totals Rp62,000 / Rp75,000 with glue and Ombré with glue Rp85,000–90,000 were observed live. No production price was changed during verification. [Release proof](evidence/pricing/release.json), [HTTP checks](evidence/pricing/production-read-check.json).
