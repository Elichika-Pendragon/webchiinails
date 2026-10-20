# Calm navigation and inline booking calendar — 20 October 2026

The owner reported abrupt page changes, confirmed the website tabs were affected, and supplied a desktop recording showing Home/About document changes and otherwise smooth section scrolling. The refinement preserves the theme, responsive route structure and existing smooth anchor scrolling. Figma remains deferred.

## Navigation

Remove the repeated 4px hero entrance. Supported browsers use an opacity-only 200ms cross-document transition: the old snapshot stays opaque while the new page fades over it. The header, mobile tab bar and chat control use stationary unique snapshots; no geometry animation, slide, bounce, router, scroll reset, library or artificial delay is added. Selecting the current mobile tab preserves the current page instead of reloading; modified clicks remain native.

The transition is enabled only for `prefers-reduced-motion: no-preference`. Unsupported browsers retain ordinary navigation. Chrome supports this cross-document mechanism from 126 and Safari from 18.2; compatibility is based on official documentation, not a physical Safari test. [Chrome documentation](https://developer.chrome.com/docs/web-platform/view-transitions/cross-document), [Safari 18.2 release](https://webkit.org/blog/16301/webkit-features-in-safari-18-2/).

The root reserves vertical scrollbar space with `overflow-y: scroll; scrollbar-gutter: stable`. This addresses classic-scrollbar width changes during document loading. No horizontal clipping is used. A transient 390/375px viewport/document difference was observed during an early transition measurement; the settled shell geometry was already shared, so this is a stabilization measure rather than a claim that the scrollbar alone caused the recording's movement.

## Inline calendar

The date field enhances into a compact Indonesian calendar, retaining a native-date fallback until initialization succeeds. Its six fixed rows keep month browsing from shifting the rest of the form. Bounds use the shared WIB date range; past/out-of-range dates and unavailable month controls are disabled. Arrow keys, Home/End and Page Up/Down move focus; Enter/Space select a date. Selection updates the existing time selector, survives review/edit and remains subject to shared validation. It does not fetch or imply Google Calendar availability.

The DP label now reads **DP 10%**. Its automatic, read-only 10% calculation remains unchanged. No font, image, iframe, dependency or extra network request is introduced by the calendar.

## Google setup boundary

The owner explicitly approved creating **Chii Nails Booking** as a service-account identity only. It was created in the existing project with no project IAM role. No private key or Calendar sharing grant was created, no billing/trial was activated, and no real Calendar call or event write occurred. Account identifiers and setup screenshots stay in private local state, outside the source archive/repository. Owner authentication, approval endpoints, durable reservations and Calendar authorization remain unfinished.

## Verification record

All 67 Node tests passed, including four date-grid/keyboard arithmetic cases covering WIB dates, inclusive bounds, six-row stability, leap years and month clamping. Local functional checks cover blank-form date errors, focus restoration, keyboard movement without accidental selection, explicit selection, month browsing, 14:00 weekday cutoff and a reviewed Rp100.000 / Rp10.000 DP / Rp90.000 balance. No WhatsApp message was sent.

Local screenshots at 1280, 390 and 320px show no document overflow. Calendar height is stable for six rows at each width; day targets are 44px high, approximately 52/44/42px wide respectively. The mobile navigation sequence covers all five pages in eight changes, plus Back/Forward and selecting the current About tab with a disclosure left open. Each destination was awaited through page load and the end of its native transition before the next action. Every final state has no document overflow, a 64px header, tabs at y=64, no hero transform and a 200ms fade. Desktop Home/About checks retain 76px headers, no hero transform and no final overflow. A fresh independent screenshot/source review found no material issues and approved publication.

The final exact-checkout production build and static SEO/asset guards pass. Four browser-JS files across all routes total **24,650 bytes raw / 9,856 bytes gzip estimate**, up 4,222 raw / 1,391 gzip from the prior DP/Last book correction. Most added code is the booking-only calendar; ordinary pages do not import it. No runtime framework is hydrated. These are asset estimates and responsive browser checks, not physical-device or sub-one-second loading benchmarks. Reduced-motion opt-out is verified in CSS/source; it was not emulated in this UI session.

Evidence: [calendar functionality](evidence/navigation-calendar/calendar-functional.json), [mobile route changes](evidence/navigation-calendar/navigation-mobile.json), [desktop routes](evidence/navigation-calendar/navigation-desktop.json), [1280px calendar](evidence/navigation-calendar/calendar-1280.png), [390px](evidence/navigation-calendar/calendar-390.png), [320px](evidence/navigation-calendar/calendar-320.png). Source/deployment identity is checked separately after the authorized push.

## Published release

Code commit **`f8d76ce6e496a7a097f28b6eb9efd53591bfb5d6`** is pushed to GitHub main and live in successful Cloudflare deployment **`542f4099-7808-4a41-8e77-9b2413a4122c`**, completed at **21:27 WIB** in 48 seconds. This duration is deployment time, not visitor loading time.

All six production routes return 200 with the exact tested inline CSS and JavaScript bytes. Production checks confirm the inline-calendar markup, concise DP label, native page-transition CSS and stable scrollbar rule. Five public routes retain their canonicals/index directives, sitemap/robots and Google ownership file; `/book` remains noindex and outside the sitemap/header. [Live artifact/SEO evidence](evidence/navigation-calendar/live-verification.json).

Connected Chrome displays the new Indonesian calendar and DP label. Its final click check was interrupted by the browser-control connection before date selection, so the live interaction check is not claimed as passing. Functional selection/month/keyboard/review results above are from the exact locally tested build. This does not establish physical Safari, older Android or a new loading-time result.
