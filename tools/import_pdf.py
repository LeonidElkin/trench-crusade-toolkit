#!/usr/bin/env python3
"""Explicit, deterministic PDF import. Never imported by the web application.
Usage: python tools/import_pdf.py --edition 1.6.3 [--out PATH]
Requires tools/requirements-import.txt. Outputs Markdown, source index, audit and layout.
"""
import argparse, collections, hashlib, json, re, subprocess, unicodedata
from pathlib import Path
import fitz

ROOT = Path(__file__).resolve().parents[1]

def clean(t):
    return unicodedata.normalize('NFC',t).replace('\xad','').replace('\u00a0',' ').replace('\ufeff','').replace('\u200b','')

def plain(b): return clean(' '.join(s['text'].strip() for l in b['lines'] for s in l['spans'] if s['text'].strip()))
def slug(t):
    t=re.sub(r'[^\w\s-]','',clean(t).lower());return re.sub(r'[\s_]+','-',t).strip('-')[:100]

def span_md(s):
    t=clean(s['text']); core=t.strip()
    if not core: return t
    if any(x in s['font'] for x in ['Wingdings','Symbol']): return '- '
    if 'Bold' in s['font'] or bool(s['flags'] & 16):
        return (' ' if t.startswith(' ') else '')+'**'+core+'**'+(' ' if t.endswith(' ') else '')
    return t

def lines_md(b):
    out=[]
    for l in b['lines']:
        ss=[s for s in l['spans'] if s['text'].strip()]
        if not ss:continue
        raw=clean(''.join(s['text'] for s in l['spans'])).strip()
        if len(raw)==1 and max(s['size'] for s in ss)>25: out.append(raw);continue
        ishead = (any(s['size']>=11 and 'AmericanText' in s['font'] and len(s['text'].strip())>1 for s in ss) or any(s['size']>=9.7 and 'Bold'in s['font'] for s in ss) or (len(ss[0]['text'].strip())>1 and 'Bold'in ss[0]['font'] and bool(re.match(r'^[+A-Z-][A-Z ()+/-]+:', raw))) or (not raw.startswith('(') and sum(len(s['text'].strip())for s in ss if 'Bold'in s['font'])/max(1,sum(len(s['text'].strip())for s in ss))>.65 and ':'not in raw and (bool(re.search(r'\([A-Za-z][^)]*\)',raw)) or bool(re.search(r'\d+\s+(?:дукат|[Оо]чк)',raw)))) or any(s['size']>=25 and len(s['text'].strip())>2 for s in ss))
        md=''.join(span_md(s)for s in l['spans']).strip()
        md=re.sub(r'\*\*\s*\*\*',' ',md)
        # Headers retain their original wording but do not need redundant bold.
        km=re.match(r'^([+A-Z-][A-Z0-9 ()+/-]*):',raw)
        if ishead and km:
            out.extend(['## '+km[1],md])
        else:
            out.append(('## '+raw) if ishead else md)
    # Join visual line wraps; retain actual headings and bullets as blocks.
    result=''
    previous_heading=False
    for line in out:
        heading=line.startswith('## ')
        if heading and previous_heading: result+=' '+line[3:]
        elif heading or line.startswith('- '): result+='\n\n'+line
        elif previous_heading: result+='\n\n'+line
        elif result.endswith('-') and not result.endswith(' -'): result=result[:-1]+line
        else: result+=(' ' if result else '')+line
        previous_heading=heading

    return result.strip()

