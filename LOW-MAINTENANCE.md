# Routine maintenance

Current operating guide, reviewed **23 October 2026**. See [deployment](DEPLOYMENT.md) for configuration and [documentation index](docs/README.md) for technical guides.

Jessica's normal work is consultation through WhatsApp, checking the actual payment, then accepting/cancelling through the protected approval page. She can change all shared menu/kit/glue prices at https://chiinails.pages.dev/prices using the existing authorized Google account. Booking prices already agreed with a customer are immutable snapshots, independent of later menu edits.

## Automatic work

| Work | Schedule/trigger | What to verify |
| --- | --- | --- |
| Production HTML, robots and sitemap | Successful production build | Correct origin; five public sitemap URLs |
| Calendar availability | Customer's visible booking checks and owner decision | Fresh sanitized slots; no approval without capacity checks |
| Instagram links | Hourly, minute 17 | `lastSuccessAt` advance and valid saved archive, not just cron delivery |
| Monthly optimized still photos | First day, 09:43 WIB, subject to GitHub delay | Successful tested batch/commit/deployment; at most 50 pool photos |
| Expired receipt cleanup | Daily, 07:15 WIB | Worker result and expired-image backlog, bounded batch of 500 |

The public Maps/Instagram embeds load near the viewport rather than blocking initial rendering. The calculator updates locally from one shared catalog; public prices cache for 60 seconds. Ordinary visitors never trigger a scraper or monthly import.

## If something fails

- Booking unavailable: preserve drafts/idempotency; inspect readiness, bindings, provider and admission errors. Never relax the owner allowlist or accept without a valid prepared receipt/fresh slot.
- Payment screenshot looks suspicious: Jessica checks the actual transaction. Image decoding is not fraud detection.
- Instagram stale/blank: retain the archive and fallback links; inspect collector and embed behavior separately. Do not repeatedly scrape or assume a blank iframe proves deletion.
- Monthly workflow failure: retain existing assets/catalogs; fix the actual error before dispatching again. A completed same-month batch is a no-op. Do not bypass tests or delete old images before replacements verify.
- Price conflict: reload the latest catalog and reconcile edits; do not overwrite an unseen revision. A failed/uncertain save keeps in-page edits for retry/reconciliation.
- Google still shows an old site name or sitemap warning: follow [SEO](SEO.md). Neither a successful deploy nor a sitemap submission proves Google processed it.

Review Cloudflare usage across the account before a traffic increase. Private receipts and public gallery photos have different retention policies. Keep secrets out of logs/support screenshots and close inspection tabs after use. Figma updates and Google indexing actions are separate, explicit owner tasks; they are not routine side effects of code/documentation work.
