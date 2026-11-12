#!/usr/bin/env python3
"""Run small sequential CPU ranges and compare with the NEW visually reviewed text."""
from __future__ import annotations

import argparse
from collections import Counter
import gzip
import hashlib
import importlib.metadata
import json
from pathlib import Path
import re
import subprocess
import sys
import unicodedata

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "reconstruction/docling-benchmark/fixture.json"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path: Path, obj: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n")


def key(r: dict) -> str:
    return f"{r['document']}-{r['start']:03}-{r['end']:03}"


def compact(text: str) -> str:
    """Only typography: retain digits, plus/minus, negations and word order."""
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = unicodedata.normalize("NFKC", text).casefold()
    text = text.translate(str.maketrans({"−": "-", "–": "-", "—": "-", "ё": "е", "\u00ad": "", "\"": "”", "“": "”"}))
    return re.sub(r"[\s*`#|]+", "", text)


def chunks(markdown: str) -> list[dict]:
    result = []
    for block in re.split(r"\n\s*\n", markdown):
        if not block.strip() or block.startswith("#") or block.lstrip().startswith("!["):
            continue
        if block.lstrip().startswith("|"):
            rows = [line for line in block.splitlines() if line.startswith("|") and not re.fullmatch(r"[| :\-]+", line)]
            for row in rows[1:]:
                if "Категория" in rows[0]:
                    # The reviewed Markdown adds explicit category IDs to a
                    # source table whose category is printed as a group heading.
                    cells = row.strip().strip("|").split("|")
                    row = "|" + "|".join(cells[1:]) + "|"
                result.append({"kind": "table-row", "critical": True, "expected": row})
        else:
            # Preserve complete paragraphs: sentence splitting on periods breaks
            # abbreviations, and splitting on table cells loses entity association.
            for paragraph in block.splitlines():
                if paragraph.strip():
                    paragraph = re.sub(r"^>\s*\*\*Лор:\*\*\s*", "", paragraph)
                    paragraph = re.sub(r"^\*\*Примечание источника:\*\*\s*", "", paragraph)
                    paragraph = re.sub(r"^[-*]\s+", "", paragraph)
                    critical = bool(re.search(r"\d|\b(?:не|нельзя|только|кроме|исключением|запрещ)\b|[+-]\s*DICE", paragraph, re.I))
                    result.append({"kind": "paragraph", "critical": critical, "expected": paragraph.strip()})
    return result


