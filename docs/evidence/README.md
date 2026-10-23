# Release evidence — 20 October 2026

- `final-pagespeed-results.json`: five route reports before the final map loading-hint/booking-note contrast changes. About's newer result is separate.
- `about-postfix-pagespeed.json`: About remeasurement after the final contrast correction, code release `664fb6e`.
- `navigation-checks.json`: 25 Chrome page-to-page combinations; Back/Forward and other controls were also checked interactively.
- `local-stress-result.json`: 500 requests against the local static server, concurrency 20. These are response durations, not internet page loading times.
- `live-verification.json`: live routes, public SEO files, expected sanitized unconfigured API response, 404 and exact first-party bundle checksum.

See [PERFORMANCE.md](../../PERFORMANCE.md) for report links, tested versions, lab settings and limitations. No Meta token or private account data is included.

## Later verification

- [23 October final audit and booking restore proof](final-check-2026-10-23/README.md). Includes provenance, before/after measurements and a SHA-256 manifest.
