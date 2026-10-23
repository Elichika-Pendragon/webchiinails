# Unified tap-to-build price menu — 23 October 2026

The owner approved replacing the entire static price-list area and separate calculator with the in-conversation tap-to-build concept. This changes the frontend price interface only; prices, database schema, owner authorization, booking and other public sections are unchanged.

## Implementation

- All 21 stable services remain, grouped as Nail Art, Cat Eye, Extension, Extras and Removal. Optional kit/glue are adjacent menu choices.
- Full-row native checkboxes select/remove services. Repeatable services reveal bounded minus/plus steppers. One/ten-kuku alternatives replace one another; no quantity zero/fractional entry is offered.
- One expandable summary shows the running total and count, selected lines, removal/reset and an unsent WhatsApp URL. Default selections are empty.
- The shared fetched price catalog updates every row and estimate; the existing owner editor remains authoritative. Failed refreshes preserve a useful static-price fallback, warning and retry. Retry preserves customer choices and quantities.
- Static HTML retains service names, rates, units and kit contents without JavaScript. Checkbox controls stay disabled until initialization. Existing price anchors and search metadata remain; there is no invisible keyword content.
- Removed the obsolete static-card and standalone-form CSS. No new framework, dependency, font, image, API write, migration or binding.

## Bounded verification

The existing Node regression suite passed 527/527. The final production build emitted eight routes and passed five public-page HTML/SEO/asset assertions. Impeccable's mechanical detector reported no findings for the three changed frontend files. Final browser JS across all routes: 100,826 raw / 36,260 gzip bytes, versus 101,874 / 36,594 before this change (334 gzip bytes smaller).

Browser testing used the built site and an isolated localhost API fixture with external embeds blocked. Desktop 1280px, mobile 390px and narrow 320px showed matching client/scroll widths of 1265/1265, 375/375 and 305/305. Rows measured at least 56px and quantity buttons 44px. This is responsive browser evidence, not physical Android/iPhone testing.

Observed default-price calculations: polos + Cat Eye + 10-nail extension + glitter + 10-nail gel removal = Rp123,000. Selecting the one-kuku extension replaced the pack; three individual nails produced Rp105,000. Removing glitter and adding kit/glue plus two ranged 3D accessories produced Rp137,000–151,000 and matching unsent WhatsApp line items. All 21 services had one menu price, with zero select elements. The extension count stopped at ten with its increment disabled.

A simulated price-API failure retained usable fallback calculations and displayed retry. Three selections including ten individual extensions produced Rp105,000. Restoring the temporary API with Cat Eye Rp42,000 and retrying preserved the three selections/count ten, updated the menu rate and yielded Rp107,000. Removing Cat Eye yielded Rp65,000 and restored focus to its menu checkbox. Reset cleared the quote and hid WhatsApp confirmation; keyboard selection of regular removal alone yielded Rp6,000. These were synthetic tests; no real production price, booking, receipt or Calendar record was changed.

The final accessibility adjustment associates every service checkbox with its price and includes the total in the summary's accessible name. The native disclosure remains keyboard operable. Existing price bounds, ranges and alternative rejection are still enforced by the shared domain calculation.

## Sticky total follow-up

Moved the single estimate disclosure above the menu and pinned it below the existing header within the price section. No scroll handlers or added requests. Expanded details have a viewport-bounded scroll area and retain their summary.

Browser viewport checks: 1280x900, 390x844 and 320x568. No horizontal overflow (client/scroll widths 1265/1265, 375/375 and 305/305). While browsing lower service rows the total stayed at y=84 on desktop and y=72 on mobile, below the 76px/64px headers. The five-service quote remained Rp123,000. A long nine-choice ranged estimate fit the 320px layout; its 404px expanded panel scrolled through 1286px of content while keeping its total visible, with reset and WhatsApp accessible. Removal retained focus on a remaining item; keyboard return to the menu collapsed the panel and left the focused checkbox visible. Reset cleared all choices, returned Rp0, closed the panel and focused its summary. No browser JavaScript errors observed. These are browser viewport checks, not physical-device tests.

Production build passed: 8 routes, 5 public-page SEO/asset checks, no React client runtime. Browser JavaScript across routes is 101,114 raw / 36,319 gzip bytes (59 gzip bytes above the previous release). The Impeccable detector returned no findings. Pricing arithmetic, catalog, database and authentication are unchanged.
