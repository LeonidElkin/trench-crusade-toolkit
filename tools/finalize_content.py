#!/usr/bin/env python3
"""Finalize an import directory using already extracted data, without reopening PDFs.
Groups each scenario by its logical section, attaches source maps, removes only orphan import artifacts.
"""
import argparse,hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def finalize(dest,prune=False):
    articles=json.loads((dest/'articles.json').read_text());assets=json.loads((ROOT/'data/assets.json').read_text())if(ROOT/'data/assets.json').exists()else[]
    original=json.loads((ROOT/'data/editions/1.6.3/sources.json').read_text())
    imported=json.loads((dest/'sources.json').read_text())
    if not any(s['id']=='core'and any(x['id']=='core'and x['sha256']==s['sha256']for x in original)for s in imported):assets=[]
    for number in range(1,10):
        category=f'scenario-{number}';group=[a for a in articles if a['category']==category]
        if not group:continue
        paragraphs=[(dest/a['file']).read_text()for a in group]
        title=next((a['title']for a in group if not a['title'].startswith('Сценарий')),group[0]['title'])
        first=dict(group[0]);first.update(id=f'core-scenario-{number}',title=f'Сценарий {number}: {first["section"]}',pages=sorted(set(p for a in group for p in a['pages'])),file=f'content/core-scenario-{number}.md')
        body='\n\n'.join(paragraphs)
        for asset in assets:
            if asset['path'].startswith('diagrams/')and asset['page']in first['pages']and asset['path']not in body:body+=f'\n\n![Схема сценария из исходного PDF, страница {asset["page"]}]({asset["path"]})\n'
        (dest/first['file']).write_text(body);first['sha256']=hashlib.sha256(body.encode()).hexdigest()
        position=articles.index(group[0]);articles=[a for a in articles if a not in group];articles.insert(position,first)
    # Deployment diagrams belong with the article containing the deployment number on that page.
    for asset in assets:
        if not asset['path'].startswith('diagrams/')or asset['page']<162:continue
        candidates=[a for a in articles if a['source']=='core'and asset['page']in a['pages']]
        if not candidates:continue
        article=candidates[0];path=dest/article['file'];body=path.read_text()
        if asset['path']not in body:body+=f'\n\n![Схема развёртывания из PDF, страница {asset["page"]}]({asset["path"]})\n';path.write_text(body);article['sha256']=hashlib.sha256(body.encode()).hexdigest()
    (dest/'articles.json').write_text(json.dumps(articles,ensure_ascii=False,indent=2)+'\n')
    if prune:
        included={a['file']for a in articles}
        for p in (dest/'content').glob('*.md'):
            if str(p.relative_to(dest))not in included:p.unlink()
    print(f'Finalized {len(articles)} logical articles with source diagrams')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--dir',type=Path,default=ROOT/'data/editions/1.6.3');p.add_argument('--prune',action='store_true');a=p.parse_args();finalize(a.dir,a.prune)
