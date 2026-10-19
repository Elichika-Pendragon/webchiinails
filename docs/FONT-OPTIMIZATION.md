# Font optimization — 20 October 2026

Both existing font families and public filenames are preserved. The combined
WOFF2 payload is **42,088 bytes**, down from **60,244 bytes** (30.1%). This is a
byte measurement, not a promise of a particular Lighthouse/LCP improvement.

| Font | Before | After | cmap entries retained |
|---|---:|---:|---:|
| Cormorant Garamond 500 | 23,312 B | 20,180 B | 211 of 229 |
| DM Sans variable 400–700 | 36,932 B | 21,908 B | 206 of 222 |

The subset keeps every original-supported codepoint in U+0020–U+00FF, current
generated page text and native controller labels, plus supported punctuation,
currency, arrows and symbols in U+2000–U+206F, U+20A0–U+20CF, U+2190–U+21FF and
U+25A0–U+27BF. There are zero missing required source-supported codepoints. New
Instagram captions with characters outside these ranges use normal font fallback;
the original Latin fonts already required fallback for many languages and emoji.
All OpenType layout features, hinting and font name/copyright metadata are kept.

DM Sans originally contained a 100–1000 variable weight axis, while CSS already
requests 400–700. Restricting the file to that range accounts for most savings.
Subsetting alone preserves the compared retained outlines and advances exactly.
Axis rebasing is not mathematically lossless: FontTools introduces tiny rounding,
with these maximum differences across the original glyph set at the used weights:

| Weight | Outline delta at 16px | Per-glyph advance delta at 16px |
|---|---:|---:|
| 400 | 0 | 0 |
| 500 | 0.0041px | 0.016px |
| 600 | 0.0092px | 0.016px |
| 700 | 0.0130px | 0 |

Path structure is unchanged. These geometry comparisons do not establish identical
browser rasterization; the small rounding tradeoff was accepted for this release.
Machine-readable checksums, cmap/axis checks and geometry results are recorded in
`font-verification.json`. Source timestamps are preserved; two independent runs
of the reproduction script produced identical output SHA-256 hashes.

## Reproduce

Exact originals and OFL files are backed up outside public assets at
`../backups/fonts-before-subset` in the local project workspace. Keep this backup
when moving the source folder; use its actual path with `--originals` below.
The script refuses sources with different SHA-256 hashes, preventing accidental
subsetting of an already reduced file:

- Cormorant: `8197bf53615ddc8c423f444c7f0eec63b7fa0ba093fcfbec60dfdd28429b0fc8`
- DM Sans: `9fea608a947e67020c33cad9a6fe3d60c54119dfb8cff87768a8117a15ed7543`

Build the pages first to make current text available. Use a temporary tooling
directory or a virtual environment; no Python dependency belongs in the browser
bundle or the Pages build requirements. Example PowerShell, with Python available:

```powershell
python -m pip install --target ..\tmp\fonttools fonttools==4.67.0 brotli==1.2.0
$env:PYTHONPATH = (Resolve-Path ..\tmp\fonttools).Path
python scripts/subset-fonts.py --originals ..\backups\fonts-before-subset
pnpm build
pnpm test
```

Regenerate after changing copy if it introduces other characters that the original
fonts supported. The ordinary Pages build uses the committed WOFF2 files and does
not install Python or invoke this script. To roll back, restore both WOFF2 files
from the exact-original backup; their existing URLs and CSS remain valid.

## License

Both supplied OFL 1.1 files and embedded metadata were checked; neither declares a
Reserved Font Name after its copyright statement. Names are not reserved by
default under [official OFL FAQ 5.7](https://openfontlicense.org/ofl-faq/). Existing
family names can remain. Both original copyrights and full OFL files remain beside
the fonts, together with `FONTLOG.txt`. These modified fonts remain under OFL 1.1.
