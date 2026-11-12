#!/usr/bin/env python3
"""Fetch/verify only the two tested standard-pipeline models, by commit and SHA."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCK = Path(__file__).with_name("models.lock.json")
CACHE = ROOT / "tools/import-cache/docling-models"


def prepare_models(offline: bool = False) -> tuple[Path, dict]:
    os.environ.setdefault("HF_HOME", str(CACHE / "huggingface"))
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    from huggingface_hub import snapshot_download
    lock = json.loads(LOCK.read_text())
    artifacts = CACHE / "artifacts"
    artifacts.mkdir(parents=True, exist_ok=True)
    for model in lock["models"]:
        snapshot = Path(snapshot_download(repo_id=model["repoId"], revision=model["revision"],
                                         allow_patterns=list(model["files"]), local_files_only=offline))
        for name, expected in model["files"].items():
            file = snapshot / name
            if file.stat().st_size != expected["bytes"] or hashlib.sha256(file.read_bytes()).hexdigest() != expected["sha256"]:
                raise ValueError(f"Model checksum mismatch: {model['repoId']}/{name}")
        link = artifacts / model["repoId"].replace("/", "--")
        if link.is_symlink():
            if link.resolve() != snapshot.resolve():
                raise ValueError(f"Different model snapshot already registered: {link}")
        elif link.exists():
            raise ValueError(f"Expected a model snapshot symlink: {link}")
        else:
            link.symlink_to(os.path.relpath(snapshot, artifacts), target_is_directory=True)
    return artifacts, lock


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    _, result = prepare_models(args.offline)
    print(json.dumps({"models": len(result["models"]), "requiredMiB": round(sum(f["bytes"] for m in result["models"] for f in m["files"].values()) / 1048576, 1),
                      "revisions": {m["repoId"]: m["revision"] for m in result["models"]}}))
