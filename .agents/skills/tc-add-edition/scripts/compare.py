#!/usr/bin/env python3
import argparse,json,re
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('old',type=Path);p.add_argument('new',type=Path);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
def catalog(d):
 base=json.loads((d/'catalog-base.json').read_text());path=d/'catalog-overrides.json';over=json.loads(path.read_text())if path.exists()else{}
 for k in ['units','items','offers','variants']:base[k]=[{**x,**over.get(k,{}).get(x['id'],{})}for x in base[k]]
 for k,extra in [('units','newUnits'),('items','newItems'),('offers','newOffers')]:base[k]+=over.get(extra,[])
 base['upgrades']=over.get('upgrades',base.get('upgrades',[]));return base
old,new=catalog(a.old),catalog(a.new);changes=[]
for group in ['factions','variants','units','items','offers','upgrades','keywords']:
 before={x['id']:x for x in old[group]};after={x['id']:x for x in new[group]}
 for id in sorted(before.keys()|after.keys()):
  x,y=before.get(id),after.get(id)
  if x is None or y is None:changes.append({'group':group,'id':id,'type':'added'if x is None else'removed'});continue
  fields={k:{'old':x.get(k),'new':y.get(k)}for k in x.keys()|y.keys()if k not in ['name','englishName','source','ruleId','notes','image']and x.get(k)!=y.get(k)}
  if fields:changes.append({'group':group,'id':id,'type':'mechanical','fields':fields})
  if x.get('name')!=y.get('name'):changes.append({'group':group,'id':id,'type':'name','old':x.get('name'),'new':y.get('name')})
def texts(d):return {x['id']:re.sub(r'<!--.*?-->','',(d/x['file']).read_text(),flags=re.S).strip()for x in json.loads((d/'articles.json').read_text())}
x,y=texts(a.old),texts(a.new);text_changes=[id for id in sorted(x.keys()|y.keys())if x.get(id)!=y.get(id)]
result={'mechanics':changes,'textChanges':text_changes};a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(f'{len(changes)} entity changes; {len(text_changes)} text changes')
