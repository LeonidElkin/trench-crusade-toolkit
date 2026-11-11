#!/usr/bin/env python3
"""Assemble new authoring records; refuse incomplete or stale visual reviews.

No legacy edition, Markdown, extraction cache or catalog is read by this tool.
The coverage report is produced even when promotion is refused.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NONRULES = {"title", "cover", "back-cover", "illustration", "credits", "blank", "front-matter", "service"}


def sha(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def canonical_sha(value: object) -> str:
    return sha(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")))


def load(path: Path) -> object:
    return json.loads(path.read_text())


def save(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def structural_findings(section: dict) -> list[dict]:
    findings = []
    markdown = section["markdown"]
    for line in markdown.splitlines():
        if line.startswith("#"):
            title = re.sub(r"^#+\s*", "", line).replace("**", "").strip()
            if len(re.findall(r"[\w]", title)) <= 1:
                findings.append({"severity": "error", "kind": "fragment-heading", "text": line})
            elif len(title) > 180 or re.match(r"^(котор|потому|также |или |и |чтобы |например,|против )", title):
                findings.append({"severity": "warning", "kind": "suspect-heading", "text": line})
    expected_cells = None
    for line in markdown.splitlines() + [""]:
        if line.startswith("|"):
            cells = len(re.split(r"(?<!\\)\|", line)) - 2
            if expected_cells is not None and cells != expected_cells:
                findings.append({"severity": "error", "kind": "ragged-table", "text": line})
            expected_cells = cells
        else:
            expected_cells = None
    if len(markdown.strip()) < 100:
        findings.append({"severity": "warning", "kind": "short-section", "text": markdown})
    if "\ufffd" in markdown:
        findings.append({"severity": "error", "kind": "replacement-character"})
    if "\u00ad" in markdown:
        findings.append({"severity": "warning", "kind": "unresolved-soft-hyphen"})
    for paragraph in markdown.split("\n\n"):
        paragraph = paragraph.strip()
        if (len(paragraph) > 150 and not paragraph.startswith(("#", "|", "![", "<!--", "<"))
                and re.search(r"[а-яёa-z]$", paragraph.replace("**", ""), re.I)):
            findings.append({"severity": "warning", "kind": "possible-unfinished-prose", "text": paragraph[-160:]})
    return [{"sectionId": section["id"], **finding} for finding in findings]


def assemble(manifest_path: Path, authored_dir: Path, reviews_dir: Path, out: Path,
             require_reviewed: bool = True) -> dict:
    if out.resolve().is_relative_to((ROOT / "data/editions").resolve()):
        raise ValueError("Assemble in staging; explicit promotion is a separate step")
    manifest = load(manifest_path)
    sources, errors, warnings = [], [], []
    section_map, page_map, authors, section_documents = {}, {}, {}, {}
    entities = defaultdict(list)
    issues, author_records = [], {}
    for document in manifest["documents"]:
        path = ROOT / document["path"]
        checksum = hashlib.sha256(path.read_bytes()).hexdigest()
        if document.get("sha256") and document["sha256"] != checksum:
            errors.append(f"Source checksum changed: {document['id']}")
        sources.append({**document, "sha256": checksum, "pages": document["expectedPages"]})
    for file in sorted(authored_dir.glob("*.json")):
        record = load(file)
        author_records[file.name] = record
        document = record["document"]
        if document not in {d["id"] for d in sources}:
            errors.append(f"Unknown document in {file}")
        for section in record["sections"]:
            sid = section["id"]
            if sid in section_map:
                errors.append(f"Duplicate section {sid}")
            section_map[sid] = section
            section_documents[sid] = document
            for finding in structural_findings(section):
                (errors if finding["severity"] == "error" else warnings).append(finding)
        for page in record["pages"]:
            key = (document, page["pdfPage"])
            if key in page_map:
                errors.append(f"Duplicate authored page {key}")
            page_map[key] = page
            authors[key] = (record["author"], file.name)
        for group, values in record.get("entities", {}).items():
            if not isinstance(values, list):
                errors.append(f"Entity group must be a list: {file.name}/{group}")
                continue
            for value in values:
                entities[group].append(value)
                if not value.get("source"):
                    errors.append(f"Missing entity source: {group}/{value.get('id')}")
        issues.extend(record.get("issues", []))
    reviews = defaultdict(list)
    for file in sorted(reviews_dir.glob("*.json")):
        record = load(file)
        for page in record["pages"]:
            reviews[(record["document"], page["pdfPage"])].append((record, page, file.name))
    coverage = []
    for source in sources:
        document = source["id"]
        for number in range(1, source["pages"] + 1):
            key = (document, number)
            page = page_map.get(key)
            entry = {"document": document, "documentTitle": source["title"], "pdfPage": number,
                     "printedPage": page.get("printedPage") if page else None,
                     "sourceSha256": source["sha256"], "contentType": page.get("contentType") if page else "unknown",
                     "files": [], "extractionStatus": "pending", "visualInspection": "pending",
                     "independentReview": "pending", "issues": page.get("issues", []) if page else []}
            coverage.append(entry)
            if not page:
                errors.append(f"Unprocessed page {document}:{number}")
                continue
            entry.update({"extractionStatus": page["extractionStatus"], "readingOrder": page.get("readingOrder", []), "author": authors[key][0]})
            if not page.get("readingOrder"):
                errors.append(f"Missing reading-order decision: {document}:{number}")
            inspection = page.get("visualInspection", {})
            if inspection.get("status") == "inspected" and inspection.get("agent") == authors[key][0]:
                entry["visualInspection"] = "inspected"
            else:
                errors.append(f"Missing actual visual inspection: {document}:{number}")
            section_ids = page.get("sectionIds", [])
            if not section_ids and page["contentType"] not in NONRULES:
                errors.append(f"Content page has no output: {document}:{number}")
            for sid in section_ids:
                section = section_map.get(sid)
                if not section or section_documents[sid] != document or number not in section["pages"]:
                    errors.append(f"Invalid page/section relation: {document}:{number}/{sid}")
                entry["files"].append(f"content/{sid}.md")
            if not section_ids:
                entry["nonruleReason"] = "; ".join(str(x) for x in page["readingOrder"])
            matching_reviews = []
            for report, review, filename in reviews[key]:
                if report["reviewer"] == authors[key][0] or review.get("status") != "verified":
                    continue
                if report.get("sourceSha256") != source["sha256"]:
                    continue
                authored_name = authors[key][1]
                reviewed_name = Path(report.get("authorFile", "")).name
                if reviewed_name != authored_name:
                    continue
                record = author_records[authored_name]
                if report.get("entitiesSha256") != canonical_sha(record.get("entities", {})):
                    continue
                if any(review.get("sectionHashes", {}).get(sid) != sha(section_map[sid]["markdown"])
                       for sid in section_ids if sid in section_map):
                    continue
                matching_reviews.append((report, review, filename))
            if matching_reviews:
                report, review, filename = matching_reviews[0]
                entry.update({"independentReview": "verified", "reviewer": report["reviewer"],
                              "reviewFile": filename, "reviewNotes": review.get("notes", "")})
            elif require_reviewed:
                errors.append(f"Missing or stale independent visual review: {document}:{number}")
    for (document, number), page in page_map.items():
        source = next((s for s in sources if s["id"] == document), None)
        if not source or not 1 <= number <= source["pages"]:
            errors.append(f"Out-of-range authored page: {document}:{number}")
    for sid, section in section_map.items():
        for number in section["pages"]:
            if sid not in page_map.get((section_documents[sid], number), {}).get("sectionIds", []):
                errors.append(f"Section has unregistered source page: {sid}/{number}")
    for group, values in entities.items():
        ids = [x.get("id") for x in values]
        duplicates = [key for key, count in Counter(ids).items() if key and count > 1]
        if duplicates:
            errors.append(f"Duplicate entities in {group}: {duplicates}")
    summary = {document: {"total": source["pages"],
                         "processed": sum(x["document"] == document and x["extractionStatus"] != "pending" for x in coverage),
                         "visuallyInspected": sum(x["document"] == document and x["visualInspection"] == "inspected" for x in coverage),
                         "independentlyReviewed": sum(x["document"] == document and x["independentReview"] == "verified" for x in coverage)}
               for source in sources for document in [source["id"]]}
    report = {"schemaVersion": 2, "edition": manifest["edition"], "revision": manifest["revision"],
              "readyForIntegration": not errors and require_reviewed, "summary": summary,
              "pages": coverage, "errors": errors, "heuristics": warnings}
    save(out / "coverage.json", report)
    save(out / "sources.json", sources)
    save(out / "issues.json", issues)
    if errors:
        return report
    metadata = []
    for section in section_map.values():
        sid = section["id"]
        filename = f"content/{sid}.md"
        target = out / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(section["markdown"])
        metadata.append({**{k: v for k, v in section.items() if k != "markdown"}, "file": filename,
                         "source": section_documents[sid], "sha256": sha(section["markdown"])})
    save(out / "articles.json", metadata)
    save(out / "entities.json", dict(entities))
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--authored", type=Path, required=True)
    parser.add_argument("--reviews", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--allow-pending-review", action="store_true", help="Author preview only; never promotable")
    args = parser.parse_args()
    result = assemble(args.manifest, args.authored, args.reviews, args.out, not args.allow_pending_review)
    print(json.dumps({"summary": result["summary"], "readyForIntegration": result["readyForIntegration"],
                      "errors": len(result["errors"]), "heuristics": len(result["heuristics"])}, ensure_ascii=False))
    if result["errors"]:
        print("\n".join(str(x) for x in result["errors"][:30]))
        raise SystemExit(1)
