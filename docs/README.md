# Documentation index

Reviewed **23 October 2026** against the current source. Start with the current guides below; dated reports describe what was tested at their own revision, not a later deployment.

## Current guides

| Topic | Guide |
| --- | --- |
| Setup and project overview | [Root README](../README.md) |
| Architecture, files, APIs and bindings | [Developer guide](DEVELOPER-GUIDE.md) |
| Deployment, recovery and configuration | [Deployment](../DEPLOYMENT.md) |
| Order references, private access and printable receipts | [Order codes and receipts](ORDER-CODES-AND-RECEIPTS.md) |
| Booking, payment, receipts and owner authorization | [Booking](BOOKING.md) |
| Private upload processor | [Processor design](BOOKING-CPU-PROCESSOR.md) |
| All-service calculator and owner price editor | [Prices](pricing.md) |
| Hourly Instagram archive and embeds | [Instagram operation](../INSTAGRAM-SETUP.md) |
| Monthly still photos and rolling retention | [Monthly photos](monthly-photos.md) |
| Meta integration history and chosen alternative | [Meta roadblocks](META-ROADBLOCKS.md) |
| Search directives, sitemap and Google status | [SEO](../SEO.md) |
| Routine operations and failure handling | [Maintenance](../LOW-MAINTENANCE.md) |
| Product constraints and design | [Product](../PRODUCT.md), [design](../DESIGN.md), [requirements](../REQUIREMENTS.md) |

## Release records and evidence

Latest workflow: [Booking without private access codes — 24 October 2026](BOOKING-SIMPLIFICATION-2026-10-24.md).

Latest: [Order-code and printable-receipt production release — 24 October 2026](evidence/order-codes-2026-10-24/README.md).

[23 October checkpoint](RELEASE-CHECKPOINT-2026-10-23.md) links the final audit, booking restore fix, pricing, monthly imports and live release evidence. [Evidence index](evidence/README.md) is the entry point for captured results. Evidence retains its original dates, revisions and test scope.

Other dated reports, the original React README, migration/performance reports and earlier booking plans are historical. They can describe superseded policies, unverified steps that were later completed, or an older architecture. In particular, do not use earlier 10% DP, stateless upload processing or Meta-token setup notes as today's production instructions. The current guides above take precedence; the source and committed Worker configs define the implementation.

## Keeping this current

When behavior changes, update the relevant guide in the same change. Record actual production observations separately from source design and isolated tests. Do not replace old measurements with new claims. Update `.env.example` when configuration names change, with placeholders only. Check relative links and `git diff --check` before committing. A documentation-only change does not require creating a real booking, changing customer prices or requesting Google indexing.
