#!/usr/bin/env python3
"""Preserve Russian text; explicitly mark game terms lost by plain table reconstruction."""
import argparse,hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def format_terms(dest):
 articles=json.loads((dest/'articles.json').read_text());count=0
 pattern=re.compile(r'(?<![A-Za-z0-9_*])(?:[+-]?\d+\s*DICE|[+-]?DICE|[A-Z][A-Z]+(?:[ -][A-Z][A-Z]+)*|[Лл][Ии][Мм][Ии][Тт]\s*:\s*\d+|[Тт]олько для [Ээ]литы)(?![A-Za-z0-9_*])')
 for a in articles:
  path=dest/a['file'];original=path.read_text();lines=[]
  for line in original.splitlines():
   if line.startswith(('#','<!--','![')):lines.append(line);continue
   spans=re.split(r'(\*\*.*?\*\*)',line)
   for i in range(0,len(spans),2):spans[i]=pattern.sub(lambda m:'**'+m[0]+'**',spans[i])
   lines.append(''.join(spans))
  text='\n'.join(lines)+'\n'
  if text!=original:path.write_text(text);count+=1
  a['sha256']=hashlib.sha256(text.encode()).hexdigest()
 (dest/'articles.json').write_text(json.dumps(articles,ensure_ascii=False,indent=2)+'\n');print(f'Term markup: {count} articles updated; no translations')
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--dir',type=Path,default=ROOT/'data/editions/1.6.3');a=p.parse_args();format_terms(a.dir)