def references(fixture: dict) -> tuple[list[dict], dict]:
    # This gate independently proves that the selected NEW records still match
    # the existing visual attestations. It does not rerender or reconvert pages.
    subprocess.run([sys.executable, str(ROOT / "tools/reconstruction/assemble.py"),
                    "--manifest", str(ROOT / fixture["manifest"]),
                    "--authored", str(ROOT / fixture["reference"]),
                    "--reviews", str(ROOT / fixture["independentReviews"]),
                    "--out", str(ROOT / "tools/import-cache/docling-reference-gate")],
                   cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    selected = {doc: {p for r in fixture["ranges"] if r["document"] == doc
                      for p in range(r["start"], r["end"] + 1)} for doc in {r["document"] for r in fixture["ranges"]}}
    hashes, result = {}, []
    for path in sorted((ROOT / fixture["reference"]).glob("*.json")):
        hashes[str(path.relative_to(ROOT))] = digest(path)
        record = json.loads(path.read_text())
        document = record["document"]
        if document not in selected:
            continue
        for section in record["sections"]:
            pages = set(section["pages"])
            rule = fixture.get("sectionSlices", {}).get(section["id"])
            if not pages <= selected[document] and rule is None:
                continue
            text = section["markdown"]
            if rule:
                start = text.index(rule["start"])
                end = text.find(rule["end"], start)
                if end < 0:
                    raise ValueError(f"Missing explicit reference slice end: {section['id']}")
                text = text[start:end]
                pages &= selected[document]
            result.append({"document": document, "section": section["id"], "title": section["title"],
                           "pages": sorted(pages), "markdownSha256": hashlib.sha256(text.encode()).hexdigest(),
                           "checks": chunks(text)})
    for path in sorted((ROOT / fixture["independentReviews"]).glob("*.json")):
        hashes[str(path.relative_to(ROOT))] = digest(path)
    return result, hashes


def run(fixture: dict, out: Path, resume: bool) -> None:
    from extract import source, validate_output
    validate_output(out)
    for r in fixture["ranges"]:
        src = source(ROOT / fixture["manifest"], r["document"], r["start"], r["end"])
        target = out / key(r)
        if resume and (target / "metadata.json").is_file():
            meta = json.loads((target / "metadata.json").read_text())
            if meta["source"] != src or meta["pdfPages"] != list(range(r["start"], r["end"] + 1)):
                raise ValueError(f"Stale run: {target}")
            config = meta["configuration"]
            if (meta["versions"]["docling"] != importlib.metadata.version("docling")
                    or config["device"] != "cpu" or config["ocr"] or config["vlm"]
                    or config["threads"] != 2 or config["tableMode"] != "accurate"
                    or not config.get("readingOrderSeparators", True)):
                raise ValueError(f"Different tested configuration: {target}; choose a new run directory")
            for name, checksum in meta["outputs"].items():
                if digest(target / name) != checksum:
                    raise ValueError(f"Changed output: {target / name}")
            print(f"Reuse {key(r)}", flush=True)
            continue
        log = out / f"{key(r)}.log"
        log.parent.mkdir(parents=True, exist_ok=True)
        command = [sys.executable, str(ROOT / "tools/docling/extract.py"), "--manifest", str(ROOT / fixture["manifest"]),
                   "--document", r["document"], "--pages", f"{r['start']}-{r['end']}", "--out", str(target)]
        with log.open("w") as stream:
            subprocess.run(command, cwd=ROOT, stdout=stream, stderr=subprocess.STDOUT, check=True, timeout=240)
        meta = json.loads((target / "metadata.json").read_text())
        print(f"{key(r)}: {meta['elapsedSeconds']}s, {meta['peakRssMiB']}MiB, {meta['tables']} tables", flush=True)


def compare(fixture: dict, fixture_path: Path, out: Path, report: Path) -> None:
    from extract import validate_output
    validate_output(report)
    reference, hashes = references(fixture)
    page_text, metadata = {}, []
    for r in fixture["ranges"]:
        target = out / key(r)
        meta = json.loads((target / "metadata.json").read_text())
        metadata.append({"range": key(r), **meta})
        for p in range(r["start"], r["end"] + 1):
            page_text[r["document"], p] = (target / f"page-{p:03}.md").read_text()
    checks = []
    for section in reference:
        text = compact("\n".join(page_text[section["document"], p] for p in section["pages"]))
        for index, check in enumerate(section["checks"]):
            expected = compact(check["expected"])
            checks.append({"document": section["document"], "section": section["section"], "pages": section["pages"],
                           "index": index, **check, "exactTypographyMatch": expected in text})
    counts = Counter(("matched" if x["exactTypographyMatch"] else "needsReview", x["kind"], x["critical"]) for x in checks)
    summary = [{"result": k[0], "kind": k[1], "critical": k[2], "count": v} for k, v in sorted(counts.items())]
    write(report, {"schemaVersion": 1, "status": "automatic-diagnostics-awaiting-editorial-disposition",
                   "admittedAsStandaloneConverter": False, "fixtureSha256": digest(fixture_path),
                   "comparatorSha256": digest(Path(__file__)),
                   "referenceHashes": hashes, "ranges": metadata, "selectedPages": len(page_text),
                   "referenceSections": len(reference), "summary": summary, "checks": checks,
                   "note": "A missed exact paragraph may be typography, order, structure or a critical error. A match proves neither headings nor ownership. Use editorial-review.json; no percentage is an acceptance gate."})
    print(json.dumps({"pages": len(page_text), "sections": len(reference), "checks": len(checks), "summary": summary}, ensure_ascii=False))


def archive(fixture: dict, out: Path, destination: Path) -> None:
    """Keep the small audit artifacts; not images, models or redundant element dumps."""
    from extract import validate_output
    validate_output(destination)
    files = {}
    for r in fixture["ranges"]:
        src, dst = out / key(r), destination / key(r)
        dst.mkdir(parents=True, exist_ok=True)
        metadata = json.loads((src / "metadata.json").read_text())
        for name, checksum in metadata["outputs"].items():
            if digest(src / name) != checksum:
                raise ValueError(f"Changed artifact: {src / name}")
        for name in ("document.md", "metadata.json"):
            (dst / name).write_bytes((src / name).read_bytes())
        (dst / "document.json.gz").write_bytes(gzip.compress((src / "document.json").read_bytes(), mtime=0))
        for p in dst.iterdir():
            if p.is_file():
                files[str(p.relative_to(destination))] = digest(p)
    write(destination / "index.json", {"schemaVersion": 1, "status": "unapproved-automatic-drafts",
                                     "nativeJson": "Lossless gzip of document.json, with page/bbox provenance. Original JSON SHA is recorded in metadata.json.",
                                     "files": files})
    print(f"Archived {len(files)} small audit files; no models or page images")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("run", "compare", "archive"))
    parser.add_argument("--fixture", type=Path, default=FIXTURE)
    parser.add_argument("--out", type=Path, default=ROOT / "tools/import-cache/docling-benchmark")
    parser.add_argument("--report", type=Path, default=ROOT / "reconstruction/docling-benchmark/comparison.json")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--archive-out", type=Path, default=ROOT / "reconstruction/docling-benchmark/artifacts")
    args = parser.parse_args()
    fixture = json.loads(args.fixture.read_text())
    if args.action == "run":
        run(fixture, args.out.resolve(), args.resume)
    elif args.action == "compare":
        compare(fixture, args.fixture.resolve(), args.out.resolve(), args.report.resolve())
    else:
        archive(fixture, args.out.resolve(), args.archive_out.resolve())


if __name__ == "__main__":
    main()
