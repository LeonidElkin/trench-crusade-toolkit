#!/usr/bin/env python3
import argparse,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
p=argparse.ArgumentParser();p.add_argument('--edition',required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--manifest',type=Path);a=p.parse_args()
if a.out.resolve().is_relative_to((ROOT/'data/editions').resolve()):p.error('Use staging outside data/editions; published editions must not be overwritten')
if a.out.exists()and any(a.out.iterdir()):p.error('Staging directory must be empty')
command=[sys.executable,str(ROOT/'tools/import_pdf.py'),'--edition',a.edition,'--out',str(a.out)]
if a.manifest:command+=['--manifest',str(a.manifest)]
for cmd in [command,[sys.executable,str(ROOT/'tools/finalize_content.py'),'--dir',str(a.out),'--prune'],[sys.executable,str(ROOT/'tools/format_terms.py'),'--dir',str(a.out)],[sys.executable,str(ROOT/'tools/audit_content.py'),'--dir',str(a.out)]]:subprocess.run(cmd,cwd=ROOT,check=True)

if a.edition=="1.6.3":
 subprocess.run([sys.executable,str(ROOT/"tools/build_catalog.py"),"--dir",str(a.out)],cwd=ROOT,check=True)
 import json,shutil
 if json.loads((a.out/"sources.json").read_text())==json.loads((ROOT/"data/editions/1.6.3/sources.json").read_text()):
  shutil.copyfile(ROOT/"data/editions/1.6.3/catalog-overrides.json",a.out/"catalog-overrides.json")
  print("Exact source checksums match; retained reviewed overrides copied")
