# Astro migration and rollback

Status: Astro is deployed through the existing GitHub main branch and Cloudflare Pages Free. The initial migration was e38433d, deployment a83ed2a5. Later map/font refinements and final measurements are recorded in PERFORMANCE.md and the release report. Date: 20 October 2026, Asia/Jakarta.

EmDash was explicitly cancelled by the owner because R2 onboarding requires a billing relationship. No EmDash/CMS dependency, loader, mapping, account resource, or production setting is included in this migration. Content stays in the committed source, with no added CMS hosting cost.

## Design and delivery

The existing React component tree is rendered to static HTML by Astro without a client directive. Existing classes, copy, prices, fixed photo frames, bilingual headings, studio photo, booking requirements, and responsive styles are retained. The native controller replaces React's runtime event handling. Desktop keeps the scrolling homepage; mobile uses a concise homepage plus four linked detail pages.

Astro 7.4.1 and `@astrojs/react` 7.1.0 are pinned to the exact versions returned by the official npm registry. They require Node >=22.22.0. Both local and Cloudflare production builds use Node 24.19.0 and pnpm 11.25.0. The earlier Cloudflare Node 22.16.0 setting was updated successfully.

React remains a build dependency. No `<astro-island>` or hydration directive appears in page output. Astro's installed React integration emits a renderer asset even when no page hydrates; `scripts/postbuild.mjs` removes it only after checking that no generated page or other browser script references it. Adding an island will fail this guard, protecting against deleting a required runtime.

## Preserved behavior

- Header menu toggles, closes when a link is used, and supports Escape with focus return.
- Floating chat uses the real WhatsApp/Instagram SVG logos, close/outside/Escape handling and focus return.
- Gallery supports native touch scroll, arrows, keyboard, live position count and disabled edge buttons.
- Instagram's standard `embed.js` loads only when a visible gallery approaches the viewport. A hidden desktop gallery on initial mobile home does not activate. Individual cards load near the horizontal viewport and retain local previews/direct links on a 16-second failure.
- Browser feed requests reuse the existing `/api/instagram` endpoint on initial load and every five minutes when visible. An eight-second request timeout preserves fallback or last good content. Data is normalized through `feed-data.js`; remote text uses DOM `textContent`, and URLs are validated before use. Unchanged post IDs/permalinks retain their existing embed DOM across refreshes.
- Four fixed hero frames update from the newest available previews, with local image backups and the French AVIF/WebP fallback retained.
- Google Maps waits until the core page has loaded, then initializes automatically as a visible map approaches the viewport. Mobile Home now includes address, hours/cutoffs and this map. Hidden desktop/mobile duplicates do not initialize. A once guard prevents duplicate frames from an automatic/manual race; a direct link remains if its 12-second loading deadline expires.
- Rules/FAQ/price disclosures use native HTML. Ordinary links reload pages; no client router or View Transitions lifecycle is introduced.

## SEO and account state

Five routes are generated: `/`, `/services`, `/custom-sets`, `/visit`, `/about`. Every route has one H1, its own title/description, production canonical and indexability guard. Existing WebSite, NailSalon, actual geo/address/hours schema is reused. `scripts/postbuild.mjs` emits robots and the five-URL sitemap and checks that the exact Google HTML verification file survives.

Google ownership remains verified by that HTML file; Search Console's outstanding sitemap warning and indexing quota are external state, not fixed merely by changing the build framework. Do not promise indexing or ranking from this migration.

The official Instagram API is still unactivated pending owner Meta setup. Astro does not replace the API, read private credentials into client code, or fetch Instagram during static generation. Existing API, token encryption, Cloudflare Function, seed tool and scheduled Worker files are preserved unchanged. Keep Pages Functions and the separate Worker deployment; do not install an Astro Cloudflare adapter for this static Pages site.

## Validation and rollout

Completed: production static rendering for five routes; all 28 tests; static asset integrity; no React browser runtime/hydration in deployable output; Google verification file byte comparison. Native controller: 11,722 bytes uncompressed / 4,733 bytes gzip. The preserved React baseline is 258,294 bytes uncompressed / 79,009 bytes gzip: about 94% less first-party browser JavaScript by gzip size. Fonts are 42,088 bytes combined, down 30.1%; see docs/FONT-OPTIMIZATION.md for glyph checks, tiny rounding differences and reproduction. Photos, fonts, HTML, CSS and external embeds are additional. The separate unchanged Instagram renewal Worker builds to 5.13 KB uncompressed / 1.80 KB gzip.

Chrome QA covered mobile/desktop layouts, menu/chat/Escape/focus, slider and media fallbacks, fixed frames, native disclosures, all 25 page-to-page combinations and Back/Forward returns. A controlled successful API response updated the hero/gallery and kept captions literal. A 500-request local static stress run with concurrency 20 passed. Initial Astro live pages, exact browser asset, robots/sitemap/verification and real 404 passed HTTPS checks. Meta authorization, actual successful Instagram embeds and the deployed KV/renewal cron remain pending; no live activation is claimed. Real Safari timing remains unverified.

All previous operational documents are retained. README-REACT.md is the original README; README.md contains current Astro commands. Older references to Vite's React build/prerender flow in operational history are historical; the production output remains `dist/`.

## Recovery

The React snapshot is preserved at Git branch `archive/react-before-astro`, commit `0e7e8d5b409410f3a0b1468c81a8b9b8ba876459`, and in the local `../backups/Chii-Nails-React-before-Astro.zip`. The original sibling React source is retained. Restore that complete snapshot if reverting frameworks; copying only its package.json is insufficient. Commit the restored files to main and let Pages rebuild, using the same SITE_URL and existing Functions. Cloudflare's previous successful production deployments also provide a dashboard rollback path.

Original fonts and OFLs are separately preserved in `../backups/fonts-before-subset` and the React archive branch. No backup contains an Instagram token or private environment file.

## Official references

- [Astro installation and supported Node versions](https://docs.astro.build/en/install-and-setup/)
- [React integration](https://docs.astro.build/en/guides/integrations-guide/react/)
- [Framework components render statically unless hydrated](https://docs.astro.build/en/guides/framework-components/)
- [Native client scripts](https://docs.astro.build/en/guides/client-side-scripts/)
- [Static page routes](https://docs.astro.build/en/basics/astro-pages/)
