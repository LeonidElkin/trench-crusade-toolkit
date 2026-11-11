"""Adversarial checks for the integration gate; not a substitute for PDF review."""
import copy
import json
import tempfile
import unittest
from pathlib import Path

from assemble import assemble, canonical_sha, save, sha


class IntegrationGateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="tc-import-gate-")
        self.root = Path(self.temp.name)
        self.pdf = self.root / "original.pdf"
        self.pdf.write_bytes(b"original fixture bytes")
        import hashlib
        self.source_sha = hashlib.sha256(self.pdf.read_bytes()).hexdigest()
        self.manifest = {"edition": "fixture", "revision": "reviewed-r2", "documents": [
            {"id": "core", "title": "Fixture original", "edition": "fixture", "path": str(self.pdf), "expectedPages": 2, "sha256": self.source_sha}]}
        self.author = {"author": "author-a", "document": "core", "sections": [
            {"id": "whole-rule", "title": "Правило", "pages": [1], "category": "Правила", "originalSection": "Правило",
             "markdown": "# Правило\n\nТочный абзац исходного правила с условием, исключением и числом 7.\n\n| Бросок | Результат |\n| --- | --- |\n| 7–11 | Успех |\n"}],
            "entities": {"procedures": [{"id": "action", "successThreshold": 7, "source": {"document": "core", "pages": [1], "sectionId": "whole-rule"}}]},
            "pages": [
                {"pdfPage": 1, "printedPage": 1, "contentType": "rules", "sectionIds": ["whole-rule"], "readingOrder": ["Две колонки; левая перед правой"], "extractionStatus": "authored", "visualInspection": {"agent": "author-a", "status": "inspected"}},
                {"pdfPage": 2, "printedPage": None, "contentType": "illustration", "sectionIds": [], "readingOrder": ["Полностраничная иллюстрация, без правил"], "extractionStatus": "accounted-nonrules", "visualInspection": {"agent": "author-a", "status": "inspected"}}], "issues": []}
        self.report = {"reviewer": "reviewer-b", "document": "core", "sourceSha256": self.source_sha,
                       "authorFile": "author.json", "entitiesSha256": canonical_sha(self.author["entities"]),
                       "pages": [{"pdfPage": n, "status": "verified", "notes": "Fixture independent attestation", "sectionHashes": {"whole-rule": sha(self.author["sections"][0]["markdown"])} if n == 1 else {}} for n in (1, 2)]}
        self.write()

    def tearDown(self):
        self.temp.cleanup()

    def write(self):
        save(self.root / "manifest.json", self.manifest)
        save(self.root / "authored/author.json", self.author)
        save(self.root / "reviews/review.json", self.report)

    def run_gate(self, reviewed=True):
        self.write()
        return assemble(self.root / "manifest.json", self.root / "authored", self.root / "reviews", self.root / "output", reviewed)

    def test_complete_distinct_review_with_matching_facts_emits_content(self):
        result = self.run_gate()
        self.assertTrue(result["readyForIntegration"])
        self.assertEqual(result["summary"]["core"]["independentlyReviewed"], 2)
        self.assertEqual((self.root / "output/content/whole-rule.md").read_text(), self.author["sections"][0]["markdown"])

    def test_changing_number_after_review_invalidates_review(self):
        self.author["entities"]["procedures"][0]["successThreshold"] = 8
        self.assertFalse(self.run_gate()["readyForIntegration"])

    def test_reordering_prose_after_review_invalidates_review(self):
        self.author["sections"][0]["markdown"] += "\nДругая колонка поставлена не на своё место.\n"
        self.assertFalse(self.run_gate()["readyForIntegration"])

    def test_replacing_pdf_invalidates_review(self):
        self.pdf.write_bytes(b"replacement original")
        self.assertFalse(self.run_gate()["readyForIntegration"])

    def test_own_review_is_not_independent(self):
        self.report["reviewer"] = "author-a"
        self.assertFalse(self.run_gate()["readyForIntegration"])

    def test_missing_illustration_page_is_incomplete(self):
        self.author["pages"].pop()
        self.assertFalse(self.run_gate()["readyForIntegration"])

    def test_content_cannot_be_dismissed_without_explicit_classification(self):
        self.author["pages"][1]["contentType"] = "rules"
        self.assertFalse(self.run_gate()["readyForIntegration"])

    def test_rendering_does_not_imply_visual_inspection(self):
        self.author["pages"][0]["visualInspection"]["status"] = "rendered"
        self.assertFalse(self.run_gate()["readyForIntegration"])

    def test_partial_draft_is_never_promotable(self):
        self.report["pages"] = []
        result = self.run_gate(reviewed=False)
        self.assertFalse(result["readyForIntegration"])
        self.assertEqual(result["summary"]["core"]["independentlyReviewed"], 0)

    def test_fragment_heading_is_rejected_even_if_attested(self):
        self.author["sections"][0]["markdown"] = "# П\n\n" + self.author["sections"][0]["markdown"]
        self.report["pages"][0]["sectionHashes"]["whole-rule"] = sha(self.author["sections"][0]["markdown"])
        self.assertFalse(self.run_gate()["readyForIntegration"])

    def test_ragged_table_is_rejected_even_if_attested(self):
        self.author["sections"][0]["markdown"] += "\n| A | B |\n| --- | --- |\n| 3 |\n"
        self.report["pages"][0]["sectionHashes"]["whole-rule"] = sha(self.author["sections"][0]["markdown"])
        self.assertFalse(self.run_gate()["readyForIntegration"])

    def test_missing_source_is_rejected(self):
        del self.author["entities"]["procedures"][0]["source"]
        self.report["entitiesSha256"] = canonical_sha(self.author["entities"])
        self.assertFalse(self.run_gate()["readyForIntegration"])

    def test_duplicate_page_is_rejected(self):
        self.author["pages"].append(copy.deepcopy(self.author["pages"][0]))
        self.assertFalse(self.run_gate()["readyForIntegration"])


if __name__ == "__main__":
    unittest.main()
