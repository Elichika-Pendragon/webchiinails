# Jessica photo selection — 21 October 2026

Six of the nine supplied photographs form the new image selection. They cover a soft French-and-gold manicure, red-and-silver nail art, spider-inspired nail art, two contrasting character press-on sets, and an overview of handmade press-on sets. This gives the site both close-up craft detail and a view of the physical sets without repeating all of the similar red manicures.

The French-and-gold photograph is the lead image because its pale pink, white and gold details sit naturally with Chii's existing theme. The other selected photographs provide examples for the work gallery and custom sets. The three unused sources remain untouched in the supplied Downloads folder.

## Source mapping

Only the six selected originals are archived, byte-for-byte, in `docs/source-assets/jessica-2026-10-21/`. These source JPEGs are outside `public/` and are not served by the website. `manifest.json` in that folder records the source and export dimensions, exact bytes, SHA-256 digests and encoder version.

| Export slug | Supplied original | Source dimensions | Source bytes |
| --- | --- | --- | ---: |
| `jessica-french-gold` | `WhatsApp Image 2026-10-21 at 00.33.42.jpeg` | 1200 × 1600 | 139,728 |
| `jessica-red-silver` | `WhatsApp Image 2026-10-21 at 00.33.42 (3).jpeg` | 1200 × 1600 | 135,518 |
| `jessica-forest-characters` | `WhatsApp Image 2026-10-21 at 00.33.44.jpeg` | 900 × 1600 | 112,643 |
| `jessica-cat-characters` | `WhatsApp Image 2026-10-21 at 00.33.44 (1).jpeg` | 1200 × 1600 | 141,296 |
| `jessica-spider-art` | `WhatsApp Image 2026-10-21 at 00.33.43.jpeg` | 1200 × 1600 | 124,996 |
| `jessica-press-on-collection` | `WhatsApp Image 2026-10-21 at 00.33.43 (1).jpeg` | 1200 × 1600 | 176,580 |

## Responsive exports

Exports use `public/images/<slug>-<width>.webp`. Pillow 12.3.0 applies EXIF orientation, preserves the full portrait composition, resizes with Lanczos, and encodes WebP at quality 82 / method 6. Export metadata is stripped. There is no generative editing, artwork retouching, color adjustment or baked-in crop. CSS can frame the images for individual placements.

Each source has three variants. The narrower forest photograph stops at its original 900-pixel width rather than being upscaled or mislabeled as 1080w.

| Slug | Small export | Medium export | Large export |
| --- | --- | --- | --- |
| `jessica-french-gold` | 360 × 480 · 15,110 B | 720 × 960 · 38,964 B | 1080 × 1440 · 66,388 B |
| `jessica-red-silver` | 360 × 480 · 14,914 B | 720 × 960 · 38,572 B | 1080 × 1440 · 66,044 B |
| `jessica-forest-characters` | 360 × 640 · 19,668 B | 720 × 1280 · 46,038 B | 900 × 1600 · 61,504 B |
| `jessica-cat-characters` | 360 × 480 · 16,958 B | 720 × 960 · 41,140 B | 1080 × 1440 · 66,734 B |
| `jessica-spider-art` | 360 × 480 · 14,212 B | 720 × 960 · 35,790 B | 1080 × 1440 · 59,042 B |
| `jessica-press-on-collection` | 360 × 480 · 23,390 B | 720 × 960 · 58,640 B | 1080 × 1440 · 94,438 B |

The 18 responsive WebP exports total **777,546 bytes** on disk; the six archived originals total **830,761 bytes**. These are inventory totals, not a claim that every variant is downloaded by a visitor. Actual transfer depends on the page's image placement, responsive `srcset`/`sizes`, viewport, device pixel ratio, lazy loading and browser cache. No device or network speed benchmark is asserted here.

## Social image fallback

`public/images/jessica-french-gold-share.jpg` is a **social-only** JPEG fallback for Open Graph, Twitter and structured-data image URLs. It is not the served hero image; the website hero uses the responsive WebP variants above.

This export preserves the French-and-gold portrait composition at **1080 × 1440**, encodes JPEG at quality **85** with progressive and optimize enabled, and strips source metadata. It is **151,355 bytes**. Together, the 18 WebP assets and this JPEG total **928,901 bytes**. Its exact file size, digest and social-only usage are recorded in the manifest, together with the separate JPEG encoder settings.

## Re-export

Install Pillow if needed, then run the following from the project root. By default it reads the exact source filenames from the current user's Downloads folder:

```sh
python scripts/export-jessica-photos.py
```

To reproduce from the archived originals:

```sh
python scripts/export-jessica-photos.py --source-directory docs/source-assets/jessica-2026-10-21
```

The script verifies all inputs before writing, refuses to replace an archived original with different bytes, keeps Downloads unchanged, and checks every export's dimensions and absence of EXIF/XMP/ICC metadata. It also verifies progressive encoding for the social JPEG. Fixed settings make exports repeatable within the recorded Pillow/codec version; a different encoder version may change compressed bytes. It updates the source/export manifest after a successful run.

## Website placement and interaction

Home uses French/gold as the lead with red/silver, forest characters and cats in the supporting mosaic. Its caption sits below the imagery. The About section shows the three press-on cards. The Custom Sets portfolio is a still six-photo grid. The whole four-tile Home mosaic rotates through the selected photos, crossfading one visible tile at a time every eight seconds, with Pause/Play and arrow controls. Reduced motion starts paused; the next responsive image is loaded and decoded before the old one is replaced. The tile shapes stay fixed. Photos move between positions over time; hidden supporting tiles on mobile do not load changing images. The Instagram embeds retain their separate swipeable track; the curated images do not pretend to belong to existing post permalinks. Only the lead photograph (or first portfolio photo on Custom Sets) is eager/high priority. Other owner photos are lazy; responsive srcset/sizes avoid sending every export. The social JPEG replaces the former photo in Open Graph, Twitter and business structured data.
