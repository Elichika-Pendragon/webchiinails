# Performance and browser checks — 20 October 2026

The target is under one second per route on desktop and mobile. FCP is first contentful paint; LCP is largest contentful paint. Asset bytes, local response time, FCP, LCP and complete third-party media loading measure different things. There is no universal sub-second claim.

## Before and after

| Measurement | React baseline | Astro release | Result |
| --- | ---: | ---: | --- |
| First-party browser JavaScript, gzip | 79,009 B | 4,737 B | 94.0% smaller |
| Self-hosted WOFF2 fonts | 60,244 B | 42,088 B | 30.1% smaller |
| Eight corresponding WebP vs old JPEG photos | 1,478,285 B | 448,174 B | 69.7% smaller |
| Home mobile FCP / LCP | 1.2 s / 2.0 s | 0.9 s / 1.4 s | Faster in these lab samples |
| Home desktop FCP / LCP | 0.3 s / 0.4 s | 0.3 s / 0.4 s | Remains below one second |

The mobile baseline is e3a9bf6 ([report](https://pagespeed.web.dev/analysis/https-chiinails-pages-dev/ejn45sudic?form_factor=mobile)). Its score was 99. The desktop baseline is the earlier 48f3300 ([report](https://pagespeed.web.dev/analysis/https-chiinails-pages-dev/0rddj7y3jw?form_factor=desktop)); desktop score was 100. That earlier release measured mobile 1.2/1.8 seconds, so the newer 2.0-second sample is not the only historical measurement. Lab variance and different release snapshots limit causal comparisons.

## All five Astro routes

Chrome Lighthouse 13.5.0, HeadlessChromium 153.0.8010.36. Mobile: emulated Moto G Power, slow 4G, initial load. Desktop: emulated desktop, custom Lighthouse throttling, initial load. All reports say No Data for real-user field measurements. Captured around 00:49 WIB, 20 October 2026, against 0fca81d.

| Route and report | Mobile FCP / LCP | Desktop FCP / LCP | Performance mobile / desktop | SEO mobile / desktop |
| --- | --- | --- | --- | --- |
| [/](https://pagespeed.web.dev/analysis/https-chiinails-pages-dev/iou4ajqzi0?form_factor=desktop) | 0.9 s / 1.4 s | 0.3 s / 0.4 s | 100 / 100 | 100 / 100 |
| [/services](https://pagespeed.web.dev/analysis/https-chiinails-pages-dev-services/malwq9vqxr?form_factor=desktop) | 0.9 s / 1.2 s | 0.3 s / 0.3 s | 100 / 100 | 100 / 100 |
| [/custom-sets](https://pagespeed.web.dev/analysis/https-chiinails-pages-dev-custom-sets/g0cqotrqtb?form_factor=desktop) | 0.9 s / 1.7 s | 0.2 s / 0.4 s | 100 / 100 | 100 / 100 |
| [/visit](https://pagespeed.web.dev/analysis/https-chiinails-pages-dev-visit/7uznyoe276?form_factor=desktop) | 0.9 s / 1.2 s | 0.3 s / 0.4 s | 100 / 100 | 100 / 100 |
| [/about](https://pagespeed.web.dev/analysis/https-chiinails-pages-dev-about/rysb5a83le?form_factor=desktop) | 0.9 s / 1.2 s | 0.2 s / 0.3 s | 100 / 100 | 100 / 100 |

Every measured first paint is below one second. Every desktop LCP is below one second. Mobile LCP remains 1.2–1.7 seconds, so the strict mobile LCP target is not met. Scores of 100 do not change that fact. Complete Maps/Instagram rendering needs additional third-party requests and is not promised within one second.

Accessibility measured 100 on Home, Services, Custom Sets and Visit. About measured 95 because its small booking-note eyebrow had insufficient contrast; that specific color was corrected afterward, and its post-fix score must be reported separately. Best Practices measured 100 on Services/About and 96 on Home/Custom Sets/Visit; read the reports rather than treating all categories as perfect. Unconfigured Instagram and external media can generate console failures. No ranking or accessibility certification follows from a Lighthouse score.

The final controller is 11,723 bytes raw / 4,737 gzip, one file with no React hydration. The recorded five-route reports precede the one-byte map-loading-hint correction and About color correction. Those later checks are documented separately instead of relabeling an old report as a new measurement.

## How transfer and startup work

React renders HTML only at build time. Fonts are self-hosted and subset with verified glyph coverage; the variable weight range is limited to the weights already used. Small rounding differences are documented in [FONT-OPTIMIZATION.md](docs/FONT-OPTIMIZATION.md). CSS is inline. The leading French photo has AVIF plus a WebP failure fallback. The first Custom Sets preview is prioritized; other gallery previews are lazy. Fixed frames keep incoming Instagram images cropped to the intended layout.

Maps waits until the core page has loaded and idle work can run, then initializes automatically when the visible section approaches the viewport. Hidden mobile/desktop duplicates do not load. Once selected by this controller, the iframe starts eagerly so the browser does not defer the same map twice. The mobile Home contains location, hours/cutoffs and Maps. Google failures retain direct place links. Instagram embed.js activates only near a visible gallery; fallback photographs/direct post links remain available.

## Stress and UI checks

All 28 Node tests pass, including 12 actual-controller regressions with bounded DOM/event adapters. See [STRESS-TEST.md](docs/STRESS-TEST.md) for scope and limits. The audit found and fixed the AVIF transport-failure fallback. Map tests cover load/idle sequencing, hidden sections, automatic/manual races, fallback cleanup and observer/idle fallbacks.

20 concurrent local clients made 500 requests across the five built HTML routes. All 500 passed; median response was 8.7 ms and p95 was 22 ms on this machine. This is a local static-server check, not internet capacity or browser load time. High-volume traffic was not sent to the public Free-tier site.

Chrome browser checks covered 320px and 390px mobile, 1280px desktop, all 21 price rows, readable hours, native rules, chat/menu/Escape/focus, slider controls, safe API captions and image updates. All 25 page-to-page combinations plus Back/Forward returns passed with correct active tabs, one H1 and no mobile overflow. The live automatic map was observed rendering the actual salon without a click after the deferred-frame hint was corrected.

## Safari

No Apple device or Safari browser is connected, so real iPhone/iPad/Mac timing and visual behavior remain unverified. Compatibility review uses official WebKit documentation. The implementation keeps AVIF/WebP fallback, WOFF2/system fonts, 100vh before 100dvh, observer feature checks, native overflow/arrow controls and reduced-motion support.

- [Safari 16.4 AVIF and picture fixes](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/)
- [Dynamic viewport units](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/)
- [WOFF2](https://webkit.org/blog/6643/improved-font-loading/)
- [IntersectionObserver](https://webkit.org/blog/8718/new-webkit-features-in-safari-12-1/)
- [ResizeObserver](https://webkit.org/blog/10247/new-webkit-features-in-safari-13-1/)

Actual successful Instagram embeds/API renewal still require Meta authorization and live configuration; iframe creation alone is not proof of successful cross-origin rendering.
