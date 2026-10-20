# Chii Nails

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users and purpose

Chii Nails serves customers looking for custom nail art, extensions, basic manicure and press-on nails in Palembang. Visitors primarily use mobile browsers, including older Android phones on Indonesian 4G and iPhones. The site helps visitors review work, prices, studio details and booking rules, then consult Jessica through WhatsApp.

## Operating context

Jessica discusses each design and its price before booking. She wants to share one constant booking URL and let customers enter name, WhatsApp number, agreed total, deposit, date and time. Appointment duration is two hours, confirmed by the owner on 20 October 2026. The intended future flow verifies the deposit and writes the appointment to a separate Google Calendar account that Jessica checks.

Latest interaction constraint: Jessica must not have to enter information or manage an admin dashboard. Use her existing Nail Art calendar. The owner's latest proposed flow is a per-request approval link inside the customer's prepared WhatsApp message: Jessica checks the actual DP and explicitly approves, then the backend adds the appointment. The customer still taps Send in WhatsApp. The approval requires Jessica's authenticated identity because the customer can also see the link. Opening a link must not approve a booking; use an explicit protected action and a fresh capacity check. This supersedes the earlier suggestion of automatically creating unverified Calendar requests; neither option is active in the local preview.

## Capabilities and constraints

- Existing static Astro website on Cloudflare Pages; React renders at build time. Keep the desktop scrolling Home and separate mobile detail pages.
- White, blush and rose identity, original logo and existing typography remain binding. Figma sync is deferred; preserve implementation documentation.
- Target fast loading on mobile and desktop. No new runtime framework, font downloads or animation library is needed for the booking form.
- Booking only, no walk-ins. DP is required and cancellation forfeits DP. Existing opening times and booking cutoffs remain authoritative in src/content.js.
- Jessica rejected QRIS because of transaction deductions. The selected first phase uses e-wallet transfer with Jessica manually checking the DP through WhatsApp. No payment API, paid plan or billing activation is authorized.
- The initial booking implementation is a static preview, authorized for publication on 20 October 2026. It does not accept money, reserve slots, persist customer details or access Calendar. Details stay in page memory until the visitor explicitly opens the reviewed WhatsApp summary.
- Jessica shares the same /book link after consultation. Never add Book/Booking to the header, menu or public booking sections. Keep this private-link route noindex and outside the search sitemap.
- Instagram developer access is blocked separately; current curated photos remain functional.

## Open decisions

- E-wallet destination and real transfer instructions/costs; do not invent receiving details.
- Calendar authorization and the specific calendar to write to. The owner has identified the target Google account; its address is retained only in local project state, not public source or customer-facing code.
- How to authenticate Jessica's agreed total/DP before fully automatic confirmation: client-entered values alone do not prove the consultation agreement.
- Start-time spacing, booking horizon, advance notice, slot holds, exceptions and buffer periods. Any preview defaults must be identified as provisional.

## Product principles

1. Consultation comes first and prices remain custom.
2. A customer should understand the booking status and payment amount without technical knowledge.
3. Jessica verifies the transfer and agreed amounts; customer-entered values never establish payment or approval. Automatic appointment availability will require an authorized calendar.
4. Keep customer information private and the public website lightweight.
