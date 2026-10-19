# Chii Nails — React website

Responsive React + Vite website with a home page and About & Booking Rules page. English headlines and Indonesian practical copy are intentional.

## Run locally

Use a supported Node.js release (22.12+ or a newer supported LTS) and pnpm. In this folder:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed in the terminal. Node.js runs the development/build tools; the published website is static and does not need a Node server.

```sh
pnpm build
pnpm preview
```

Use Cloudflare Pages with Git integration for the site and its Instagram Function; follow [DEPLOYMENT.md](./DEPLOYMENT.md). Static-only hosting can serve `dist/` but cannot run the automatic Instagram API. Keep both `index.html` and `about.html`. Root-relative paths expect hosting at a domain root. Nothing has been published or connected to a domain yet.

## Edit the content

- `src/content.js`: contact links, location, opening hours, service descriptions, curated Instagram posts, and booking rules.
- `src/App.jsx`: React components and interactions; `src/main.jsx` hydrates the prerendered pages.
- `scripts/`: build-time HTML, metadata, structured data and sitemap generation. See [SEO.md](./SEO.md).
- `src/styles.css`: responsive layout and brand colors.
- `public/images/`: actual Chii logo, nail photos, studio reference image and map preview.

The latest supplied policy replaces earlier no-deposit wording: booking requires name, phone number, date, time and DP. Cancellation forfeits the DP; lateness costs Rp10.000 per 10 minutes. The DP amount is not specified, so customers are directed to confirm it on WhatsApp. Hours are Mon–Fri 08.00–17.00 WIB (last booking 15.00) and Sat–Sun 08.00–12.00 WIB (last booking 10.00). Booking is required; walk-ins are not accepted. Studio-only service and no-rescheduling rules remain. No payment gateway or online deposit collection is implemented.

## Live integrations

- Instagram profile: https://www.instagram.com/chii.nails_/
- Google Maps: https://www.google.com/maps?cid=13060782932404739183
- WhatsApp from the current public Instagram bio: https://wa.me/6285111028211
- Four specific Instagram post URLs are in `src/content.js`.

The hero now uses the four newest available Instagram image previews (including Reel covers), inside fixed frames with centered object-fit: cover cropping. It shares one feed request/polling cycle with the gallery. API authorization is still required; until then or when preview images fail, local salon photos remain.

The gallery is a horizontally scrollable slider with arrow buttons, touch scrolling, keyboard arrows, and real Instagram post embeds using Instagram's embed script. Embeds load as the gallery approaches the viewport. If Instagram cannot render, the gallery displays a local photo and a link to the original post. The slider also supports newest posts through the included server API; see INSTAGRAM-SETUP.md. Until owner credentials are configured it uses four curated fallback posts. Some source posts are Reels; Instagram controls playback inside its embed. No custom autoplay is added.

Chrome testing confirmed that the Google Maps iframe resolves to Dewi Salon & Chii.Nails in Palembang. Instagram created its iframe elements but the embedded requests failed in the testing browser; successful live rendering still needs checking on the published domain with public embedding enabled. The local-photo fallback remains usable.

The floating chat stays at the lower right and opens WhatsApp and Instagram choices. Opening a contact link does not send a message automatically.

## Backend recommendation

The owner's chosen approach avoids LightWidget: Cloudflare Pages, our official Instagram API feed, and a daily renewal Worker with encrypted KV token storage. It checks daily and renews approximately every 30 days for a 60-day token. See [LOW-MAINTENANCE.md](./LOW-MAINTENANCE.md) and [INSTAGRAM-SETUP.md](./INSTAGRAM-SETUP.md). The code is prepared and tested with controlled responses, but owner authorization, bindings, secrets and live deployment are still pending. There is no public renewal endpoint or token in the React bundle.

The Cloudflare Pages Function reads current credentials from KV; `workers/instagram-refresh.js` updates them independently of visits. The Vercel adapter remains a static-token alternative for an appropriate paid/commercial plan, and does not use this Cloudflare renewal job. Booking/DP arrangements happen through WhatsApp; this website stores no customer records. Static-only hosting retains the curated fallback feed.

Supabase is not needed for this feed. Consider it later only for stored bookings or an owner dashboard: Postgres for records, Auth for owner login and Storage for uploaded images, with Row Level Security. Never place a service-role key in browser code. Meta can still revoke authorization, requiring an owner reconnect and a technical operator to reseed credentials. Automatic failure notifications and a one-click OAuth dashboard are not implemented.

Official references: [Vite guide](https://vite.dev/guide/), [Supabase React quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/reactjs), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Before launch

Confirm that 0851-1102-8211 is the preferred booking number (older public listings use a different number), confirm the DP amount and payment instructions, and test the four embeds on the production domain. Keep the Instagram-sourced assets only with the salon owner's authorization. The supplied studio photo is cropped from a story screenshot; replace it with the original high-resolution photo when available.

Design: https://www.figma.com/design/lBhcVrZPmNAJO4MlFg9bVC/Chii-Nails-web-mark-1?node-id=9-21

Figma contains editable desktop/mobile layouts and visual previews of the post slider. The DP policy, weekday/weekend hours, last-booking cutoffs and no-walk-in wording have also been updated directly in the Figma editor through Chrome after the connector reached its limit. No Figma Code Layer was created because the connector's code upload tools were unavailable; the runnable React source is separate.