def arsenal_blocks(blocks):
    start=next((b for b in blocks if plain(b).startswith('Оружие дальнего боя') and len(re.findall(r'\d+\s+(?:дукат|очк)',plain(b)))>8),None)
    if not start:return blocks
    selected=[b for b in blocks if b['bbox'][0]>=start['bbox'][0]-10 and b['bbox'][1]>=start['bbox'][1]-2]
    spans=[s for b in selected for l in b['lines']for s in l['spans']if s['text'].strip()]
    groups=[]
    for s in sorted(spans,key=lambda s:(round(s['bbox'][1]),s['bbox'][0])):
        if not groups or abs(groups[-1][0]-s['bbox'][1])>2:groups.append((s['bbox'][1],[s]))
        else:groups[-1][1].append(s)
    price_x=min(s['bbox'][0] for s in spans if re.match(r'^\d+\s+(?:дукат|очк)',clean(s['text']).strip(),re.I))
    category='';offers=[];current=None
    categories=['Оружие дальнего боя','Оружие ближнего боя','Броня','Снаряжение']
    for y,ss in groups:
        ss.sort(key=lambda s:s['bbox'][0]);name=' '.join(clean(s['text']).strip()for s in ss if s['bbox'][0]<price_x-3).strip();detail=' '.join(clean(s['text']).strip()for s in ss if s['bbox'][0]>=price_x-3).strip()
        if name in categories:
            if current:offers.append(current);current=None
            category=name;continue
        if re.match(r'^\d+\s+(?:дукат|очк)',detail,re.I):
            if current and not current['detail']:current['name']+=' '+name;current['detail']=detail
            else:
                if current:offers.append(current)
                current={'name':name,'detail':detail,'category':category}
        elif current:
            if name:current['name']+=' '+name
            if detail:current['detail']+=' '+detail
        elif name:current={'name':name,'detail':detail,'category':category}
    if current:offers.append(current)
    # Use a synthetic block with complete table rows, preserving each source term.
    parts=[]
    for category in categories:
        rows=[o for o in offers if o['category']==category]
        if not rows:continue
        parts.append('## '+category+'\n\n| Предмет | Стоимость и ограничения |\n| --- | --- |\n'+'\n'.join('| '+o['name']+' | '+o['detail']+' |'for o in rows))
    synthetic={'arsenal':offers,'markdown':'\n\n'.join(parts),'bbox':start['bbox'],'lines':start['lines']}
    return [b for b in blocks if b not in selected]+[synthetic]

