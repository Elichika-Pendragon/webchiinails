# Chii Nails — Astro static website

Astro generates five HTML pages using the existing React presentation components **only at build time**. A small native JavaScript controller handles navigation, chat, Instagram, and Maps. There is no browser React hydration. Desktop retains the long scrolling homepage; mobile gets a shorter homepage and dedicated Services, Custom Sets & Prices, Visit, and About pages.

## Run locally

Use Node **22.22.0 or newer** on a supported even-numbered release. This prototype was built with Node 24.19.0 and pnpm 11.25.0. Cloudflare's earlier Node 22.16.0 default must be updated before deploying this migration.

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd test
pnpm.cmd dev
```

Build and inspect a production-origin artifact:

```powershell
$env:SITE_URL = 'https://chiinails.pages.dev'
pnpm.cmd build
pnpm.cmd check:assets
pnpm.cmd preview
```

`dist/` is the static output. Without `SITE_URL`, or on a non-production Cloudflare branch, pages use `noindex` and the sitemap is omitted. Keep `public/googlefe4df279dce4c32d.html`: it retains Google Search Console ownership verification.

## Editing

- `src/App.jsx`, `src/PriceList.jsx`: build-time presentation; no `client:*` directives.
- `src/styles.css`: shared responsive visual design.
- `src/content.js`: contacts, hours, booking rules, services, and owner-supplied prices.
- `src/pages/`, `src/layouts/Page.astro`: static routes and document metadata.
- `src/scripts/client.js`: native browser interactions and five-minute public feed refresh.
- `scripts/seo.mjs`: unique metadata, canonical URLs, WebSite/NailSalon schema, robots and sitemap helpers.
- `functions/api/instagram.js`, `server/`, `workers/`: unchanged server-side Instagram API and encrypted token renewal system.

## Instagram and hosting

Instagram authorization remains pending owner setup. Local curated posts and photographs work while `/api/instagram` returns its sanitized unavailable response. Astro never requests Instagram during the build. Once the official API is configured, the hero and gallery refresh in the browser immediately and every five minutes while the page is visible; unchanged embeds are retained.

Deploy to **Cloudflare Pages**, with build command `pnpm build`, output `dist`, and the root `functions/` directory. This is static Astro with **no Cloudflare Astro adapter**. Keep the existing Pages Functions/KV bindings and separate scheduled renewal Worker. `pnpm build:worker` and `pnpm seed:instagram` remain available; never commit credentials or `.private/`.

Read [MIGRATION-ASTRO.md](MIGRATION-ASTRO.md) before switching production. All existing operational documents are preserved. [README-REACT.md](README-REACT.md) retains the original React instructions as historical reference; its Vite/prerender commands are superseded here.
