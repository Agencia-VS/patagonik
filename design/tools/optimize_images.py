#!/usr/bin/env python3
"""Produce web-sized copies of the bundle's images.

src/assets holds the originals and stays untouched, so re-running this is
idempotent rather than recompressing already-lossy output. The optimized copies
and a matching index land in a separate directory that tools/build.py can be
pointed at with --assets.

Sizes come from what the page actually renders (measured at 1920x1080):

    experience photo   340x250 on the card, 571x1058 in the detail modal
    gallery background 1920x778, full bleed behind the carousel
    quote background   full bleed, behind an overlay and a form panel

The modal is what sets the ceiling for the experience photos — the cards alone
would be happy with a third of it.

Usage:
    python3 tools/optimize_images.py [--src src] [--out dist/assets-web]
"""

from __future__ import annotations

import argparse
import io
import json
import pathlib
import re

from PIL import Image

# role -> (longest side in px, webp quality)
ROLES = {
    "card": (1100, 74),          # experience photos: card + detail modal
    "gallery-bg": (1600, 70),    # full-bleed, sits behind the carousel
    "quote-bg": (1400, 68),      # full-bleed, behind an overlay and the form
    "editorial": (1400, 74),     # esencia / band photography
    "band": (1200, 74),          # closing CTA band
    "map": (1200, 78),           # park map, panned and zoomed in the modal
}

# Slot id (or a marker for non-slot uses) -> role.
SLOT_ROLES = {
    "pt-exp-bg": "gallery-bg",
    "pt-exp-bg-extended": "gallery-bg",
    "pt-esc-main": "editorial",
    "pt-band-valle": "editorial",
    "pt-final-band": "band",
}


def classify(uuid: str, template: str) -> str:
    """Work out what a given asset is used for, from the template itself."""
    slots = re.findall(r'<image-slot[^>]*id="([^"]*)"[^>]*src="%s"' % uuid, template)
    for slot in slots:
        if slot in SLOT_ROLES:
            return SLOT_ROLES[slot]
        if slot.startswith("pt-exp-"):
            return "card"
    if re.search(r"url\('%s'\)" % uuid, template):
        return "quote-bg"
    # Reached only by the CONAF map, which is assigned by script, not markup.
    return "map"


def encode(im: Image.Image, longest: int, quality: int) -> bytes:
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGB")
    w, h = im.size
    scale = longest / max(w, h)
    if scale < 1:
        im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=quality, method=6)
    return buf.getvalue()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", type=pathlib.Path, default=pathlib.Path("src"))
    ap.add_argument("--out", type=pathlib.Path, default=pathlib.Path("dist/assets-web"))
    args = ap.parse_args()

    template = (args.src / "template.html").read_text(encoding="utf-8")
    index = json.loads((args.src / "assets" / "index.json").read_text(encoding="utf-8"))

    args.out.mkdir(parents=True, exist_ok=True)
    new_index: dict[str, dict] = {}
    before = after = 0
    rows = []

    for uuid, entry in index.items():
        source = args.src / "assets" / entry["file"]
        raw = source.read_bytes()

        if not entry["mime"].startswith("image/"):
            # Fonts and the runtime scripts ride through untouched.
            (args.out / entry["file"]).write_bytes(raw)
            new_index[uuid] = dict(entry)
            before += len(raw)
            after += len(raw)
            continue

        role = classify(uuid, template)
        longest, quality = ROLES[role]
        im = Image.open(io.BytesIO(raw))
        data = encode(im, longest, quality)

        # Never let "optimizing" make a file bigger than it started.
        if len(data) >= len(raw) and entry["mime"] == "image/webp":
            data, name, mime = raw, entry["file"], entry["mime"]
        else:
            name, mime = f"{uuid}.webp", "image/webp"

        (args.out / name).write_bytes(data)
        new_index[uuid] = {"file": name, "mime": mime, "compressed": entry["compressed"]}
        before += len(raw)
        after += len(data)
        out_dims = Image.open(io.BytesIO(data)).size
        rows.append((len(raw), len(data), im.size, out_dims, role, uuid))

    (args.out / "index.json").write_text(
        json.dumps(new_index, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    rows.sort(reverse=True)
    print(f'{"before":>10} {"after":>10}  {"from":<13} {"to":<13} role')
    for raw_len, new_len, src_dims, out_dims, role, uuid in rows:
        print(f"{raw_len:>10,} {new_len:>10,}  {str(src_dims):<13} {str(out_dims):<13} {role}")
    print(f"\ntotal {before:,} -> {after:,} bytes  ({after / before:.1%}, saved {(before - after) / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
