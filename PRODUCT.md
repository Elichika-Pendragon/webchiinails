# Chii Nails

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users and purpose

Chii Nails serves customers looking for custom nail art, extensions, basic manicure and press-on nails in Palembang. Visitors primarily use mobile browsers, including older Android phones on Indonesian 4G and iPhones. The site helps visitors review work, prices, studio details and booking rules, then consult Jessica through WhatsApp.

## Operating context

Jessica discusses each design and its price before booking. She shares one constant booking URL; customers enter name, WhatsApp number, agreed total, date and time. DP is a read-only calculation of 10% of the agreed total, rounded up to whole rupiah, and is recalculated by shared validation rather than trusted from the client. Appointment duration is two hours. The intended future flow verifies the deposit and writes the appointment to the existing Nail Art calendar that Jessica checks.

Latest interaction constraint: Jessica must not have to enter information or manage an admin dashboard. Use her existing Nail Art calendar. The owner's latest proposed flow is a per-request approval link inside the customer's prepared WhatsApp message: Jessica checks the actual DP and explicitly approves, then the backend adds the appointment. The customer still taps Send in WhatsApp. The approval requires Jessica's authenticated identity because the customer can also see the link. Opening a link must not approve a booking; use an explicit protected action and a fresh capacity check. This supersedes the earlier suggestion of automatically creating unverified Calendar requests; neither option is active in the local preview.

## Capabilities and constraints

- Existing static Astro website on Cloudflare Pages; React renders at build time. Keep the desktop scrolling Home and separate mobile detail pages.
- White, blush and rose identity, original logo and existing typography remain binding. Figma sync is deferred; preserve implementation documentation.
- Target fast loading on mobile and desktop. No new runtime framework, font downloads or animation library is needed for the booking form.
- Booking only, no walk-ins. DP is 10% of the agreed total and cancellation forfeits DP. Weekday Last book is 14:00, weekend 10:00, while studio closing stays 17:00/12:00. Shared src/content.js records these rules.
- Latest owner wording permits transfer or QRIS and calls the customer-facing booking contact Chii. This supersedes the earlier no-QRIS preference. Jessica manually checks the actual payment through WhatsApp. No payment API, paid plan or billing activation is authorized.
- The booking interface supports a labelled WhatsApp-only preview while the backend is disabled. A gated approval implementation is also prepared: five valid fields enable Book, which creates a pending request and opens WhatsApp with a unique owner link when configured. Stored requests and Calendar access remain inactive until configuration and explicit access grants are complete. Payment verification remains manual; no payment API is used.
- Jessica shares the same /book link after consultation. Never add Book/Booking to the header, menu or public booking sections. Keep this private-link route noindex and outside the search sitemap.
- Instagram developer access is blocked separately; current curated photos remain functional.

## Open decisions

- Transfer destination, QRIS artwork and actual payment instructions/costs; do not invent receiving details.
- Calendar authorization and the specific calendar to write to. The owner has identified the target Google account; its address is retained only in local project state, not public source or customer-facing code.
- How to authenticate Jessica's agreed total and manual DP check before fully automatic confirmation: client-entered total alone does not prove the consultation agreement.
- Start-time spacing, booking horizon, advance notice, slot holds, exceptions and buffer periods. Any preview defaults must be identified as provisional.

## Product principles

1. Consultation comes first and prices remain custom.
2. A customer should understand the booking status and payment amount without technical knowledge.
3. Jessica verifies the transfer and agreed amounts; customer-entered values never establish payment or approval. Automatic appointment availability will require an authorized calendar.
4. Keep customer information private and the public website lightweight.
