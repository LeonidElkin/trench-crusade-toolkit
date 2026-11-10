#!/usr/bin/env python3
"""Build machine-readable base catalog from retained import evidence.
Run only during import; curated overrides live in catalog-overrides.json.
"""
from pathlib import Path
import argparse, collections, json, re, sys
ROOT=Path(__file__).resolve().parents[1]
ap=argparse.ArgumentParser();ap.add_argument('--dir',type=Path,default=ROOT/'data/editions/1.6.3');args=ap.parse_args();DEST=args.dir
def read(n):return json.loads((DEST/n).read_text())
def write(n,x):(DEST/n).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def norm(t):return re.sub('[^а-яa-z0-9]','',t.lower().replace('ё','е'))
def sid(t):return re.sub(r'[^\w-]','',re.sub(r'\s+','-',t.lower())).strip('-')
layout=read('layout.json');articles=read('articles.json')
content={a['id']:(DEST/a['file']).read_text()for a in articles}

def ref(source,pages):return {'source':source,'pages':sorted(set(pages))}
def rule_at(source,page,title=''):
    aa=[a for a in articles if a['source']==source and page in a['pages']]
    if title:
        matches=[a for a in aa if norm(title) in norm(a['title'])or norm(a['title'])in norm(title)]
        if matches:return matches[0]['id']
    return aa[0]['id']if aa else None

fdefs=[('heretic','Легион Еретиков',18,19,22,27),('pilgrims','Паломники Траншей',33,34,37,41),('sultanate','Железный Султанат',48,49,54,58),('antioch','Новое Антиохийское Княжество',66,67,68,72),('grail','Культ Чёрного Грааля',82,83,86,92),('court','Двор Семиглавого Змея',96,98,106,117)]
factions=[{'id':i,'name':n,'source':ref('core',[p]),'ruleId':rule_at('core',p),'arsenalRuleId':rule_at('core',ap,'Оружие дальнего боя'),'image':'art/'+i+'.jpeg','startingBudget':{'ducats':700,'glory':0},'battleBudget':{'ducats':900,'glory':8}}for i,n,p,ap,_,_ in fdefs]
units=[]
unit_ids={'heretic':['priest','commando','chorister','trooper','anointed','war-wolf','witch','wretch'],'pilgrims':['prophet','castigator','communicant','pilgrim','prisoner','nun','anchorite'],'sultanate':['captain','alchemist','assassin','azeb','sapper','lion','janissary','bull'],'antioch':['lieutenant','cleric','sniper','yeoman','stormtrooper','engineer','mechanized','medic'],'grail':['lord','knight','guard','hound','thrall','herald','amalgam'],'court':['praetor','sorcerer','hunter','knight','yoke','wretch','locust','saint'],'allies':['medic','witch-hunter','tank-hunter','mendelist','sin-eater','sorcerer','observer','mamluk','dog','scripture-keeper']}
profile_text={}
for f in fdefs+[('allies','',0,0,1,22)]:
    fid,_,_,_,lo,hi=f;source='allies'if fid=='allies'else'core'
    bs=[b for b in layout if b['source']==source and lo<=b['page']<=hi]
    starts=[]
    for i,b in enumerate(bs):
        if re.search(r'Стоимость\s*:\s*\d+',b['raw']):starts.append(i)
    if len(starts)!=len(unit_ids[fid]):raise ValueError(f'{fid}: {len(starts)} profiles, expected {len(unit_ids[fid])}')
    for k,start in enumerate(starts):
        b=bs[start];end=starts[k+1]if k+1<len(starts)else len(bs);parts=bs[start:end]
        title=b['raw'].split('(Стоимость')[0].strip()
        if not title:title=bs[start-1]['raw'].strip()
        # Some Word blocks prepend previous profile keywords to a heading.
        if 'Ключевые слова'in title:title=re.split(r'(?=0-\d)',title)[-1]
        title=re.sub(r'\s+',' ',title)
        limit=re.match(r'^(0-\d+|1)\s*',title);minimum=0;maximum=None
        if limit:
            if limit[1]=='1':minimum=1;maximum=1
            else:maximum=int(limit[1].split('-')[1])
            title=title[limit.end():].strip()
        cost=int(re.search(r'Стоимость\s*:\s*(\d+)',b['raw'])[1]);currency='glory'if 'слав' in b['raw'].lower().split(')')[0]else'ducats'
        table=next((x['table']for x in parts if 'table'in x and 'Движение'in x['table']['headers']),None)
        if not table:raise ValueError(f'No profile table {fid} {title}')
        stats=dict(zip(['name','movement','ranged','melee','armour','base'],table['rows'][0]))
        text='\n'.join(x['raw']for x in parts);profile_text[fid+'.'+unit_ids[fid][k]]=text
        kms=list(re.finditer(r'Ключевые слова\s*[:\n]?\s*([A-Z][A-Z0-9 ,+()\-/]*)',text)); km=kms[-1]if kms else None
        keywords=[v.strip()for v in km[1].strip().split(',')]if km else[]
        # Source line HERETI is preserved; it is not silently corrected.
        eq=re.search(r'Экипировка\s*(.*?)(?:Способности|Ключевые слова)',text,re.S)
        locked=bool(eq and re.search(r'(?:не может|нельзя|не могут).{0,80}(?:модифиц|измен|экипир|оснащ)|не может иметь никакого',eq[1],re.I))
        uid=fid+'.'+unit_ids[fid][k];pages=[x['page']for x in parts]
        unit={'id':uid,'name':title,'factionId':None if fid=='allies'else fid,'mercenary':fid=='allies','cost':{'ducats':cost if currency=='ducats'else 0,'glory':cost if currency=='glory'else 0},'min':minimum,'max':maximum,'stats':stats,'profileRows':table['rows'],'keywords':keywords,'source':ref(source,pages),'ruleId':rule_at(source,b['page'],title),'equipmentLocked':locked,'fixedItems':[],'allowedCategories':['ranged','melee','armour','equipment'],'manualCheck':True}
        units.append(unit)
