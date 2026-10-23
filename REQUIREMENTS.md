# Current acceptance requirements

Consolidated **23 October 2026**. Use [Product](PRODUCT.md) for scope, [developer guide](docs/DEVELOPER-GUIDE.md) for architecture and the [release checkpoint](docs/RELEASE-CHECKPOINT-2026-10-23.md) for what was actually verified.

## Public website

- Five public pages provide crawlable service/location/rules content with production metadata and a generated sitemap. Booking/approval/prices stay noindex and out of navigation/sitemap.
- Preserve the established branding, approved fixed Meet Chii photo, sticky header, visible contact controls and Shopee title **Shopee** with subtitle **Checkout Our Shopee**.
- Randomize the opening automatic mosaic across all visible tiles, then fade photos without sliding/manual controls. Keep the Instagram row separately swipeable, three recent plus nine random older, and defer third-party embeds/Maps.
- Load optimized responsive images; gallery uses small batches, not a download of the full collection on page opening. Monthly actual-still imports add ten (five recent/five random), keep at most 50 pool photos and retain the fixed About asset separately.

## Booking and owner tools

- Apply the manual minimum-DP contract, all required fields/proof, eight service-duration choices and WIB/Calendar rules in [Booking](docs/BOOKING.md), on both client and server.
- No amount recalculation of historical requests, no slot holds for pending requests and no successful acceptance without fresh capacity checks and atomic/idempotent storage.
- Exact verified owner identity authorizes review, receipts, accept/cancel and price edits. A review link or arbitrary Google account is insufficient. Enforce private/no-store responses, signed sessions, same-origin and CSRF checks.
- Preserve drafts/receipt/idempotency after an interrupted request. Require explicit retry and fresh availability. Restore without moving the existing calendar/preview/status layout.
- Shared prices support every menu service, bounded quantities, alternatives without double charging and summed ranges. Owner saves the complete catalog atomically with revision conflict protection; stored booking totals do not change.

## Operations

- Keep uploads in the private bound processor/D1 path with admission, Turnstile and independent image normalization. Image validity is not payment authenticity.
- Preserve last good Instagram/archive/photo content if an external dependency fails. Verify actual scheduled progress, not merely cron delivery. Respect configured bounds and check separate/shared provider quotas before capacity claims.
- Test relevant changes and build before release. Record fixture/live/physical-device distinctions. Do not generate real bookings, overwrite prices, restart indexing, update Figma or activate billing as incidental tests.

Dated reports elsewhere retain their original observations; their superseded pending steps or older DP/Meta designs are not current acceptance requirements.
