# Booking corrections — 20 October 2026

The owner requested these corrections after the first static preview was published at `f41ca3e` (Cloudflare `02097797`). This report records the prepared correction source and its local verification; live publication must be checked separately against the pushed commit.

## Result

- Five editable values: name, WhatsApp number, agreed total, date and time. DP is a read-only **10%** of the agreed total, recalculated whenever the total changes. Fractional Rupiah round upward to the next whole Rp1. Shared validation derives the canonical DP and ignores legacy or forged deposit input.
- Customer-facing booking copy and WhatsApp summary use **Chii**. Payment wording is **transfer atau QRIS**, with actual payment checked manually. No payment provider/API is activated.
- All current website hours content uses **Last book**: Monday–Friday **14:00**, Saturday–Sunday **10:00 WIB**. Opening hours remain 08:00–17:00 and 08:00–12:00. With the two-hour default, the final weekday appointment ends at 16:00.
- `/book` stays an unlisted static preview, `noindex, nofollow`, outside the five-page sitemap and header/menu. The customer reviews the summary and explicitly opens WhatsApp, then taps Send there. Approval links, slot reservations and Google Calendar sync remain unfinished and inactive.

## Verification

All **63 Node tests** passed, including canonical DP calculation, whole-Rupiah rounding, ignored deposit tampering, weekday 14:00 cutoff, weekend 10:00 cutoff, and the inactive Calendar adapter with synthetic responses. Production build and SEO/asset guards passed for six routes.

Local Chrome interactions confirmed total Rp100.000 → DP Rp10.000 and balance Rp90.000; changing the total to Rp250.000 recalculates DP Rp25.000; Rp100.001 produces Rp10.001; clearing the total clears DP. The weekday selector ends at 14.00–16.00 WIB. The encoded WhatsApp draft contains Chii, DP 10% and transfer/QRIS wording; no message was sent.

Desktop 1280px and mobile 390/320px were inspected together. No horizontal overflow was observed. A fresh independent review of four screenshots and the relevant source found no material correction-scope issues and approved proceeding with release verification. The packaged Impeccable detector remains unavailable; the manual independent review is the fallback. Current local screenshots: [desktop](evidence/booking-rules/desktop.png), [mobile](evidence/booking-rules/mobile.png), [320px](evidence/booking-rules/user-320.png), [review](evidence/booking-rules/mobile-review.png).

The build emits four browser-JS files totaling **20,428 bytes raw / 8,465 bytes gzip estimate** across all routes. This correction adds 157 raw / 44 gzip bytes compared with the first pushed preview. No dependency, image, font, iframe or framework hydration was added. These are asset-size estimates, not a new loading-time benchmark; the sub-one-second mobile LCP target remains unverified for `/book`.

Figma synchronization and Meta authorization remain deferred. No billing, credentials, Calendar access grants or real payment/Calendar API calls were introduced.
