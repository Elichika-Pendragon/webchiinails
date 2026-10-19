# Chii Nails — requirements and verification

Checked 19 October 2026. User's newest rules take precedence over older screenshots.

| Conversation requirement | Current delivery and verification |
| --- | --- |
| Editable Figma desktop/mobile | Existing 1440px and 390px frames; native editable text, auto-layout, components, variables and image fills. File is in the normal account's Starter team; the Student account was invited with edit access. |
| White/pink brand; seamless header/logo | Actual Chii logo; header uses its sampled pink. Desktop header spacing fixed. Real salon/nail photos remain raster assets inside editable layouts. |
| Clean Outerbloom-inspired image mosaic | Still-photo hero: tall feature + supporting mosaic; no custom background video. |
| English style, Indonesian clientele | English headlines/service labels; practical details, policies and instructions in Indonesian. |
| Custom designs as a selling point | Hero, services, gallery, About and custom-request WhatsApp CTAs cover client references. |
| Service menu | Nail art, extensions and press-on; design-specific quotes through WhatsApp, without invented prices. |
| Embedded Instagram post slider | Native Figma slider previews; React embeds actual posts with touch/keyboard/arrow navigation. Server adapter can request latest authorized posts; initial authorization is still pending. |
| Lightweight load behaviour | No carousel, icon, chat or animation package. Image lazy loading; Instagram script starts near gallery, and individual embeds start near visible carousel cards. Feed cache five minutes. Google iframe loads on request. |
| Why Chii Nails? | All four benefits: Best Quality, Custom Premium Design, Competitive Price, Delivery Across Indonesia (press-on). |
| Studio/About/location | Actual story photo crop, About & Booking Rules page, one studio. |
| Google Maps and live links | Direct verified Maps CID and coordinates replace the supplied Search redirect; the owner's phone screenshot shows the correct business map. |
| Floating chat | React fixed lower-right trigger; opens WhatsApp/Instagram, closes by button/Escape/outside click. Desktop/mobile checks completed. Figma overlay is a prototype preview; live widget positioning comes from CSS. |
| DP and cancellation | Old no-DP wording removed from Figma desktop/mobile and React, including SEO description. DP required; confirm amount through WhatsApp; cancellation forfeits DP. No payment gateway. |
| Late arrival | Rp10.000 per 10 minutes. Superseded no-show/early-arrival paragraph replaced in Figma and React. |
| Hours and last booking | Mon–Fri 08.00–17.00, last booking 15.00; Sat–Sun 08.00–12.00, last booking 10.00 WIB. Updated in both media. |
| No walk-ins | Explicit in location and rules; booking requires name, phone, date, time and DP. |
| Other salon rules | No home service; booked schedule cannot be changed, based on the supplied rules. |
| React source and hosting tutorial | Source ZIP, README, API setup guide, and DEPLOYMENT.md. Site published at https://webchiinails.pages.dev on Cloudflare Pages; no purchase made. |

## Checks completed

- Chrome Figma find-and-replace updated both desktop/mobile policy copies. Searches for `tanpa DP` and `tidak memerlukan DP` returned no results. Mobile rule cards inspected at 100% zoom and reflowed without clipping.
- Chrome React checks: desktop and 390px mobile navigation, six rule accordions, chat choices, carousel navigation, live map, and outbound-link destinations. Mobile document width matched viewport without page overflow.
- Build succeeds. JavaScript bundle about 77 kB gzip and CSS about 3.5 kB gzip (fonts, photos and third-party embeds are additional). Bundled images total about 2.1 MB; below-fold assets are lazy-loaded. This is a build-size measurement, not a Lighthouse score.
- Sixteen Node tests cover feed ordering/thumbnail/link safety, token redaction, API/cache behaviour, SEO controls/schema/canonical safety, encrypted token storage/tamper rejection, account mismatch, expiry handling, renewal timing, persistence and sanitized failure recovery.
- Both pages contain build-time rendered HTML. The published site was checked for canonical URLs, valid JSON-LD, two sitemap entries and robots discovery at https://webchiinails.pages.dev. Missing-domain and preview builds remain noindex.
- Chrome verified both prerendered pages and React interaction without hydration console errors. At a 320px viewport the home page width matched its 305px available content width, and the open chat panel stayed within it. Temporary viewport override was reset.
- SEO.md covers SITE_URL, Search Console, sitemap and local business setup. The owner chose to avoid LightWidget. LOW-MAINTENANCE.md and INSTAGRAM-SETUP.md now cover our own daily renewal Worker, encrypted KV store and one-time setup. The Worker bundles to about 5.1 kB before gzip and adds nothing to browser JavaScript.
- Cloudflare `/about` normalization handled alongside `/about.html`. Functions invocation restricted to the API path with `_routes.json` so static resources do not consume Function requests.

