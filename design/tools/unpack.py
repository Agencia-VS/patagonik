#!/usr/bin/env python3
"""Unpack a Claude Design bundle into an editable source tree.

A bundle is a single HTML file whose <body> carries four data islands:

    <script type="__bundler/manifest">      {uuid: {mime, compressed, data}}
    <script type="__bundler/ext_resources"> [{id, uuid}, ...]
    <script type="__bundler/page_order">    [uuid, ...]
    <script type="__bundler/template">      "<!DOCTYPE html>..."  (JSON string)

At runtime the loader turns every manifest entry into a blob: URL (fonts
become data: URIs) and then does a plain `template.split(uuid).join(url)`,
so the template refers to assets by bare UUID. Unpacking therefore means:
write the template to disk as-is, and drop each manifest entry into its own
file next to a small index that remembers mime/compression.

Usage:
    python3 tools/unpack.py <bundle.html> [--out src]
"""

from __future__ import annotations

import argparse
import base64
import gzip
import json
import pathlib
import re
import sys
import zlib

ISLAND = '<script type="__bundler/{kind}">'

EXT_BY_MIME = {
    "image/webp": "webp",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/svg+xml": "svg",
    "image/gif": "gif",
    "font/woff2": "woff2",
    "font/woff": "woff",
    "text/javascript": "js",
    "application/javascript": "js",
    "text/css": "css",
}


def read_island(html: str, kind: str) -> str:
    """Return the raw text of one <script type="__bundler/KIND"> island."""
    open_tag = ISLAND.format(kind=kind)
    start = html.find(open_tag)
    if start == -1:
        raise SystemExit(f"bundle is missing the {kind!r} island")
    start += len(open_tag)
    end = html.find("</script>", start)
    if end == -1:
        raise SystemExit(f"unterminated {kind!r} island")
    return html[start:end].strip()


def decompress(raw: bytes) -> bytes:
    """The loader uses DecompressionStream('gzip'); accept raw deflate too."""
    for attempt in (gzip.decompress, zlib.decompress, lambda d: zlib.decompress(d, -15)):
        try:
            return attempt(raw)
        except Exception:
            continue
    raise ValueError("asset marked compressed but no codec matched")


def unpack(bundle_path: pathlib.Path, out_dir: pathlib.Path) -> None:
    html = bundle_path.read_text(encoding="utf-8")

    template = json.loads(read_island(html, "template"))
    manifest = json.loads(read_island(html, "manifest"))
    ext_resources = json.loads(read_island(html, "ext_resources"))
    page_order = json.loads(read_island(html, "page_order"))

    if page_order:
        # Nested page bundles ride in the root manifest and are resolved through
        # about:blank#<uuid> frame markers. Nothing here produces them.
        print(f"warning: bundle declares {len(page_order)} nested page(s); "
              f"they are copied through untouched", file=sys.stderr)

    assets_dir = out_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    index: dict[str, dict] = {}
    for uuid, entry in manifest.items():
        raw = base64.b64decode(entry["data"])
        stored = decompress(raw) if entry.get("compressed") else raw
        ext = EXT_BY_MIME.get(entry["mime"], "bin")
        name = f"{uuid}.{ext}"
        (assets_dir / name).write_bytes(stored)
        index[uuid] = {
            "file": name,
            "mime": entry["mime"],
            # Remember how it shipped so a rebuild can reproduce it byte-for-byte.
            "compressed": bool(entry.get("compressed")),
        }

    (out_dir / "assets" / "index.json").write_text(
        json.dumps(index, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (out_dir / "ext_resources.json").write_text(
        json.dumps(ext_resources, indent=2) + "\n", encoding="utf-8"
    )
    (out_dir / "template.html").write_text(template, encoding="utf-8")

    # The wrapper (loading UI + loader script) is everything outside the islands;
    # a rebuild reuses it verbatim so the loader is never accidentally forked.
    (out_dir / "shell.html").write_text(strip_islands(html), encoding="utf-8")

    inline = len(re.findall(r"data:image/\w+;base64,", template))
    print(f"template.html   {len(template):>12,} chars ({inline} inline data URIs)")
    print(f"assets/         {len(index):>12,} files")
    print(f"shell.html      {len((out_dir / 'shell.html').read_text(encoding='utf-8')):>12,} chars")


def strip_islands(html: str) -> str:
    """Replace each island's payload with a {kind} placeholder for rebuilding."""
    for kind in ("manifest", "ext_resources", "page_order", "template"):
        open_tag = ISLAND.format(kind=kind)
        start = html.find(open_tag)
        if start == -1:
            continue
        payload = start + len(open_tag)
        end = html.find("</script>", payload)
        html = html[:payload] + "\n@@" + kind.upper() + "@@\n" + html[end:]
    return html


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("bundle", type=pathlib.Path)
    ap.add_argument("--out", type=pathlib.Path, default=pathlib.Path("src"))
    args = ap.parse_args()
    unpack(args.bundle, args.out)


if __name__ == "__main__":
    main()
