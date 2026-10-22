# Instagram production release - 23 October 2026

Production: https://chiinails.pages.dev/

App commit: 55b5f9f7c4880a5c942b064657ee7460f8784bc8
Pages deployment: 5fe0943a-16d0-45cd-83bb-6d10fa066c54
Collector version: 2d39bf4d-47c2-4234-a569-31851737cf97

## Delivered

- Separate public-links-only KV archive, seeded with 279 unique accessible Instagram post/reel URLs.
- Private collector enabled hourly at minute 17. No Instagram credentials, booking database, or receipt bindings.
- Existing swipeable row selects 3 recent non-pinned posts and 9 random archive posts per document. Archive request and Instagram embeds wait until the row enters the viewport; only visible/adjacent cards activate.
- All visible opening mosaic tiles shuffle on each page load, then retain the existing slow automatic fades. Mobile hidden panels retain lazy loading. Random selection can naturally repeat an image between visits.
- Confirmed live /book and /book/approve noindex, nofollow metadata and exclusion from sitemap. No Search Console changes made.

## Verification

510 tests passed; production build passed. Browser JavaScript totals 29,210 gzip bytes without a React client runtime. Exact Pages Wrangler 3.114.17 bundling was checked after replacing unsupported JSON import attributes with a synchronized bootstrap module. The archive route was added to _routes.json and verified live: GET 200 / POST 405, 279 saved links, public fields only. Booking status remains enabled.

Browser checks at 320px and 390px found no page overflow. Navigation targets are 44px; horizontal gallery controls move the row. Before gallery visibility there were zero Instagram scripts/frames. After scrolling, selection expanded to 12 posts. Desktop production photo arrangements differed across reload. A screenshot captured a normal fade transition, so a DOM snapshot can contain the outgoing and incoming image together.

Cloudflare Free plan confirmed in the dashboard. Before release: 7/3000 monthly build minutes; 9 Browser Run Quick Actions in the displayed month-to-date range; browser hours rounded to zero. This is not an exact daily remaining-browser-time measurement. Hourly execution is estimated at 72 KV writes/day and measured prototype browser time implies approximately 31-85 browser seconds/day, below 1000 writes and 600 shared browser seconds/day. A conservative admission estimate reserves up to 360 seconds/day; this is not a hard execution timeout or distributed lock. No billing enabled.

## Practical limits

The initial remote test-scheduled integration succeeded and updated production public-link KV. Natural cron delivery and discovery of a genuinely new post have not yet been observed. The profile displayed 280 posts but 279 unique accessible URLs were collected; that discrepancy remains unresolved.

Native Instagram frames remained blank during the final Chrome test, including an isolated direct public iframe. The gallery successfully switched to photo previews and direct post links. This release does not establish that Meta embeds render in every browser or that anonymous future scraping will remain available indefinitely. Viewport checks do not substitute for physical older Android/carrier testing.

Evidence: docs/evidence/instagram-release/. No customer bookings were created or accepted during this release check. Google indexing remains deferred at the user's request.
