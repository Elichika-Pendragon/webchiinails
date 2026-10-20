# Chii Nails Astro release report

20 October 2026, Asia/Jakarta. Public site: **https://chiinails.pages.dev/**. Repository: **Elichika-Pendragon/webchiinails**, main. Framework migration and subsequent refinements were pushed successfully and verified through Cloudflare Pages.

## Delivered

- Static Astro 7.4.1 with five routes and build-only React presentation; no React hydration. The browser controller is 11,829 bytes raw / 4,806 bytes gzip, about 94% smaller than the preserved React browser JavaScript.
- Desktop scrolling Home retained. Mobile has a shorter Home, five navigation tabs, separate Services, Custom Sets & Prices, Visit and About pages, and a location/hours/map section on Home.
- All 21 supplied price rows, press-on finished-set range Rp25.000–155.000, Rp22.000 base kit, optional glue and Rp62.000 Cat Eye example are readable HTML. Booking requires DP; no walk-ins; correct weekday/weekend hours and last-booking cutoffs remain throughout.
- Actual social SVG logos, clean studio photograph without cursor, fixed photo frames, safe fallback images, slider, menu/chat keyboard controls and small reduced-motion-aware CSS animations.
- Actual salon Google Maps place and directions. Maps loads automatically after core page readiness near the visible section; no click is required. Hidden duplicate sections stay unloaded, duplicate-frame races are guarded, and direct links survive Google loading failures.
- Self-hosted fonts reduced 30.1%; photo WebP equivalents reduced 69.7%. Font glyph/license checks and reproducible tooling are retained.

## Measurements and tests

| Check | Result |
| --- | --- |
| Automated tests | 28 passed, including 12 native-controller regressions |
| Local static stress | 500/500 requests passed, concurrency 20; median 8.7 ms / p95 22 ms |
| Browser round trips | All 25 page-to-page combinations passed, plus Back/Forward and controls |
| Mobile first content | 0.8–0.9 seconds across the five latest measurements |
| Mobile largest content | 1.2–1.7 seconds in the slow-4G lab tests |
| Desktop first/largest content | 0.2–0.3 / 0.3–0.4 seconds |
| Lighthouse performance / SEO | 100 / 100 for all five measured routes, mobile and desktop |

The strict mobile LCP target under one second **has not been achieved**. First paint and desktop LCP meet the target in these lab samples. Results are Lighthouse simulations with no field data, not guaranteed real-device or full Maps/Instagram loading times. Exact report URLs, snapshot versions, other category scores and before/after comparisons are in [PERFORMANCE.md](PERFORMANCE.md).

Confirmed bug fixes include the AVIF failure fallback, double deferral of a visible map, and small-text contrast issues. These tests do not establish that every browser or possible state is bug-free. Chrome layout checks covered 320px/390px mobile, 768px tablet and 1280px desktop. Mobile Home Maps rendered automatically without a click. The desktop investigation found that our opaque loading cover could hide an iframe until Google's full load event. The deployed fix exposes the iframe immediately, uses a neutral notice below it, and refreshes the official Share embed URL. The owner confirmed the map displays after refreshing desktop Chrome. A bare static embed still failed in the connected test context, so that context does not provide independent desktop rendering proof. Third-party availability remains outside the site controller. Safari capabilities were researched from official WebKit sources; no physical Apple device was available.

## SEO and account-dependent work

All five live pages return HTTP 200, one H1, unique metadata, index/follow and correct canonical/static JSON-LD. Robots, the five-URL XML sitemap and the exact Google verification file are live. Invalid routes return a real 404. Preview builds retain noindex protection. Content naturally describes nail art, salon services and nail treatment in Palembang without unsupported medical or rating claims.

Search Console URL-prefix ownership was verified previously. Its earlier sitemap fetch warning and indexing quota have not been cleared merely by this release; Google indexing/ranking remains unconfirmed. No service-quota bypass was attempted. The public Google Maps listing was rechecked on 20 October and its Website link points to https://chiinails.pages.dev/.

