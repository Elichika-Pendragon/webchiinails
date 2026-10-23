# Instagram operation

Current architecture, reviewed **23 October 2026**. The active gallery does not need a Meta developer token, Instagram login or third-party feed subscription. The retained official-API adapter is a separate legacy option, not a prerequisite. [Meta roadblocks](docs/META-ROADBLOCKS.md) explains why this changed.

## Hourly link archive

`workers/instagram-links.js` runs as `chii-instagram-links` with the bindings and cron in `workers/instagram-links.wrangler.jsonc`. Cloudflare Browser Rendering (`BROWSER`) anonymously reads Jessica's public profile. Discovery parses a bounded set of public post/Reel links, deduplicates IDs, and merges links into the public-links-only `INSTAGRAM_LINKS` KV namespace.

The cron is `17 * * * *`, hourly at minute 17. `INSTAGRAM_SCRAPING_ENABLED=true` is a collector setting, not a browser flag. Runs deduplicate by scheduled UTC hour, with bounded attempts and Browser Rendering admission. Do not turn visitor requests into scraper triggers or retry repeatedly when Instagram blocks discovery. The fixed budget is an application safeguard, not proof of available account quota.

KV keys are `archive-v1` (saved archive) and `refresh-v1` (refresh state). A successful cron delivery alone does not prove discovery updated the archive. Check the scheduled outcome, `instagram_archive_refresh` log and an actual advance of `lastSuccessAt`. Zero added links is valid when there is no new post. Discovery order/time is not a guaranteed publication timestamp. Failure retains the last good archive rather than blanking the gallery.

The natural 06:17 WIB run on 23 October advanced success state with 279 links and zero additions; see [hourly verification](docs/instagram-hourly-verification-2026-10-23.md). That observation does not guarantee every future run or new-post discovery.

## Visitor gallery

`/api/instagram-archive` exposes saved public permalinks only, with a 60-second browser / five-minute shared cache and a source bootstrap fallback. The native swipeable row selects three recent posts plus nine distinct random older posts per visit. Fetching/rendering is deferred until the section approaches the viewport; actual embeds are loaded only as needed. It does not run a five-minute browser polling loop or fetch the entire archive's media on page opening.

Instagram serves the actual embed and may block, delay or remove it independently of our site. Retain the link/fallback and avoid turning an iframe timeout into a claim that the post was deleted. [Embed investigation](docs/instagram-embed-fix-2026-10-23.md) records the browser-specific issue and the user's successful independent check.

## Monthly photo collection is separate

[Monthly photos](docs/monthly-photos.md) uses the saved links to import ten actual still photos, five recent and five random older, once per month. It excludes Reel covers/video, optimizes responsive WebP assets and caps the shared pool at 50 including the original six. The Meet Chii photo stays fixed. This is a GitHub Actions build-time operation, not the hourly collector or Instagram iframe media cache.

## Legacy path and recovery

`server/instagram-feed.js`, `server/instagram-tokens.js`, `workers/instagram-refresh.js`, `workers/wrangler.jsonc` and `scripts/seed-instagram-token.mjs` retain the earlier official API/token-renewal implementation. `pnpm build:worker` and `pnpm seed:instagram` belong to that path. Do not deploy its placeholder config or seed tokens to repair the active public-link collector.

If discovery is stale, check the collector logs, Browser Rendering usage and KV state without changing the archive to manufacture a success. Preserve the existing good links. If monthly imports fail, preserve existing images and inspect the Actions failure; same-month completed refreshes are no-ops. No account cookies, session extraction, access-control bypass or billing activation is part of this design. Public availability and Instagram's policies can change; this route has no reliability guarantee.
