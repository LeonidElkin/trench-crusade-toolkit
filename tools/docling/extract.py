#!/usr/bin/env python3
"""CPU-only Docling draft with original-page provenance; never approves rules."""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import resource
import time

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MANIFEST = ROOT / "reconstruction/1.6.3/manifest.json"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def validate_output(out: Path) -> None:
    resolved = out.resolve()
    for protected in ("data", "src", "public", ".git", ".agents"):
        if resolved.is_relative_to(ROOT / protected) or resolved == ROOT:
            raise ValueError("Docling produces drafts in staging, never production data or visual attestations")
    if resolved.is_relative_to(ROOT / "reconstruction"):
        parts = resolved.relative_to(ROOT / "reconstruction").parts
        if len(parts) > 1 and parts[1] in ("authored", "reviews"):
            raise ValueError("Docling cannot write author records or visual reviews of any edition")


def source(manifest_path: Path, document_id: str, start: int, end: int) -> dict:
    manifest = json.loads(manifest_path.read_text())
    document = next((d for d in manifest["documents"] if d["id"] == document_id), None)
    if not document:
        raise ValueError(f"Unknown source: {document_id}")
    if not (1 <= start <= end <= document["expectedPages"]) or end - start + 1 > 4:
        raise ValueError("Choose 1–4 original PDF pages within the manifest's bounds")
    path = ROOT / document["path"]
    if sha(path) != document["sha256"]:
        raise ValueError("Source SHA differs; create a new source manifest instead of reusing this evidence")
    import fitz
    with fitz.open(path) as pdf:
        if len(pdf) != document["expectedPages"]:
            raise ValueError("Actual PDF page count differs from the manifest")
    return document


def configure(threads: int, offline: bool, reading_order_separators: bool = True) -> dict:
    if not 1 <= threads <= 4:
        raise ValueError("Use 1–4 CPU threads")
    cache = ROOT / "tools/import-cache/docling-models"
    os.environ.setdefault("HF_HOME", str(cache / "huggingface"))
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    os.environ.setdefault("OMP_NUM_THREADS", str(threads))
    os.environ.setdefault("MKL_NUM_THREADS", str(threads))
    if offline:
        os.environ["HF_HUB_OFFLINE"] = "1"
    return {"device": "cpu", "threads": threads, "ocr": False, "vlm": False,
            "pipeline": "standard", "tableMode": "accurate", "remoteServices": False,
            "generateImages": False, "offline": offline, "readingOrderSeparators": reading_order_separators,
            "cache": "tools/import-cache/docling-models"}


