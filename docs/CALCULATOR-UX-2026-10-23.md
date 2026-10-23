# Calculator categories and shorter public copy — 23 October 2026

Owner selected the separate-sections concept using Impeccable, then requested less repeated public text. This is a frontend refinement of the existing shared catalog and pricing rules.

## Delivered behavior

- Five independent native sections: Nail Art, Cat Eye, Extension, Extras, Removal; all 21 catalog choices remain available together.
- Explicit add actions, conditional bounded quantities, itemized totals/ranges and existing alternative replacement rules.
- Current fetched prices in every category menu; existing owner price editor and D1 schema unchanged.
- Desktop estimate alongside the controls; compact layout stacks and provides a native jump to the estimate. Standalone Cat Eye/removal and optional kit/glue remain available.
- Base-kit contents moved into an accessible native disclosure. No hidden keyword copy or new runtime dependency.
- Repeated hero/service pitches, duplicate gallery actions and the repetitive benefits section removed/shortened. Approved Meet Chii section and booking rules verified unchanged against the preceding commit.

## Verification

The existing 527 Node tests passed. Production build generated eight routes and passed all five public-page SEO/asset assertions. Impeccable's mechanical detector returned no findings for the five changed frontend files. Final browser JS across all routes: 101,874 raw / 36,594 gzip bytes, versus the preceding 101,201 / 36,476 (+118 gzip bytes).

An isolated local UI fixture served the built site and synthetic price API with third-party embeds blocked. Desktop 1280px, mobile 390px and narrow 320px checks observed no horizontal overflow (client/scroll widths respectively 1265/1265, 375/375, 305/305). Category selects/add actions measured 48px tall. This is viewport/browser testing, not physical-device evidence.

Observed calculations with the default catalog: polos + Cat Eye + 10-nail extension + glitter + 10-nail gel removal = Rp123,000; replacing extension with three individually priced nails = Rp105,000; four nails = Rp109,000. Zero quantity kept the last valid total and hid the confirmation link. Correcting quantity, removing glitter, adding kit/glue and two ranged 3D extras yielded Rp137,000–151,000, with matching line items in the unsent WhatsApp URL. Cat Eye alone = Rp40,000; regular removal alone = Rp6,000. Stale action feedback cleared after later estimate changes.

Changing Cat Eye to Rp42,000 in the temporary in-memory fixture updated both its option label and estimate after reload; adding polos yielded Rp67,000. This was synthetic only: no production price, booking, receipt or Calendar event was changed during verification.

## Search behavior

Useful content remains readable in HTML or native expandable sections. No background-colored, zero-opacity or off-screen keyword text was added. [Google's spam policies](https://developers.google.com/search/docs/essentials/spam-policies#hidden-text-and-link-abuse) distinguish deliberate hidden search text from legitimate expandable UI. Titles, structured data, five-page sitemap and private-route noindex boundaries remain. This does not promise ranking or immediate search snippet changes.
