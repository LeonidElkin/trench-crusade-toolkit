#!/usr/bin/env python3
import subprocess, sys, tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
subprocess.run([sys.executable,'-m','unittest','discover','-s','tools/reconstruction','-p','test_*.py'],cwd=ROOT,check=True)
with tempfile.TemporaryDirectory(prefix='tc-reviewed-check-') as out:
 subprocess.run([sys.executable,str(ROOT/'tools/reconstruction/assemble.py'),'--manifest',str(ROOT/'reconstruction/1.6.3/manifest.json'),'--authored',str(ROOT/'reconstruction/1.6.3/authored'),'--reviews',str(ROOT/'reconstruction/1.6.3/reviews'),'--out',out],cwd=ROOT,check=True)
subprocess.run(['npm','run','data:validate'],cwd=ROOT,check=True)
