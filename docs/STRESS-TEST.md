# Bounded local regression audit — 20 October 2026

The Astro migration passes **28 Node tests**, including **12 native-controller
regressions** added in `server/native-controller.test.js`. Run `pnpm test` from
this folder. The test executes the actual browser entry in Node's VM with small
DOM/event/observer adapters; it does not duplicate the controller implementation.
No browser process, real timer, external request, Meta account or CMS is involved.

## Controller cases checked

- A failed AVIF request removes its picture source and selects local WebP. A
  failed Instagram CDN image restores the original photograph and destination;
  repeated polling does not restore the known failed image.
- Missing API preview images preserve all four fixed hero frames.
- Unchanged gallery updates retain the exact cards and iframe elements without
  moving DOM nodes. Permutations retain card identity and correct order; removing
  a post or changing its URL cancels pending embed work and detaches its old host.
- Hidden galleries do not inject Instagram's script. A late script completion
  cannot reactivate a removed post. Repeated activation injects one script.
- HTML-looking captions remain literal text. Unsafe permalink and image protocols
  are rejected before rendering.
- Slider arrow controls do not intercept nested link keypresses. Reduced-motion
  scrolling uses `auto`. Escape closes chat/menu and restores control focus.
- Five-minute feed polling skips hidden pages and overlapping requests. Pagehide
  aborts an outstanding request, and visibility changes permit a fresh request.
- Automatic maps wait until the first-party window load and an idle callback (or
  timeout fallback), then load near the viewport. Hidden mobile/desktop map
  duplicates stay unloaded. Manual/automatic races create one iframe, successful
  loading clears the outside status/busy state, early manual loading prevents a late observer,
  and the no-observer/no-idle path removes scroll watchers after initialization. The iframe is unmasked immediately, remains unmasked after the 12-second slow notice, and its direct Maps link survives; a late load clears that notice.

The audit exposed an AVIF transport-failure fallback edge, which was repaired
before this test run. No further confirmed release blocker was found in these
controller cases.

## Built HTML checked independently

All five generated routes (`/`, `/about`, `/services`, `/custom-sets`, `/visit`)
have one H1, unique element IDs, existing internal fragment targets, one correct
canonical, parseable static JSON-LD with a matching page URL, index/follow robots
metadata in the production build, and no Astro/React hydration island. Public
copy remains available in the generated HTML without JavaScript. Build guards
also check local assets, obsolete booking language, the public Google ownership
file and absence of client React/token code.

## What this does not establish

DOM adapters cannot measure actual browser layout, iframe navigation, cross-origin
Instagram rendering or device performance. A true permutation moves existing
cards; a browser may reload an iframe when its ancestor is moved. Normal unchanged
polling and inserting a newest post at the front preserve existing card placement.
Real Meta embeds and Safari still require their own browser/account verification;
these tests make no claim of a Safari benchmark or a live Instagram integration.
Local HTTP/browser checks are separate from this regression suite.
