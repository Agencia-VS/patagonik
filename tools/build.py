#!/usr/bin/env python3
"""Reassemble the editable source tree into a Claude Design bundle.

Inverse of tools/unpack.py. Reads src/shell.html (the loader, kept verbatim
with @@ISLAND@@ placeholders), src/template.html, src/ext_resources.json and
src/assets/index.json, then writes a single self-contained HTML file.

Only assets the template actually references are packed, so deleting an
<image-slot> is enough to drop its bytes from the build.

Usage:
    python3 tools/build.py [--src src] [--out dist/PatagoniK_Landing.html]
"""

from __future__ import annotations

import argparse
import base64
import gzip
import json
import pathlib
import sys

PLACEHOLDER = "@@{}@@"


def load(src: pathlib.Path):
    shell = (src / "shell.html").read_text(encoding="utf-8")
    template = (src / "template.html").read_text(encoding="utf-8")
    index = json.loads((src / "assets" / "index.json").read_text(encoding="utf-8"))
    ext_resources = json.loads((src / "ext_resources.json").read_text(encoding="utf-8"))
    return shell, template, index, ext_resources


def build(src: pathlib.Path, out: pathlib.Path, prune: bool = True) -> None:
    shell, template, index, ext_resources = load(src)

    referenced = {u for u in index if u in template}
    # ext_resources map React/ReactDOM URLs onto manifest uuids; the runtime
    # looks them up by URL, not by a uuid appearing in the template.
    referenced |= {e["uuid"] for e in ext_resources if e.get("uuid") in index}

    if prune:
        dropped = sorted(set(index) - referenced)
        if dropped:
            print(f"pruned {len(dropped)} unreferenced asset(s):", file=sys.stderr)
            for u in dropped:
                print(f"  - {index[u]['file']}", file=sys.stderr)
        pack = referenced
    else:
        pack = set(index)

    manifest: dict[str, dict] = {}
    total_raw = 0
    for uuid in sorted(pack):
        entry = index[uuid]
        raw = (src / "assets" / entry["file"]).read_bytes()
        total_raw += len(raw)
        payload = gzip.compress(raw, 9) if entry["compressed"] else raw
        manifest[uuid] = {
            "mime": entry["mime"],
            "compressed": entry["compressed"],
            "data": base64.b64encode(payload).decode("ascii"),
        }

    islands = {
        "MANIFEST": json.dumps(manifest, separators=(",", ":")),
        "EXT_RESOURCES": json.dumps(ext_resources, separators=(",", ":")),
        "PAGE_ORDER": "[]",
        # The loader does JSON.parse on this island, so the template ships as a
        # JSON string. </script> inside it would close the island early.
        "TEMPLATE": json.dumps(template).replace("</", "<\\/"),
    }

    html = shell
    for kind, payload in islands.items():
        token = PLACEHOLDER.format(kind)
        if token not in html:
            raise SystemExit(f"shell.html is missing the {token} placeholder")
        html = html.replace(token, payload)

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")

    size = out.stat().st_size
    print(f"assets packed   {len(manifest):>6}  ({total_raw / 1e6:.2f} MB raw)")
    print(f"template        {len(template) / 1e3:>6.1f} kB")
    print(f"{out}  ->  {size / 1e6:.2f} MB")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", type=pathlib.Path, default=pathlib.Path("src"))
    ap.add_argument("--out", type=pathlib.Path,
                    default=pathlib.Path("dist/PatagoniK_Landing.html"))
    ap.add_argument("--no-prune", action="store_true",
                    help="pack every asset, even ones the template never names")
    args = ap.parse_args()
    build(args.src, args.out, prune=not args.no_prune)


if __name__ == "__main__":
    main()
