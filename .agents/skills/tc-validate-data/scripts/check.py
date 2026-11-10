#!/usr/bin/env python3
import json,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
subprocess.run([sys.executable,str(ROOT/'tools/audit_content.py')],cwd=ROOT,check=True)
a=json.loads((ROOT/'data/editions/1.6.3/content-audit.json').read_text())
if a['minimumCharacterCoverage']<1 or a['pagesWithMissingNumbers']:raise SystemExit('Content audit failed; review missing source material')
subprocess.run(['npm','run','data:validate'],cwd=ROOT,check=True)
