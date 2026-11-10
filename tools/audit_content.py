#!/usr/bin/env python3
"""Audit retained layout against editable Markdown. No PDF read during normal validation."""
import argparse,collections,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def clean(t):
 t=re.sub(r'!\[[^]]*\]\([^)]*\)','',t);t=re.sub(r'<!--.*?-->','',t,flags=re.S)
 return t.replace('*','').replace('#','').replace('|',' ').replace('−','-').replace('\xad','')
def audit(dest):
 layout=json.loads((dest/'layout.json').read_text());articles=json.loads((dest/'articles.json').read_text());src=collections.defaultdict(str);out=collections.defaultdict(str)
 for b in layout:src[(b['source'],b['page'])]+=' '+clean(b['raw'])
 for a in articles:
  text=(dest/a['file']).read_text();parts=re.split(r'<!-- source:(core|allies) page:(\d+) -->',text)
  for n in range(1,len(parts),3):out[(parts[n],int(parts[n+1]))]+=' '+clean(parts[n+2])
 report=[]
 for key,source in src.items():
  # Compare multisets: visual line wraps and column order are not semantic differences.
  input_letters=collections.Counter(c.lower()for c in source if c.isalnum());output_letters=collections.Counter(c.lower()for c in out[key]if c.isalnum())
  missing=input_letters-output_letters;total=sum(input_letters.values());ratio=1-sum(missing.values())/max(1,total)
  num=lambda t:collections.Counter(re.findall(r'[+-]?\d+(?:[.,]\d+)?',re.sub(r'([+-])\s+(\d)',r'\1\2',t)))
  missing_numbers=num(source)-num(out[key])
  report.append({'source':key[0],'page':key[1],'characterCoverage':round(ratio,6),'missingNumbers':dict(missing_numbers),'sourceCharacters':total,'markdownCharacters':sum(output_letters.values())})
 result={'pages':report,'coveredPages':len(report),'minimumCharacterCoverage':min(r['characterCoverage']for r in report),'pagesWithMissingNumbers':len([r for r in report if r['missingNumbers']])}
 (dest/'content-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({k:v for k,v in result.items()if k!='pages'},ensure_ascii=False))
 for r in report:
  if r['characterCoverage']<.995 or r['missingNumbers']:print(r)
 return result
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');p.add_argument('--dir',type=Path,default=ROOT/'data/editions/1.6.3');a=p.parse_args();result=audit(a.dir)
 if a.check and (result['minimumCharacterCoverage']<1 or result['pagesWithMissingNumbers']):raise SystemExit('Content coverage check failed')
