# Performance and browser checks

The goal is under one second per route on desktop and mobile. Asset size, local HTTP response time, first contentful paint (FCP), and largest contentful paint (LCP) measure different things. No universal sub-second claim is made.

## Migration measurements

The preserved React baseline sends about 79,009 bytes of compressed first-party JavaScript. The Astro version renders the same presentation at build time and sends one native controller: 11,100 bytes raw / 4,549 bytes gzip after the AVIF failure fix, about 94% less compressed JavaScript. Fonts, images, HTML, inline CSS, and third-party media are additional.

The eight WebP assets total 448,174 bytes versus 1,478,285 bytes for their older JPEG counterparts. The leading French photo also has a 41,960-byte AVIF with WebP fallback. Fonts are self-hosted, and CSS is inline. Instagram embeds are deferred until a visible gallery approaches the viewport; Maps loads only on request. Reduced-motion preferences disable the small CSS animations.

## Stress and UI checks

20 concurrent local clients made 500 requests across the five built HTML routes. All 500 returned HTTP 200 with one H1 and a canonical; there were no failures. Median response was 8.7 ms and p95 was 22 ms on the local machine. This is a static-server concurrency check, not internet capacity or a browser load-time measurement.

Chrome checks covered 320px and 390px mobile layouts and a 1280px desktop layout, price rows, separate mobile routes, native rule disclosures, repeated chat opening/closing, Escape/focus return, mobile menu, slider controls and position, map loading/fallback links, and a controlled successful API response. The test feed updated the leading hero image and gallery; markup-like captions remained literal text. A broken AVIF fallback was found in review and fixed.

## Earlier live baseline

Before Astro, the 48f3300 homepage scored 100 desktop / 98 mobile in PageSpeed Insights. Desktop FCP/LCP were 0.3/0.4 seconds; slow-4G mobile FCP/LCP were 1.2/1.8 seconds. A later CSS-inline/AVIF run of e3a9bf6 scored 99 mobile but measured 1.2/2.0 seconds FCP/LCP. Scores and timings vary; neither mobile run met the one-second target. These are lab runs with no field data.

Final Astro live route measurements will be recorded below after deployment.

## Safari

No Apple device or Safari browser is connected, so real iPhone/iPad/Mac timing and visual behavior remain unverified. Compatibility review uses official WebKit documentation. The code uses AVIF/WebP picture fallback, WOFF2 fonts with system fallbacks, 100vh before 100dvh, observer feature checks, native overflow scrolling with arrow buttons, and reduced-motion support.

- [Safari 16.4 AVIF and picture fixes](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/)
- [Dynamic viewport units in Safari 15.4](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/)
- [WOFF2 support](https://webkit.org/blog/6643/improved-font-loading/)
- [IntersectionObserver](https://webkit.org/blog/8718/new-webkit-features-in-safari-12-1/)
- [ResizeObserver](https://webkit.org/blog/10247/new-webkit-features-in-safari-13-1/)

Instagram's iframe initialization does not prove successful cross-origin content rendering. Authorized live API, token renewal, and public embedding still require testing after Meta access is available.
