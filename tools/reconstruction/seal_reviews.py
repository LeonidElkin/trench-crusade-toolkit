#!/usr/bin/env python3
"""Add byte-level bindings only after existing reviewer hashes match exactly.

This command does not create reviews or change any review/visual status.
"""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def seal(directory: Path) -> int:
    manifest = json.loads((directory / "manifest.json").read_text())
    sources = {s["id"]: sha((ROOT / s["path"]).read_bytes()) for s in manifest["documents"]}
    count = 0
    for path in sorted((directory / "reviews").glob("*.json")):
        report = json.loads(path.read_text())
        author_path = directory / "authored" / Path(report["authorFile"]).name
        raw = author_path.read_bytes()
        author = json.loads(raw)
        if report["reviewer"] == author["author"]:
            raise ValueError(f"Own review is not independent: {path}")
        if report.get("sourceSha256") != sources[report["document"]]:
            raise ValueError(f"Source changed or not bound: {path}")
        encoded = json.dumps(author["entities"], ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
        if sha(encoded) != report["entitiesSha256"]:
            raise ValueError(f"Reviewed entities changed: {path}")
        sections = {s["id"]: sha(s["markdown"].encode()) for s in author["sections"]}
        pages = {p["pdfPage"]: p for p in author["pages"]}
        for review in report["pages"]:
            page = pages[review["pdfPage"]]
            for sid in page.get("sectionIds", []):
                if review.get("sectionHashes", {}).get(sid) != sections[sid]:
                    raise ValueError(f"Reviewed text changed: {path}:{review['pdfPage']}/{sid}")
        report["authorFileSha256"] = sha(raw)
        report["byteBindingMethod"] = "Derived after matching reviewer source, entities and section hashes; review statuses unchanged."
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        count += 1
    return count


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    print(f"Bound {seal(args.directory)} existing review reports; no review status was assigned")