def table_blocks(blocks):
    """Recover unruled Word tables using header anchors and overlapping fragments."""
    result=[];used=set();tables=[]
    for i,b in enumerate(blocks):
        if i in used:continue
        txt=plain(b)
        if 'arsenal'in b:
            result.append({'text':b['markdown'],'raw':b['markdown'],'bbox':list(b['bbox']),'arsenal':b['arsenal']});continue
        if not ('Название' in txt and (('Движение'in txt and 'Броня'in txt) or ('Модификаторы'in txt and 'Ключевые слова'in txt))):
            result.append({'text':lines_md(b),'raw':txt,'bbox':list(b['bbox'])});continue
        ss=[s for l in b['lines']for s in l['spans']if s['text'].strip()]
        top=min(s['bbox'][1]for s in ss)
        hs=sorted([s for s in ss if abs(s['bbox'][1]-top)<2],key=lambda s:s['bbox'][0])
        if len(hs)<4:
            result.append({'text':lines_md(b),'raw':txt,'bbox':list(b['bbox'])});continue
        bottom=b['bbox'][3]; fragments=[b];used.add(i)
        for j,c in enumerate(blocks):
            if j==i or j in used:continue
            if c['bbox'][1]>=top+5 and c['bbox'][1]<bottom-1 and c['bbox'][0]>=b['bbox'][0]-2 and c['bbox'][0]<hs[-1]['bbox'][0]+100:
                fragments.append(c);used.add(j);bottom=max(bottom,c['bbox'][3])
        anchors=[s['bbox'][0] for s in hs]
        vals=[s for c in fragments for l in c['lines']for s in l['spans']if s['text'].strip() and s['bbox'][1]>top+4]
        cells=[[]for _ in anchors]
        for s in vals:
            col=min(range(len(anchors)),key=lambda x:abs(s['bbox'][0]-anchors[x]))
            cells[col].append(s)
        # The second column marks profile rows. A weapon usually has one row.
        starts=sorted(set(round(s['bbox'][1],1)for s in cells[1]))
        if not starts:starts=[top+10]
        if 'Модификаторы'in txt:starts=starts[:1]
        rows=[['' for _ in anchors]for _ in starts]
        for col,vs in enumerate(cells):
            for s in sorted(vs,key=lambda x:(round(x['bbox'][1]),x['bbox'][0])):
                ri=max([k for k,y in enumerate(starts)if s['bbox'][1]>=y-2]or[0])
                rows[ri][col]+=(' 'if rows[ri][col]else'')+clean(s['text']).strip()
        heads=[clean(s['text']).strip()for s in hs]
        md='| '+' | '.join(heads)+' |\n| '+' | '.join('---'for _ in heads)+' |\n'
        md+='\n'.join('| '+' | '.join(v.replace('|','\\|')for v in row)+' |'for row in rows)
        result.append({'text':md,'raw':' '.join(plain(c)for c in fragments),'bbox':list(b['bbox']),'table':{'headers':heads,'rows':rows}})
        tables.append({'headers':heads,'rows':rows,'bbox':list(b['bbox'])})
    return result,tables

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--edition',required=True);ap.add_argument('--out',type=Path);ap.add_argument('--manifest',type=Path);a=ap.parse_args()
    manifest_path=a.manifest or ROOT/'tools/import-manifests'/f'{a.edition}.json'
    if not manifest_path.is_file():ap.error(f'Missing explicit source manifest: {manifest_path}')
    manifest=json.loads(manifest_path.read_text())
    if manifest['editionId']!=a.edition:ap.error('Edition must match the source manifest')
    sources_manifest=[(s['id'],s['filename'],s['edition'])for s in manifest['sources']]
    ranges=[(s['from'],s['to'],s['title'],s['category'])for s in manifest['sections']]
    dest=a.out or ROOT/'data/editions'/a.edition;dest.mkdir(parents=True,exist_ok=True);(dest/'content').mkdir(exist_ok=True)
    docs=[];audit=[];layout=[];sources=[];current=None;articles=[];seen=collections.Counter();counts=collections.Counter()
    def flush():
        nonlocal current
        if not current:return
        body='\n\n'.join(current.pop('parts')).strip()+'\n'
        if body.strip():
            (dest/'content'/f"{current['id']}.md").write_text(body)
            current['file']='content/'+current['id']+'.md';current['pages']=sorted(set(current['pages']));current['sha256']=hashlib.sha256(body.encode()).hexdigest();articles.append(current)
        current=None
    for sid,filename,version in sources_manifest:
        path=ROOT/'.reference'/filename
        if not path.exists():ap.error(f'Missing source: {path}')
        pdf=fitz.open(path);sources.append({'id':sid,'filename':filename,'edition':version,'pages':len(pdf),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
        for pno,page in enumerate(pdf,1):
            blocks=[b for b in page.get_text('dict')['blocks']if 'lines'in b and b['bbox'][1]>=50 and b['bbox'][1]<790 and plain(b)]
            bs,ts=table_blocks(arsenal_blocks(blocks))
            if sid=='core':
                group=next(x for x in ranges if x[0]<=pno<=x[1]);category=group[3];section=group[2]
            else:category='allies';section='Союзники и наёмники'
            # Keep original PDF reading order. Word stores text columns in reading order.
            pagechars=0
            for b in bs:
                for part in re.split(r'(?m)(?=^## )',b['text']):
                    part=part.strip()
                    if not part:continue
                    first=part.split('\n',1)[0]
                    heading=first[3:] if first.startswith('## ')else None
                    if heading and (len(heading)>2) and not re.fullmatch(r'[\d\s.-]+',heading):
                        flush();base=sid+'-'+slug(heading);seen[base]+=1
                        aid=base+('~'+str(seen[base])if seen[base]>1 else'')
                        current={'id':aid,'title':heading,'source':sid,'pages':[],'category':category,'section':section,'parts':[]}
                    if current is None or current['category']!=category or current['source']!=sid:
                        flush();aid=sid+'-'+category+'-'+str(pno)
                        current={'id':aid,'title':section,'source':sid,'pages':[],'category':category,'section':section,'parts':[]}
                    if pno not in current['pages']:current['parts'].append(f'<!-- source:{sid} page:{pno} -->')
                    current['pages'].append(pno);current['parts'].append(part);pagechars+=len(part)
                b['page']=pno;b['source']=sid;layout.append(b)
            audit.append({'source':sid,'page':pno,'textCharacters':len(page.get_text()),'retainedCharacters':pagechars,'tables':len(ts),'images':len(page.get_images()),'status':'text' if pagechars else 'illustration' if page.get_images() else 'empty'})
            counts[sid]+=pagechars
        flush()
    def write(name,value): (dest/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
    write('sources.json',sources);write('articles.json',articles);write('import-audit.json',{'importerVersion':1,'pymupdfVersion':fitz.VersionBind,'pages':audit,'articleCount':len(articles),'tableCount':sum(p['tables']for p in audit)})
    # Extraction evidence is an import artifact, not a second editable content source.
    write('layout.json',layout)
    print(json.dumps({'sources':len(sources),'pages':len(audit),'articles':len(articles),'tables':sum(p['tables']for p in audit),'out':str(dest)},ensure_ascii=False))
if __name__=='__main__':main()
