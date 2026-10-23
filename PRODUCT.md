# Chii Nails

Current product brief, reviewed **23 October 2026**. [Documentation index](docs/README.md) and [release checkpoint](docs/RELEASE-CHECKPOINT-2026-10-23.md) separate current rules from historical delivery evidence.

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users and purpose

Chii Nails serves customers looking for nail art, extensions and custom press-on nails in Palembang. Most visitors use phones, including older Android devices on slow Indonesian connections. Help them see actual work, understand services/prices/rules, consult through WhatsApp and complete a booking without losing progress after a connection interruption.

## Operating context

Jessica agrees on the service and price before sharing `/book`. New bookings use editable whole-Rupiah DP >=Rp20,000 and <=the agreed total, or full payment. There is no percentage calculation; totals <=Rp20,000 normalize to full payment. Require a prepared receipt and fresh availability. Jessica alone verifies the actual transaction and accepts/cancels with her allowlisted Google login. Pending requests do not hold time. All-day/timed Calendar occupancy matters regardless of Busy/Free. Preserve stored historical amounts/policies and fail closed on uncertain provider/auth results.

## Capabilities and constraints

- Static Astro on Cloudflare Pages, React at build time only, small native browser controllers; preserve mobile performance and existing white/blush/rose identity, logo and typography.
- Keep the smooth sticky header and automatic fading photo mosaic across its visible tiles. Randomize each opening, avoid duplicate visible photos, pause when hidden/offscreen and respect reduced motion. Keep Instagram's separate row swipeable and deferred, like Maps.
- Shared all-service calculator has independent Nail Art, Cat Eye, Extension, Extras and Removal sections, one itemized estimate, quantities, ranges and optional kit/glue. `/prices` lets the sole owner edit the persisted catalog; customer quotes already stored remain unchanged.
- Use the same hourly public-link collector and a separate monthly optimized still-photo import. Five recent plus five random older per successful month; no Reel covers/video; rolling pool 50 including originals. Keep the approved Meet Chii photo fixed and exclude its duplicate from the portfolio.
- `/book`, `/book/approve` and `/prices` remain unlisted/noindex and absent from sitemap. Search directives do not replace server authorization. Keep a visible chat/contact affordance and the approved Shopee title/subtitle/link.
- No payment gateway, automatic bank-transfer authenticity claim, WhatsApp chat reading, account-cookie scraping, incidental paid-plan activation or VPS. Private receipts stay in D1 with the documented 30-day post-appointment expiry/cleanup; public photos have separate retention.
- Preserve per-tab draft/receipt recovery, explicit retry and existing reserved form space. Do not introduce extra hydration, unnecessary downloads or automatic submission on reconnection.
- Future Figma changes require the owner's command. Google Console work is separate and currently stopped; do not restart it during routine code/docs maintenance.

Public copy should explain each point once where practical. Remove repeated pitches; keep service/location facts, prices, essential warnings and booking rules visible or in usable disclosures. Never camouflage SEO text against its background.

## Verification and unresolved limits

Current implementation and dated tests are linked from the release checkpoint. Actual bank payment verification is manual; isolated Calendar/provider tests do not prove a new live appointment acceptance. Physical-device/carrier behavior, future scraper reliability, Google's sitemap processing and rankings are not guaranteed. Full-payment cancellation/refund policy still needs owner clarification; do not invent one in customer copy.