# Takwin profile uses a header cost rather than (Стоимость).
hom=[b for b in layout if b['source']=='core'and b['page']==63]
table=next(b['table']for b in hom if 'table'in b)
units.append({'id':'sultanate.homunculus','name':'Гомункул Таквин','factionId':'sultanate','mercenary':False,'cost':{'ducats':40,'glory':0},'min':0,'max':None,'stats':dict(zip(['name','movement','ranged','melee','armour','base'],table['rows'][0])),'profileRows':table['rows'],'keywords':['SULTANATE'],'source':ref('core',[63]),'ruleId':rule_at('core',63,'Гомункул'),'equipmentLocked':True,'fixedItems':[],'allowedCategories':[],'variantId':'wisdom','manualCheck':True})

# Weapon, armour and equipment descriptions. Numeric fields come from retained tables.
items=[];aliases={};seen=set()
for a in sorted(articles,key=lambda x: 0 if x['source']=='core'and 118<=x['pages'][0]<=132 else 1):
    title=a['title'];rus=re.split(r'\s*\([A-Za-z]',title)[0];english=re.search(r'\(([A-Za-z][^)]*)\)',title)
    valid=bool(rus.strip()) and english and (a['category']in['ranged','melee','armour','equipment'] or 20<=a['pages'][0]<=105)
    if not valid:continue
    iid='item.'+sid(english[1]);body=content[a['id']]
    category=a['category']if a['category']in['ranged','melee','armour','equipment']else'equipment'
    ts=[b['table']for b in layout if b['source']==a['source'] and b['page']in a['pages'] and 'table'in b and any(norm(rus)in norm(row[0])or norm(row[0])in norm(rus)for row in b['table']['rows'])]
    profile=ts[0]if ts else None
    mt=re.search(r'(?m)^\| Название \| Тип.*(?:\n\|[^\n]*)+',body)
    if mt:
        lines=mt[0].splitlines(); profile={'headers':[x.strip().replace('*','')for x in lines[0].strip('|').split('|')], 'rows':[[x.strip().replace('*','')for x in line.strip('|').split('|')]for line in lines[2:]]}
    if profile and 'Тип'in profile['headers']:category='ranged'if a['pages'][0]<124 and a['category']=='ranged'else'melee'if a['category']=='melee'else category
    if iid in seen:
        aliases[norm(rus)]=iid;continue
    seen.add(iid);hands=None;range_value=None;mods=None;keywords=[]
    if profile and 'Тип'in profile['headers']:
        row=dict(zip(profile['headers'],profile['rows'][0]));ht=row.get('Тип','').lower();hands=2 if 'двур'in ht else 1 if 'однор'in ht else None;range_value=row.get('Дальность');mods=row.get('Модификаторы');keywords=[x.strip()for x in row.get('Ключевые слова','').split(',')if x.strip()and x.strip()!='-']
    items.append({'id':iid,'name':rus,'englishName':english[1],'category':category,'hands':hands,'range':range_value,'modifiers':mods,'keywords':keywords,'source':ref(a['source'],a['pages']),'ruleId':a['id']})
    aliases[norm(rus)]=iid
    if profile:
        for row in profile['rows']:aliases.setdefault(norm(row[0]),iid)
