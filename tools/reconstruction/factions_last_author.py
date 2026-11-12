#!/usr/bin/env python3
"""Explicit editorial reconstruction of visually inspected core PDF pp.66–117.

No old rules corpus is read. Rectangles and all table cells below were chosen
against rendered original pages. Re-running this script does not perform review.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
PDF = ROOT / 'public/reference/trench-crusade-1.6.3-ru.pdf'
DOC = fitz.open(PDF)
EXPECTED_SHA256='c1ddd9579d5e7cfb5623f8b0c8528a40a96e004776831f8ccbe9e65b617879c9'
if hashlib.sha256(PDF.read_bytes()).hexdigest()!=EXPECTED_SHA256:
    raise SystemExit('Source PDF changed: editorial selections and visual inspection require a new authoring pass.')
OUT = ROOT / 'reconstruction/1.6.3/authored/factions-last.json'
RAW = {n: DOC[n-1].get_text('dict', flags=fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES) for n in range(66,118)}
SECTIONS = []
ENTITIES = {key: [] for key in ['factions','variants','units','items','offers','upgrades','abilities','constraints']}
TABLES = {}


def plain(line):
    return ''.join(s['text'] for s in line['spans']).strip()


def norm(text):
    text = text.replace('\u00ad', '').replace('\xa0',' ')
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def span_md(span):
    s = span['text'].replace('\u00ad','').replace('\xa0',' ')
    if not s.strip():
        return s
    a, b = len(s)-len(s.lstrip()), len(s.rstrip())
    word = s[a:b]
    font = span['font'].lower()
    # Only actual PDF emphasis, never infer headings from isolated lines.
    mark = '**' if 'bold' in font else '*' if 'italic' in font else ''
    return s[:a] + mark + word + mark + s[b:]


def line_md(line):
    s = ''.join(span_md(span) for span in line['spans'])
    s = re.sub(r'\*\*\s+\*\*',' ',s)
    s = re.sub(r'(?<!\*)\*\s+\*(?!\*)',' ',s)
    return norm(s)


def join_lines(lines):
    out = ''
    for s in lines:
        if not s:
            continue
        # PDF line wrap after a minus sign must keep negative numeric values.
        if re.search(r'-\*{0,2}$',out) and re.match(r'\*{0,2}[А-Яа-яЁёA-Za-z0-9]',s):
            out += s
        elif out.endswith('-') and re.match(r'[а-яa-z]',s):
            # The document also contains true compounds (Из-за, Иго-Демон).
            # Preserve printed hard hyphens; only soft hyphens are removed.
            out += s
        else:
            out += (' ' if out else '') + s
    out = re.sub(r'\*\*\s+\*\*',' ',out)
    out = re.sub(r'(?<!\*)\*\s+\*(?!\*)',' ',out)
    return out


SUBHEADS = {'Экипировка','Способности','Ключевые слова','Ранги Рыцаря Чумы',
            'Особые правила','Особые правила Песни скорби','Воля Гегемона',
            'Способности Святых воинов Абиссинии','Семь Смертных Грехов',
            'Двор и Великая Война'}


def table_md(headers,rows):
    esc = lambda v: str(v).replace('|','\\|')
    return '\n'.join(['| '+' | '.join(map(esc,headers))+' |',
                      '| '+' | '.join(['---']*len(headers))+' |'] +
                     ['| '+' | '.join(map(esc,row))+' |' for row in rows])


def reg(page, x0=0,y0=75,x1=595,y1=768):
    return {'page':page,'bbox':[x0,y0,x1,y1]}


def render_region(region):
    n = region['page']; x0,y0,x1,y1 = region['bbox']
    chunks=[]
    replaced=set()
    for bi,block in enumerate(RAW[n]['blocks']):
        if block.get('type') != 0:
            continue
        selected=[]
        for line in block['lines']:
            x,y,_,_ = line['bbox']
            if not (x0<=x<x1 and y0<=y<y1) or not plain(line):
                continue
            if plain(line) in ('o',):
                continue
            if len(plain(line))==1 and plain(line).isalpha() and max(s['size'] for s in line['spans'])>20:
                continue # decorative initial has an explicit dropcap decision
            covered = False
            for ti,t in enumerate(TABLES.get(n,[])):
                tx0,ty0,tx1,ty1=t['bbox']
                if tx0<=x<tx1 and ty0-1<=y<ty1:
                    if ti not in replaced:
                        if selected:
                            chunks.append(join_lines(selected));selected=[]
                        chunks.append(table_md(t['headers'],t['rows']))
                        replaced.add(ti)
                    covered=True;break
            if covered:
                continue
            txt=plain(line)
            if txt in SUBHEADS:
                if selected:
                    chunks.append(join_lines(selected));selected=[]
                chunks.append('## '+txt)
                continue
            # Distinct printed bullets can share a PyMuPDF text block.
            leading=line['spans'][0]
            if selected and 'bold' in leading['font'].lower() and re.search(r'\([^)]*\):',txt):
                chunks.append(join_lines(selected));selected=[]
            # First-line headings and price are one visual row; lore starts below.
            if selected and any('italic' in s['font'].lower() for s in line['spans']) and not any('*' in q for q in selected):
                chunks.append(join_lines(selected));selected=[]
            selected.append(line_md(line))
        if selected:
            body=join_lines(selected)
            first=next((l for l in block['lines'] if plain(l)),None)
            if first and first['bbox'][0]>=x0+15 and re.match(r'^\*\*[^*]+:',body):
                body='- '+body
            chunks.append(body)
    text='\n\n'.join(c for c in chunks if c.strip())
    return text


def add_section(key,title,category,regions,original=None,dropcap=None):
    sid='core-'+key
    parts=[render_region(r) for r in regions]
    text=''
    for p in parts:
        if not p:
            continue
        prev=re.sub(r'[*#]','',text).rstrip()
        nxt=re.sub(r'[*#]','',p).lstrip()
        # Explicit regions follow the visual reading order, so lowercase tails join.
        if text and prev and prev[-1] not in '.!?»:\n' and re.match('[а-яa-z]',nxt):
            text+=' '+p
        else:
            text+= ('\n\n' if text else '')+p
    if dropcap:
        # The decorative glyph was observed on the page, not invented from text.
        text=dropcap+text
    if key=='antioch-papal':
        text=text.replace('до D3\n\nМаркеров','до D3 Маркеров')
    SECTIONS.append({'id':sid,'title':title,'category':category,
                     'originalSection':original or title,
                     'pages':sorted(set(r['page'] for r in regions)),
                     'sourceSelections':regions,'markdown':text})
    return sid


def source(sid,pages):
    return {'document':'core','pages':pages if isinstance(pages,list) else [pages], 'sectionId':sid}


def add_table(page,bbox,headers,rows):
    TABLES.setdefault(page,[]).append({'bbox':bbox,'headers':headers,'rows':rows})


PROFILE_HEADERS=['Название','Движение','ДБ','ББ','Броня','База']
ITEM_HEADERS=['Название','Тип','Дальность','Модификаторы','Ключевые слова']


# Explicit, visually read profile cells. The two alternative rows are retained.
PROFILE_DATA=[
 (68,373,398,[['Лейтенант','6”/пехота','+2D','+2D','0','32 мм']]),
 (69,190,216,[['Окопный клирик','6”/пехота','+1D','+1D','0','32 мм']]),
 (69,508,542,[['Снайпер-священник','6”/пехота','+2D','-1D','0','25 мм']]),
 (70,232,266,[['Йомен','6”/пехота','0','0','0','25 мм'],['Окопный Крот','6”/пехота','0','0','0','25 мм']]),
 (70,526,552,[['Штурмовик','6”/пехота','0','+1D','0','25 мм']]),
 (71,170,196,[['Инженер','6”/пехота','+1D','0','-2','25 мм']]),
 (71,602,629,[['Тяжелая пехота','6”/пехота','+1D','0','-2','32/40 мм']]),
 (72,369,396,[['Медик','6”/пехота','0','0','-1','25 мм']]),
 (86,305,339,[['Повелитель Опухолей','6”/пехота','+1D','+4D','0','40/50 мм']]),
 (87,190,217,[['Чумной Рыцарь','6”/пехота','-0','+2D','0','32 мм']]),
 (88,192,229,[['Страж Трупов','6”/пехота','0','+1D','0','32 мм']]),
 (88,621,648,[['Гончая','8”/пехота','-','+1D','0','30х60 мм']]),
 (89,351,389,[['Прислужник','5”/пехота','-','-1D','0','25 мм'],['Прислужник Мух','6”/Летающий','-','-1D','0','25 мм']]),
 (90,287,314,[['Глашатай','10”/Летающий','0','0','0','40 мм']]),
 (92,200,227,[['Амальгама','6”/пехота','0','0','0','60 мм']]),
 (106,267,294,[['Претор','8”/Летающий','+3D','+3D','0','50 мм']]),
 (108,246,278,[['Колдун','6”/летающий','+1D','+1D','0','50 мм']]),
 (110,182,209,[['Охотник','6”/пехота','+2D','+1D','0','32 мм']]),
 (112,202,229,[['Адский Рыцарь','6”/пехота','0','+2D','-2','40 мм']]),
 (113,253,280,[['Ярмовый Бес','6”/пехота','0','+1D','0','32 мм']]),
 (113,711,744,[['Несчастный','6”/пехота','-1D','-1D','0','25 мм']]),
 (114,357,387,[['Ямная саранча','8”/Летающий','0','+2D','-2','30х60 мм']]),
 (116,166,200,[['Оскверненный Святой','6”/пехота','-','+3D','-3','60 мм']]),
]
for p,y0,y1,rows in PROFILE_DATA:
    add_table(p,[0,y0,595,y1],PROFILE_HEADERS,rows)

ITEM_TABLE_DATA=[
 (75,200,239,['Меч-противотанковый','Двуручное','ББ','+1D к броскам на ранение','**CUMBERSOME**, **CRITICAL**']),
 (77,155,193,['Лохаберский топор','Двуручное','ББ','+1 к броскам на ранение','**HEAVY**, **CRITICAL**, **CUMBERSOME**']),
 (80,179,207,['Шотель','Одноручное','ББ','Игнорирует щит','**CRITICAL**']),
 (84,207,244,['Зараженная винтовка','Двуручное','18”','-','-']),
 (84,319,355,['Извергающий заразу','Двуручное','8”','-','**GAS**']),
 (84,441,477,['Гнилостный дробовик','Двуручный','12”','+1D к атаке','**ASSAULT**']),
 (84,573,609,['Пушка внутренностей','Двуручное','24”','+2D к атаке','**HEAVY**']),
 (84,705,731,['Чумной клинок','Одноручное','ББ','-','-']),
 (85,121,157,['Топор Вельзевула','Двуручное','ББ','+2D на ранения','**HEAVY**']),
 (85,342,369,['Граната','Граната','8”','-','**ASSAULT**']),
 (95,647,679,['Мушкетон','Двуручное','10”','-','**SHRAPNEL**']),
 (99,179,207,['Аркебуза','Двуручное','18”','-','-']),
 (99,296,332,['Змеиная винтовка','Двуручное','30”','-','**HEAVY**']),
 (99,418,455,['Штурмовая змея','Двуручное','36”','-','**GAS**, **HEAVY**, **ASSAULT**']),
 (99,540,578,['Летейский лук','Одноручное','24”','+2D на ранение / Игнорирует броню','**ASSAULT**']),
 (100,150,176,['Орудие пыток','Двуручное','ББ','-','-']),
 (100,262,288,['Адский клинок','Двуручное','ББ','+1D на ранение','**FIRE**']),
 (100,375,411,['Головорез','Одноручное','ББ','+2 на ранения против неактивированных целей','-']),
 (100,486,523,['Меч Малебранче','Двуручное','ББ','3D6 на ранение','**HEAVY**']),
]
for p,y0,y1,row in ITEM_TABLE_DATA:
    add_table(p,[0,y0,595,y1],ITEM_HEADERS,[row])


def build_sections():
    # Narrative and the side oath have their own semantic destinations.
    add_section('antioch-lore','Новое Антиохийское Княжество — история','lore',
                [reg(66,0,249,250,740),reg(66,250,249,480,740),reg(67,0,75,250,145)],dropcap='Н')
    add_section('antioch-oath','Клятва Новой Антиохии','lore',[reg(66,480,240,595,740)])
    add_section('antioch-recruitment','Создание отряда Новой Антиохии','factions',[reg(67,0,150,250,250)])
    add_section('antioch-fireteams','Боевые группы Новой Антиохии','factions',[reg(67,0,355,250,736)])
    add_section('antioch-arsenal','Арсенал Новой Антиохии','arsenal',[reg(67,0,258,250,350)])
    specs=[
      ('antioch-lieutenant','Лейтенант',[reg(68)]),
      ('antioch-cleric','Окопный клирик',[reg(69,0,75,595,417)]),
      ('antioch-sniper','Снайпер-священник',[reg(69,0,423)]),
      ('antioch-yeoman','Йомен и Окопный Крот',[reg(70,0,75,595,437)]),
      ('antioch-shocktrooper','Штурмовики',[reg(70,0,440)]),
      ('antioch-engineer','Боевые инженеры',[reg(71,0,75,595,512)]),
      ('antioch-mechanized','Механизированная тяжелая пехота',[reg(71,0,518),reg(72,0,75,595,175)]),
      ('antioch-medic','Боевой медик Новой Антиохии',[reg(72,0,175)]),
    ]
    for key,title,regions in specs:add_section(key,title,'units',regions)
    add_section('antioch-papal','Силы вмешательства Папских государств','variants',[reg(73,0,75,250,768),reg(73,250,75,595,122)])
    add_section('antioch-eire','Рейнджеры Эйре','variants',[reg(73,250,130),reg(74,0,75,250,641)])
    add_section('antioch-prussia','Штурмовики Свободного Государства Пруссия','variants',[reg(74,0,646,250,768),reg(74,250,75)])
    add_section('prussia-tank-splitter','Меч-противотанковый','equipment',[reg(75)])
    add_section('antioch-alba','Штурмовой Отряд Королевства Альба','variants',[reg(76)])
    add_section('alba-lochaber-axe','Лохаберский топор','equipment',[reg(77)])
    add_section('antioch-abyssinia-lore','Экспедиционные Силы Абиссинии — история','lore',[reg(78,0,75,250),reg(78,250,75)])
    add_section('antioch-abyssinia','Экспедиционные Силы Абиссинии','variants',[reg(79,0,75,250),reg(79,250,75)])
    for key,title,y0,y1 in [('shotel','Шотель',109,266),('holy-water','Святая вода Лалибелы',272,373),('anfarro','Анфарро (Военная корона)',378,480),('tabot','Табот',484,620)]:
        add_section('abyssinia-'+key,title,'equipment',[reg(80,0,y0,595,y1)])
    add_section('grail-lore','Культ Черного Грааля — история','lore',[reg(82,0,285,250),reg(82,250,75)],dropcap='Э')
    add_section('grail-special','Особые правила и создание отряда Черного Грааля','factions',[reg(83,0,75,260)])
    add_section('grail-arsenal','Арсенал Черного Грааля','arsenal',[reg(83,260,75,595,220)])
    for key,title,p,y0,y1 in [
      ('infested-rifle','Зараженная винтовка',84,139,282),
      ('corruption-belcher','Извергающий заразу',84,282,394),
      ('putrid-shotgun','Гнилостный дробовик',84,394,506),
      ('viscera-cannon','Пушка Гнили (Пушка внутренностей)',84,506,658),
      ('plague-blade','Чумной клинок',84,658,768),
      ('beelzebubs-axe','Топор Вельзевула',85,75,186),
      ('black-grail-shield','Щит Черного Грааля',85,186,295),
      ('parasite-grenades','Паразитические гранаты',85,295,417),
      ('compound-eyes-helmet','Шлем Составных Глаз',85,417,476),
      ('grail-devotee','Приверженец Грааля',85,476,750)]:
        add_section('grail-'+key,title,'equipment',[reg(p,0,y0,595,y1)])
    add_section('grail-hierarchy','Орден Мухи — иерархия дворян','factions',[reg(86,0,75,595,222)])
    for key,title,regions in [
      ('lord','Повелитель Опухолей',[reg(86,0,223)]),
      ('plague-knight','Чумной Рыцарь',[reg(87)]),
      ('corpse-guard','Страж Трупов',[reg(88,0,75,595,507)]),
      ('hounds','Гончие Чёрного Грааля',[reg(88,0,508),reg(89,0,75,595,205)]),
      ('thralls','Прислужник Грааля/Мух',[reg(89,0,205)]),
      ('herald','Глашатаи Вельзевула',[reg(90)]),
      ('amalgam','Амальгама',[reg(92)])]:
        add_section('grail-'+key,title,'units',regions)
    add_section('grail-dirge','Песнь скорби Великого Гегемона','variants',[reg(94,0,75,250),reg(94,250,75),reg(95,0,75,595,385)])
    for key,title,y0,y1 in [('broken-crown','Разрушенная корона',418,522),('bitter-ashes','Урна горьких пепелов',522,602),('blunderbuss','Мушкетон',602,700)]:
        add_section('dirge-'+key,title,'equipment',[reg(95,0,y0,595,y1)])
    add_section('court-lore','Двор Семиглавого Змея — история','lore',[reg(96,0,265,250),reg(96,250,75),reg(97)],dropcap='И')
    add_section('court-recruitment','Создание отряда Двора и Семь Смертных Грехов','factions',[reg(98,0,75,250)])
    add_section('court-arsenal','Арсенал Двора','arsenal',[reg(98,250,75,595,200)])
    for key,title,p,y0,y1 in [
      ('arquebus','Аркебуза',99,127,238),('ophidian-rifle','Змееустая Винтовка',99,238,371),
      ('serpent-assault-gun','Змеиная Громпушка (Штурмовая змея)',99,371,493),('bow-of-lethe','Лук Леты',99,493,700),
      ('torture-instrument','Орудие пыток',100,75,215),('hellblade','Адский клинок',100,215,327),
      ('head-taker','Головорез',100,327,440),('malebranche-sword','Меч Малебранче',100,440,551),
      ('crown-hellfire','Корона Адского Пламени',100,551,652),('infernal-iron','Адский Железный Доспех',100,652,768),
      ('restraining-muzzle','Узда Подчинения',101,75,219)]:
        add_section('court-'+key,title,'equipment',[reg(p,0,y0,595,y1)])
    add_section('court-goetic','Гоэтические Силы — общие правила','abilities',[reg(101,0,219,595,552)])
    # Each purchased power has one self-contained article and a typed record below.
    for power in POWERS:
        key,title,p,y0,y1,*_=power
        add_section('court-power-'+key,title,'abilities',[reg(p,0,y0,595,y1)])
    add_section('court-leadership','Знатные Дворяне — выбор лидера','factions',[reg(106,0,75,595,161)])
    for key,title,regions in [
      ('praetor','Претор',[reg(106,0,162)]),('sorcerer','Колдун',[reg(108)]),('hunter','Охотник Левого Пути',[reg(110)]),
      ('hell-knight','Адский Рыцарь',[reg(112)]),('yoke-fiend','Иго-Демон',[reg(113,0,75,595,548)]),
      ('wretched','Несчастные',[reg(113,0,548),reg(114,0,75,595,273)]),
      ('pit-locust','Ямовая саранча',[reg(114,0,274)]),('desecrated-saint','Оскверненный Святой',[reg(116)])]:
        add_section('court-'+key,title,'units',regions)


# [key,title,page,y start,y end,ducats,sin,allowed,limit,goetic marker range]
POWERS=[
 ('burning-inferno','Пылающий Ад (Burning Inferno)',101,556,700,15,None,'sorcerer',None,[1,3]),
 ('slavemaster','Повелитель Рабов (Slavemaster)',102,75,212,10,None,'ELITE',None,[1,1]),
 ('charge-hatred','Яростный Натиск (Charge of Hatred)',102,253,335,10,'wrath','ELITE',3,None),
 ('lesser-mark-cain','Малая Метка Каина (Lesser Mark of Cain)',102,335,408,20,'wrath','ELITE',1,None),
 ('blind-rage','Слепая Ярость (Blind Rage)',102,408,466,10,'wrath','ELITE',3,None),
 ('envious-eyes','Завистливые Глаза (Envious Eyes)',102,507,609,5,'envy','praetor-or-sorcerer',None,None),
 ('coveted-position','Вожделенное Место (Coveted Position)',102,609,680,10,'envy','praetor-or-sorcerer',None,[2,2]),
 ('yours-mine','Всё Твоё — Моё (What is Yours is Mine)',103,75,168,10,'envy','ELITE',None,[1,1]),
 ('forbidden-pleasures','Запретные Наслаждения (Forbidden Pleasures)',103,209,281,10,'lust','praetor-or-sorcerer',None,None),
 ('exquisite-pain','Изысканная Боль (Exquisite Pain)',103,281,353,15,'lust','ELITE',None,[1,2]),
 ('call-flesh','Зов Плоти (Call of Flesh)',103,353,502,15,'lust','praetor-or-sorcerer',None,[2,2]),
 ('proud-defiance','Гордая Непокорность (Proud Defiance)',103,542,604,15,'pride','ELITE',None,None),
 ('too-proud-fall','Слишком Горд, чтобы Пасть (Too Proud to Fall)',103,604,700,10,'pride','praetor-or-sorcerer',None,[2,2]),
 ('light-samael','Свет Самаэля (Light of Samael)',104,75,179,15,'pride','praetor-or-sorcerer',None,[2,2]),
 ('morphean-mind','Морфеев Разум (Morphean Mind)',104,219,315,15,'sloth','ELITE',None,None),
 ('charm-acedia','Чары Ацедии (Charm of Acedia)',104,315,438,10,'sloth','ELITE',None,[1,1]),
 ('daemonium-meridianum','Даймониум Меридианум (Daemonium Meridianum)',104,438,532,20,'sloth','ELITE',1,None),
 ('belly-beast','Чрево Зверя (Belly of the Beast)',104,574,700,5,'gluttony','ELITE',None,None),
 ('uncaring-gluttony','Ненасытное Обжорство (Uncaring Gluttony)',105,75,197,10,'gluttony','ELITE',1,[2,2]),
 ('eater-flesh','Пожиратель Плоти (Eater of the Flesh)',105,197,315,10,'gluttony','praetor-or-sorcerer',1,None),
 ('body-gold','Золотое Тело (Body of Gold)',105,358,444,15,'greed','ELITE',1,None),
 ('black-heart','Чёрное Сердце (Black Heart)',105,444,550,15,'greed','any-with-purchase-access',3,[1,1]),
 ('universal-greed','Всеобщая Алчность (Universal Greed)',105,550,650,15,'greed','ELITE',1,None),
]


def cost(ducats=0,glory=0):
    return {'ducats':ducats,'glory':glory}


def entity(bucket,key,name,sid,pages,**data):
    entry={'id':'core-'+key,'name':name,'source':source('core-'+sid,pages),**data}
    ENTITIES[bucket].append(entry)
    return entry


def add_unit(key,name,faction,ducats,minimum,maximum,profile,keywords,sid,pages,**extra):
    names=['name','movement','ranged','melee','armour','base']
    return entity('units',key,name,sid,pages,factionId='core-'+faction,cost=cost(ducats),
                  min=minimum,max=maximum,stats=dict(zip(names,profile)),keywords=keywords,
                  mercenary=False,**extra)


def build_entities():
    entity('factions','antioch','Новое Антиохийское Княжество','antioch-recruitment',67,
           startingBudget=cost(700),battleBudget=cost(900,8),
           unitSectionIds=['core-antioch-'+x for x in ['lieutenant','cleric','sniper','yeoman','shocktrooper','engineer','mechanized','medic']],
           arsenalSectionId='core-antioch-arsenal',specialRuleSectionIds=['core-antioch-fireteams'],fireteamLimit=2,
           allyPolicy={'sourceDocument':'allies','useIndividualHireConditions':True})
    entity('factions','grail','Культ Черного Грааля','grail-special',83,
           startingBudget=cost(700),battleBudget=cost(900,8),arsenalSectionId='core-grail-arsenal',
           specialRuleSectionIds=['core-grail-special','core-grail-hierarchy'],
           leaderChoices=[{'id':'lord','requiresUnitId':'core-grail-lord','min':1,'max':1,'knightMax':2},
                          {'id':'knight','requiresUnitId':'core-grail-plague-knight','min':1,'max':3}],
           allyPolicy={'sourceDocument':'allies','useIndividualHireConditions':True})
    entity('factions','court','Двор Семиглавого Змея','court-recruitment',98,
           startingBudget=cost(700),battleBudget=cost(900,8),arsenalSectionId='core-court-arsenal',
           specialRuleSectionIds=['core-court-recruitment','core-court-goetic','core-court-leadership'],
           allegianceRequired=True,
           allegiances=[{'id':'wrath','name':'Гнев'},{'id':'envy','name':'Зависть'},
                        {'id':'pride','name':'Гордыня','sourceAlias':'Гордость'},
                        {'id':'gluttony','name':'Чревоугодие'},
                        {'id':'greed','name':'Алчность','sourceAlias':'Жадность'},
                        {'id':'sloth','name':'Лень','sourceAlias':'Праздность'},
                        {'id':'lust','name':'Похоть'}],
           leaderChoices=['core-court-praetor','core-court-sorcerer'],
           allyPolicy={'sourceDocument':'allies','useIndividualHireConditions':True})
    lookup={(p,rows[0][0]):rows for p,_,_,rows in PROFILE_DATA}
    p=lambda page,name:lookup[(page,name)][0]
    all_eq={'arsenalId':'core-antioch','categories':['ranged','melee','armour','equipment']}
    add_unit('antioch-lieutenant','Лейтенант','antioch',70,1,1,p(68,'Лейтенант'),['ELITE','NEW ANTIOCH','TOUGH','LEADER'],'antioch-lieutenant',68,allowedEquipment=all_eq)
    add_unit('antioch-cleric','Окопный клирик','antioch',60,0,2,p(69,'Окопный клирик'),['ELITE','NEW ANTIOCH'],'antioch-cleric',69,allowedEquipment=all_eq,
             abilitySelection={'min':1,'max':1,'options':['God is With Us!','Onwards, Christian Soldiers!']})
    add_unit('antioch-sniper','Снайпер-священник','antioch',50,0,3,p(69,'Снайпер-священник'),['ELITE','NEW ANTIOCH'],'antioch-sniper',69,allowedEquipment=all_eq)
    add_unit('antioch-yeoman','Йомен','antioch',30,0,None,p(70,'Йомен'),['NEW ANTIOCH'],'antioch-yeoman',70,allowedEquipment=all_eq,
             compulsoryPurchase={'name':'Винтовка','cost':cost(5),'quantity':1,
                                  'replacement':{'category':'ranged','payOnlyPositivePriceDifference':True,'sourcePriceBaseline':5}})
    add_unit('antioch-trench-mole','Окопный Крот','antioch',40,0,2,lookup[(70,'Йомен')][1],['NEW ANTIOCH','INFILTRATOR'],'antioch-yeoman',70,allowedEquipment=all_eq,
             derivesFromUnitId='core-antioch-yeoman',compulsoryPurchase={'name':'Винтовка','cost':cost(5),'quantity':1,'replacement':{'category':'ranged','payOnlyPositivePriceDifference':True,'sourcePriceBaseline':5}},
             sharesLimitWith='core-antioch-yeoman',limitRules=[{'condition':{'warbandValueDucatsGreaterThan':1000},'max':3}])
    add_unit('antioch-shocktrooper','Штурмовик','antioch',45,0,5,p(70,'Штурмовик'),['NEW ANTIOCH'],'antioch-shocktrooper',70,allowedEquipment=all_eq,
             equipmentExceptions=[{'kind':'ignoreHeavyEffects','category':'melee','doesNotChangeHeavyCarryLimit':True}])
    add_unit('antioch-engineer','Боевой инженер','antioch',80,0,2,p(71,'Инженер'),['NEW ANTIOCH'],'antioch-engineer',71,
             fixedEquipment=[{'name':'Лопата','category':'equipment','included':True,'removable':False},{'name':'Бронежилет инженера','category':'armour','included':True,'removable':False,'armourAlreadyInProfile':True}],
             allowedEquipment={'arsenalId':'core-antioch','categories':['ranged','melee','equipment']},
             equipmentExceptions=[{'kind':'ignoreHeavyEffects','itemName':'Фугасный заряд'}])
    add_unit('antioch-mechanized','Механизированная тяжелая пехота','antioch',85,0,3,p(71,'Тяжелая пехота'),['NEW ANTIOCH','STRONG'],'antioch-mechanized',[71,72],allowedEquipment=all_eq,
             fixedEquipment=[{'name':'Лёгкая машинная броня','countsAs':'Усиленная броня','category':'armour','included':True,'base':'32 мм','armourAlreadyInProfile':True}],
             profileChoices=[{'id':'reinforced','costDelta':cost(0),'base':'32 мм','armour':'-2'},
                            {'id':'machine','costDelta':cost(10),'base':'40 мм','armourItemName':'Машинная броня','exemptArsenalLimit':True,'source':source('core-antioch-mechanized',71)}])
    add_unit('antioch-medic','Боевой медик','antioch',65,0,1,p(72,'Медик'),['NEW ANTIOCH'],'antioch-medic',72,
             allowedEquipment={'categories':[]},equipmentLocked=True,
             fixedEquipment=[{'name':x,'included':True,'removable':False} for x in ['Мизерикордия','Медицинский набор','Противогаз','Стандартная броня']],
             immunities=['FEAR'],distinctFromAlliedMedic=True)

    grail_eq={'arsenalId':'core-grail','categories':['ranged','melee','armour','equipment']}
    add_unit('grail-lord','Повелитель Опухолей','grail',130,0,1,p(86,'Повелитель Опухолей'),['BLACK GRAIL','ELITE','TOUGH','STRONG','FEAR','LEADER'],'grail-lord',86,allowedEquipment=grail_eq,
             minimumByLeaderChoice={'lord':1},unarmedRule={'freeHandsCountAs':'Окопная Дубинка','neverUnarmed':True})
    add_unit('grail-plague-knight','Чумной Рыцарь','grail',60,0,2,p(87,'Чумной Рыцарь'),['BLACK GRAIL','ELITE','FEAR','STRONG'],'grail-plague-knight',87,allowedEquipment=grail_eq,
             equipmentRequirements=[{'kind':'atLeastOne','category':'armour','excludeShields':True}],
             limitRules=[{'condition':{'leaderChoice':'knight'},'max':3,'min':1}],rankSelection={'min':0,'max':1,'group':'plague-knight-rank'})
    add_unit('grail-corpse-guard','Страж Трупов','grail',55,0,3,p(88,'Страж Трупов'),['BLACK GRAIL','ELITE','FEAR'],'grail-corpse-guard',88,allowedEquipment=grail_eq)
    add_unit('grail-hounds','Гончая Чёрного Грааля','grail',55,0,3,p(88,'Гончая'),['BLACK GRAIL','FEAR'],'grail-hounds',[88,89],equipmentLocked=True,allowedEquipment={'categories':[]},unarmedRule={'noPenalty':True})
    add_unit('grail-thrall','Прислужник Грааля','grail',25,0,None,lookup[(89,'Прислужник')][0],['BLACK GRAIL','FEAR'],'grail-thralls',89,equipmentLocked=True,allowedEquipment={'categories':[]},unarmedRule={'noPenalty':True},choiceGroup='grail-thrall-profile')
    add_unit('grail-fly-thrall','Прислужник Мух','grail',25,0,None,lookup[(89,'Прислужник')][1],['BLACK GRAIL','FEAR'],'grail-thralls',89,equipmentLocked=True,allowedEquipment={'categories':[]},unarmedRule={'noPenalty':True},choiceGroup='grail-thrall-profile')
    add_unit('grail-herald','Глашатай Вельзевула','grail',50,0,4,p(90,'Глашатай'),['BLACK GRAIL','FEAR','SKIRMISHER'],'grail-herald',90,
             allowedEquipment={'arsenalId':'core-grail','categories':['ranged'],'additionalItemNames':['Шлем Составных Глаз','Приверженец Грааля']},
             fixedAttack='Зараженный хоботок',unarmedRule={'noPenalty':True,'bloodMarkersReplacedWith':'infection'})
    add_unit('grail-amalgam','Амальгама','grail',150,0,1,p(92,'Амальгама'),['BLACK GRAIL','FEAR','TOUGH','STRONG'],'grail-amalgam',92,
             allowedEquipment={'arsenalId':'core-grail','categories':['ranged','melee'],'additionalItemNames':['Окопный щит']},
             equipmentExceptions=[{'kind':'functionalHands','count':6},{'kind':'maxQuantityPerWeaponType','max':2},
                                  {'kind':'forbidKeyword','keyword':'GRENADE'},{'kind':'forbidWeaponType','type':'Граната'},
                                  {'kind':'maxItemQuantity','itemName':'Окопный щит','max':1,'hands':1},
                                  {'kind':'strongHands','count':2,'maxHeavyWeapons':2,'handsPerHeavyWeapon':1},
                                  {'kind':'ignoreShieldCompatibility'}, {'kind':'attackWithEachEquippedWeapon','separateActions':True,'offHandPenalty':False}])
    executor_profile=p(87,'Чумной Рыцарь').copy();executor_profile[0]='Исполнитель';executor_profile[2]='+1D'
    add_unit('dirge-executor','Исполнитель','grail',80,1,1,executor_profile,['BLACK GRAIL','ELITE','FEAR','STRONG','TOUGH'],'grail-dirge',94,
             variantId='core-grail-dirge',inheritsUnitId='core-grail-plague-knight',allowedEquipment=grail_eq,
             equipmentRequirements=[{'kind':'atLeastOne','category':'armour','excludeShields':True}],
             countsAgainstKnightLimit='unresolved',limitInterpretationIssue='core-issue-dirge-knight-count')

    court_eq={'arsenalId':'core-court','categories':['ranged','melee','armour','equipment']}
    court_kw=['THE COURT','DEMONIC']
    add_unit('court-praetor','Претор','court',115,0,1,p(106,'Претор'),court_kw+['ELITE','TOUGH','STRONG','FEAR','LEADER'],'court-praetor',106,allowedEquipment=court_eq,
             powerPurchase={'min':0,'max':2,'maxByAllegiance':{'wrath':1}},leaderEligible=True)
    add_unit('court-sorcerer','Колдун','court',75,0,1,p(108,'Колдун'),court_kw+['ELITE','FEAR'],'court-sorcerer',108,
             allowedEquipment={'arsenalId':'core-court','categories':['melee','armour','equipment']},powerPurchase={'min':1,'max':3},leaderEligible=True,
             innateGoetic=['Благословение Луны-Змеи'])
    add_unit('court-hunter','Охотник Левого Пути','court',110,0,1,p(110,'Охотник'),court_kw+['ELITE','INFILTRATOR'],'court-hunter',110,
             allowedEquipment={'arsenalId':'core-court','categories':['melee','armour','equipment'],'forbiddenItemNames':['Адский Железный Доспех']},
             fixedEquipment=[{'name':'Лук Леты','category':'ranged','included':True,'removable':False,'alwaysOccupiesHands':1}],
             innateGoetic=['Ходок Теней','Левый Путь','Плащ Оракула Зверя'])
    add_unit('court-hell-knight','Адский Рыцарь','court',100,0,3,p(112,'Адский Рыцарь'),court_kw+['STRONG','ELITE'],'court-hell-knight',112,
             allowedEquipment={'arsenalId':'core-court','categories':['ranged','melee','equipment']},
             fixedEquipment=[{'name':'Адский Железный Доспех','category':'armour','included':True,'removable':False,'armourAlreadyInProfile':True}],powerPurchase={'min':0,'max':1},innateGoetic=['Кровавая Магия'])
    add_unit('court-yoke-fiend','Иго-Демон','court',30,0,None,p(113,'Ярмовый Бес'),court_kw,'court-yoke-fiend',113,
             allowedEquipment={'arsenalId':'core-court','categories':['melee','armour','equipment'],'ranged':{'maxWeapons':1,'maxItemDucats':30}},aliases=['Ярмовый Бес'])
    add_unit('court-wretched','Несчастный','court',20,0,None,p(113,'Несчастный'),[],'court-wretched',[113,114],
             allowedEquipment={'arsenalId':'core-court','categories':['melee','armour','equipment'],'maxItemDucats':10},
             equipmentRequirements=[{'kind':'atLeastOne','categories':['melee'],'min':1}],
             modelCountRule={'operator':'lessThan','otherKeyword':'DEMONIC','strict':True},noImplicitFactionKeyword=True)
    add_unit('court-pit-locust','Ямовая саранча','court',90,0,3,p(114,'Ямная саранча'),court_kw+['FEAR'],'court-pit-locust',114,
             allowedEquipment={'itemNames':['Корона Адского Пламени']},aliases=['Ямная саранча'],
             fixedEquipment=[{'name':'Укреплённая броня','category':'armour','included':True,'removable':False,'armourAlreadyInProfile':True}],unarmedRule={'noPenalty':True})
    add_unit('court-desecrated-saint','Оскверненный Святой','court',140,0,1,p(116,'Оскверненный Святой'),court_kw+['FEAR','TOUGH','STRONG'],'court-desecrated-saint',116,
             fixedEquipment=[{'name':'Броня Коцита','category':'armour','included':True,'removable':False,'armourAlreadyInProfile':True}],
             allowedEquipment={'arsenalId':'core-court','categories':['melee']},
             equipmentExceptions=[{'kind':'functionalHands','count':3},{'kind':'maxWeapons','max':3},{'kind':'maxTwoHandedWeapons','max':1},
                                  {'kind':'attackWithEachEquippedWeapon','separateActions':True,'offHandPenalty':False}],
             auraByAllegiance={'sloth':{'name':'Аура Лени','rangeInches':8},'envy':{'name':'Аура Зависти','rangeInches':12},
                               'pride':{'name':'Аура Гордыни','rangeInches':8},'greed':{'name':'Аура Алчности','rangeInches':12},
                               'wrath':{'name':'Аура Гнева','rangeInches':8},'lust':{'name':'Аура Похоти','rangeInches':6},
                               'gluttony':{'name':'Аура Голода','rangeInches':8}})
    for power in POWERS:
        key,title,pn,_,_,price,sin,allowed,limit,markers=power
        entity('upgrades','court-power-'+key,title,'court-power-'+key,pn,
               factionId='core-court',cost=cost(price),kind='goeticPower',allegiance=sin,
               eligibility=allowed,limit=limit,goeticMarkerRange=markers,
               acquisition='when-model-is-purchased',countsTowardPowerLimit=True,
               effects=({'addKeywords':['GOLEM'],'removeKeywords':['TOUGH']} if key=='body-gold' else {}))


# Each line is a visually checked original arsenal row, not a price template.
# A trailing "s" denotes Glory; Ducats and Glory are never converted.
ARSENALS={
 'antioch': (67, '''[ranged]
Винтовка|10|Штыковое крепление
Полуавтоматическая винтовка|15|Штыковое крепление
Автоматическая винтовка|40|Лимит: 1, Штыковое крепление
Пистолет|6|
Автоматический пистолет|20|Только для элиты, Лимит:3
Пистолет-пулемёт|30|Лимит: 2, Штыковое крепление, совместим с щитом
Дробовик|10|Штыковое крепление, совместим с щитом
Автоматический дробовик|15|Лимит: 2, Штыковое крепление, совместим с щитом
Тяжелый дробовик|20|Лимит: 2, совместим с щитом
Снайперская винтовка|35|Лимит: 3
Гранатомёт|30|Лимит: 2
Граната|7|
Зажигательная граната|15|Лимит: 2
Пулемёт|50|Лимит: 2
Огнемёт|30|Лимит: 3
Тяжёлый огнемёт|55|Лимит: 1
Фугасный заряд|15|Лимит: 3, CONSUMABLE, один на модель
[melee]
Окопный нож|1|
Штык|2|совместим с щитом
Окопная Дубинка|3|
Меч/топор|4|
Древковое оружие|7|совместим с щитом
Большой молот/кувалда|10|
Большой меч/топор|12|
Мизерикордия|15|Лимит: 1, только для Боевого медика
[armour]
Стандартная броня|15|
Усиленная броня|40|Только для Элиты и Механизированной тяжелой пехоты
Машинная броня|50|Только для Элиты, Лимит: 1, исключая Механизированную тяжелую пехоту
Бронежилет инженера|45|Только для Боевого инженера
Окопный щит|10|
Тяжелый баллистический щит|15|Только для моделей в Машинной броне
[equipment]
Боевой шлем|5|
Противогаз|5|
Лопата|5|
Медицинский набор|5|
Музыкальный инструмент|15|Лимит: 1, не для Элиты
Пилюли мученичества|1s|CONSUMABLE, только для Элиты, Лимит: 2
Боевой флаг|1s|Лимит: 1
Полевой алтарь|2s|
Альпинистский комплект|3|Лимит: 4
Бинокль|10|только для Элиты
'''),
 'grail': (83, '''[ranged]
Винтовка|10|Штыковое крепление
Пистолет|6|
Мушкет|5|Штыковое крепление
Зараженная винтовка|15|Штыковое крепление
Извергающий заразу|30|Лимит: 2
Пулемёт|50|Только для Амальгамы, Лимит:1
Дробовик|10|Штыковое крепление, совместим с щитом
Гнилостный дробовик|20|Лимит: 2, Штыковое крепление, совместимость со щитом
Газовые гранаты|10|
Паразитические гранаты|15|
Пушка внутренностей|50|Лимит: 1, только для Элиты
[melee]
Окопный нож|1|
Штык|2|совместим с щитом
Окопная Дубинка|3|
Меч/топор|4|
Древковое оружие|7|Только для Чумного Рыцаря, совместим с щитом
Большой молот/кувалда|10|
Большой меч/топор|12|
Чумной клинок|7|Лимит: 2, только для Элиты
Топор Вельзевула|30|Лимит: 1, только для Элиты
[armour]
Стандартная броня|15|
Усиленная броня|40|Только для Элиты
Окопный щит|10|
Щит Черного Грааля|20|Только для Элиты
[equipment]
Боевой шлем|5|
Шлем Составных Глаз|10|Только для Элиты и Глашатаев, Лимит:3, Головной убор
Приверженец Грааля|15|Только для Элиты или Глашатая, Лимит:2
Нечестивый талисман|15|CONSUMABLE
Нечестивая реликвия|15|Только для Элиты
Боевой флаг|10|Лимит: 1
Музыкальный инструмент|15|Лимит: 1
Полевой алтарь|2s|
'''),
 'court': (98, '''[ranged]
Бландербус|5|Совместим с щитом
Аркебуза|8|
Змееустая винтовка|25|Лимит: 3, только для Элиты
Пистолет|6|
Дробовик|10|Совместим с щитом, Штыковое крепление
Газовые гранаты|10|
Зажигательная граната|15|Лимит: 2
Штурмовая Змея|50|Лимит: 2
Огнемёт|30|Лимит: 2
Тяжёлый огнемёт|55|Лимит: 1
[melee]
Окопный нож|1|
Окопная Дубинка|3|
Меч/топор|4|
Древковое оружие|7|Совместим с щитом
Большой молот/кувалда|10|
Большой меч/топор|12|
Орудие пыток|8|
Головорез|15|Лимит: 2
Адский клинок|15|Лимит: 3
Меч Малебранче|50|Лимит: 1
[armour]
Стандартная броня|15|
Усиленная броня|40|Только для Элиты
Окопный щит|10|
Адский железный доспех|50|только для Адских Рыцарей
[equipment]
Боевой шлем|5|
Противогаз|5|
Лопата|5|только для Иго-Демонов и Несчастных
Нечестивый амулет|15|CONSUMABLE
Нечестивая реликвия|15|
Зажигательные боеприпасы|15|Лимит: 1, CONSUMABLE
Знамя|1s|Лимит: 1
Музыкальный инструмент|15|Лимит:1
Корона Адского Пламени|15|только для Элиты и Ямной Саранчи
Узда подчинения|10|Только для Иго-Демонов, Лимит: 3
''')}


def build_arsenals():
    categories={'ranged':'Оружие дальнего боя','melee':'Оружие ближнего боя','armour':'Броня','equipment':'Снаряжение'}
    for faction,(page,rows) in ARSENALS.items():
        category=None;markdown=[];table=[];index=0
        for row in rows.strip().splitlines()+['[END]']:
            if row.startswith('['):
                if table:
                    markdown.append(table_md(['Предмет','Стоимость','Ограничения и примечания'],table));table=[]
                category=row[1:-1]
                if category!='END':markdown.append('## '+categories[category])
                continue
            name,price,notes=row.split('|')
            amount=int(price.rstrip('s'));c=cost(glory=amount) if price.endswith('s') else cost(amount)
            limit=re.search(r'Лимит\s*:\s*(\d+)',notes,re.I)
            offer=entity('offers',f'{faction}-offer-{index:02}',name,f'{faction}-arsenal',page,
                         factionId='core-'+faction,itemName=name,category=category,cost=c,
                         limit=int(limit[1]) if limit else None,notes=notes,
                         shieldCompatible=bool(re.search(r'совместим',notes,re.I)),bayonetLug='штыковое' in notes.lower(),
                         consumable='CONSUMABLE' in notes)
            if 'элит' in notes.lower():
                if 'не для' in notes.lower():offer['forbiddenKeywords']=['ELITE']
                elif name not in ['Шлем Составных Глаз','Приверженец Грааля','Усиленная броня','Корона Адского Пламени'] or faction=='grail' and name=='Усиленная броня':offer['requiredKeywords']=['ELITE']
            if faction=='antioch':
                if name=='Мизерикордия':offer['allowedUnitIds']=['core-antioch-medic']
                if name=='Усиленная броня':offer['eligibilityAny']=[{'keyword':'ELITE'},{'unitId':'core-antioch-mechanized'}]
                if name=='Машинная броня':offer['limitExemptUnitIds']=['core-antioch-mechanized']
                if name=='Бронежилет инженера':offer['allowedUnitIds']=['core-antioch-engineer']
                if name=='Тяжелый баллистический щит':offer['requiresItemName']='Машинная броня'
                if name=='Фугасный заряд':offer['perModelLimit']=1
            if faction=='grail':
                if name=='Пулемёт':offer['allowedUnitIds']=['core-grail-amalgam']
                if name=='Древковое оружие':offer['allowedUnitIds']=['core-grail-plague-knight','core-dirge-executor']
                if name in ['Шлем Составных Глаз','Приверженец Грааля']:offer['eligibilityAny']=[{'keyword':'ELITE'},{'unitId':'core-grail-herald'}]
                if name=='Приверженец Грааля':offer['perModelLimit']=2
            if faction=='court':
                if name=='Адский железный доспех':offer['allowedUnitIds']=['core-court-hell-knight']
                if name=='Лопата':offer['allowedUnitIds']=['core-court-yoke-fiend','core-court-wretched']
                if name=='Корона Адского Пламени':offer['eligibilityAny']=[{'keyword':'ELITE'},{'unitId':'core-court-pit-locust'}]
                if name=='Узда подчинения':offer['allowedUnitIds']=['core-court-yoke-fiend']
            table.append([name,str(amount)+(' очк. Славы' if price.endswith('s') else ' дукатов'),notes or '—'])
            index+=1
        section=next(s for s in SECTIONS if s['id']==f'core-{faction}-arsenal')
        section['markdown']+='\n\n'+'\n\n'.join(markdown)
        section['tableEvidence']={'page':page,'reviewMethod':'all cells compared with original rendered page','rows':index}


def build_variants_upgrades():
    def variant(key,name,pages,**data):
        return entity('variants',key,name,key,pages,
                      factionId='core-'+('grail' if key=='grail-dirge' else 'antioch'),
                      inheritance={'kind':'base-faction-with-explicit-amendments','sourceSectionId':'core-'+key},**data)
    variant('antioch-papal','Силы вмешательства Папских государств',73,
            startingBudget=cost(500,11),battleBudget=cost(700,15),
            unitMinimums={'core-antioch-lieutenant':0,'core-antioch-cleric':1},
            bannedUnitIds=['core-antioch-trench-mole'],
            specialChoices=[{'name':'Высшее благословение','max':1,'replacementCost':cost(glory=3),'initialCostExplicitlySpecified':False}],
            abilityOptionsAdded={'core-antioch-cleric':['Arise and be Healed!']})
    variant('antioch-eire','Рейнджеры Эйре',[73,74],fireteamLimit=1,
            unitLimits={'core-antioch-mechanized':1},
            unitChanges={'core-antioch-lieutenant':{'removeAbilities':['On my command!'],'addKeywords':['SKIRMISHER']}},
            equipmentRestrictions=[{'kind':'forbidHeavyWeapons','exceptUnitIds':['core-antioch-mechanized'],'sourceExceptionName':'Снаряды Сапёров','exceptionNeedsResolution':True},
                                   {'kind':'forbidArmourNames','names':['Тяжёлая броня','Машинная броня'],'exceptUnitIds':['core-antioch-mechanized'],'heavyArmourAliasNeedsResolution':True}],
            campaignPatron='Святой Патрик',
            abilityOptionsReplacing={'core-antioch-cleric':{'replaces':'Onwards, Christian Soldiers!','options':['Away, Serpents!','Arise and be Healed!']}})
    variant('antioch-prussia','Штурмовики Свободного Государства Пруссия',74,fireteamLimit=3,
            unitMinimums={'core-antioch-shocktrooper':2},
            unitLimits={'core-antioch-shocktrooper':8,'core-antioch-mechanized':1,'core-antioch-sniper':1},
            bannedUnitIds=['core-antioch-trench-mole'],
            offerLimitsByName={'Пистолет-пулемёт':4,'Гранатомёт':0,'Пулемёт':1},
            unitChanges={'core-antioch-shocktrooper':{'removeAbilities':['Assault Drill']}},
            equipmentRestrictions=[{'kind':'forbidArmourNames','names':['Усиленная броня','Машинная броня'],'exceptUnitIds':['core-antioch-lieutenant','core-antioch-mechanized']}],
            grenadeRangeBonusInches=4,
            unresolvedRuleIds=['core-issue-prussia-automatic-weapons'])
    variant('antioch-alba','Штурмовой Отряд Королевства Альба',[76,77],
            offerLimitsByName={name:1 for name in ['Гранатомёт','Пистолет-пулемёт','Пулемёт','Автоматический дробовик','Снайперская винтовка']},
            unitChanges={'core-antioch-lieutenant':{'addKeywords':['STRONG']},'core-antioch-mechanized':{'statSet':{'ranged':'0','melee':'+1D'}}},
            offerCostsByName={'Большой меч':cost(7)},
            equipmentRestrictions=[{'kind':'forbidArmourNames','names':['Усиленная броня','Машинная броня'],'exceptUnitIds':['core-antioch-lieutenant','core-antioch-mechanized']}],
            moraleDiceBonus=1,ignoreDefendedObstaclePenalty=True,
            machineArmourAttackPenaltyIgnored=True)
    variant('antioch-abyssinia','Экспедиционные Силы Абиссинии',[78,79,80],
            unitLimits={'core-antioch-medic':2,'core-antioch-cleric':2,'core-antioch-sniper':0,'core-antioch-trench-mole':0},
            unitAliases={'core-antioch-cleric':'Святой воин Абиссинии','core-antioch-yeoman':'Ополченец'},
            aliasIssue='core-issue-abyssinia-militia-name',bannedProfileChoices=[{'unitId':'core-antioch-mechanized','choiceId':'machine'}],
            rangedHeavyWeaponLimit=3,sourceLimitExceptionName='Снаряды Сапёров',exceptionNeedsResolution=True,
            abilityOptionsReplacing={'core-antioch-cleric':{'replaces':'Onwards, Christian Soldiers!','options':['Blessed Psalm','God’s Mercy']}},
            shortRangeMarksmanship={'unitIds':['core-antioch-yeoman','core-antioch-lieutenant'],'includesUpgrade':'Авангард','diceBonus':1,'excludesKeywords':['HEAVY'],'excludesTypes':['Граната']})
    variant('grail-dirge','Песнь скорби Великого Гегемона',[94,95],
            addedUnitIds=['core-dirge-executor'],unitMinimums={'core-dirge-executor':1},
            bannedUnitIds=['core-grail-lord','core-grail-amalgam'],
            unitLimits={'core-grail-plague-knight':3,'core-grail-hounds':2,'core-grail-herald':2},
            unitCostOverrides={'core-grail-thrall':cost(30),'core-grail-fly-thrall':cost(30)},
            unitChanges={'core-grail-thrall':{'statSet':{'ranged':'0'},'allowCategories':['ranged'],'allowItemNames':['Боевой флаг','Музыкальный инструмент']},
                         'core-grail-fly-thrall':{'statSet':{'ranged':'0'}}},
            bannedItemNames=['Щит Черного Грааля','Топор Вельзевула'],
            offerLimitsByName={'Чумной клинок':3,'Гнилостный дробовик':3,'Пушка внутренностей':3},
            offerEligibilityChanges={'Пушка внутренностей':{'removeRequiredKeyword':'ELITE'}},
            leadershipRuleReplaces='core-grail-hierarchy',
            unresolvedRuleIds=['core-issue-dirge-knight-count'])

    def upgrade(key,name,sid,page,ducats,units,variantId=None,**data):
        return entity('upgrades',key,name,sid,page,cost=cost(ducats),unitIds=['core-'+u for u in units],
                      variantId='core-'+variantId if variantId else None,**data)
    upgrade('papal-swiss-guard','Швейцарская гвардия','antioch-papal',73,5,
            ['antioch-lieutenant','antioch-yeoman','antioch-shocktrooper','antioch-engineer','antioch-mechanized','antioch-medic'],'antioch-papal',
            eligibility={'any':[{'keywordAbsent':'ELITE'},{'unitId':'core-antioch-lieutenant'}]},
            limitRules=[{'scope':'non-ELITE','max':4},{'scope':'lieutenant','max':1}],immunities=['FEAR'])
    upgrade('eire-fianna','Фианна','antioch-eire',73,10,['antioch-shocktrooper'],'antioch-eire',keywords=['SKIRMISHER','INFILTRATOR'])
    upgrade('eire-berserker','Берсеркер','antioch-eire',74,15,['antioch-lieutenant','antioch-shocktrooper'],'antioch-eire',limit=1,
            eligibility={'any':[{'unitId':'core-antioch-lieutenant'},{'requiresUpgradeId':'core-eire-fianna'}]},
            immunities=['FEAR','blood-markers-from-any-source'],forbidCategories=['armour'],allowedArmourExceptions=['Окопный щит'])
    upgrade('prussia-forward','Передовые позиции','antioch-prussia',74,10,['antioch-shocktrooper'],'antioch-prussia',limit=2,keywords=['INFILTRATOR'])
    upgrade('prussia-rapid','Молниеносный штурм','antioch-prussia',74,5,['antioch-shocktrooper','antioch-lieutenant'],'antioch-prussia',dashRiskyActionDiceBonus=1)
    upgrade('abyssinia-chewa','Чева','antioch-abyssinia',79,5,
            ['antioch-lieutenant','antioch-cleric','antioch-shocktrooper'],'antioch-abyssinia',
            eligibility={'any':[{'keyword':'ELITE'},{'unitId':'core-antioch-shocktrooper'}]},
            acquisition='after-recruitment',grantsTag='CHEWA',conditionalMeleeDice={'oneOtherModel':1,'twoOrMoreOtherModels':2,'wordingIssue':'core-issue-chewa-other-model'})
    upgrade('abyssinia-vanguard','Авангард','antioch-abyssinia',79,5,['antioch-yeoman'],'antioch-abyssinia',limit=4,
            deploymentRule={'after':'INFILTRATOR','anyTableEdge':True,'minEnemyDistanceInches':8,'forbiddenIfScenarioForbidsInfiltrator':True,'normalDeploymentAlsoAllowed':True})
    upgrade('grail-hound-infection','Заражающие безоружные атаки','grail-hounds',88,5,['grail-hounds'],bloodMarkersReplacedWith='infection')
    upgrade('grail-herald-buzz','Безумный гул','grail-herald',90,10,['grail-herald'],limit=1)
    upgrade('grail-knight-companion-ranged','Рыцарь-Спутник Мухи — Дальний бой','grail-plague-knight',87,5,['grail-plague-knight','dirge-executor'],group='plague-knight-rank',statChanges={'rangedDice':1})
    upgrade('grail-knight-companion-melee','Рыцарь-Спутник Мухи — Ближний бой','grail-plague-knight',87,5,['grail-plague-knight','dirge-executor'],group='plague-knight-rank',statChanges={'meleeDice':1})
    upgrade('grail-knight-rotten-cross','Рыцарь Гнилого Креста','grail-plague-knight',87,5,['grail-plague-knight','dirge-executor'],group='plague-knight-rank',
            foreignArsenalPurchase={'arsenalNames':['Новая Антиохия','Легион Еретиков'],'categories':['ranged','melee'],'quantityText':'любое оружие','atAcquisition':True,'canReplaceIfLost':True,'transferable':False})
    upgrade('grail-knight-almoner','Чумной Раздатчик','grail-plague-knight',87,10,['grail-plague-knight','dirge-executor'],group='plague-knight-rank',bloodbathMarkerDiscount=1)


def build_special_items():
    # key,title,English,category,source section,page,table row index or None
    special=[
      ('prussia-tank-splitter','Меч-противотанковый','Tank-splitter sword','melee',75,0),
      ('alba-lochaber-axe','Лохаберский топор','Lochaber axe','melee',77,1),
      ('abyssinia-shotel','Шотель','Shotel','melee',80,2),
      ('abyssinia-holy-water','Святая вода Лалибелы','Holy Water of Lalibela','equipment',80,None),
      ('abyssinia-anfarro','Анфарро (Военная корона)','Anfarro','equipment',80,None),
      ('abyssinia-tabot','Табот','Tabot','equipment',80,None),
      ('grail-infested-rifle','Зараженная винтовка','Infested Rifle','ranged',84,3),
      ('grail-corruption-belcher','Извергающий заразу','Corruption Belcher','ranged',84,4),
      ('grail-putrid-shotgun','Гнилостный дробовик','Putrid Shotgun','ranged',84,5),
      ('grail-viscera-cannon','Пушка Гнили','Viscera Cannon','ranged',84,6),
      ('grail-plague-blade','Чумной клинок','Plague Blade','melee',84,7),
      ('grail-beelzebubs-axe','Топор Вельзевула','Beelzebub’s Axe','melee',85,8),
      ('grail-black-grail-shield','Щит Черного Грааля','Black Grail Shield','armour',85,None),
      ('grail-parasite-grenades','Паразитические гранаты','Parasite Grenades','ranged',85,9),
      ('grail-compound-eyes-helmet','Шлем Составных Глаз','Compound Eyes Helmet','equipment',85,None),
      ('grail-grail-devotee','Приверженец Грааля','Grail Devotee','equipment',85,None),
      ('dirge-broken-crown','Разрушенная корона','Broken Crown','equipment',95,None),
      ('dirge-bitter-ashes','Урна горьких пепелов','Urn of Bitter Ashes','equipment',95,None),
      ('dirge-blunderbuss','Мушкетон','Blunderbuss','ranged',95,10),
      ('court-arquebus','Аркебуза','Arquebus','ranged',99,11),
      ('court-ophidian-rifle','Змееустая Винтовка','Ophidian Rifle','ranged',99,12),
      ('court-serpent-assault-gun','Змеиная Громпушка','Serpent Assault Gun','ranged',99,13),
      ('court-bow-of-lethe','Лук Леты','Bow of Lethe','ranged',99,14),
      ('court-torture-instrument','Орудие пыток','Torture Instrument','melee',100,15),
      ('court-hellblade','Адский клинок','Hellblade','melee',100,16),
      ('court-head-taker','Головорез','Head Taker','melee',100,17),
      ('court-malebranche-sword','Меч Малебранче','Malebranche Sword','melee',100,18),
      ('court-crown-hellfire','Корона Адского Пламени','Crown of Hellfire','equipment',100,None),
      ('court-infernal-iron','Адский Железный Доспех','Infernal Iron Armour','armour',100,None),
      ('court-restraining-muzzle','Узда Подчинения','Restraining Muzzle','equipment',101,None),
    ]
    for key,name,en,cat,pn,ti in special:
        data={}
        if ti is not None:
            row=ITEM_TABLE_DATA[ti][3]
            data={'tableName':row[0],'type':row[1],'hands':2 if row[1].startswith('Двуруч') else 1 if row[1]=='Одноручное' else None,
                  'range':row[2],'modifiers':row[3],'keywords':re.findall(r'\*\*([^*]+)\*\*',row[4])}
        obj=entity('items',key,name,key,pn,englishName=en,category=cat,**data)
        if key=='grail-viscera-cannon':obj['aliases']=['Пушка внутренностей']
        if key=='court-ophidian-rifle':obj['aliases']=['Змеиная винтовка']
        if key=='court-serpent-assault-gun':obj['aliases']=['Штурмовая Змея','Штурмовая змея']
        if key=='court-bow-of-lethe':obj['aliases']=['Летейский лук']
        if key=='grail-black-grail-shield':obj.update(shield=True,countsAsItemName='Окопный щит')
        if key=='grail-compound-eyes-helmet':obj.update(headgear=True,countsAsItemName='Боевой шлем',statChanges={'rangedDice':1})
        if key=='grail-grail-devotee':obj.update(perModelLimit=2,injuryFlatBonusPerCopy=1,countsAsModel=False)
        if key=='abyssinia-anfarro':obj.update(headgear=True,forbiddenWithItemNames=['Боевой шлем'],statChanges={'meleeDice':1},immunities=['FEAR'])
        if key=='abyssinia-holy-water':obj['keywords']=['CONSUMABLE']
        if key=='dirge-broken-crown':obj['headgear']=False
        if key=='court-restraining-muzzle':obj.update(statChanges={'rangedDice':1},removesAbilities=['Hateful'])
        if key=='court-infernal-iron':obj.update(injuryFlatPenalty=2,penaltyAppliesAgainstArmourIgnoringAttacks=True)
    entity('items','antioch-engineer-armour','Бронежилет инженера','antioch-engineer',71,
           englishName='Engineer Body Armour',category='armour',armourModifier=-2,
           shrapnelInjuryDicePenalty=1,preventsAdditionalShrapnelBloodMarker=True,
           shrapnelEffectsApplyAgainstArmourIgnoringAttacks=True)
    entity('items','court-cocytus-armour','Броня Коцита','court-desecrated-saint',116,
           category='armour',armourModifier=-3,acquisition='fixed-in-profile-only',removable=False)
    for key,price,glory,limit,variantid,eligibility in [
      ('prussia-tank-splitter',15,0,3,'antioch-prussia',{}),('alba-lochaber-axe',15,0,None,'antioch-alba',{}),
      ('abyssinia-shotel',5,0,None,'antioch-abyssinia',{'any':[{'keyword':'ELITE'},{'tag':'CHEWA'}]}),
      ('abyssinia-holy-water',3,0,4,'antioch-abyssinia',{}),
      ('abyssinia-anfarro',10,0,6,'antioch-abyssinia',{'any':[{'keyword':'ELITE'},{'tag':'CHEWA'}]}),
      ('abyssinia-tabot',0,4,1,'antioch-abyssinia',{'unitId':'core-antioch-cleric'}),
      ('dirge-broken-crown',25,0,1,'grail-dirge',{'keyword':'ELITE'}),('dirge-bitter-ashes',40,0,1,'grail-dirge',{'keyword':'ELITE'}),
      ('dirge-blunderbuss',5,0,None,'grail-dirge',{})]:
        item=next(i for i in ENTITIES['items'] if i['id']=='core-'+key)
        entity('offers',key+'-offer',item['name'],key,item['source']['pages'],factionId='core-'+('grail' if variantid=='grail-dirge' else 'antioch'),
               itemId=item['id'],itemName=item['name'],category=item['category'],cost=cost(price,glory),limit=limit,variantId='core-'+variantid,
               eligibility=eligibility,shieldCompatible=key=='dirge-blunderbuss')


def build_abilities():
    names={
      'antioch-lieutenant':['Стойкий (Tough)','По моей команде! (On my command!)'],
      'antioch-cleric':['Господь с нами! (God is With Us!)','Вперёд, воины Христовы! (Onwards, Christian Soldiers!)'],
      'antioch-sniper':['Прицеливание (Aim)','Абсолютная вера (Absolute Faith)'],
      'antioch-shocktrooper':['Штурмовой рывок (Shock Charge)','Штурмовая тактика (Assault Drill)'],
      'antioch-engineer':['Бронежилет инженера (Engineer Body Armour)','Полевая демонтажная команда (Battlefield Demolition)','Укрепление (Fortify)','Обезвреживание мин (De-mine)'],
      'antioch-mechanized':['Сильный (Strong)'],
      'antioch-medic':['Добить поверженных (Finish the Fallen)','Эксперт-медик (Expert Medic)','Монастырская подготовка (Convent Conditioning)'],
      'grail-lord':['Прикосновение Вельзевула (Beelzebub’s Touch)','Неживая стойкость (Undead Fortitude)','Прочный (Tough)','Страх (Fear)','Сильный (Strong)'],
      'grail-plague-knight':['Немёртвая Стойкость (Undead Fortitude)','Ужас (Fear)','Сильный (Strong)'],
      'grail-corpse-guard':['Паразитический Клещ (Parasitic Tick)','Телохранитель (Bodyguard)','Немёртвая Стойкость (Undead Fortitude)','Страх (Fear)'],
      'grail-hounds':['Немёртвая Стойкость (Undead Fortitude)','Ужасающая скорость (Frightening Speed)','Страх (Fear)'],
      'grail-thralls':['Подавляющее множество (Overwhelming Horde)','Немёртвая Стойкость (Undead Fortitude)','Страх (Fear)'],
      'grail-herald':['Зараженный хоботок (Infected Proboscis)','Безумный гул (Maddening Buzz)','Токсичный (Toxic)','Скользкий (Skirmisher)','Страх (Fear)'],
      'grail-amalgam':['Опухший (Corpulent)','Прочный (Tough)','Токсичный (Toxic)','Затаптывание (Trample)','Неостановимый (Unstoppable)','Страх (Fear)','Сильный (Strong)'],
      'court-praetor':['Гоэтические Силы (Goetic Powers)','Прочный (Tough)','Сильный (Strong)','Демонический Ужас (Demonic Horror)'],
      'court-sorcerer':['Гоэтическая Магия (Goetic Magic)','Демонический Ужас (Demonic Horror)','Благословение Луны-Змеи (Blessing of the Serpent Moon)'],
      'court-hunter':['Ходок Теней (Shadow Walker)','Левый Путь (Left-Hand Path)','Плащ Оракула Зверя (Oracle Beast Cloak)'],
      'court-hell-knight':['Сильный (Strong)','Кровавая Магия (Blood Magic)','Гоэтические Силы (Goetic Powers)'],
      'court-yoke-fiend':['Ненависть (Hateful)','Палач (Torturer)'],
      'court-wretched':['Закон Ада (Law of Hell)'],
      'court-pit-locust':['Роевая Атака (Swarming Attack)','Демонический Ужас (Demonic Horror)'],
      'court-desecrated-saint':['Прочный (Tough)','Демонический Ужас (Demonic Horror)','Сильный (Strong)','Демоническая Аура (Demonic Aura)',
                                'Аура Лени (Sloth)','Аура Зависти (Envy)','Аура Гордыни (Pride)','Аура Алчности (Greed)',
                                'Аура Гнева (Wrath)','Аура Похоти (Lust)','Аура Голода (Gluttony)'],
      'antioch-fireteams':['FIRETEAM','Концентрированная атака (Concentrated Attack)'],
      'antioch-abyssinia':['Благословенный псалом (Blessed Psalm)','Милость Божья (God’s Mercy)'],
    }
    for section,names in names.items():
        article=next(s for s in SECTIONS if s['id']=='core-'+section)
        unitids=[u['id'] for u in ENTITIES['units'] if u['source']['sectionId']==article['id']]
        for i,name in enumerate(names):
            record=entity('abilities',section+f'-ability-{i+1}',name,section,article['pages'],
                          unitIds=unitids,textReference={'sectionId':article['id'],'printedAbilityName':name})
            for u in ENTITIES['units']:
                if u['id'] in unitids:u.setdefault('abilityIds',[]).append(record['id'])


ISSUE_DATA=[
 ('prussia-automatic-weapons',[74],'antioch-prussia','«Автоматические дробовики и автоматические пистолеты не ограничены для Элиты». Формулировка не различает снятие ограничения по ключевому слову ELITE и изменение количественного лимита. Не превращать в отсутствие лимита без отдельного решения.'),
 ('abyssinia-militia-name',[70,79],'antioch-abyssinia','На79 использованы «Ополченцы», а профиль основной фракции70 называется «Йомен». Нового профиля Ополченца источник не даёт. Сохраняется явное сопоставление для интерфейса, а исходное название не подменяется.'),
 ('sapper-charges-name',[67,74,79],'antioch-abyssinia','Исключение «Снаряды Сапёров» в74/79 не совпадает с названием «Фугасный заряд» в арсенале67. Предполагаемое соответствие не считать подтверждённым и не разрешать запрещённое вооружение молча.'),
 ('eire-heavy-armour-name',[67,74],'antioch-eire','Рейнджерам запрещена «Тяжёлая ... броня» на74; арсенал67 использует «Усиленная броня». Сохраняются буквальная формулировка и необходимость редакторского решения об этом названии.'),
 ('chewa-other-model',[79],'antioch-abyssinia','Условие бонуса Чева сформулировано «с другой моделью, кроме Чева». Буквальное описание сохранено; неоднозначно, исключает ли это другую модель Чева или только атакующего Чева.'),
 ('dirge-knight-count',[94],'grail-dirge','Исполнитель использует характеристики Чумного Рыцаря; отдельно разрешены «до трёх Чумных Рыцарей». Не сказано прямо, входит ли обязательный Исполнитель в этот предел. Никакой из вариантов подсчёта не помечен подтверждённым.'),
 ('court-sin-aliases',[98,102,103,104,105],'court-recruitment','В списке98 употреблены Гордость, Жадность, Праздность, тогда как разделы сил называют Гордыня, Алчность, Лень. Сохранены исходные названия и явные aliases без дополнительных новых грехов.'),
 ('court-blunderbuss',[95,98],'court-arsenal','В арсенале Двора указан «Бландербус»; полное описание «Мушкетон (Blunderbuss)» на95 вводится как эксклюзивное для Песни скорби. Вероятное соответствие названий не выдаётся за прямую ссылку исходника.'),
 ('hunter-repeat-cost',[110],'court-hunter','Левый Путь обозначен GOETIC (2), но при повторном применении в том же движении текст говорит «тратя Маркер крови за каждое использование» в единственном числе. Не назначать молча стоимость1 или2 повторного применения.'),
 ('lieutenant-source-typo',[68],'antioch-lieutenant','Оригинальное изображение68 действительно содержит «ДЕЙСВТИЕ». Проверено увеличением5x, исходная опечатка сохранена; это не ошибка нового извлечения.'),
 ('grail-lord-source-typo',[86],'grail-lord','В источнике свободные руки Повелителя Опухолей считаются «траншейной дубиркой». Текст сохранён; сопоставление с Окопной Дубинкой фиксируется явно в structured unarmedRule, без изменения оригинала.'),
 ('grail-hierarchy-truncated',[86],'grail-hierarchy','В оригинале второй пункт Иерархии Дворян обрывается на «может включать до трёх» без существительного и знака конца предложения. По заголовку и контексту подразумеваются Рыцари Чумы; исходный текст не дописан.'),
]


def finish_pages_and_issues():
    issues=[{'id':'core-issue-'+key,'source':source('core-'+section,pages),'description':description,
             'status':'source-ambiguity' if key not in ['lieutenant-source-typo','grail-lord-source-typo','court-sin-aliases'] else 'documented-source-form'}
            for key,pages,section,description in ISSUE_DATA]
    illustration={81,91,93,107,109,111,115,117}
    lore={66,78,82,96,97}
    pages=[]
    for page in range(66,118):
        sections=[s for s in SECTIONS if page in s['pages']]
        regions=[{'sectionId':s['id'],'bbox':r['bbox'],'orderWithinSection':i+1}
                 for s in sections for i,r in enumerate(s['sourceSelections']) if r['page']==page]
        notes={66:'Две основные колонки читаются слева направо; красная клятва самостоятельна. Буквица Н восстановлена. Конец второй колонки продолжается на67.',
               67:'Слева продолжение лора, создание отряда и две способности Боевых групп. Справа четырёхкатегорийный арсенал с отдельными колонками названия и цены.',
               70:'Два профиля Йомена/Крота в одной таблице. 30 дукатов и обязательная винтовка5 сохранены раздельно. Ниже самостоятельный Штурмовик.',
               71:'Два самостоятельных профиля; способности тяжёлой пехоты продолжаются на72.',
               72:'Верх страницы завершает тяжёлую пехоту. Заголовок медика начинается ниже, в том же текстовом блоке PDF, но в другой смысловой секции.',
               73:'Левую колонку Папских государств завершает продолжение молитвы вверху правой; только затем начинается Эйре.',
               74:'Левая колонка завершает Эйре и начинает лор Пруссии; правая завершает лор и даёт отдельный список правил Пруссии.',
               79:'Слева полный список специальных правил Абиссинии, справа две отдельные способности Святых воинов.',
               82:'Буквица Э возвращена в начало лора; заключительный абзац левой колонки продолжается вверху правой.',
               83:'Слева Маркеры Заражения, мораль и создание отряда. Справа арсенал; цена знамени10дукатов отличается от другой фракции и сохранена.',
               86:'Сначала отдельные два варианта иерархии лидеров, затем полный профиль Повелителя Опухолей.',
               88:'Страж Трупов и Гончая — самостоятельные профили. Описание Немёртвой Стойкости Гончей продолжается на89.',
               89:'Вверху завершение Гончей; ниже две альтернативы Прислужников с различным движением, общими правилами и той же ценой.',
               94:'Лор продолжается из левой колонки в правую, затем самостоятельные правила Песни скорби; Воля Гегемона продолжена на95.',
               95:'Вверху Воля Гегемона с четырьмя действиями. Ниже на всю ширину три отдельных специальных предмета.',
               96:'Буквица И возвращена; две колонки лора. Последнее предложение правой колонки продолжается на97.',
               97:'Одноколоночное завершение лора и отдельный подраздел Двор и Великая Война; изображение справа не содержит правил.',
               98:'Левая колонка: набор, обязательный выбор греха, самостоятельное правило DEMONIC. Правая: полный арсенал с ценами и исключениями.',
               101:'Сначала полное описание Узды, затем общие гоэтические правила и отдельная приобретаемая сила Пылающий Ад.',
               106:'Перед Претором самостоятельное требование о лидере Претор ИЛИ Колдун. Таблица50мм, оба боевых показателя+3D.',
               108:'Колдун обязан приобрести хотя бы одну из максимум трёх сил; встроенное Благословение не записано как отдельная покупка.',
               110:'Лук Леты неснимаемый, всегда занимает руку; три встроенных заклинания и неоднозначная стоимость повторения Левого Пути сохранены.',
               113:'Профили Иго-Демона и Несчастного отдельны. Строгое соотношение Несчастных к DEMONIC находится перед лором; экипировка продолжается114.',
               114:'Верх завершает Несчастных, включая обязательное оружие и предел10дукатов за предмет. Ниже отдельная Ямовая саранча с исключением для Короны.',
               116:'Три руки и максимум одно двуручное оружие Святого; семь аур по грехам прочитаны отдельно, включая исключения BLACK GRAIL и ARTIFICIAL.'}.get(page,
                   'Полная страница рассмотрена как оригинальное изображение; таблицы, стоимость, ограничения и выделение сопоставлены с новым текстом.')
        if page in illustration:notes='Полностраничная иллюстрация/вторая половина разворота; самостоятельного текста правил нет. Учтена явно, игровая статья не создаётся.'
        pages.append({'pdfPage':page,'printedPage':page,'contentType':'illustration' if page in illustration else 'lore' if page in lore else 'rules-and-profiles',
                      'readingOrder':regions,'sectionIds':[s['id'] for s in sections],
                      'extractionStatus':'not-applicable' if page in illustration else 'authored',
                      'visualInspection':{'agent':'factions_last','status':'inspected','notes':notes,
                                          'method':'view_image of individual original PDF page rendered with PyMuPDF at 1.8 scale; disputed68 word additionally inspected at5x'},
                      'independentReview':{'status':'pending'},
                      'issues':[issue['id'] for issue in issues if page in issue['source']['pages']],
                      **({'explicitExclusion':'illustration-without-independent-rules'} if page in illustration else {})})
    for issue in issues:
        if issue['status']=='source-ambiguity':
            ENTITIES['constraints'].append({'id':issue['id'],'severity':'manual','message':issue['description'],'source':issue['source']})
    return pages,issues


if __name__=='__main__':
    build_sections()
    build_entities()
    build_arsenals()
    build_variants_upgrades()
    build_special_items()
    build_abilities()
    pages,issues=finish_pages_and_issues()
    OUT.parent.mkdir(parents=True,exist_ok=True)
    result={'schemaVersion':2,'author':'factions_last','document':'core',
            'sourceSha256':hashlib.sha256(PDF.read_bytes()).hexdigest(),
            'pageRange':list(range(66,118)),'sections':SECTIONS,
            'entities':ENTITIES,'pages':pages,'issues':issues}
    OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(f'Authored {len(SECTIONS)} sections; '+str({k:len(v) for k,v in ENTITIES.items()}))
