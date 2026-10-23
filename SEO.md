# Search and sitemap operation

Reviewed **23 October 2026**. Canonical site: https://chiinails.pages.dev/. Preserve `public/googlefe4df279dce4c32d.html` unchanged: this public verification file supports the existing Google Search Console URL-prefix property. A pages.dev subdomain does not give us control of Cloudflare's parent-domain DNS TXT records.

## Automatic source behavior

Astro emits full page content with unique titles/descriptions, canonical URLs, language `id`, local business/WebSite structured data and optimized images. The public pages are `/`, `/services`, `/custom-sets`, `/about`, `/visit`. `scripts/seo.mjs` defines the page list and origin rules; `scripts/postbuild.mjs` generates `sitemap.xml` and `robots.txt` during each production build.

Production needs `SITE_URL=https://chiinails.pages.dev`, `SEO_PRODUCTION_BRANCH=main`, `SEO_INDEXABLE=true`. Missing origin/non-production builds remain noindex and omit the sitemap. Adding photos or Instagram links does not create extra sitemap pages. A new public route must be added deliberately to the SEO configuration.

`/book`, `/book/approve` and `/prices` have noindex directives and are excluded from the sitemap. Approval/prices also have private response/header controls in `public/_headers`. Do not mistake noindex for authentication: owner API checks remain mandatory. `robots.txt` allows crawling public pages and disallows `/api/`; do not block private-page crawling as a substitute for letting Google see their noindex directives.

## Submission versus indexing

The sitemap URL is https://chiinails.pages.dev/sitemap.xml. In the existing URL-prefix property's field that already displays the origin, enter only `sitemap.xml`. Submission is a hint; successful submission, successful fetch and actual indexing are three separate outcomes. Google may revisit a known sitemap and pages automatically. Manual Request indexing is optional, quota-limited and does not guarantee indexing or ranking. Do not repeat it after a quota error or bypass challenges.

Latest recorded check on 23 October: the public sitemap returned valid XML with five URLs, while Search Console still reported it could not read the sitemap, with last read 21 October and zero discovered pages. A homepage indexing request had hit the daily quota; an earlier inspection showed the homepage was already indexed with an older crawl. These are dated observations, not a claim of successful sitemap processing. Google Console retries were stopped at the owner's instruction; this documentation refresh does not restart them.

For any future owner-requested check, confirm the actual signed-in owner account in the UI, inspect the existing property, and record Google's response. A local HTTP 200 or Googlebot User-Agent probe does not prove a real Google crawler fetched it. Do not delete a verified property, replace credentials or repeatedly resubmit merely to clear a warning.

## Known source follow-up

The `/custom-sets` description in `scripts/seo.mjs` still contains the earlier Rp25,000–155,000 press-on range. The calculator now uses the approved additive menu/kit formula, and owner price edits do not regenerate static metadata. Treat that description as a remaining copy mismatch to review in a separate site change; this documentation update does not silently alter runtime/SEO source.

## Why the result may still say Cloudflare

The favicon and the search result's site name are separate signals. The code supplies the Chii Nails name/alternate name and consistent metadata, but Google chooses and refreshes the displayed site name. Hosting under pages.dev can leave Cloudflare associated with the result. Correct metadata and re-crawling are not a guarantee or an instant rename. Do not promise first place for Nail Art Palembang or its variants; keep service/location content useful and business details consistent.

References for future checks: [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [recrawl requests](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl), [site names](https://developers.google.com/search/docs/appearance/site-names). Dated implementation/evidence reports are indexed in [docs](docs/README.md).