Meta authorization remains deferred because developer SMS verification was unavailable. Official feed, encrypted token KV storage and a separate daily renewal Worker are implemented and tested, but no live token, KV binding or cron activation is claimed. Renewal targets roughly every 30 days for a 60-day token; the public feed polls every five minutes while visible. Local photos/direct links remain usable. Meta revocation still needs an owner reconnect.

## Cost and ownership

Cloudflare Workers Free was checked in the account. Hosting remains Pages Free with chiinails.pages.dev. No paid plan, domain purchase, R2 subscription or billing activation was performed. EmDash was explicitly cancelled; it is not a dependency or part of the deployed site. Usual Free-tier quotas still apply; there is no claim of unlimited resources.

The salon keeps its existing GitHub and Cloudflare accounts. Booking/DP confirmation remains on WhatsApp; the site does not promise real-time appointment availability or collect customer/payment records. Future business-data changes still need a source edit/commit.

## Recovery and handoff

- React rollback branch: `archive/react-before-astro`, commit `0e7e8d5b409410f3a0b1468c81a8b9b8ba876459`.
- Local React archive: `../backups/Chii-Nails-React-before-Astro.zip`; five original page templates and docs verified, no dependency cache/private env files.
- Original fonts/OFL backup: `../backups/fonts-before-subset` and the rollback branch.
- Current Astro source, tutorials, requirements, test scope, measured reports and migration/recovery instructions are preserved. See [REQUIREMENTS.md](REQUIREMENTS.md), [DEPLOYMENT.md](DEPLOYMENT.md), [MIGRATION-ASTRO.md](MIGRATION-ASTRO.md), [INSTAGRAM-SETUP.md](INSTAGRAM-SETUP.md), and [docs/STRESS-TEST.md](docs/STRESS-TEST.md).

Code release checked: `164954e1c5b40cb5d6777049bfc2039ec3663b61`, deployment `https://be38d777.chiinails.pages.dev`. A later documentation-only commit may have a newer deployment ID while serving the same page code.

Figma file: https://www.figma.com/design/lBhcVrZPmNAJO4MlFg9bVC/Chii-Nails-web-mark-1 . Editable desktop/mobile prices, mobile destination pages, navigation links, clean studio photos and mobile Home location summary were updated. Fresh Home/Visit exports were inspected at 01:29 WIB; see [Home proof](docs/proof/figma-mobile-home.png), [Visit proof](docs/proof/figma-mobile-visit.png) and [desktop Visit proof](docs/proof/figma-desktop-visit.png). These are editable design screens, not a live Google Maps simulation. Figma retains its older muted #806e75 token and static map placeholder wording; the site has the corrected contrast and automatic map behavior. Desktop map-button prototype URLs were not re-audited in this final pass. Exact pixel/copy parity across every older frame is not claimed.

The [mobile map proof](docs/proof/mobile-home-map-live.png) records the successful automatic salon-map rendering before the last cover refinement. Desktop rendering after the final fix was confirmed directly by the owner.

## Compact header revision — 20 October 2026

The desktop header is 76px high instead of 104px (26.9% shorter), with a 64px logo and a 200 × 44px consultation button. The mobile and tablet header is 64px instead of 82px, with a 52px logo and a Menu control at least 44px high. Fonts, colors, page content and booking destinations are retained. The collapsed menu now starts at 960px to avoid crowding tablet navigation; mobile content/page tabs still use the existing 720px breakpoint. An obsolete 721–900px desktop-header rule was removed so it cannot reduce the collapsed menu text or add extra link gaps.

