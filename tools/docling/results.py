#!/usr/bin/env python3
"""Verify small benchmark artifacts and record reproducibility/resource evidence."""
from __future__ import annotations

import gzip
import hashlib
import json
import argparse
from pathlib import Path
import platform

ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT / "reconstruction/docling-benchmark"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_archive(archive: Path) -> int:
    index = json.loads((archive / "index.json").read_text())
    for name, checksum in index["files"].items():
        if sha(archive / name) != checksum:
            raise ValueError(f"Changed archived output: {name}")
    count = 0
    for folder in sorted(p for p in archive.iterdir() if p.is_dir()):
        metadata = json.loads((folder / "metadata.json").read_text())
        native = gzip.decompress((folder / "document.json.gz").read_bytes())
        if hashlib.sha256(native).hexdigest() != metadata["outputs"]["document.json"]:
            raise ValueError("Compressed native JSON differs from the actual conversion")
        doc = json.loads(native)
        if {int(p) for p in doc["pages"]} != set(metadata["pdfPages"]):
            raise ValueError("Original page numbers lost in the native JSON")
        for collection in ("texts", "tables", "pictures"):
            for item in doc.get(collection, []):
                for prov in item.get("prov", []):
                    if prov["page_no"] not in metadata["pdfPages"] or "bbox" not in prov:
                        raise ValueError("Missing page/bbox provenance")
        if metadata["status"] != "automatic-draft":
            raise ValueError("An extractor must not assign visual approval")
        count += len(metadata["pdfPages"])
    return count


def record() -> None:
    pages = verify_archive(REPORT / "artifacts")
    comparison = json.loads((REPORT / "comparison.json").read_text())
    fixture = ROOT / "reconstruction/docling-benchmark/fixture.json"
    if sha(fixture) != comparison["fixtureSha256"]:
        raise ValueError("Changed benchmark fixture")
    if sha(ROOT / "tools/docling/benchmark.py") != comparison["comparatorSha256"]:
        raise ValueError("Comparator changed; rerun diagnostics before reusing the report")
    for name, checksum in comparison["referenceHashes"].items():
        if sha(ROOT / name) != checksum:
            raise ValueError(f"Reference changed; recheck benchmark: {name}")
    experiments = []
    for baseline, variant, purpose in [
        ("core-019-019", "no-separators-core-019", "reading-order-separators-disabled"),
        ("allies-002-002", "no-separators-allies-002", "reading-order-separators-disabled"),
        ("core-022-022", "offline-reproduction-core-022", "offline-reproduction"),
        ("core-022-022", "pinned-models-core-022", "pinned-models-offline-reproduction"),
        ("allies-016-016", "allies-016", "project-skill-offline-smoke"),
    ]:
        a = ROOT / "tools/import-cache/docling-benchmark" / baseline
        directory = "docling-skill-smoke" if purpose == "project-skill-offline-smoke" else "docling-experiments"
        b = ROOT / "tools/import-cache" / directory / variant
        meta = json.loads((b / "metadata.json").read_text())
        # Retain the configuration/resource metadata; identical MD/native JSON
        # already exist in the baseline archive and need not be committed twice.
        experiments.append({"baseline": baseline, "run": variant, "purpose": purpose,
                            "markdownByteIdentical": sha(a / "document.md") == sha(b / "document.md"),
                            "nativeJsonByteIdentical": sha(a / "document.json") == sha(b / "document.json"),
                            "metadata": meta})
    lock_path = ROOT / "tools/docling/models.lock.json"
    lock = json.loads(lock_path.read_text())
    result = {"schemaVersion": 1, "uniqueBenchmarkPages": pages,
              "comparisonSha256": sha(REPORT / "comparison.json"),
              "artifactsIndexSha256": sha(REPORT / "artifacts/index.json"),
              "modelsLockSha256": sha(lock_path), "python": platform.python_version(),
              "editorialReviewSha256": sha(REPORT / "editorial-review.json"),
              "baselineElapsedSeconds": round(sum(r["elapsedSeconds"] for r in comparison["ranges"]), 3),
              "peakProcessRssMiB": max(r["peakRssMiB"] for r in comparison["ranges"]),
              "baselineDetectedTables": sum(r["tables"] for r in comparison["ranges"]),
              "requiredPinnedModelsMiB": round(sum(f["bytes"] for m in lock["models"] for f in m["files"].values()) / 1048576, 1),
              "experiments": experiments,
              "qualityAuthority": "editorial-review.json; automatic matches never imply acceptance or visual inspection"}
    (REPORT / "results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({k: v for k, v in result.items() if k not in ("experiments", "qualityAuthority")}))


def verify_recorded() -> dict:
    pages = verify_archive(REPORT / "artifacts")
    result = json.loads((REPORT / "results.json").read_text())
    for name, path in [("comparisonSha256", REPORT / "comparison.json"),
                       ("artifactsIndexSha256", REPORT / "artifacts/index.json"),
                       ("modelsLockSha256", ROOT / "tools/docling/models.lock.json"),
                       ("editorialReviewSha256", REPORT / "editorial-review.json")]:
        if sha(path) != result[name]:
            raise ValueError(f"Stale recorded evidence: {path}")
    comparison = json.loads((REPORT / "comparison.json").read_text())
    if sha(ROOT / "tools/docling/benchmark.py") != comparison["comparatorSha256"]:
        raise ValueError("Comparator changed")
    if sha(REPORT / "fixture.json") != comparison["fixtureSha256"]:
        raise ValueError("Fixture changed")
    for name, checksum in comparison["referenceHashes"].items():
        if sha(ROOT / name) != checksum:
            raise ValueError(f"Reference changed: {name}")
    editorial = json.loads((REPORT / "editorial-review.json").read_text())
    if editorial["comparisonSha256"] != result["comparisonSha256"]:
        raise ValueError("Editorial assessment refers to different diagnostics")
    expected = {(c["section"], c["index"]) for c in comparison["checks"] if not c["exactTypographyMatch"]}
    actual = {(c["section"], c["index"]) for c in editorial["dispositions"]}
    if expected != actual:
        raise ValueError("Missing editorial disposition for a diagnostic")
    if pages != result["uniqueBenchmarkPages"]:
        raise ValueError("Recorded page count differs")
    for experiment in result["experiments"]:
        baseline = REPORT / "artifacts" / experiment["baseline"] / "metadata.json"
        meta = json.loads(baseline.read_text())
        for field, name in [("markdownByteIdentical", "document.md"), ("nativeJsonByteIdentical", "document.json")]:
            same = meta["outputs"][name] == experiment["metadata"]["outputs"][name]
            if same != experiment[field]:
                raise ValueError("Reproducibility evidence differs")
    critical = [f for f in editorial["findings"] if f["severity"] == "critical" and f["draftStatus"] != "fixed-and-retested"]
    if critical and editorial["admittedForReliableMassImport"]:
        raise ValueError("Critical errors contradict mass-import approval")
    return {"verifiedBenchmarkPages": pages, "unresolvedCriticalDraftCases": len(critical),
            "admittedForReliableMassImport": editorial["admittedForReliableMassImport"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-only", action="store_true", help="Stdlib-only CI audit; no Docling/models or reimport")
    parser.add_argument("--require-mass-ready", action="store_true", help="Fail if the extractor has unresolved critical cases")
    args = parser.parse_args()
    if not args.verify_only and not args.require_mass_ready:
        record()
    verified = verify_recorded()
    print(json.dumps(verified))
    if args.require_mass_ready and not verified["admittedForReliableMassImport"]:
        raise SystemExit("Docling is not admitted for reliable mass import; use the visually reviewed hybrid pipeline.")
