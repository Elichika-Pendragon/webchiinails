#!/usr/bin/env python3
"""Export six responsive WebP photo sets and one social-only JPEG fallback.

Requires Pillow. Sources default to ~/Downloads; the archived originals can also
be supplied with --source-directory docs/source-assets/jessica-2026-10-21.
The original photographs are copied byte-for-byte into docs, never into public.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image, ImageOps, __version__ as pillow_version, features


PHOTOS = (
    ("jessica-french-gold", "WhatsApp Image 2026-10-21 at 00.33.42.jpeg"),
    ("jessica-red-silver", "WhatsApp Image 2026-10-21 at 00.33.42 (3).jpeg"),
    ("jessica-forest-characters", "WhatsApp Image 2026-10-21 at 00.33.44.jpeg"),
    ("jessica-cat-characters", "WhatsApp Image 2026-10-21 at 00.33.44 (1).jpeg"),
    ("jessica-spider-art", "WhatsApp Image 2026-10-21 at 00.33.43.jpeg"),
    ("jessica-press-on-collection", "WhatsApp Image 2026-10-21 at 00.33.43 (1).jpeg"),
)
TARGET_WIDTHS = (360, 720, 1080)
QUALITY = 82
METHOD = 6
SOCIAL_QUALITY = 85
ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "docs" / "source-assets" / "jessica-2026-10-21"
OUTPUT = ROOT / "public" / "images"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def export(source_directory: Path) -> dict:
    if not features.check("webp"):
        raise RuntimeError("This Pillow installation does not support WebP.")

    # Validate every input before writing any export or archive file.
    for _, filename in PHOTOS:
        source = source_directory / filename
        with Image.open(source) as image:
            image.verify()
        archived = ARCHIVE / filename
        if archived.exists() and sha256(source) != sha256(archived):
            raise ValueError(f"Archived original differs from supplied source: {filename}")

    ARCHIVE.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest = {
        "collection": "Jessica photographs supplied 2026-10-21",
        "encoder": {"library": "Pillow", "version": pillow_version, "format": "WebP", "quality": QUALITY, "method": METHOD},
        "socialEncoder": {"library": "Pillow", "version": pillow_version, "format": "JPEG", "quality": SOCIAL_QUALITY, "progressive": True, "optimize": True},
        "processing": ["EXIF orientation", "uncropped aspect ratio", "Lanczos resize", "no upscaling", "strip export metadata"],
        "photos": [],
    }

    for slug, filename in PHOTOS:
        source = source_directory / filename
        archived = ARCHIVE / filename
        if not archived.exists():
            shutil.copyfile(source, archived)

        with Image.open(source) as original:
            oriented = ImageOps.exif_transpose(original).convert("RGB")
            # A fresh image prevents EXIF, XMP and ICC data from being inherited.
            pixels = Image.new("RGB", oriented.size)
            pixels.paste(oriented)

        source_width, source_height = pixels.size
        photo = {
            "slug": slug,
            "source": {"file": filename, "width": source_width, "height": source_height, "bytes": source.stat().st_size, "sha256": sha256(source)},
            "exports": [],
        }
        # The 900-pixel-wide forest photograph gets a truthful 900w maximum.
        for width in sorted({min(target, source_width) for target in TARGET_WIDTHS}):
            height = round(source_height * width / source_width)
            resized = pixels.resize((width, height), Image.Resampling.LANCZOS)
            destination = OUTPUT / f"{slug}-{width}.webp"
            resized.save(destination, "WEBP", quality=QUALITY, method=METHOD)
            with Image.open(destination) as check:
                if check.size != (width, height) or check.getexif() or any(key in check.info for key in ("exif", "xmp", "icc_profile")):
                    raise ValueError(f"Unexpected export dimensions or metadata: {destination.name}")
            photo["exports"].append({"file": destination.relative_to(ROOT).as_posix(), "width": width, "height": height, "bytes": destination.stat().st_size, "sha256": sha256(destination)})
        if slug == "jessica-french-gold":
            width = min(1080, source_width)
            height = round(source_height * width / source_width)
            destination = OUTPUT / f"{slug}-share.jpg"
            pixels.resize((width, height), Image.Resampling.LANCZOS).save(
                destination, "JPEG", quality=SOCIAL_QUALITY, progressive=True, optimize=True
            )
            with Image.open(destination) as check:
                if check.size != (width, height) or check.getexif() or any(key in check.info for key in ("exif", "xmp", "icc_profile")) or not check.info.get("progressive"):
                    raise ValueError(f"Unexpected social export dimensions, encoding or metadata: {destination.name}")
            photo["socialExport"] = {"file": destination.relative_to(ROOT).as_posix(), "width": width, "height": height, "bytes": destination.stat().st_size, "sha256": sha256(destination), "usage": "social-only; not the served hero image"}
        manifest["photos"].append(photo)

    manifest["sourceBytes"] = sum(photo["source"]["bytes"] for photo in manifest["photos"])
    manifest["responsiveExportBytes"] = sum(item["bytes"] for photo in manifest["photos"] for item in photo["exports"])
    manifest["socialExportBytes"] = sum(photo.get("socialExport", {}).get("bytes", 0) for photo in manifest["photos"])
    manifest["exportBytes"] = manifest["responsiveExportBytes"] + manifest["socialExportBytes"]
    (ARCHIVE / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-directory", type=Path, default=Path.home() / "Downloads", help="Directory containing the six original WhatsApp JPEG files")
    args = parser.parse_args()
    manifest = export(args.source_directory.expanduser().resolve())
    print(json.dumps({"photos": len(manifest["photos"]), "responsiveExports": sum(len(photo["exports"]) for photo in manifest["photos"]), "socialExports": sum("socialExport" in photo for photo in manifest["photos"]), "sourceBytes": manifest["sourceBytes"], "responsiveExportBytes": manifest["responsiveExportBytes"], "socialExportBytes": manifest["socialExportBytes"], "exportBytes": manifest["exportBytes"]}, indent=2))


if __name__ == "__main__":
    main()