Local validation: the production build and static SEO/asset guards pass; browser JavaScript remains 11,829 bytes raw / 4,806 bytes gzip. Headless Chrome 156 checked all five pages at 12 viewport widths from 320px to 1920px (60 combinations): expected header/logo/button sizes, no document horizontal overflow, no duplicate menu links, tappable menu items, opening/closing, Escape focus restoration and no browser exceptions. Third-party requests were deliberately blocked for this header check, so it is not a new Maps, Instagram, Safari or loading-time benchmark. See [measurements](docs/evidence/header-local-2026-10-20.json), [desktop proof](docs/proof/header-local-1280.png), [mobile proof](docs/proof/header-local-390.png) and [tablet proof](docs/proof/header-local-768.png).

Release `36a27c47e1f3398da3ccf9e91fa4c64d7e4cb3c3` was pushed to main and the new header was verified on the public Cloudflare Pages site at 16:05 WIB. All five routes return 200, keep one H1 and production index/follow/canonical settings, and retain the five-URL sitemap and robots entry. The public browser JavaScript matches the local build byte for byte. An additional 15 live Chrome viewport/route checks passed at 390px, 768px and 1280px with no browser exceptions; third-party content was excluded from these header checks. See [live verification](docs/evidence/header-live-verification-2026-10-20.json), [live layout checks](docs/evidence/header-live-2026-10-20.json), [live desktop proof](docs/proof/header-live-1280.png) and [live mobile proof](docs/proof/header-live-390.png).

Figma header synchronization is deferred at the owner's request on 20 October 2026. The exact header sizes, responsive breakpoint, source code, release references and screenshots are preserved above for a later sync. Earlier attempts were blocked by the file's tool-call limit and a browser URL-verification restriction; no Figma header edits or plan changes were made.

## Soft corners and interaction refinement — 20 October 2026

The owner requested Impeccable refinement with Apple ecosystem interaction conventions while retaining the theme, then emphasized older Android phones and constrained Indonesian 4G. The launcher could not initialize its engine cache, so the existing source and current visual proofs supplied the design context. No engine, dependency, account or paid service was added.

The existing pink/white palette, fonts, content, photo crops, compact header and route structure remain. Shared tokens now provide 8px control, 12px card, 16px photo/map and 20px contact-panel corners. Main standalone controls and the narrow mobile page tabs have 44px targets. Native rule disclosures toggle across the full summary row. Keyboard focus remains visible on rounded image links and hovered contact links; outside input, keyboard focus leaving the menu, Escape and responsive breakpoint changes dismiss the menu. Menu and contact panel no longer remain open together. Hover effects apply to fine hover-capable pointers; noninteractive price cards no longer move. Native scrolling, safe-area spacing and reduced-motion behavior remain.

The production build, static SEO/asset guard and all 28 existing Node tests pass. The final local Chrome batch covers all five routes at 320, 390, 768, 960, 961 and 1280px (30 combinations), with no document horizontal overflow or first-party browser exceptions. It checks targets, radii, unchanged header sizes, native rules, menu dismissal, chat/Escape/focus, a short 390×400 viewport and reduced motion. See [local evidence](docs/evidence/ui-polish-local-2026-10-20.json), [desktop](docs/proof/ui-polish-local-1280.png), [mobile](docs/proof/ui-polish-local-390.png) and [service panels](docs/proof/ui-polish-local-services.png).

The only browser JS is 12,126 bytes raw / 4,879 gzip: +297 raw / +73 gzip bytes versus the compact-header release. Inline CSS is 26,091 bytes / 5,920 gzip: +2,670 raw / +459 gzip bytes. Combined compressed CSS/JS grows by 532 bytes, without an additional stylesheet/script request or any new image/font download. These are deterministic gzip comparisons, not a promise of exact on-wire compression. [Before assets](docs/evidence/ui-polish-baseline-assets-2026-10-20.json). Timing results are recorded separately in [PERFORMANCE.md](PERFORMANCE.md).

Apple references, reusable tokens, input behavior and mobile compatibility decisions are preserved in [DESIGN.md](DESIGN.md). Figma remains intentionally deferred. Third-party Maps/Instagram rendering is excluded from this bounded UI pass; actual Safari and physical older-Android testing remain unverified.