## Still requires owner/deployment verification

- Instagram credentials are not connected. Newest-post retrieval has been tested with controlled responses; a live API end-to-end check needs owner authorization. The testing browser blocked Instagram embed requests, so photo/direct-link fallbacks were checked; successful live embedding still needs production-domain testing.
- Renewal code and encrypted KV integration are implemented, but are not active until the owner authorizes Meta and Pages/Worker bindings/secrets/cron are deployed. Tests use controlled API responses; actual renewal with a valid owner token and the Cloudflare runtime is still a launch check. There is no public renewal endpoint.
- No automatic email/WhatsApp failure notifications or one-click OAuth owner dashboard. Status is recorded in KV and scheduled-event logs; monitoring must be arranged and checked. Revoked/expired authorization requires owner reauthorization and technical reseeding. This is reduced maintenance, not a zero-maintenance guarantee.
- Cloudflare Pages and its Function deployed successfully through Git integration. The public Instagram endpoint returns a sanitized unavailable response while owner authorization is deferred. An earlier local Wrangler CLI issue did not block the managed deployment.
- Confirm preferred WhatsApp number and DP amount before launch. The current number comes from Chii's public bio, which differs from older public listings.
- Studio image is a cropped story screenshot; the original photo would be a sharper replacement.
- Figma Code Layer was not created because code-upload connector tools were unavailable. The separate React project is the runnable source. Native Figma previews cannot execute real Instagram or Google embeds.
- The owner tested the published site on a physical phone and reported the mobile details addressed below. Live Instagram authorization and production PageSpeed/Search Console validation remain pending. Local browser tests do not establish a production Lighthouse score or search ranking.

## Fixed-frame hero and Maps correction

- All four hero image slots have fixed desktop/mobile dimensions, min-size constraints, overflow clipping and centered cover cropping. Image aspect ratio cannot enlarge a grid row or overlap services.
- Hero and post slider share one authorized Instagram feed with five-minute polling; the four newest available photo/thumbnail previews populate the hero. Failed/missing images keep local fallbacks. Live owner authorization remains pending.
- Chrome resolved the new owner share link https://share.google/jFSExFb9oiM3cob89 to Google Search, then verified the actual Maps listing and CID 13060782932404739183 at -2.9707861,104.7923294. Open Maps now uses that direct place link; Directions uses exact coordinates. The iframe comes from the listing’s Share → Embed a map code.
- Removed the misleading static map preview pinned on SMA N 5; the loading area is a branded location card until the actual Maps embed is requested.

Chrome checked the corrected hero at desktop (660px total height) and mobile (764px with fixed 380/190/170px image rows), including a narrow 300px available CSS viewport: document width matched viewport and the care strip started after the hero. Google Maps external CID link resolved to the exact salon. Embed load was slow in the testing browser, so the loading card falls back to a direct location link after 12 seconds. The owner's subsequent phone screenshot confirms that the actual business map renders.

## Photo, hours and chat polish — deployed

- Replaced the cursor-marked studio screenshot with `studio-clean.jpg`, retouched with the built-in image editing tool and encoded at 180 kB. The original is backed up privately and removed from published assets. Updated the structured-data image URL too.
- Home and About share one weekday/weekend hours table. Each opening range keeps its own last-booking cutoff, followed by the required-DP and no-walk-in notice. Mobile address, heading and button spacing adjusted.
- Replaced W/◎ placeholders with local WhatsApp and Instagram SVG logos. No dependency added.
- All 16 Node tests and the production build pass. Browser checks at 380px available CSS width found no page overflow; both 28px logos loaded and the open chat stayed between x=16 and x=364. Escape closed it. The About hours table renders correctly; no console errors in the local preview.
- Desktop screenshots confirm the cursor removal, hours layout and recognizable chat logos. Narrow-browser screenshot capture was unreliable; mobile checks used rendered DOM dimensions and interaction checks. A fresh physical-phone visual check after deployment remains useful.
- These changes were pushed as commit `7333cd5` and deployed successfully. Instagram connection still requires owner-account authorization.

