#!/usr/bin/env python3
"""Explicit extraction of illustrations and diagrams. User authorized publication on 2026-11-10."""
import hashlib,json
from pathlib import Path
import fitz
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'public/reference/trench-crusade-1.6.3-ru.pdf'
doc=fitz.open(source);out=ROOT/'public/art';out.mkdir(parents=True,exist_ok=True);manifest=[]
for name,page in [('heretic',21),('pilgrims',42),('sultanate',65),('antioch',81),('grail',93),('court',107),('hero',3)]:
    im=max(doc[page-1].get_images(),key=lambda i:i[2]*i[3]);data=doc.extract_image(im[0]);path=out/(name+'.'+data['ext']);path.write_bytes(data['image']);manifest.append({'path':str(path.relative_to(ROOT/'public')),'source':'core','page':page,'xref':im[0],'sha256':hashlib.sha256(data['image']).hexdigest()})
maps={134:[662],136:[670],138:[678],140:[686],142:[694],144:[703],146:[710],150:[724],156:[743],162:[767],164:[777],165:[782,784,786,788],166:[793]}
out=ROOT/'public/diagrams';out.mkdir(exist_ok=True)
for page,xrefs in maps.items():
    for xref in xrefs:
        data=doc.extract_image(xref);path=out/(f'core-{page}-{xref}.'+data['ext']);path.write_bytes(data['image']);manifest.append({'path':str(path.relative_to(ROOT/'public')),'source':'core','page':page,'xref':xref,'sha256':hashlib.sha256(data['image']).hexdigest()})
(ROOT/'data/assets.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(f'Extracted {len(manifest)} authorized illustrations/diagrams; no source PDF copied')
