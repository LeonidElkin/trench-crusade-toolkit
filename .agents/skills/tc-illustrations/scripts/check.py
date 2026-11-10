#!/usr/bin/env python3
"""Inventory existing portraits; no network, generation or PDF parsing."""
import argparse
import subprocess
from pathlib import Path
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--edition', default='1.6.3')
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parents[4]
cmd = ['npx', 'tsx', 'tools/manage-portraits.ts', 'status', '--edition', args.edition]
if args.check:
    cmd.append('--check')
raise SystemExit(subprocess.run(cmd, cwd=root).returncode)
