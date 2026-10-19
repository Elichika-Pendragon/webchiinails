# Astro migration prototype

Status: isolated local prototype, not published. This folder does not modify the existing React source or Git checkout. Date: 20 October 2026, Asia/Jakarta.

EmDash was explicitly cancelled by the owner because R2 onboarding requires a billing relationship. No EmDash/CMS dependency, loader, mapping, account resource, or production setting is included in this migration. Content stays in the committed source, with no added CMS hosting cost.

## Design and delivery

The existing React component tree is rendered to static HTML by Astro without a client directive. Existing classes, copy, prices, fixed photo frames, bilingual headings, studio photo, booking requirements, and responsive styles are retained. The native controller replaces React's runtime event handling. Desktop keeps the scrolling homepage; mobile uses a concise homepage plus four linked detail pages.

Astro 7.4.1 and `@astrojs/react` 7.1.0 are pinned to the exact versions returned by the official npm registry. They require Node >=22.22.0. The build was tested with Node 24.19.0. Update Cloudflare's `NODE_VERSION` before switching production; the prior Node 22.16.0 is too old.

React remains a build dependency. No `<astro-island>` or hydration directive appears in page output. Astro's installed React integration emits a renderer asset even when no page hydrates; `scripts/postbuild.mjs` removes it only after checking that no generated page or other browser script references it. Adding an island will fail this guard, protecting against deleting a required runtime.

## Preserved behavior

- Header menu toggles, closes when a link is used, and supports Escape with focus return.
- Floating chat uses the real WhatsApp/Instagram SVG logos, close/outside/Escape handling and focus return.
- Gallery supports native touch scroll, arrows, keyboard, live position count and disabled edge buttons.
- Instagram's standard `embed.js` loads only when a visible gallery approaches the viewport. A hidden desktop gallery on initial mobile home does not activate. Individual cards load near the horizontal viewport and retain local previews/direct links on a 16-second failure.
- Browser feed requests reuse the existing `/api/instagram` endpoint on initial load and every five minutes when visible. An eight-second request timeout preserves fallback or last good content. Data is normalized through `feed-data.js`; remote text uses DOM `textContent`, and URLs are validated before use. Unchanged post IDs/permalinks retain their existing embed DOM across refreshes.
- Four fixed hero frames update from the newest available previews, with local image backups and the French AVIF/WebP fallback retained.
- Google Maps iframe loads only after a visitor's click, with a direct link available if its 12-second loading deadline expires.
- Rules/FAQ/price disclosures use native HTML. Ordinary links reload pages; no client router or View Transitions lifecycle is introduced.

## SEO and account state

Five routes are generated: `/`, `/services`, `/custom-sets`, `/visit`, `/about`. Every route has one H1, its own title/description, production canonical and indexability guard. Existing WebSite, NailSalon, actual geo/address/hours schema is reused. `scripts/postbuild.mjs` emits robots and the five-URL sitemap and checks that the exact Google HTML verification file survives.

Google ownership remains verified by that HTML file; Search Console's outstanding sitemap warning and indexing quota are external state, not fixed merely by changing the build framework. Do not promise indexing or ranking from this migration.

The official Instagram API is still unactivated pending owner Meta setup. Astro does not replace the API, read private credentials into client code, or fetch Instagram during static generation. Existing API, token encryption, Cloudflare Function, seed tool and scheduled Worker files are preserved unchanged. Keep Pages Functions and the separate Worker deployment; do not install an Astro Cloudflare adapter for this static Pages site.

## Validation and rollout

Completed locally: production static rendering for five routes; all 16 existing tests; static asset integrity; no React browser runtime/hydration in deployable output; Google verification file byte comparison. Native controller: 11,040 bytes uncompressed / 4,536 bytes gzip. The current React baseline in the sibling folder is 258,294 bytes uncompressed / 79,009 bytes gzip: about 94% less first-party browser JavaScript by gzip size. This is an asset-size comparison, not a Lighthouse score; photos, fonts, CSS and third-party embeds are additional. Re-run `pnpm check:assets` for the final exact measurement after edits. The separate unchanged Instagram renewal Worker builds to 5.13 KB uncompressed / 1.80 KB gzip.

Before switching production, the main task must finish browser QA of desktop/mobile layout, menu/chat/focus, carousel and media fallbacks, fixed image frames, navigation and Maps. Test successful API data with controlled data when available, then check live Cloudflare Functions/KV and renewal Worker configuration after deploying. The API cannot be declared connected until Meta authorization is complete. This prototype has not been published or committed.

All previous operational documents are retained. README-REACT.md is the original README; README.md contains current Astro commands. Older references to Vite's React build/prerender flow in operational history are historical; the production output remains `dist/`.

## Official references

- [Astro installation and supported Node versions](https://docs.astro.build/en/install-and-setup/)
- [React integration](https://docs.astro.build/en/guides/integrations-guide/react/)
- [Framework components render statically unless hydrated](https://docs.astro.build/en/guides/framework-components/)
- [Native client scripts](https://docs.astro.build/en/guides/client-side-scripts/)
- [Static page routes](https://docs.astro.build/en/basics/astro-pages/)
