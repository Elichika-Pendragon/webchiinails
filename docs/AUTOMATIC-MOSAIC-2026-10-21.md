# Automatic mosaic correction — 21 October 2026

The owner reported that the photographs stopped rotating while the manual buttons still worked. Pointer/focus handlers permanently disabled autoplay, hover stopped its timer, reduced motion started paused, and initialization depended on every control node being present.

The mosaic now starts automatically without a counter, Play/Pause or arrow buttons. Hover, focus and pointer input do not change its running state. One visible tile changes at a time on the existing eight-second cadence; all four desktop positions participate. Reduced motion keeps automatic image replacement but skips the opacity fade. Hidden/departed pages stop work and restart on return. Modern browsers pause offscreen through IntersectionObserver at threshold zero; browsers without that API can still rotate on an active visible page.

The redundant contact button beneath the hero is hidden on desktop and retained on mobile. The header contact button and manually scrollable Instagram embeds are preserved. Image sizes, one-upcoming-image loading, decode-before-fade, failure/timeout protection, fixed tile dimensions, duplicate avoidance, and hidden-mobile-tile guards remain intact. SEO metadata and the soft-gray unavailable-calendar treatment are unchanged.

The exact release checkout passes **324/324 tests**, including **21 native-controller regressions** covering control-free rotation, hover/focus/pointer persistence, desktop/mobile sequencing, reduced motion, missing observer support and stale/error handling. The production-origin build and existing asset/privacy/SEO checks pass. Six browser JavaScript files total **65,294 raw / 23,897 gzip bytes**, 240 compressed bytes fewer than the preceding revision. No dependency or new asset was added. These are byte counts, not a real-device speed benchmark.

Code and documentation are published together. The private operator record stores post-publication verification and the resulting deployment, avoiding another documentation-only build. This correction performs no account login, permission change, payment or Calendar write.