def extract(manifest_path: Path, document_id: str, start: int, end: int, out: Path,
            threads: int = 2, offline: bool = False, reading_order_separators: bool = True) -> dict:
    validate_output(out)
    document = source(manifest_path, document_id, start, end)
    if out.exists() and any(out.iterdir()):
        raise ValueError("Output already exists; choose a new run directory to preserve evidence")
    config = configure(threads, offline, reading_order_separators)
    began = time.perf_counter()
    import torch
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.accelerator_options import AcceleratorOptions, AcceleratorDevice
    from docling.datamodel.pipeline_options import PdfPipelineOptions, TableFormerMode
    from docling.document_converter import DocumentConverter, PdfFormatOption
    from models import prepare_models, LOCK

    if torch.version.cuda is not None:
        raise ValueError("This pipeline is tested with CPU-only PyTorch")
    torch.set_num_threads(threads)
    options = PdfPipelineOptions()
    options.do_ocr = False
    options.do_table_structure = True
    options.table_structure_options.mode = TableFormerMode.ACCURATE
    options.accelerator_options = AcceleratorOptions(num_threads=threads, device=AcceleratorDevice.CPU)
    options.enable_remote_services = False
    options.generate_page_images = False
    options.generate_picture_images = False
    options.do_picture_classification = False
    options.do_picture_description = False
    options.do_code_enrichment = False
    options.do_formula_enrichment = False
    options.use_reading_order_separators = reading_order_separators
    options.document_timeout = 180
    artifacts, model_lock = prepare_models(offline)
    options.artifacts_path = artifacts
    layout_revision = next(m["revision"] for m in model_lock["models"] if m["repoId"] == options.layout_options.model_spec.repo_id)
    options.layout_options.model_spec = options.layout_options.model_spec.model_copy(update={"revision": layout_revision})
    converter = DocumentConverter(allowed_formats=[InputFormat.PDF],
                                  format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)})
    result = converter.convert(ROOT / document["path"], page_range=(start, end), raises_on_error=True)
    doc = result.document
    expected = set(range(start, end + 1))
    if set(doc.pages) != expected:
        raise ValueError(f"Original page provenance mismatch: {sorted(doc.pages)} != {sorted(expected)}")
    payload = doc.export_to_dict()
    save(out / "document.json", payload)
    (out / "document.md").write_text(doc.export_to_markdown() + "\n")
    elements = []
    for item, level in doc.iterate_items():
        provenance = [p.model_dump(mode="json") for p in getattr(item, "prov", [])]
        if not provenance:
            continue
        if not all(p["page_no"] in expected for p in provenance):
            raise ValueError("Element provenance escapes the requested page range")
        text = getattr(item, "text", None)
        if text is None and hasattr(item, "export_to_markdown"):
            text = item.export_to_markdown(doc=doc)
        elements.append({"id": item.self_ref, "label": str(item.label.value), "level": level,
                         "text": text or "", "provenance": provenance,
                         "table": item.data.model_dump(mode="json") if hasattr(item, "data") and item.label.value == "table" else None})
    save(out / "elements.json", elements)
    for page in sorted(expected):
        (out / f"page-{page:03}.md").write_text(doc.export_to_markdown(page_no=page) + "\n")
    versions = {n: importlib.metadata.version(n) for n in
                ("docling", "docling-core", "docling-ibm-models", "torch", "torchvision", "PyMuPDF")}
    metadata = {
        "schemaVersion": 1, "status": "automatic-draft", "visualReview": "not-performed-by-this-tool",
        "source": document, "manifestSha256": sha(manifest_path), "pdfPages": sorted(expected),
        "python": platform.python_version(), "versions": versions, "configuration": config,
        "pipelineOptions": options.model_dump(mode="json", serialize_as_any=True),
        "modelsLockSha256": sha(LOCK), "extractorSha256": sha(Path(__file__)),
        "conversionStatus": str(result.status.value), "elapsedSeconds": round(time.perf_counter() - began, 3),
        "peakRssMiB": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1),
        "elements": len(elements), "tables": len(doc.tables),
        "outputs": {p.name: sha(p) for p in sorted(out.iterdir()) if p.is_file()},
    }
    save(out / "metadata.json", metadata)
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--document", required=True)
    parser.add_argument("--pages", required=True, help="Original 1-based PDF page or inclusive range, e.g. 4-7")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--offline", action="store_true", help="Require previously downloaded local models")
    parser.add_argument("--no-reading-order-separators", action="store_true", help="Bounded diagnostic alternative; not a table-repair guarantee")
    args = parser.parse_args()
    parts = args.pages.split("-")
    if len(parts) not in (1, 2) or not all(p.isdecimal() for p in parts):
        parser.error("--pages must be N or N-M")
    try:
        result = extract(args.manifest.resolve(), args.document, int(parts[0]), int(parts[-1]),
                         args.out.resolve(), args.threads, args.offline, not args.no_reading_order_separators)
    except (ValueError, StopIteration) as error:
        parser.error(str(error))
    print(json.dumps({k: result[k] for k in ("pdfPages", "conversionStatus", "elapsedSeconds", "peakRssMiB", "elements", "tables")}))


if __name__ == "__main__":
    main()
