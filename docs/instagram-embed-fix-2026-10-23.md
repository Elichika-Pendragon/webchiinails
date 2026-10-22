# Instagram embed diagnosis - 23 October 2026

## Findings

The earlier blanket timeout result was specific to the existing Chrome test context. In that context, both the live gallery and an isolated direct public Instagram iframe remained blank, while the same embed URL opened as a top-level page. No definitive browser-profile cause was established. Browser policy did not permit inspecting chrome://extensions; no settings or protections were changed.

The independent in-app browser rendered actual native Instagram posts for the same URLs, both in an isolated page and in the live gallery. The user also confirmed actual Instagram posts appear in their own browser. Public, unauthenticated HTTP GETs of the embed URLs returned 200 with post content. These checks do not support a general account-level embed block.

A genuine code defect was found: after 16 seconds the client removed the host/frame and disconnected its readiness observer. A slow post could never recover after that cutoff. Meta's public embed.js starts frames at zero height, waits for postMessage readiness/measurement, and admits at most three frames concurrently; zero initial height alone is not a failure. The unchanged hidden host CSS was ruled out as the sole cause by rendering the same post with both normal and collapsed hosts in isolation.

## Change

After 16 seconds, show a slow-loading notice and a manual retry control while preserving the native iframe and readiness observer. Late readiness removes the preview and retry control. Actual script network errors retain the fallback and provide retry. A retry replaces only its own attempt; stale completion callbacks cannot affect the replacement. Removed cards clear observers, timers and retry controls. Initial viewport-based loading and horizontal swipe behavior remain unchanged; no scraper or server bindings changed.

## Verification

- 513 tests passed, including three new regression cases: readiness after the old cutoff, script error/retry, and removing a delayed card.
- Production build and asset checks passed; browser JavaScript 29,389 gzip bytes, no React client runtime. Increase over the previous release: 179 gzip bytes.
- Local built page showed four loaded native Instagram frames at desktop size; screenshot visibly showed post video, profile, controls and engagement UI.
- At a simulated 390px viewport, native frames were approximately 315px wide, four completed, and page client/scroll widths both measured 375px (scrollbar excluded). This is a viewport check, not a physical-phone test.
- User confirmed native Instagram posts currently show in their own browser.

No claim is made that the exact Chrome profile issue was repaired, that every archive post was individually checked, or that Meta will always respond. The resilience fix prevents our own timer from discarding delayed posts.

## Production result

Published commit 218a744 in Cloudflare Pages deployment 3b097610-e51c-4ed5-a1b6-db8f870dd283. Live HTML matched the tested build entry and served client.BqadHk3x.js with the new slow-loading notice and retry behavior (HTTP 200). Four live native frames completed at 662-692px height, with zero retry controls left. The first frame exposed Chii's profile, post content, engagement controls and likes; screenshot saved in docs/evidence/instagram-embed-fix/live-native-posts.png. This supersedes the earlier report's browser-wide implication while preserving its historical Chrome-only observation.
