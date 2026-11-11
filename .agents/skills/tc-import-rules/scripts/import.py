#!/usr/bin/env python3
"""Explicit PDF preparation and gated assembly. No legacy fallbacks."""
import argparse
import json
import subprocess
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[4]
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--edition', required=True)
p.add_argument('--out', type=Path, required=True)
p.add_argument('--manifest', type=Path)
p.add_argument('--authored', type=Path)
p.add_argument('--reviews', type=Path)
p.add_argument('--resume', action='store_true')
p.add_argument('--prepare-only', action='store_true')
p.add_argument('--author-preview', action='store_true')
a = p.parse_args()
canonical = ROOT / 'reconstruction' / a.edition
manifest = a.manifest or canonical / 'manifest.json'
if not manifest.is_file(): p.error('Provide a new edition manifest')
if json.loads(manifest.read_text())['edition'] != a.edition: p.error('Manifest edition mismatch')
if a.out.resolve().is_relative_to((ROOT / 'data/editions').resolve()): p.error('Use staging, not production')
if a.out.exists() and any(a.out.iterdir()) and not a.resume: p.error('Use empty staging or --resume')
prepare = [sys.executable, str(ROOT / 'tools/reconstruction/prepare.py'), '--manifest', str(manifest), '--out', str(a.out / 'evidence')]
if a.resume: prepare.append('--resume')
subprocess.run(prepare, cwd=ROOT, check=True)
if not a.prepare_only:
    command = [sys.executable, str(ROOT / 'tools/reconstruction/assemble.py'), '--manifest', str(manifest), '--authored', str(a.authored or canonical / 'authored'), '--reviews', str(a.reviews or canonical / 'reviews'), '--out', str(a.out / 'database')]
    if a.author_preview: command.append('--allow-pending-review')
    subprocess.run(command, cwd=ROOT, check=True)
