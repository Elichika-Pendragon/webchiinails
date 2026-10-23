# Chii Nails

Code documentation reviewed against the repository on **23 October 2026**. Production: https://chiinails.pages.dev/. Private repository: Elichika-Pendragon/webchiinails, branch `main`.

Astro builds static HTML; React is used at build time only. Small native JavaScript controllers handle the gallery, calculator, booking and owner tools. Cloudflare Pages Functions, D1 and private Workers provide the server features. No browser React hydration, VPS or payment gateway is required.

## Start here

- [Documentation index](docs/README.md): current guides versus historical evidence.
- [Developer guide](docs/DEVELOPER-GUIDE.md): architecture, source map, APIs and configuration.
- [Deployment and recovery](DEPLOYMENT.md): existing Pages/Worker setup and release order.
- [Booking contract](docs/BOOKING.md): manual deposit, receipts, owner approval and recovery.
- [Shared prices and calculator](docs/pricing.md): all-service combinations and owner editor.
- [Instagram operation](INSTAGRAM-SETUP.md), [monthly photos](docs/monthly-photos.md), and [our Meta roadblocks](docs/META-ROADBLOCKS.md).
- [SEO](SEO.md) and [maintenance](LOW-MAINTENANCE.md).
- [Latest release checkpoint](docs/RELEASE-CHECKPOINT-2026-10-23.md): dated verification, evidence and limitations.

## Local development

The package requires Node >=22.22.0; the current workflow uses Node 24 and pnpm 11.25.0. Use the committed lockfile.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
pnpm preview
```

`pnpm dev` and `pnpm preview` serve the site, not the complete Cloudflare backend. Booking, private RPC, D1, Images and scheduled jobs need their bound runtime or isolated fixtures. Missing production credentials must not be worked around by disabling checks. `.env.example` lists placeholders, not real credentials. A build without `SITE_URL` deliberately stays noindex and omits the sitemap.

Monthly-photo tests, using a separate Python environment:

```sh
python -m pip install -r scripts/monthly-photos-requirements.txt
python -m unittest discover -s scripts -p 'test_monthly_photos.py'
```

Running `scripts/monthly_photos.py` itself fetches images and changes catalogs/assets; it is a refresh operation, not a read-only test.

## Routes and current behavior

Public pages: `/`, `/services`, `/custom-sets`, `/about`, `/visit`. The unlisted `/book`, `/book/approve` and `/prices` routes have noindex directives and are excluded from the sitemap. Noindex is not access control; owner APIs independently verify the authorized Google identity.

Booking uses an editable DP of at least Rp20,000, bounded by the agreed total, or full payment. New requests use `manual-min20k-v3`, with no percentage calculation. A prepared receipt and fresh availability are required. Jessica checks the actual bank transaction and explicitly accepts or cancels. Existing requests retain their stored payment rules and amounts.

The Instagram row shows three recent posts plus nine distinct random archive posts, with embeds deferred until needed. The hourly public-link collector is independent of the monthly photo refresh. Monthly imports use actual still photos, five recent plus five random older, in one rolling pool capped at 50 including the original six. The approved Meet Chii image remains fixed and its assets are retained separately.

The shared calculator combines the listed services, quantities, ranges and optional press-on kit/glue. Jessica edits the same persisted price catalog at `/prices` using the existing owner login.

## Verification boundaries

The latest functional release recorded 527 Node tests, 11 Python tests, successful production build/asset checks, bounded HTTP checks and desktop/mobile viewport checks. See the checkpoint for the exact commits and results. Simulated network/viewports are not physical-device evidence; screenshot validation is not bank-payment verification. These are dated observations, not a promise of unlimited traffic or permanent scraper availability.

Keep secrets, receipt bytes, private account identifiers and authentication material out of source, screenshots and logs. Never commit `.env*` values, `.dev.vars`, `.private`, dependency folders or generated `dist` output. Do not overwrite concurrent work with a force push.
