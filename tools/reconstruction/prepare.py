#!/usr/bin/env python3
"""Prepare immutable, addressable PDF evidence; never infer rules or approval."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]


def save(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare(manifest_path: Path, out: Path, dpi: int, resume: bool) -> None:
    manifest = json.loads(manifest_path.read_text())
    if out.resolve().is_relative_to((ROOT / "data/editions").resolve()):
        raise ValueError("PDF preparation belongs in staging, never production data")
    if out.exists() and any(out.iterdir()) and not resume:
        raise ValueError("Nonempty staging requires --resume and matching source hashes")
    inventory = {"schemaVersion": 2, "dpi": dpi, "documents": []}
    for document in manifest["documents"]:
        path = ROOT / document["path"]
        checksum = digest(path)
        pdf = fitz.open(path)
        if len(pdf) != document["expectedPages"]:
            raise ValueError(f"Unexpected page count: {document['id']}: {len(pdf)}")
        previous_path = out / document["id"] / "source.json"
        metadata = {**document, "sha256": checksum, "pages": len(pdf), "dpi": dpi}
        if previous_path.exists() and json.loads(previous_path.read_text()) != metadata:
            raise ValueError(f"Evidence differs: {previous_path}; use another staging directory")
        save(previous_path, metadata)
        inventory["documents"].append(metadata)
        for number, page in enumerate(pdf, 1):
            target = out / document["id"] / f"{number:03d}"
            if resume and target.with_suffix(".json").exists() and target.with_suffix(".png").exists():
                previous = json.loads(target.with_suffix(".json").read_text())
                if (previous.get("sourceSha256") == checksum
                        and previous.get("pdfPage") == number
                        and previous.get("renderDpi") == dpi
                        and previous.get("imageSha256") == digest(target.with_suffix(".png"))):
                    continue
            raw = page.get_text("rawdict", sort=False)
            # Retain the original stream ordering. A reviewer chooses reading order later.
            for block_number, block in enumerate(raw["blocks"]):
                block["id"] = f"b{block_number:03d}"
                if block["type"] == 1:
                    block.pop("image", None)
                    block.pop("mask", None)
                    continue
                for line_number, line in enumerate(block["lines"]):
                    line["id"] = f"{block['id']}.l{line_number:03d}"
                    for span_number, span in enumerate(line["spans"]):
                        span["id"] = f"{line['id']}.s{span_number:03d}"
                        span["text"] = "".join(c["c"] for c in span["chars"])
            vectors = [
                {k: list(v) if isinstance(v, (fitz.Rect, fitz.Point)) else v
                 for k, v in drawing.items() if k != "items"}
                for drawing in page.get_drawings()
            ]
            evidence = {
                "document": document["id"], "pdfPage": number,
                "sourceSha256": checksum, "width": page.rect.width,
                "height": page.rect.height, "rotation": page.rotation,
                "blocks": raw["blocks"], "drawings": vectors,
                "renderDpi": dpi, "pymupdfVersion": fitz.VersionBind,
            }
            page.get_pixmap(dpi=dpi, alpha=False).save(target.with_suffix(".png"))
            evidence["imageSha256"] = digest(target.with_suffix(".png"))
            save(target.with_suffix(".json"), evidence)
        print(f"Prepared {document['id']}: {len(pdf)} pages at {dpi} dpi", flush=True)
    save(out / "inventory.json", inventory)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--dpi", type=int, default=180)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    if not 144 <= args.dpi <= 600:
        parser.error("Use a readable rendering resolution between 144 and 600 dpi")
    prepare(args.manifest, args.out, args.dpi, args.resume)
