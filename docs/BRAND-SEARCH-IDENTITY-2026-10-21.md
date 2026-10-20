# Chii Nails search identity — 21 October 2026

The website identifies itself as **Chii Nails**, with **Chii Nails Palembang** as the alternate name on its existing `WebSite` structured-data entity. The site already uses the Chii Nails name in page titles and Open Graph metadata. Shared browser metadata now also uses this name for `application-name` and `apple-mobile-web-app-title`.

## Brand icon exports

The browser icons come from the existing original `docs/source-assets/chii-nails-original.png`, a 2000 × 2000 PNG. The source is unchanged. The export script removes only surplus flat pink canvas, retains the entire original artwork, and centers it on a square pink background matching the source (`#ffd2e6`). It makes no artwork, font or theme changes.

Artwork bounds are `(320, 377, 1674, 1435)` using Pillow's exclusive right/bottom coordinates. A 55-pixel minimum pink padding produces a 1464 × 1464 square before resizing. Exports contain no inherited EXIF, XMP or ICC metadata.

| Stable public path | Dimensions | Bytes |
| --- | --- | ---: |
| `/images/chii-favicon-96.png` | 96 × 96 PNG | 9,374 |
| `/images/chii-favicon-192.png` | 192 × 192 PNG | 25,056 |
| `/images/chii-apple-touch-icon.png` | 180 × 180 PNG | 22,857 |
| `/favicon.ico` | 16 × 16, 32 × 32 and 48 × 48 entries | 5,651 |

The normal page layout and both booking page heads reuse the same `brandHead()` helper from `scripts/seo.mjs`. This replaces the previous generic JPEG favicon reference with explicit PNG icon sizes, an Apple touch icon and the root ICO fallback. Header logos remain unchanged. Booking and approval pages retain their existing `noindex` directives.

Re-export with Pillow installed:

```sh
python scripts/export-brand-icons.py
```

## What Google controls

The name and icon are signals Google can use when it crawls the website; the website cannot force a particular search-result display. Google chooses the displayed site name and favicon and determines when refreshed assets appear after recrawling. Publishing these changes does not guarantee an immediate search-result change. No Search Console setting, ownership permission or external account was modified as part of this work.

References: [Google site-name documentation](https://developers.google.com/search/docs/appearance/site-names) and [favicon documentation](https://developers.google.com/search/docs/appearance/favicon-in-search).
