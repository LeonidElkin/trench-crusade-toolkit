"""Protect numerical fidelity, provenance and the separation of drafts/authority."""
from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

from benchmark import compact, chunks
from extract import ROOT, DEFAULT_MANIFEST, source, validate_output
from results import verify_archive


class FidelityTests(unittest.TestCase):
    def test_modifiers_limits_and_negations_remain_distinct(self) -> None:
        for good, wrong in [("+1 DICE", "-1 DICE"), ("0–1 модель", "0–2 модели"),
                            ("не может атаковать", "может атаковать"), ("2 Славы", "2 дуката"),
                            ("кроме ELITE", "только ELITE")]:
            self.assertNotEqual(compact(good), compact(wrong))

    def test_markdown_and_space_are_typographic(self) -> None:
        self.assertEqual(compact("**+1 DICE**"), compact("+1\nDICE"))
        self.assertEqual(compact('6”/Пехота'), compact('6"/пехота'))

    def test_rows_preserve_cost_and_ownership(self) -> None:
        check = chunks("| Предмет | Цена |\n| --- | --- |\n| Винтовка | 10 дукатов |\n")[0]
        self.assertTrue(check["critical"])
        self.assertIn(compact(check["expected"]), compact("Винтовка 10 дукатов"))
        self.assertNotIn(compact(check["expected"]), compact("Винтовка Пистолет 10 дукатов 6 дукатов"))

    def test_production_and_review_destinations_rejected(self) -> None:
        for target in ("data/editions/new", "src/generated/drafts", "public/rules",
                       "reconstruction/future/authored", "reconstruction/future/reviews"):
            with self.subTest(target=target), self.assertRaises(ValueError):
                validate_output(ROOT / target)
        with tempfile.TemporaryDirectory() as tmp:
            link = Path(tmp) / "alias"
            link.symlink_to(ROOT / "data", target_is_directory=True)
            with self.assertRaises(ValueError):
                validate_output(link / "new")

    def test_no_version_invented_for_allies(self) -> None:
        self.assertIsNone(source(DEFAULT_MANIFEST, "allies", 16, 16)["edition"])

    def test_ranges_bounded_before_model_loading(self) -> None:
        for start, end in ((0, 1), (1, 5), (167, 169), (10, 9)):
            with self.subTest(start=start, end=end), self.assertRaises(ValueError):
                source(DEFAULT_MANIFEST, "core", start, end)

    def test_stale_source_sha_rejected(self) -> None:
        manifest = json.loads(DEFAULT_MANIFEST.read_text())
        manifest["documents"][0]["sha256"] = "0" * 64
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "manifest.json"
            path.write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "Source SHA differs"):
                source(path, "core", 4, 7)

    def test_actual_page_count_checked(self) -> None:
        manifest = json.loads(DEFAULT_MANIFEST.read_text())
        manifest["documents"][0]["expectedPages"] = 167
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "manifest.json"
            path.write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "Actual PDF page count"):
                source(path, "core", 4, 7)

    def test_actual_native_json_archive_and_provenance(self) -> None:
        self.assertEqual(verify_archive(ROOT / "reconstruction/docling-benchmark/artifacts"), 15)


if __name__ == "__main__":
    unittest.main()
