# Chii Nails decisions and acceptance checklist

This is the consolidated record of the website conversation. Owner corrections take precedence over earlier screenshots or copy.

| Area | Agreed requirement and state |
| --- | --- |
| Brand | White/blush/rose theme, Cormorant Garamond headings and DM Sans copy; English headlines with clear Indonesian practical details. Preserve fixed image frames and object-fit cropping. |
| Booking | Booking only; no walk-ins. DP required, amount confirmed through WhatsApp. Cancellation forfeits DP. No home service or rescheduling. Late fee Rp10.000 per 10 minutes. No customer database/payment gateway introduced. |
| Hours | Mon–Fri 08.00–17.00, last booking 15.00. Sat–Sun 08.00–12.00, last booking 10.00. WIB. Opening hours and booking cutoffs remain distinct in visible text and schema. |
| Services | Custom nail art, extensions, basic manicure/vitamin oil, custom press-on shipping across Indonesia. No invented medical treatment claims. |
| Prices | All 21 nail-art/cat-eye/extras/removal rows transcribed from owner screenshots. Finished press-on total Rp25.000–155.000. Rp22.000 base kit plus chosen design, example Cat Eye total Rp62.000; optional MXBON glue Rp13.000. Confirm final quote/shipping via WhatsApp. |
| Mobile | Compact Home with five page tabs and three destination cards; Services, Custom Sets & Prices, Visit, About use separate URLs. Later owner correction adds location/address/hours and automatic interactive Maps below the mobile Home summary. |
| Desktop | Keep scrolling Home sections, with the same dedicated detail URLs available. Existing studio photo uses the cleaned image without the cursor. |
| Maps | Exact salon CID 13060782932404739183 and coordinates -2.9707861,104.7923294. Direct place/directions links, no Google Search destination. Interactive iframe initializes automatically after the page is ready and the visible map section approaches the viewport. No required click; direct link remains if Google is unavailable. |
| Social | Actual local WhatsApp and Instagram SVG logos; floating contact popup, Escape/outside close/focus handling. Contact clicks do not automatically send messages. Current bio WhatsApp is 6285111028211; an older listing differed, so the owner should confirm the contact if changing it. |
| Instagram | No LightWidget or scraping. Official API backend prepared, private encrypted KV token storage, separate daily renewal Worker targeting roughly 30-day refresh, one initial/five-minute visible feed poll shared by hero/gallery. Local photos/direct post links survive API/embed failures. Genuine embed.js is lazy and separate from preview thumbnails. Meta developer access/SMS issue remains deferred by owner. No live token/KV/cron activation is claimed. |
| Framework | Astro static rendering; React presentation only runs at build time. Native browser controller, no React hydration. No Cloudflare Astro adapter for this static Pages deployment. Existing Pages Function remains. |
| Motion | Small CSS-only transform/hover animations, no animation library. Reduced-motion support. |
| Performance | Under one second is the target for each route on desktop/mobile. Measure FCP and LCP independently, document lab conditions and actual misses. Compare React baseline with final Astro results. Never translate a JavaScript reduction directly into a claimed load-time improvement. |
| Browser QA | Chrome mobile/desktop layouts and round-trip combinations; Safari capability review from primary WebKit sources. No Apple device available, so real Safari rendering/timing is unverified. |
| SEO | Natural Palembang service/location copy targeting relevant nail-art, salon, and nail-treatment searches; unique metadata, one H1, static HTML/schema, canonical URLs, five-URL sitemap, production indexability and preview noindex guards, real 404. No ranking guarantee. |
| Google state | URL-prefix Search Console ownership verified by googlefe4df279dce4c32d.html; retain it. Previously submitted sitemap had a Google fetch warning; index/live-test quota was exhausted. Public files validate, but Google indexing is not confirmed by this release. Owner reports Business Profile website updated. No quota bypass/retry performed. |
| Hosting/cost | Existing private GitHub repository and chiinails.pages.dev, Pages Free. Existing old-domain 301 retained. No paid plan, R2 subscription, custom-domain purchase, or billing activation. EmDash explicitly cancelled after its image-storage billing requirement was checked. |
| Design handoff | Update editable Figma desktop/mobile price guide, separate mobile screens and routes, clean studio photo, correct Maps loading state. Preserve design tokens and accurate policies. Final Figma limitations/proofs must be reported honestly. |
| Safety/rollback | Keep operational docs, React folder, pre-Astro ZIP, and archive/react-before-astro branch. No secrets in Git, client code, reports or screenshots. Existing authorization/renewal code preserved and tested, with Meta activation still pending. |

Validation evidence and timing results live in [PERFORMANCE.md](PERFORMANCE.md), [docs/STRESS-TEST.md](docs/STRESS-TEST.md), and [MIGRATION-ASTRO.md](MIGRATION-ASTRO.md). The final release record identifies the actual deployed commit and remaining account-dependent work.
