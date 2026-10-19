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
| Google Maps and live links | Exact supplied share link used for directions and map action; interactive iframe visibly resolved to Dewi Salon & Chii.Nails in Chrome. |
| Floating chat | React fixed lower-right trigger; opens WhatsApp/Instagram, closes by button/Escape/outside click. Desktop/mobile checks completed. Figma overlay is a prototype preview; live widget positioning comes from CSS. |
| DP and cancellation | Old no-DP wording removed from Figma desktop/mobile and React, including SEO description. DP required; confirm amount through WhatsApp; cancellation forfeits DP. No payment gateway. |
| Late arrival | Rp10.000 per 10 minutes. Superseded no-show/early-arrival paragraph replaced in Figma and React. |
| Hours and last booking | Mon–Fri 08.00–17.00, last booking 15.00; Sat–Sun 08.00–12.00, last booking 10.00 WIB. Updated in both media. |
| No walk-ins | Explicit in location and rules; booking requires name, phone, date, time and DP. |
| Other salon rules | No home service; booked schedule cannot be changed, based on the supplied rules. |
| React source and hosting tutorial | Source ZIP, README, API setup guide, and DEPLOYMENT.md. No site has been published and no purchase has been made. |

## Checks completed

- Chrome Figma find-and-replace updated both desktop/mobile policy copies. Searches for `tanpa DP` and `tidak memerlukan DP` returned no results. Mobile rule cards inspected at 100% zoom and reflowed without clipping.
- Chrome React checks: desktop and 390px mobile navigation, six rule accordions, chat choices, carousel navigation, live map, and outbound-link destinations. Mobile document width matched viewport without page overflow.
- Build succeeds. JavaScript bundle about 77 kB gzip and CSS about 3.5 kB gzip (fonts, photos and third-party embeds are additional). Bundled images total about 2.1 MB; below-fold assets are lazy-loaded. This is a build-size measurement, not a Lighthouse score.
- Sixteen Node tests cover feed ordering/thumbnail/link safety, token redaction, API/cache behaviour, SEO controls/schema/canonical safety, encrypted token storage/tamper rejection, account mismatch, expiry handling, renewal timing, persistence and sanitized failure recovery.
- Both pages now contain build-time rendered HTML. A configured production build was checked for canonical URLs, valid JSON-LD, two sitemap entries and robots discovery, then restored to the unconfigured noindex default. The reserved test domain was only used locally; no site was published.
- Chrome verified both prerendered pages and React interaction without hydration console errors. At a 320px viewport the home page width matched its 305px available content width, and the open chat panel stayed within it. Temporary viewport override was reset.
- SEO.md covers SITE_URL, Search Console, sitemap and local business setup. The owner chose to avoid LightWidget. LOW-MAINTENANCE.md and INSTAGRAM-SETUP.md now cover our own daily renewal Worker, encrypted KV store and one-time setup. The Worker bundles to about 5.1 kB before gzip and adds nothing to browser JavaScript.
- Cloudflare `/about` normalization handled alongside `/about.html`. Functions invocation restricted to the API path with `_routes.json` so static resources do not consume Function requests.

## Still requires owner/deployment verification

- Instagram credentials are not connected. Newest-post retrieval has been tested with controlled responses; a live API end-to-end check needs owner authorization. The testing browser blocked Instagram embed requests, so photo/direct-link fallbacks were checked; successful live embedding still needs production-domain testing.
- Renewal code and encrypted KV integration are implemented, but are not active until the owner authorizes Meta and Pages/Worker bindings/secrets/cron are deployed. Tests use controlled API responses; actual renewal with a valid owner token and the Cloudflare runtime is still a launch check. There is no public renewal endpoint.
- No automatic email/WhatsApp failure notifications or one-click OAuth owner dashboard. Status is recorded in KV and scheduled-event logs; monitoring must be arranged and checked. Revoked/expired authorization requires owner reauthorization and technical reseeding. This is reduced maintenance, not a zero-maintenance guarantee.
- A local Cloudflare Wrangler build attempt failed inside the downloaded tool with a missing `undici` dependency. The adapter itself passes Node tests; a real Cloudflare deployment/Function build remains to be confirmed. React production build passes independently.
- Confirm preferred WhatsApp number and DP amount before launch. The current number comes from Chii's public bio, which differs from older public listings.
- Studio image is a cropped story screenshot; the original photo would be a sharper replacement.
- Figma Code Layer was not created because code-upload connector tools were unavailable. The separate React project is the runnable source. Native Figma previews cannot execute real Instagram or Google embeds.
- Physical-phone testing, live Instagram authorization and production PageSpeed/Search Console validation remain launch checks. Local browser tests do not establish a production Lighthouse score or search ranking.

## Fixed-frame hero and Maps correction

- All four hero image slots have fixed desktop/mobile dimensions, min-size constraints, overflow clipping and centered cover cropping. Image aspect ratio cannot enlarge a grid row or overlap services.
- Hero and post slider share one authorized Instagram feed with five-minute polling; the four newest available photo/thumbnail previews populate the hero. Failed/missing images keep local fallbacks. Live owner authorization remains pending.
- Chrome resolved the new owner share link https://share.google/jFSExFb9oiM3cob89 to Google Search, then verified the actual Maps listing and CID 13060782932404739183 at -2.9707861,104.7923294. Open Maps now uses that direct place link; Directions uses exact coordinates. The iframe comes from the listing’s Share → Embed a map code.
- Removed the misleading static map preview pinned on SMA N 5; the loading area is a branded location card until the actual Maps embed is requested.

Chrome checked the corrected hero at desktop (660px total height) and mobile (764px with fixed 380/190/170px image rows), including a narrow 300px available CSS viewport: document width matched viewport and the care strip started after the hero. Google Maps external CID link resolved to the exact salon. Embed load was slow in the testing browser, so the loading card now falls back to a direct location link after 12 seconds. Full live iframe rendering still requires checking in the visitor browser.