# Explicit source synonyms, including source misspellings. Labels in offers stay verbatim.
map_names={'Пулемёт':'Machine Gun','Пистолет':'Pistol/Revolver','Дробовик':'Shotgun','Бландербус':'Blunderbuss','Бомбарда МУРАД':'MURAD Bombard','Бронежилет инженера':'Engineer Body Armour','Железный Капироте':'Iron Capirote','Медицинский набор':'Medi-kit','Знамя отряда':'Troop Flag','Альпинистский набор':'Mountaineer Kit','Окопный нож':'Knife/Dagger','Траншейный нож':'Knife/Dagger','Большой молот/кувалда':'Double-Handed Blunt Weapon','Цеп/плеть':'Scourge/Battle Whip/Flail','Винтовка':'Bolt Action Rifle','Окопный нож':'Knife/Dagger','Траншейный нож':'Knife/Dagger','Граната':'Grenades','Газовые гранаты':'Gas Grenades','Автоматический пистоле':'Automatic Pistol','Меч/топор':'Sword/Axe','Большой меч или топор':'Great Sword/Axe','Окопный щит':'Trench Shield','Машинная броня':'Machine Armour','Милосердие':'Misericordia','Мизерикордия':'Misericordia','Нечестивый амулет':'Unholy Trinket','Знамя':'Troop Flag','Знамя отряда':'Troop Flag','Боевой флаг':'Troop Flag','Альпинистский набор':'Mountaineer Kit','Медицинский комплект':'Medi-kit','Алхимические доспехи':'Alchemist Armour','Алхимические боеприпасы':'Alchemical Ammunition','Пушка внутренностей':'Viscera Cannon','Штурмовая Змея':'Serpent Assault Gun','Щит с изображением святой иконы':'Holy Icon Shield','Адское Клеймо':'Infernal Brand Mark','Таблетки мученичества':'Martyrdom Pills','Пилюли мученичества':'Martyrdom Pills','Нечестивый талисман':'Unholy Trinket','Боевой крест':'War Cross'}
for name,eng in map_names.items():
    matches=[i for i in items if norm(i['englishName'])==norm(eng)]
    if matches:aliases[norm(name)]=matches[0]['id']

offers=[];missing=[];catmap={'Оружие дальнего боя':'ranged','Оружие ближнего боя':'melee','Броня':'armour','Снаряжение':'equipment'}
for fid,_,_,ap,_,_ in fdefs:
    rows=[o for b in layout if b['source']=='core'and b['page']==ap and 'arsenal'in b for o in b['arsenal']]
    for o in rows:
        iid=aliases.get(norm(o['name']))
        if not iid:
            # A missing mapping stays explicit; never use fuzzy matching for rules.
            iid='item.'+sid(o['name']);missing.append({'faction':fid,'name':o['name'],'id':iid})
            if iid not in seen:
                items.append({'id':iid,'name':o['name'],'englishName':None,'category':catmap[o['category']],'hands':None,'range':None,'modifiers':None,'keywords':[],'source':ref('core',[ap]),'ruleId':rule_at('core',ap,o['category']),'unresolved':True});seen.add(iid)
        m=re.search(r'(\d+)\s+(дукат\w*|очк\w*\s+слав\w*)',o['detail'],re.I)
        if not m:raise ValueError(o)
        currency='glory'if m[2].lower().startswith('очк')else'ducats';cost=int(m[1]);lm=re.search(r'лимит\s*:\s*(\d+)',o['detail'],re.I)
        offers.append({'id':'offer.'+fid+'.'+iid[5:],'factionId':fid,'itemId':iid,'name':o['name'],'category':catmap[o['category']],'cost':{'ducats':cost if currency=='ducats'else 0,'glory':cost if currency=='glory'else 0},'limit':int(lm[1])if lm else None,'notes':o['detail'][m.end():].strip(),'source':ref('core',[ap]),'ruleId':rule_at('core',ap,o['category']),'allowedUnitIds':None,'requiredKeywords':[],'forbiddenKeywords':[]})
variants=[];vids=['naval','ghosts','greed','affliction','plague','methodius','fidai','wisdom','papal','eire','prussia','alba','abyssinia','hegemon']
for a,vid in zip([a for a in articles if a['title'].startswith('Вариант отряда:')],vids):
    faction=a['category'].replace('-variants','');name=a['title'].replace('Вариант отряда:','').strip()
    if vid=='greed':name+=' Алчности'
    variants.append({'id':vid,'name':name,'factionId':faction,'source':ref('core',a['pages']),'ruleId':a['id'],'manualCheck':True})
keywords=[]
for a in articles:
    if a['category']=='keywords' and re.match(r'^[+A-Z-][A-Z ()+\d/-]+$',a['title']):keywords.append({'id':'keyword.'+('positive-dice'if a['title']=='+DICE'else'negative-dice'if a['title']=='-DICE'else sid(a['title'])),'name':a['title'],'source':ref('core',a['pages']),'ruleId':a['id']})
write('catalog-base.json',{'schemaVersion':1,'edition':'1.6.3','factions':factions,'variants':variants,'units':units,'items':items,'offers':offers,'upgrades':[],'keywords':keywords,'constraints':[]})
write('catalog-extraction-report.json',{'unitCount':len(units),'itemCount':len(items),'offerCount':len(offers),'variantCount':len(variants),'keywordCount':len(keywords),'unresolvedItemMappings':missing})
# Temporary targeted review material, not application data.
Path('/tmp/trench-profiles-review.json').write_text(json.dumps(profile_text,ensure_ascii=False,indent=2))
print(json.dumps({'units':len(units),'items':len(items),'offers':len(offers),'variants':len(variants),'keywords':len(keywords),'unresolvedMappings':len(missing)}))
