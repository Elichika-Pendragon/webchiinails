#!/usr/bin/env python3
"""Export square browser icons from the complete original Chii Nails artwork.

Requires Pillow. Trims only the surplus flat pink canvas, adds equal pink
padding around a square composition, and preserves all non-background pixels.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "source-assets" / "chii-nails-original.png"
OUTPUT = ROOT / "public" / "images"
PADDING_RATIO = 0.04
PNG_EXPORTS = ((96, "chii-favicon-96.png"), (192, "chii-favicon-192.png"), (180, "chii-apple-touch-icon.png"))


def main() -> None:
    with Image.open(SOURCE) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
    background = image.getpixel((0, 0))
    bounds = ImageChops.difference(image, Image.new("RGB", image.size, background)).getbbox()
    if bounds is None:
        raise ValueError("Source contains no artwork distinct from its background.")
    left, top, right, bottom = bounds
    art = image.crop(bounds)
    padding = math.ceil(max(art.size) * PADDING_RATIO)
    side = max(art.size) + padding * 2
    square = Image.new("RGB", (side, side), background)
    square.paste(art, ((side - art.width) // 2, (side - art.height) // 2))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    exports = []
    for size, name in PNG_EXPORTS:
        path = OUTPUT / name
        square.resize((size, size), Image.Resampling.LANCZOS).save(path, "PNG", optimize=True)
        with Image.open(path) as check:
            if check.size != (size, size) or check.getexif() or any(key in check.info for key in ("exif", "xmp", "icc_profile")):
                raise ValueError(f"Invalid icon export: {name}")
        exports.append({"file": path.relative_to(ROOT).as_posix(), "width": size, "height": size, "bytes": path.stat().st_size})

    ico = ROOT / "public" / "favicon.ico"
    square.resize((192, 192), Image.Resampling.LANCZOS).save(ico, "ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    with Image.open(ico) as check:
        sizes = sorted(check.ico.sizes())
        if sizes != [(16, 16), (32, 32), (48, 48)]:
            raise ValueError("ICO is missing an expected icon size.")
    exports.append({"file": ico.relative_to(ROOT).as_posix(), "sizes": sizes, "bytes": ico.stat().st_size})
    print(json.dumps({"source": SOURCE.relative_to(ROOT).as_posix(), "sourceDimensions": image.size, "background": background, "artBounds": [left, top, right, bottom], "squareSize": side, "padding": padding, "exports": exports}, indent=2))


if __name__ == "__main__":
    main()
