"""Reproduce the local OFL font subsets; original source files are mandatory.

Install pinned FontTools 4.67.0 + Brotli 1.2.0 separately as documented in
docs/FONT-OPTIMIZATION.md. No network, global install or source download occurs.
"""
from pathlib import Path
from html.parser import HTMLParser
import argparse
import hashlib
import json
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    "cormorant-garamond-latin-500.woff2": "8197bf53615ddc8c423f444c7f0eec63b7fa0ba093fcfbec60dfdd28429b0fc8",
    "dm-sans-latin-variable.woff2": "9fea608a947e67020c33cad9a6fe3d60c54119dfb8cff87768a8117a15ed7543",
}

class PageText(HTMLParser):
    def __init__(self): super().__init__(); self.skip = 0; self.text = []
    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"): self.skip += 1
        else: self.text += [value for key, value in attrs if key in ("alt", "title", "aria-label") and value]
    def handle_endtag(self, tag):
        if tag in ("script", "style"): self.skip = max(0, self.skip - 1)
    def handle_data(self, value):
        if not self.skip: self.text.append(value)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--originals", required=True, type=Path, help="Directory containing the exact original WOFF2 files")
    parser.add_argument("--output", type=Path, default=ROOT / "public/fonts")
    args = parser.parse_args()
    html = list((ROOT / "dist").glob("*.html"))
    if len(html) < 5: parser.error("Build the five static pages first so current copy can be verified")
    text = PageText()
    for file in html: text.feed(file.read_text(encoding="utf-8"))
    actual = set(map(ord, "\n".join(text.text) + (ROOT / "src/scripts/client.js").read_text(encoding="utf-8")))
    wanted = actual | set(range(0x20, 0x100)) | set(range(0x2000, 0x2070)) | set(range(0x20A0, 0x20D0)) | set(range(0x2190, 0x2200)) | set(range(0x25A0, 0x27C0))
    args.output.mkdir(parents=True, exist_ok=True)
    results = []
    for filename, checksum in SOURCES.items():
        source = args.originals / filename
        if hashlib.sha256(source.read_bytes()).hexdigest() != checksum:
            parser.error(f"Original source checksum mismatch: {filename}; do not subset a previously subset font")
        original = TTFont(source)
        font = TTFont(source)
        if "fvar" in font: font = instantiateVariableFont(font, {"wght": (400, 700)}, inplace=True)
        options = subset.Options()
        options.layout_features = ["*"]
        options.name_IDs = ["*"]
        options.name_languages = ["*"]
        options.name_legacy = True
        options.glyph_names = True
        options.notdef_glyph = True
        options.notdef_outline = True
        options.recommended_glyphs = True
        reducer = subset.Subsetter(options=options)
        reducer.populate(unicodes=wanted)
        reducer.subset(font)
        output = args.output / filename
        font.flavor = "woff2"
        # Preserve the source timestamp so identical input produces identical bytes.
        font.recalcTimestamp = False
        font.save(output)
        cmap = TTFont(output).getBestCmap()
        missing = sorted((set(original.getBestCmap()) & wanted) - set(cmap))
        if missing: raise RuntimeError(f"Required source-supported codepoints missing: {missing}")
        results.append({"font": filename, "beforeBytes": source.stat().st_size, "afterBytes": output.stat().st_size, "sourceSupportedCodepoints": len(original.getBestCmap()), "retainedCodepoints": len(cmap), "missingRequiredCodepoints": missing})
    print(json.dumps(results, indent=2))

if __name__ == "__main__": main()
