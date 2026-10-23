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

## Combined service calculator — 23 October 2026

The calculator now accepts every one of the 21 listed menu entries together, with a removable itemized estimate. Studio estimates start empty and do not automatically include the press-on kit. Kit and MXBON glue are independent optional additions. A customer can combine nail art + extensions + glitter + removal, or other menu selections. The listed 10-finger design rates are full-menu fees, not automatically prorated or discounted when designs are combined. Every amount continues to come from the same owner-editable price snapshot; no database or authentication changes are required.

Explicit 1-nail services allow quantities 1–10. Fixed 10-nail/10-finger menu entries can appear once. Stickers and 3D accessories allow 1–50 requested extras, with their unit/final amount confirmed by Chii because the supplied menu does not state their unit. Choosing a 1-nail vs 10-nail alternative for the same extension/removal replaces the prior alternative and announces that change, preventing duplicate charges. Other independent services remain combinable. Fractional, empty, negative and excessive quantities cannot produce a new quote or WhatsApp link; the last valid estimate remains labelled while the input is corrected. Ranged prices are multiplied and summed at both ends.

527 Node tests passed, including new combination, quantity, range, editable-price and invalid-alternative cases. Browser checks verified a Rp83,000 quote (polos Rp25,000 + 10-nail extension Rp30,000 + glitter Rp5,000 + 10-nail gel removal Rp23,000), replacing the extension with three individually priced nails (Rp65,000), changing that quantity to four (Rp69,000), rejecting zero, and removing glitter (Rp60,000 after restoring three extensions). The WhatsApp composer URL includes the actual selected line items, quantities and total; no message is sent automatically. Mobile inspection used a 390px viewport with 375px content/scroll width, a proxy rather than a physical-device test. The calculator appears before the optional kit contents on compact screens. No new runtime dependency, external request per calculation, server binding or credential was added.

## Tap-to-build price menu — 23 October 2026

One interactive price list replaces both the static price cards and the separate calculator form. All 21 services are shown once in Nail Art, Cat Eye, Extension, Extras and Removal groups. Checkbox labels make the full row selectable. Choosing a repeatable service reveals 44px minus/plus buttons and its count; no dropdowns or add buttons remain. Fixed services can be selected once. One-kuku/ten-kuku alternatives replace one another. All existing calculation and bounded-quantity rules remain.

Optional base kit/glue are menu choices under For press-on, with kit contents in a native disclosure. A single expandable summary shows the count and total, then selected line items, remove/reset actions and the unsent WhatsApp confirmation URL. The estimate starts empty; the earlier conversation mockup's sample selections are not automatic customer choices. Price rows remain readable in static HTML without JavaScript, with selection disabled and a noscript explanation.

The same 21 stable price IDs, public price snapshot and owner editor are retained. Refresh failure shows a fallback-price warning and retry. A successful retry applies the new catalog to the menu and estimate without resetting selections/quantities. Read [tap-to-build verification](TAP-TO-BUILD-2026-10-23.md) for the observed checks. The earlier separate-category form in [the previous UX report](CALCULATOR-UX-2026-10-23.md) is historical.
