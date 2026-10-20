# Performance and browser checks — 20 October 2026

The target is under one second per route on desktop and mobile. FCP is first contentful paint; LCP is largest contentful paint. Asset bytes, local response time, FCP, LCP and complete third-party media loading measure different things. There is no universal sub-second claim.

## Before and after

| Measurement | React baseline | Astro release | Result |
| --- | ---: | ---: | --- |
| First-party browser JavaScript, gzip | 79,009 B | 4,806 B | 93.9% smaller |
| Self-hosted WOFF2 fonts | 60,244 B | 42,088 B | 30.1% smaller |
| Eight corresponding WebP vs old JPEG photos | 1,478,285 B | 448,174 B | 69.7% smaller |
| Home mobile FCP / LCP | 1.2 s / 2.0 s | 0.9 s / 1.4 s | Faster in these lab samples |
| Home desktop FCP / LCP | 0.3 s / 0.4 s | 0.3 s / 0.4 s | Remains below one second |

The mobile baseline is e3a9bf6 ([report](https://pagespeed.web.dev/analysis/https-chiinails-pages-dev/ejn45sudic?form_factor=mobile)). Its score was 99. The desktop baseline is the earlier 48f3300 ([report](https://pagespeed.web.dev/analysis/https-chiinails-pages-dev/0rddj7y3jw?form_factor=desktop)); desktop score was 100. That earlier release measured mobile 1.2/1.8 seconds, so the newer 2.0-second sample is not the only historical measurement. Lab variance and different release snapshots limit causal comparisons.

## All five Astro routes

Chrome Lighthouse 13.5.0, HeadlessChromium 153.0.8010.36. Mobile: emulated Moto G Power, slow 4G, initial load. Desktop: emulated desktop, custom Lighthouse throttling, initial load. All reports say No Data for real-user field measurements. Four reports were captured around 00:49 WIB against 0fca81d; About was rechecked around 01:00 WIB after its contrast correction in 664fb6e, on 20 October 2026.

| Route and report | Mobile FCP / LCP | Desktop FCP / LCP | Performance mobile / desktop | SEO mobile / desktop |
| --- | --- | --- | --- | --- |
| [/](https://pagespeed.web.dev/analysis/https-chiinails-pages-dev/iou4ajqzi0?form_factor=desktop) | 0.9 s / 1.4 s | 0.3 s / 0.4 s | 100 / 100 | 100 / 100 |
| [/services](https://pagespeed.web.dev/analysis/https-chiinails-pages-dev-services/malwq9vqxr?form_factor=desktop) | 0.9 s / 1.2 s | 0.3 s / 0.3 s | 100 / 100 | 100 / 100 |
| [/custom-sets](https://pagespeed.web.dev/analysis/https-chiinails-pages-dev-custom-sets/g0cqotrqtb?form_factor=desktop) | 0.9 s / 1.7 s | 0.2 s / 0.4 s | 100 / 100 | 100 / 100 |
| [/visit](https://pagespeed.web.dev/analysis/https-chiinails-pages-dev-visit/7uznyoe276?form_factor=desktop) | 0.9 s / 1.2 s | 0.3 s / 0.4 s | 100 / 100 | 100 / 100 |
| [/about](https://pagespeed.web.dev/analysis/https-chiinails-pages-dev-about/des3wmxtpx?form_factor=desktop) | 0.8 s / 1.4 s | 0.3 s / 0.3 s | 100 / 100 | 100 / 100 |

Every measured first paint is below one second. Every desktop LCP is below one second. Mobile LCP remains 1.2–1.7 seconds, so the strict mobile LCP target is not met. Scores of 100 do not change that fact. Complete Maps/Instagram rendering needs additional third-party requests and is not promised within one second.

The latest accessibility measurements are 100 on all five routes. About originally measured 95 because its small booking-note eyebrow had insufficient contrast; after correction its new report measured 100, with mobile FCP/LCP 0.8/1.4 seconds versus 0.9/1.2 seconds in the older sample. Both samples are retained to show normal timing variance. Best Practices measured 100 on Services/About and 96 on Home/Custom Sets/Visit; read the reports rather than treating all categories as perfect. Unconfigured Instagram and external media can generate console failures. No ranking or accessibility certification follows from a Lighthouse score.

That earlier controller is 11,829 bytes raw / 4,806 gzip, one file with no React hydration. Four reports precede the first map-loading-hint correction; About uses its later contrast remeasurement. All five Lighthouse reports precede the final loading-cover fix in 164954e; that fix was checked with tests, live bundle verification and an owner desktop check, not relabeled as a fresh Lighthouse measurement. Source snapshots are retained instead of relabeling an old report as a new measurement.

## How transfer and startup work

React renders HTML only at build time. Fonts are self-hosted and subset with verified glyph coverage; the variable weight range is limited to the weights already used. Small rounding differences are documented in [FONT-OPTIMIZATION.md](docs/FONT-OPTIMIZATION.md). CSS is inline. The leading French photo has AVIF plus a WebP failure fallback. The first Custom Sets preview is prioritized; other gallery previews are lazy. Fixed frames keep incoming Instagram images cropped to the intended layout.

Maps waits until the core page has loaded and idle work can run, then initializes automatically when the visible section approaches the viewport. Hidden mobile/desktop duplicates do not load. Once selected by this controller, the iframe starts eagerly so the browser does not defer the same map twice. The mobile Home contains location, hours/cutoffs and Maps. Google failures retain direct place links. Instagram embed.js activates only near a visible gallery; fallback photographs/direct post links remain available.

## Stress and UI checks

All 28 Node tests pass, including 12 actual-controller regressions with bounded DOM/event adapters. See [STRESS-TEST.md](docs/STRESS-TEST.md) for scope and limits. The audit found and fixed the AVIF transport-failure fallback. Map tests cover load/idle sequencing, hidden sections, automatic/manual races, fallback cleanup and observer/idle fallbacks.

20 concurrent local clients made 500 requests across the five built HTML routes. All 500 passed; median response was 8.7 ms and p95 was 22 ms on this machine. This is a local static-server check, not internet capacity or browser load time. High-volume traffic was not sent to the public Free-tier site.

Chrome browser checks covered 320px and 390px mobile, 768px tablet and 1280px desktop, all 21 price rows, readable hours, native rules, chat/menu/Escape/focus, slider controls, safe API captions and image updates. All 25 page-to-page combinations plus Back/Forward returns passed with correct active tabs, one H1 and no mobile overflow. The live mobile Home map was observed rendering the actual salon without a click after the deferred-frame hint was corrected. A final desktop test exposed an opaque loading cover waiting for Google's full iframe load event. Release 164954e removes the cover immediately on mount and keeps any loading/slow notice below the map. The same official salon embed was refreshed from Google Maps Share. All 28 tests pass, including exposed-frame/late-load checks. The connected desktop test also failed to render a bare static iframe, while Google's same-origin embed preview rendered; no browser privacy setting was changed. The owner then refreshed the live Visit page and explicitly confirmed that the map displays in desktop Chrome. This owner confirmation is distinct from an independently captured desktop rendering proof.

## Safari

No Apple device or Safari browser is connected, so real iPhone/iPad/Mac timing and visual behavior remain unverified. Compatibility review uses official WebKit documentation. The implementation keeps AVIF/WebP fallback, WOFF2/system fonts, 100vh before 100dvh, observer feature checks, native overflow/arrow controls and reduced-motion support.

- [Safari 16.4 AVIF and picture fixes](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/)
- [Dynamic viewport units](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/)
- [WOFF2](https://webkit.org/blog/6643/improved-font-loading/)
- [IntersectionObserver](https://webkit.org/blog/8718/new-webkit-features-in-safari-12-1/)
- [ResizeObserver](https://webkit.org/blog/10247/new-webkit-features-in-safari-13-1/)

Actual successful Instagram embeds/API renewal still require Meta authorization and live configuration; iframe creation alone is not proof of successful cross-origin rendering.

## Lightweight UI refinement — 20 October 2026, 17:47–17:49 WIB

Release `cc912de542356b26146d912e23457967b897ddc9` adds shared corner radii and touch/keyboard refinements without a new image, font, library or network request. Static Astro still ships no React hydration. Browser JS grows from 11,829 / 4,806 gzip bytes to 12,126 / 4,879 gzip bytes. Inline CSS grows from 23,421 / 5,461 gzip bytes to 26,091 / 5,920 gzip bytes. Together the compressed CSS/JS delta is **532 bytes**. Gzip is a deterministic comparison; Cloudflare may use different transfer compression.

The public five-route build, CSS and JS bytes, sitemap, robots and ownership file were verified after deployment. The UI checks pass 30 local combinations and 15 public combinations, including 320px mobile targets, short viewport chat, disclosures, menu/chat/Escape/focus and reduced motion. No new first-party browser exceptions were observed. Noninteractive price-card movement was removed and hover styling is limited to fine hover-capable pointers. Native scrolling and asynchronous near-viewport Maps/Instagram behavior remain.

### Synthetic constrained-4G comparison

Headless Chrome 156.0.8078.12, 390×844 viewport, touch/mobile emulation, **6× CPU slowdown**, 150ms network latency, 1.6Mbps download and 750Kbps upload. Browser cache disabled; three new browser contexts per route, medians below. Third-party requests are blocked to isolate first-party startup; Google/Instagram completion is excluded. This is a scenario for a modest phone, not a physical Android model, an Indonesian carrier measurement or a Lighthouse score. Desktop and tablet layout checks are separate from this mobile timing run.

| Route | Before FCP / LCP | Live refinement FCP / LCP |
| --- | --- | --- |
| `/` | 1.740 / 1.908 s | 0.932 / 1.068 s |
| `/services` | 1.648 / 1.648 s | 0.872 / 0.872 s |
| `/custom-sets` | 1.732 / 1.868 s | 0.956 / 1.236 s |
| `/visit` | 1.424 / 2.528 s | 0.952 / 1.904 s |
| `/about` | 1.672 / 2.436 s | 0.804 / 1.252 s |

Maximum observed CLS is 0 on every route in both batches. Latest first paint is below one second on all five routes; latest LCP is below one second only on Services. **The all-route mobile LCP target remains unmet.**

The timing difference is not a causal speedup claim: the baseline overlapped local build/QA activity, while the follow-up ran after it, and public edge/network/process conditions vary. No percentage improvement is attributed to rounded corners or to the 532-byte change. The new results show a small transfer budget and usable startup in this particular constrained scenario; actual older-phone CPU/GPU, memory pressure, carrier coverage and third-party content can be slower. No Safari/iPhone/iPad/Mac timing is claimed.

Raw data: [before](docs/evidence/ui-polish-performance-before-2026-10-20.json), [after](docs/evidence/ui-polish-performance-after-2026-10-20.json), [before asset sizes](docs/evidence/ui-polish-baseline-assets-2026-10-20.json), [live matching build/SEO](docs/evidence/ui-polish-live-verification-2026-10-20.json). Interaction and visual conventions are preserved in [DESIGN.md](DESIGN.md); Figma remains deferred.
