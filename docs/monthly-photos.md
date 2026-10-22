# Monthly studio photo collection

The shared photo pool has a hard limit of 50 images. Jessica's original six have
the same age-out rules as imported photos. A successful month adds ten distinct
still photos: five from the newest eligible, accessible photo posts in the link
archive, followed by five randomized older posts. One photo is selected per post.
Reels, GraphVideo media and video children in mixed carousels are excluded.

The existing hourly Cloudflare link scraper and swipeable native Instagram row
remain separate and unchanged. `scripts/monthly_photos.py` reads their public
archive once, fetches anonymous public embed metadata, verifies the post and
owner, then downloads actual still image bytes. No Meta access token, Instagram
login, customer data, Cloudflare credential or persistent new secret is needed.

Pillow exports 360/720/up-to-1080px WebP files without EXIF, GPS or original source
files. Responsive outputs are capped at 240 KB each; downloads, dimensions,
aspect ratio, redirects, source hosts and probe count are bounded. Source CDN
URLs expire and are never stored in the published catalog. Exact pixel hashes
and a perceptual similarity check reduce duplicate imports; this is not a
guarantee against every crop or edit of a photograph.

The catalog is newest-import-first. Ten verified additions are staged before
the oldest managed variants are removed as needed to stay at 50. The first
crossing from 46 to 56 therefore removes six photos; subsequent full batches
remove ten. Failed discovery or an incomplete batch preserves the old catalog.
The GitHub job tests and builds the full result before committing; any job
failure leaves the last production deployment in place. Concurrent repository
changes cause a normal push failure rather than an overwrite. Same-month runs
are no-ops. Old Git history and previous Pages deployment snapshots are not
purged; the cap applies to the active gallery and current deployment assets.

GitHub Actions runs on the first of each month at 09:43 Asia/Jakarta (02:43 UTC),
with a manual dispatch for initial verification/recovery. Scheduled delivery
can be delayed by GitHub. The job is limited to ten minutes, with no uploaded
Actions artifacts, no paid add-ons, no new Cloudflare runtime processing and
one additional Pages build per successful monthly batch. It uses a temporary
repository-scoped GitHub token with contents-write permission to publish only
the two catalogs and managed image files. Official GitHub actions are pinned.

Only presentation fields enter the browser bundle; retention hashes and source
metadata stay in the private repository. The photo gallery initially exposes
six image sources. Subsequent URLs stay inert until the user reaches the last
visible photo, revealing six more at a time. A keyboard-accessible button is
also available. The existing randomized opening mosaic and automatic eight-
second one-image fade use the same active pool. Offscreen/hidden rotation
pauses. The owner-approved Meet Chii photo is a fixed section asset, outside the
rotating collection. Its gallery entry ages out normally, while its responsive
files remain available for the unchanged About section.

Validation: 11 Python tests cover owner/media filtering, mixed carousels, source
URL restrictions, metadata stripping, no-upscaling, similarity, six-month
retention, same-month deduplication, failed discovery and actual managed-file
removal. Browser controller tests include a 50-photo pool, six-image batches,
fallback controls and offscreen rotation. Desktop/mobile preview checks and
production/automation activation evidence are recorded alongside the release.

Anonymous Instagram embeds can change or become unavailable. If that happens,
the job reports failure and keeps the last complete gallery; unattended refresh
is not guaranteed by Instagram. The photo-only order follows the fresh grid
IDs plus the initial profile archive ordering, not invented publication dates.