## Shorter website address and SEO

- The main website is now https://chiinails.pages.dev, built from the same private GitHub repository and main branch. New Pages project: `chiinails`; build `pnpm build`; output `dist`; `PNPM_VERSION=11.25.0`; `SITE_URL=https://chiinails.pages.dev`.
- Home canonical, robots metadata and the cleaned studio asset were checked on the new live domain. Existing rendered page content and NailSalon structured data are retained.
- Cloudflare account-level Bulk Redirect list `chii_legacy_address` and rule `Chii Nails new website address` forward the old address with HTTP 301, preserving paths and query strings. A browser visit to the old `/about?source=old-link` resolved to the same path and query on chiinails.pages.dev. No project was deleted.
- Google Search Console setup has started but ownership is not yet verified; the intended Google account must be confirmed first. No sitemap submission or indexing request has been confirmed yet. Instagram remains awaiting the intended Meta developer account; no developer terms accepted or app created in the personal Facebook session.

## SEO optimization — 19 October 2026

Search Console URL-prefix ownership is confirmed in Settings as verified owner. The public HTML verification file remains unchanged. Current sitemap report still says cannot fetch; submission alone is not indexing success. The previous homepage indexing request hit Google's daily quota; retry only after reset. Owner reports Maps website link updated.

First on-page optimization: clearer bilingual service/location copy, extensions and press-on explanations, customer FAQ with descriptive internal links to canonical /about, and coordinates matching the Maps location in NailSalon JSON-LD. Existing WebSite identity, unique page metadata, prerendered HTML, hours, booking rules, sitemap and robots preserved. No added dependencies.

Validation: 16 tests pass; production build passes; rendered HTML checks pass for both canonical URLs, index directives, schema JSON, correct hours/DP, FAQ text and unchanged verification file. Chrome checked FAQ expansion at mobile 390px without horizontal document overflow and About at desktop 1280px with all six booking rules. These are functional checks, not a measured Core Web Vitals or Lighthouse score. Instagram API remains unactivated pending Meta authorization.

## Price list, motion and image delivery — 19 October 2026

Added21 owner-supplied price rows inside Custom Sets: nail art, Cat Eye, extensions/accessories and removal. Owner clarified press-on Rp25.000–155.000 is the finished-set total. Base kit22k, optional MXBON glue13k, six kit items and22k+40k=62k example retained. Responsive HTML price guide uses existing blush/white/rose palette and typography; no new dependency. All prices are in prerendered HTML.

CSS-only entrance/hover/press effects respect prefers-reduced-motion; no animation JavaScript, library, scroll handler, or blocking overlay. One-time WebP exports at quality85 preserve dimensions; local images total745,478 bytes versus1,478,285 bytes for JPG originals (50% reduction). Original JPGs remain available for existing social/schema image URLs. Browser-loaded local photos now use WebP. Main JS79.04KB gzip, CSS4.97KB gzip. Instagram remote media remains controlled by Meta/CDN and was not recompressed.

Checks: existing16 tests pass; production build passes;21 price rows, owner-confirmed total, exact example, kit, unique anchors and ownership file verified in rendered HTML. Desktop,390px and320px layouts checked; no price-row overflow or broken loaded images. Price list uses normal anchors and no extra tab/carousel dependency. Instagram API is still not activated: Meta SMS/developer access unavailable; owner deferred this until tomorrow. Search Console quota/fetch follow-up remains pending.

Follow-up performance/local SEO optimization: capped press-on delivery image at720px and logo at176px; total browser WebP assets448,174bytes (70% below JPG originals). Self-hosted licensed Latin WOFF2 brand fonts remove Google Fonts CSS/DNS from rendering path; font preloads added to both pages. Entrance motion now uses transform only, keeping text visible immediately. Homepage title and service copy target Nail Art Palembang, salon nail art and nail treatment through known basic manicure/vitamin oil services. One-second first-screen target is an optimization goal, not yet a measured result or an all-network promise.
