# Release checkpoint - 23 October 2026

The site source through `1543b21` is pushed to the existing private GitHub repository
and verified live on https://chiinails.pages.dev/. This checkpoint packages the
remaining final-audit evidence; it does not change application behavior.

## Latest delivered work

- Combined-service calculator and shared owner-editable prices: `d3ace81` and
  `eaeb15c`. See [pricing](pricing.md).
- Gallery duplicate removed while the approved Meet Chii photo remains fixed:
  `2e9d852` and `9d1bb21`.
- Booking restore layout stabilized: `1543b21`. Calendar, receipt preview and
  routine status rows reserve their space before recovery completes. No added JS.
- Monthly photo workflow: first failed run was a test-fixture portability issue,
  corrected in `fdb0611`; the replacement hosted run succeeded at 06:23 WIB.
  See [monthly release proof](monthly-photos-release-2026-10-23.md) and
  [the successful GitHub run](https://github.com/Elichika-Pendragon/webchiinails/actions/runs/39871506806).

## Final validation

- 527 application regressions and 11 monthly-photo tests passed. The 527-test suite
  was rerun after the booking markup change; the final CSS build guards also passed.
- Eight live routes and 42 initially referenced assets returned HTTP 200.
- Controlled live burst: 100/100 success, at most five clients, p95 73.9 ms.
- Heavier localhost-only burst: 500/500 success with 20 clients, p95 33.3 ms.
- Simulated 400 kbps mobile homepage: first paint 0.796s, main photo 2.364s;
  not a physical-phone or carrier measurement. Fresh PageSpeed was quota-blocked.
- Saved fields and prepared receipt survived a local API outage/reload; Book stayed
  blocked until reconnection and fresh availability. No real booking was submitted.
- Final restore comparison: Book button moved 0px between parsed and restored
  states at 1280px, 390px and 320px requested widths. Removing the receipt also
  retained that position and correctly blocked Book.
- Live Book HTML contains the final reserved-layout markers and noindex/nofollow.
  Production phone check confirms 296px preview frame and no horizontal overflow.
- Browser JS remains 101,201 bytes raw / 36,476 bytes gzip across all routes.

Full results and capture provenance: [final evidence index](evidence/final-check-2026-10-23/README.md).
The older [full audit](evidence/final-check-2026-10-23/Chii-final-performance-and-feature-check.md)
is retained as a pre-fix snapshot; its restore-layout issue is resolved above.

## Repository and operating boundaries

Source, assets, Worker code/configuration, migrations, lockfile, workflow, tests and
setup documentation are tracked. Existing credentials and Cloudflare/Google account
bindings remain in their configured systems; use `.env.example` and deployment
documentation for setup. Do not put production secrets or customer receipts in Git.

The first monthly verification was manual; a future natural monthly delivery is
not claimed here. The hourly scraper's natural-run proof is recorded separately in
[its verification](instagram-hourly-verification-2026-10-23.md). No workflow rerun
or new photo pull was needed for packaging. Search Console indexing remains on
hold at the user's request. Temporary test tabs/servers were closed and synthetic
drafts cleared after verification.
