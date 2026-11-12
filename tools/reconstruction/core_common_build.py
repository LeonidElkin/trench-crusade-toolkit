#!/usr/bin/env python3
"""Fresh PDF transcription using an explicit editorial map after visual inspection.
Does not read the first imported corpus or its catalog. This is an edition-specific
editorial map; its output still requires independent image review.
"""
from pathlib import Path
import json,re,hashlib
import fitz
ROOT=Path(__file__).resolve().parents[2]
PDF=ROOT/'public/reference/trench-crusade-1.6.3-ru.pdf'
EXPECTED_PDF_SHA256='c1ddd9579d5e7cfb5623f8b0c8528a40a96e004776831f8ccbe9e65b617879c9'
if hashlib.sha256(PDF.read_bytes()).hexdigest()!=EXPECTED_PDF_SHA256:
 raise SystemExit('Source PDF changed: this editorial map and its visual inspection records require a new visual author pass.')
DOC=fitz.open(PDF)
OUT=ROOT/'reconstruction/1.6.3/authored/core-common.json'
SECTIONS=[]
PAGES={}
BLOCKS={}
HEADINGS={
 'Что нужно для игры','Кровавая баня','Местность','Типы движения','Дальние атаки','Ближний бой','Падение',
 'Ограничения','Имя модели (Model Name)','Движение (Movement)','Дальнобойные атаки (Ranged)',
 'Ближний бой (Melee)','Броня (Armour)','База (Base)','Снаряжение (Equipment)',
 'Способности (Abilities)','Ключевые слова (Keywords)',
 'Размер стола','Установка террейна','Маркеры целей','Перед битвой и способности перед битвой',
 'Очки победы','Длительность игры','Силы','Поле боя','Инфильтраторы','Размещение',
 'Длительность битвы','Условия победы','Славные подвиги','Особые цели','Окопы','Мины',
 'Мораль','Обзор','Вагоны поезда','Ящики с припасами','Непредвиденные события',
 'Дракон','Оружие Дракона','Способности Дракона','Крестьяне','Подготовка','Террейн',
 'Длительность Игры','Определение типа сценария','Таблица Сценариев (бросьте D6)',
 'Сценарий 1: На истощение','Сценарий 2: Захват и удержание','Сценарий 3: Саботаж',
 'Сценарий 4: Только вперёд','Сценарий 5: Прорыв','Сценарий 6: Извлечь',
 'Бросок на тип развертывания','Таблица типов развертывания','1. Случайная встреча',
 '2. Стандартное развёртывание','3. Атака с фланга','4. Битва на дистанции','5. Туннели',
 '6. Туман войны','Таблица тумана войны','Результат броска - Игрок 1','Результат броска - Игрок 2'
}

def clean(s):
 s=s.replace('\u00ad','').replace('\xa0',' ')
 s=re.sub(r'[ \t]+',' ',s).strip()
 s=re.sub(r' +([,.;:!?])',r'\1',s)
 return s

def spans_text(spans,style=True):
 out=[]
 for s in spans:
  t=s['text']
  if not t.strip():out.append(t);continue
  if 'Arial' in s['font'] and t.strip() in ['\uf0a7','\uf0b7','\uf0a8','▫','▪','','']:continue
  if style and 'Bold' in s['font']:t='**'+t.strip()+'**'+(' ' if t.endswith(' ') else '')
  elif style and 'Italic' in s['font']:t='*'+t.strip()+'*'+(' ' if t.endswith(' ') else '')
  out.append(t)
 text=''.join(out)
 text=text.replace('****','').replace('** **',' ')
 return clean(text)

def raw(n):
 if n not in BLOCKS:BLOCKS[n]=DOC[n-1].get_text('dict')['blocks']
 return BLOCKS[n]

def plain(b):return clean(' '.join(spans_text(l['spans'],False)for l in b['lines']))

def render_block(n,idx,skip_heading=False):
 b=raw(n)[idx]
 lines=[]
 for l in b['lines']:
  ss=[s for s in l['spans'] if s['text'].strip()]
  if not ss:continue
  t=spans_text(l['spans'])
  if not t:continue
  # Bullet glyphs are distinct PDF spans, not headings or textual rules.
  t=re.sub(r'^[\uf000-\uf8ff□■▣▪▫◆◇]+\s*','',t)
  lines.append(t)
 text=clean(' '.join(lines))
 # Only the visually identified headings in this edition map become headings.
 for count in range(min(3,len(lines)),0,-1):
  lead=clean(' '.join(lines[:count])).replace('**','').replace('*','')
  if lead in HEADINGS:
   text='## '+lead+('\n\n'+clean(' '.join(lines[count:])) if len(lines)>count else '')
   break
 # A numbered instruction sequence inside one PDF block remains a sequence.
 if not text.startswith('## ') and sum(bool(re.match(r'^\d+\.',l))for l in lines)>1:
  text=''
  for line in lines:
   if re.match(r'^\d+\.',line):text+='\n'+line
   else:text+=' '+line
  text=text.strip()
 if text in ['T','П','К','В']:return ''
 if n==4 and idx==9:text='T'+text
 if n==2 and text.startswith('риветствуем'):text='П'+text
 if n==12 and idx==8:text='К'+text
 if n==14 and idx==7:text='В '+text
 text=text.replace('Кровитакже','Крови также').replace('Кровидля','Крови для')
 text=re.sub(r'(?<!\*)\*\*([^*]+)\*\*\s*\*\*([^*]+)\*\*',r'**\1 \2**',text)
 return text

def ref(n,idx):return {'document':'core','pages':[n],'blockId':f'core:p{n:03d}:b{idx:03d}','bbox':[round(v,3)for v in raw(n)[idx]['bbox']]}

def take(n,ids):return [(n,i)for i in ids]

def section(id,title,category,parts,pre='',post='',join=None):
 texts=[];refs=[];pages=[]
 for n,i in parts:
  t=render_block(n,i)
  if t:texts.append(t);refs.append(ref(n,i));pages.append(n)
 md='\n\n'.join(texts)
 for a,b in (join or []):md=md.replace(a+'\n\n'+b,a+' '+b)
 md=(pre+'\n\n'+md+'\n\n'+post).strip()
 data={'id':id,'title':title,'category':category,'originalSection':title,'pages':sorted(set(pages)),'markdown':'# '+title+'\n\n'+md+'\n','sourceBlocks':refs}
 SECTIONS.append(data)
 return data

# Explicit semantic article boundaries established from the images, not font sizes.
section('core-introduction','Предисловие','Введение',take(2,[6,7]) if False else [(2,i)for i,b in enumerate(raw(2))if b['type']==0 and 100<b['bbox'][1]<700 and len(plain(b))>8])
section('core-foundations','Основы игры и необходимые материалы','Основные правила',take(4,[9,10,11,12,13,14,15,16,17,18]))
section('core-activation','Ход игры и активации','Основные правила',take(4,[20,21,22,23]))
section('core-actions','Действия','Основные правила',take(4,[24])+take(5,[7,8,10,11,12,13,15,16,21,23,24]))
# The success table is a separate rule box in the upper right of page 5.
a=section('core-action-success','Таблица успеха действий','Основные правила',take(5,[18,19]))
a['markdown']=a['markdown'].replace('2-6 - Провал 7-11 – Успех 12+ - Критический успех: Если это атака в ближнем или дальнем бою, добавьте **+1 DICE** к броскам на ранения.', '| Результат | Исход |\n| --- | --- |\n| 2–6 | Провал |\n| 7–11 | Успех |\n| 12+ | Критический успех: Если это атака в ближнем или дальнем бою, добавьте **+1 DICE** к броскам на ранения. |\n\n')
a['tables']=[{'rows':[['Результат','Исход'],['2–6','Провал'],['7–11','Успех'],['12+','Критический успех; +1 DICE к ранению при атаке']],'source':ref(5,19)}]
section('core-dice','Модификаторы +DICE и -DICE','Основные правила',take(5,[26,27])+take(6,[6,7,8,9]))
section('core-blood-markers','Маркеры Крови','Основные правила',take(6,[11,12,13]))
section('core-bloodbath','Кровавая баня','Основные правила',take(6,[14,15]))
section('core-blessing-markers','Маркеры Благословения','Основные правила',take(6,[17,18]))
section('core-movement','Движение, нападение, лазание и прыжки','Движение',take(6,[20,21,23,25])+take(7,[7,9,11,12,14,15,17,19,21,22,24,26,28,30]),join=[('(Defended','Obstacle).')])
section('core-falling','Падение','Движение',take(7,[31,32])+take(8,[6]))
section('core-terrain','Местность','Движение',take(8,[7,9,11,13,15,16]))
section('core-movement-types','Типы движения','Движение',take(8,[17,19,21,22]),join=[('через','разрывы')])
section('core-ranged','Бой и дальние атаки','Бой',take(8,[24,25,26,27,28,29,31,33])+take(10,[6]))
inj=section('core-injuries','Таблица ранений','Бой',take(9,[8,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27]))
inj['markdown']=inj['markdown'].replace('\n\n**Примечание:', '\n\n| Результат | Ранение |\n| --- | --- |\n| 1 (или меньше) | Без эффекта |\n| 2–6 | Лёгкое ранение |\n| 7–8 | Повален |\n| 9+ | Выведен из строя (Out of Action) |\n\n**Примечание:',1)
inj['sourceBlocks'][1:1]=[ref(9,i)for i in [9,10]]
inj['tables']=[{'rows':[['Результат','Ранение'],['1 (или меньше)','Без эффекта'],['2–6','Лёгкое ранение'],['7–8','Повален'],['9+','Выведен из строя (Out of Action)']],'source':{'document':'core','pages':[9],'blocks':[ref(9,9),ref(9,10)]}}]
section('core-melee','Ближний бой','Бой',take(10,[7,8,9,11,13,14,16,18,20]))
section('core-end-activation','Конец активации','Основные правила',take(10,[22,23]))
section('core-morale','Мораль','Основные правила',take(10,[25,26,27,28]))
section('core-end-turn','Конец хода','Основные правила',take(11,[7,9]))
section('core-keywords-intro','Ключевые слова: общие сведения','Ключевые слова',take(4,[25])+take(12,[8]))
# Red marginal notes are independent of the two black body columns.
section('core-measure-and-climb','Предварительное измерение, лазание и прыжки','Движение',take(5,[29]))
section('core-prohibition','Правило запрещения','Основные правила',take(6,[26]))
section('core-fractions','Дроби','Основные правила',take(6,[27]))
section('core-exit-trench','Подняться из окопа','Движение',take(6,[28]))
section('core-model-representation','Точность моделей','Создание отряда',take(7,[34,35])+take(14,[30]))
section('core-shoot-into-melee','Стрельба в ближний бой','Бой',take(8,[35,36]))
section('core-choose-faction','Выберите свою фракцию','Создание отряда',take(14,[7,9,10]))
section('core-recruitment','Набор вашего отряда','Создание отряда',take(14,[12,13,14,15]),join=[('Мы','рекомендуем,')])
section('core-recruitment-limits','Ключевые слова и ограничения снаряжения','Создание отряда',take(14,[17,18,20,22]))
section('core-equipping','Снаряжение отряда','Создание отряда',take(14,[24,26,28])+take(15,[6,8,10,11,12]))
section('core-allies-hiring','Союзники и наёмники','Создание отряда',take(16,[7,8]))
section('core-purchasable-abilities','Приобретаемые способности','Создание отряда',take(16,[10]))
section('core-roster','Список отряда и готовность к битве','Создание отряда',take(16,[12,13,16]))
section('core-characteristic-profile','Профиль характеристик','Создание отряда',take(16,list(range(18,28))))

KEYWORDS=[]
for n,ids in [(12,list(range(9,16))+list(range(17,25))),(13,list(range(7,25)))]:
 for i in ids:
  t=plain(raw(n)[i]);name=t.split(':')[0].strip();parts=[(n,i)]
  if name=='BLAST (X)':parts.append((12,16))
  if name=='FIRE':parts.append((13,6))
  slug={'+DICE':'plus-dice','-DICE':'minus-dice'}.get(name,re.sub('[^a-z0-9]+','-',name.lower()).strip('-'))
  kid='core-keyword-'+slug
  s=section(kid,name,'Ключевые слова',parts)
  if name in ['BLAST (X)','FIRE']:s['markdown']=s['markdown'].replace('\n\n'+render_block(*parts[1]),' '+render_block(*parts[1]))
  KEYWORDS.append({'id':kid,'name':name,'source':{'document':'core','pages':s['pages'],'sectionId':kid},'ruleId':kid})

# Source issues are preserved verbatim, never repaired by knowledge of another edition.
ISSUES=[
 {'id':'core-campaign-not-provided','document':'core','pages':[2,9,14,16], 'description':'Предисловие прямо называет правила кампаний и исследований отсутствующими в данном плейтесте. Отсылки к серьёзным ранениям, исследованиям и кампании сохраняются; из этих двух PDF нельзя восстановить отсутствующую полную кампанийную процедуру.'},
 {'id':'core-dragon-base-bands','document':'core','pages':[157], 'description':'Таблица Дракона задаёт интервалы баз 120–200, 210–250 и 260–300 мм. Значения 201–209 и 251–259 не описаны. Не расширять интервалы автоматически и не превращать фразу о 300 мм в неподтверждённую высоту модели.'},
 {'id':'core-risky-keyword-alias','document':'core','pages':[13,121,125], 'description':'Справочник определяет RISKY ACTION, но таблицы оружия используют сокращение RISKY. Сохраняются оба исходных написания; связь должна быть явной нормализацией.'},
 {'id':'core-trench-shield-machine-conflict','document':'core','pages':[9,127], 'description':'Краткая таблица p9 говорит, что Траншейный щит совмещается с любой бронёй, но в той же таблице и полном описании p127 Механизированная броня не совмещается с щитом. Применяется специальное исключение p127, обе формулировки сохранены.'}
]

# Common arsenal, full-width item entries and 5-column profiles. Table segmentation
# is based on observed header coordinates; every resulting row is retained in JSON.
ITEMS=[]
for n in range(118,132):
 if n==118:
  ids=[i for i,b in enumerate(raw(n))if b['type']==0 and b['bbox'][1]>250 and b['bbox'][1]<775 and plain(b)]
  ids.sort(key=lambda i:(0 if raw(n)[i]['bbox'][0]<250 else 1,raw(n)[i]['bbox'][1],raw(n)[i]['bbox'][0]))
  section('core-equipment-capacity','Оружие, броня и снаряжение: общие ограничения','Снаряжение',take(n,ids))
  continue
 page=DOC[n-1];blocks=raw(n)
 spans=[dict(s,lineId=f'core:p{n:03d}:b{bi:03d}:l{li:03d}')for bi,b in enumerate(blocks)if b['type']==0 for li,l in enumerate(b['lines'])for s in l['spans']if s['text'].strip()and 60<s['bbox'][1]<775 and s['bbox'][0]<445]
 # Item headings were identified visually as the bold Russian/English names.
 headings=[]
 for bi,b in enumerate(blocks):
  if b['type'] or not 60<b['bbox'][1]<775 or b['bbox'][0]>445:continue
  for li,l in enumerate(b['lines']):
   ss=[s for s in l['spans']if s['text'].strip()]
   if not ss:continue
   txt=spans_text(ss,False)
   if ss[0]['bbox'][0]<45 and 'Bold' in ss[0]['font'] and '(' in txt and txt.endswith(')') and not txt.startswith(('Правила','Примечание')):
    headings.append((l['bbox'][1],txt,bi,li))
 headings.sort()
 # Category introductions before the first real entry retain their own article.
 if headings and n in [124,127,129]:
  cut=headings[0][0]
  intro=[i for i,b in enumerate(blocks)if b['type']==0 and 60<b['bbox'][1]<cut and b['bbox'][0]<445 and len(plain(b))>2]
  section({124:'core-melee-weapons-intro',127:'core-armour-intro',129:'core-equipment-intro'}[n],{124:'Оружие Ближнего Боя',127:'Броня',129:'Экипировка'}[n],'Снаряжение',take(n,intro))
 for hi,(y,title,bi,li)in enumerate(headings):
  end=headings[hi+1][0]if hi+1<len(headings)else 775
  # Source aliases retain the full bilingual item heading.
  english=title[title.find('(')+1:title.rfind(')')]
  iid='core-item-'+re.sub('[^a-z0-9]+','-',english.lower()).strip('-')
  selected=[s for s in spans if y-.2<=s['bbox'][1]<end-.2]
  table_heads=[s for s in selected if s['text'].strip()=='Название']
  events=[];table_rows=None;table_bbox=None
  excluded=set()
  if table_heads:
   th=table_heads[0];ty=th['bbox'][1]
   hs=sorted([s for s in selected if abs(s['bbox'][1]-ty)<1.2],key=lambda s:s['bbox'][0])
   starts=[s['bbox'][0]for s in hs]
   if len(starts)==5:
    # Tables have a single profile row; following body text is separated by a large vertical gap.
    candidates=sorted([s for s in selected if s['bbox'][1]>ty+2],key=lambda s:(s['bbox'][1],s['bbox'][0]))
    data=[];last_bottom=max(s['bbox'][3]for s in hs)
    for s in candidates:
     if s['bbox'][1]-last_bottom>9:break
     data.append(s);last_bottom=max(last_bottom,s['bbox'][3])
    cells=['']*5
    for s in sorted(data,key=lambda s:(round(s['bbox'][1],1),s['bbox'][0])):
     x=s['bbox'][0];col=max(i for i,start in enumerate(starts)if x>=start-2)
     cells[col]+= (' 'if cells[col]else '')+spans_text([s])
    table_rows=[[spans_text([s],False)for s in hs],[clean(c)for c in cells]]
    table_bbox=[min(s['bbox'][0]for s in hs+data),ty,max(s['bbox'][2]for s in hs+data),last_bottom]
    for s in hs+data:excluded.add((s['lineId'],s['bbox'][0]))
    events.append((ty,'| '+' | '.join(table_rows[0])+' |\n| '+' | '.join(['---']*5)+' |\n| '+' | '.join(table_rows[1])+' |'))
  # Paragraph blocks are reconstructed by their actual line baselines after the table is removed.
  grouped={}
  for s in selected:
   if (s['lineId'],s['bbox'][0])in excluded:continue
   grouped.setdefault(s['lineId'].split(':l')[0],[]).append(s)
  for bid,ss in grouped.items():
   ss=sorted(ss,key=lambda s:(s['bbox'][1],s['bbox'][0]));firsty=min(s['bbox'][1]for s in ss)
   line_groups={}
   for s in ss:line_groups.setdefault(s['lineId'],[]).append(s)
   lines=[spans_text(v)for k,v in line_groups.items()]
   if firsty==y or abs(firsty-y)<1:
    # First line is the article title, not part of its lore paragraph.
    if lines:lines=lines[1:]
   text=clean(' '.join(lines))
   if text:events.append((firsty,text))
  md='\n\n'.join(e[1]for e in sorted(events,key=lambda e:e[0]))
  cat='ranged'if n<=123 else 'melee'if n<=126 else 'armour'if n<=128 else 'equipment'
  entity={'id':iid,'name':title.split(' (')[0],'englishName':english,'category':cat,'source':{'document':'core','pages':[n],'sectionId':iid,'bbox':[36,round(y,3),445,round(end,3)]},'ruleId':iid,'tableRows':table_rows,'cost':None,'costNote':'Стоимость определяется конкретным арсеналом фракции, в общем описании цена не указана.'}
  if table_rows:
   vals=[re.sub(r'\*','',v)for v in table_rows[1]]
   kw=re.findall(r'BLAST\s+\d+[”"″]?|[A-Z]+(?:\s+ACTION)?',vals[4])
   entity.update({'profileName':vals[0],'type':vals[1],'range':vals[2],'modifiers':vals[3],'keywords':kw,'rawKeywords':vals[4]})
  ITEMS.append(entity)
  SECTIONS.append({'id':iid,'title':title,'category':{'ranged':'Дальнобойное оружие','melee':'Оружие ближнего боя','armour':'Броня','equipment':'Экипировка'}[cat],'originalSection':title,'pages':[n],'markdown':'# '+title+'\n\n'+md+'\n','sourceBlocks':[{'document':'core','pages':[n],'bbox':[36,round(y,3),445,round(end,3)]}],'tables':[]if not table_rows else [{'rows':table_rows,'source':{'document':'core','pages':[n],'bbox':table_bbox}}]})

# Scenario articles follow semantic scenario boundaries including their diagram pages.
SCENARIOS=[(134,135,'core-scenario-1','Сценарий 1: Захватить Ничейные земли'),(136,137,'core-scenario-2','Сценарий 2: Охота на реликвии'),(138,139,'core-scenario-3','Сценарий 3: Охота на героев'),(140,141,'core-scenario-4','Сценарий 4: Бойня в траншеях'),(142,143,'core-scenario-5','Сценарий 5: Великая война'),(144,145,'core-scenario-6','Сценарий 6: Рейд за припасами'),(146,149,'core-scenario-7','Сценарий 7: Бронированный поезд'),(150,155,'core-scenario-8','Сценарий 8: Штурм берегов'),(156,160,'core-scenario-9','Сценарий 9: Охота на Дракона')]

def main_blocks(n):
 ids=[i for i,b in enumerate(raw(n))if b['type']==0 and 60<b['bbox'][1]<775 and plain(b)]
 ids.sort(key=lambda i:(0 if raw(n)[i]['bbox'][0]<250 else 1 if raw(n)[i]['bbox'][0]<480 else 2,raw(n)[i]['bbox'][1],raw(n)[i]['bbox'][0]))
 return ids

section('core-scenarios-general','Сценарии: общие правила','Сценарии',take(133,[i for i in main_blocks(133)if raw(133)[i]['bbox'][1]>190]))
for start,end,sid,title in SCENARIOS:
 parts=[]
 for n in range(start,end+1):
  ids=main_blocks(n)
  # On title/map pages the 2 display headings are represented by the article title.
  if n==start:ids=[i for i in ids if not any(s['size']>32 for l in raw(n)[i]['lines']for s in l['spans'])]
  parts+=take(n,ids)
 s=section(sid,title,'Сценарии',parts,pre=f'[Схема поля боя — оригинальный PDF, с. {start}](reference/trench-crusade-1.6.3-ru.pdf#page={start}).')
 s['pages']=list(range(start,end+1))
 # Source diagrams contain rules and cannot be classified as merely decorative.
 s['diagrams']=[{'document':'core','pages':[start],'role':'scenario-layout','originalPdfPage':start}]

random=section('core-random-scenarios','Генератор рандомных сценариев','Сценарии',[(n,i)for n in range(162,168)for i in main_blocks(n)if not(n==162 and raw(n)[i]['bbox'][1]<250)])

# Marginal red literary quotations are retained separately from the mechanics.
quotes=[]
for n in [121,122,125]:
 quotes+=take(n,[i for i,b in enumerate(raw(n))if b['type']==0 and b['bbox'][0]>445 and 60<b['bbox'][1]<775 and len(plain(b))>4])
section('core-armoury-marginal-quotes','Цитаты на полях арсенала','Лор',quotes)

# Explicit paragraph continuations, checked by reading both original columns/pages.
CONTINUATIONS={
 'core-scenarios-general':[(133,)],
}
for sid,patterns in {
 'core-scenarios-general':[('Маркеров целей.','Маркеров целей.')],
 'core-scenario-4':[('в любом','месте на поле боя,')],
 'core-scenario-5':[('ведите','подсчёт Очков победы')],
 'core-scenario-7':[('в этом','ходу, если она ещё')],
 'core-scenario-8':[('выведен из','строя). Бросьте'),('и даже','набрасывающихся')],
 'core-scenario-9':[('Лазать по','Дракону,'),('находящаяся в','пределах площади')]
}.items():
 s=next(s for s in SECTIONS if s['id']==sid)
 for left,right in patterns:s['markdown']=s['markdown'].replace(left+'\n\n'+right,left+' '+right)

# Rebuild the three scenario selection / feat tables from their observed rows.
def rows_markdown(headers,rows):
 return '| '+' | '.join(headers)+' |\n| '+' | '.join(['---']*len(headers))+' |\n'+'\n'.join('| '+' | '.join(r)+' |'for r in rows)
table1=[[str(i),t]for i,t in enumerate(['НА ИСТОЩЕНИЕ','ЗАХВАТ И УДЕРЖАНИЕ','САБОТАЖ','ТОЛЬКО ВПЕРЁД','ПРОРЫВ','ИЗВЛЕЧЬ'],1)]
table2=[[str(i),t]for i,t in enumerate(['СЛУЧАЙНАЯ ВСТРЕЧА','СТАНДАРТНОЕ РАЗВЕРТЫВАНИЕ','АТАКА С ФЛАНГА','БИТВА НА ДИСТАНЦИИ','ТУННЕЛИ','ТУМАН ВОЙНЫ'],1)]
random['markdown']=random['markdown'].replace(render_block(162,28),rows_markdown(['D6','Сценарий'],table1))
random['markdown']=random['markdown'].replace(render_block(164,24),rows_markdown(['D6','Развёртывание'],table2))
random['tables']=[{'rows':[['D6','Сценарий']]+table1,'source':ref(162,28)},{'rows':[['D6','Развёртывание']]+table2,'source':ref(164,24)}]
for title,indices in [('Результат броска - Игрок 1',range(10,16)),('Результат броска - Игрок 2',range(20,26))]:
 rows=[]
 for i in indices:
  t=render_block(167,i)
  m=re.match(r'^(\d)\s+(.*)',t,re.S)
  if not m:raise ValueError(('feat row',i,t))
  rows.append([m[1],m[2]])
 old='\n\n'.join(render_block(167,i)for i in indices)
 random['markdown']=random['markdown'].replace(old,rows_markdown(['D6','Славный подвиг'],rows))
 random['tables'].append({'title':title,'rows':[['D6','Славный подвиг']]+rows,'source':{'document':'core','pages':[167],'blocks':[ref(167,i)for i in indices]}})

# Extract fresh raster diagrams; their pixels, geometry and source hashes remain auditable.
diagram_boxes={
 134:[45,240,550,750],136:[30,265,563,763],138:[44,280,551,754],140:[154,236,441,506],
 142:[36,235,559,741],144:[33,288,562,779],146:[64,262,531,735],150:[36,235,558,779],156:[49,323,545,819],
 164:[260,550,449,716],165:[[35,191,215,358],[35,478,216,646],[261,117,451,294],[261,532,453,710]],166:[35,246,221,419]
}
asset_dir=ROOT/'public/assets/reconstruction/core'
asset_dir.mkdir(parents=True,exist_ok=True)
for n,boxes in diagram_boxes.items():
 if isinstance(boxes[0],(int,float)):boxes=[boxes]
 dest=next(s for s in SECTIONS if s['id']==('core-random-scenarios'if n>=162 else next(t[2]for t in SCENARIOS if t[0]==n)))
 dest.setdefault('diagrams',[])
 dest['diagrams']=[d for d in dest['diagrams']if not(d.get('originalPdfPage')==n and 'bbox'not in d)]
 for j,bbox in enumerate(boxes,1):
  path=asset_dir/f'page-{n:03d}-{j}.png'
  DOC[n-1].get_pixmap(matrix=fitz.Matrix(2,2),clip=fitz.Rect(bbox),alpha=False).save(path)
  rel=path.relative_to(ROOT/'public').as_posix()
  meta={'document':'core','pages':[n],'bbox':bbox,'path':rel,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'role':'rules-diagram'}
  dest['diagrams'].append(meta)
  dest['markdown']+='\n\n![Схема оригинальных правил, страница '+str(n)+', фрагмент '+str(j)+']('+rel+')\n'

# Every assigned page is accounted for. Inspection means first author pass only.
INSPECTED=list(range(1,18))+list(range(118,169))
for n in INSPECTED:
 related=[s['id']for s in SECTIONS if n in s['pages']]
 typ='rules'
 if n==1:typ='title'
 if n in [3,17,132,161,168]:typ='illustration'if n!=168 else 'back-cover'
 if n==2:typ='preface'
 if n in [134,136,138,142,144,146,150,156]:typ='scenario-title-and-rules-diagram'
 order=['Левая основная колонка сверху вниз','Правая основная колонка сверху вниз']
 notes='Оригинальное изображение страницы действительно рассмотрено автором; независимая повторная сверка не выполнена.'
 if n in [119,120,121,122,123,124,125,126,127,128,129,130,131]:order=['Полноширинные статьи сверху вниз','В каждой статье: название, курсивный лор, строка характеристик, полный текст Правил','Красные цитаты на полях отдельно от механик'];notes+=' Пять столбцов таблиц разделены по видимым заголовкам и координатам; границы предметов установлены по визуальным названиям.'
 if n in [1,3,17,132,161,168]:order=['Титул/иллюстрация и подписи, самостоятельных механик нет']
 if n==5:order=['Левая колонка действий','Правые атаки ближнего боя и рискованные действия','Отдельная вставка Таблица успеха действий','Правые +DICE/-DICE','Красные боковые примечания'];notes+=' Таблица не разрывает перечисление общих действий.'
 if n==7:notes+=' Продолжение Атаки в прыжке из левой колонки в верх правой; подпись Точность моделей внизу относится к красному полю справа сверху.'
 if n==9:order=['Левая колонка вставки Таблица ранений, включая таблицу результатов','Правая колонка вставки, эффекты ранений'];notes+=' Вставка самостоятельна; общий дальний бой продолжается с p8 на p10.'
 if n==14:notes+=' Набор отряда продолжается сверху правой колонки до заголовка Ключевые слова.'
 if n==137:notes+=' Последний Славный подвиг Защитник Реликвии расположен в узком третьем поле справа и включён в конец списка.'
 if n==167:order=['Верхняя таблица: результаты Игрока 1, 1–6','Нижняя таблица: результаты Игрока 2, 1–6']
 PAGES[n]={'pdfPage':n,'printedPage':None if n in [1,168]else n,'contentType':typ,'readingOrder':order,'sectionIds':related,'extractionStatus':'authored'if related else 'non-rule-accounted','visualInspection':{'agent':'core_rules','status':'inspected','notes':notes},'independentReview':{'status':'pending'},'issues':[x['id']for x in ISSUES if n in x['pages']]}

SCENARIO_PROFILES=[
 {'id':'core-scenario-beast','name':'Зверь','source':{'document':'core','pages':[152,153],'sectionId':'core-scenario-8'},'cost':None,'movement':'8”/пехота','ranged':'–','melee':'+2D','armour':'0','base':'120 × 80 мм','heightMaxMm':60,'keywords':['FEAR','TOUGH'],'equipment':['Укус','Когти'],'availability':'Непредвиденное событие 4 сценария Штурм берегов; не нанимаемый боец.'},
 {'id':'core-scenario-dragon','name':'Дракон','source':{'document':'core','pages':[157,158,159],'sectionId':'core-scenario-9'},'cost':None,'movement':'10”/пехота','ranged':'+3D','melee':'+3D','armour':'-3','base':'120 мм+','heightMaxMm':None,'baseSizeText':'Модель Дракона должна быть размещена на базе не менее 120 мм и может достигать 300 мм.','keywords':['FEAR'],'movementByBase':[{'baseMinMm':120,'baseMaxMm':200,'movementInches':10},{'baseMinMm':210,'baseMaxMm':250,'movementInches':9},{'baseMinMm':260,'baseMaxMm':300,'movementInches':8}],'equipment':['Топот (Stomp)','Огненное Дыхание (Fire Breath)','Удар Хвоста (Tail Swipe)'],'availability':'Сценарий Охота на Дракона; не нанимаемый боец.'},
 {'id':'core-scenario-peasant','name':'Крестьянин','source':{'document':'core','pages':[157,159],'sectionId':'core-scenario-9'},'cost':None,'movement':'5”/Пехота','ranged':'нет','melee':'нет','armour':'0','base':'25 мм','keywords':[],'equipment':[],'availability':'Каждый игрок размещает по три крестьянина в сценарии Охота на Дракона; не нанимаемый боец.'}
]

payload={'schemaVersion':2,'author':'core_rules','document':'core','sourceSha256':hashlib.sha256(PDF.read_bytes()).hexdigest(),'pageRange':INSPECTED,'sections':SECTIONS,'entities':{'keywords':KEYWORDS,'items':ITEMS,'scenarioProfiles':SCENARIO_PROFILES,'procedures':[
 {'id':'core-action-roll','kind':'diceRoll','baseDice':2,'keepDice':2,'sides':6,'modifierCancellation':'pairwise','positiveDice':'add-and-keep-highest','negativeDice':'add-and-keep-lowest','successThreshold':7,'criticalThreshold':12,'attackCriticalInjuryDice':1,'riskyFailure':'end-activation','ordinaryFailure':'other-actions-remain-available','source':{'document':'core','pages':[5,6],'sectionId':'core-action-success'}},
 {'id':'core-injury-roll','kind':'diceRoll','baseDice':2,'keepDice':2,'sides':6,'nonstandardRoll':'Keep the number of dice in the original pool after +/-DICE.','table':[{'max':1,'result':'no-effect'},{'min':2,'max':6,'result':'minor-wound'},{'min':7,'max':8,'result':'down'},{'min':9,'result':'out-of-action'}],'source':{'document':'core','pages':[9],'sectionId':'core-injuries'}},
 {'id':'core-bloodbath-roll','kind':'bloodbath','bloodMarkerCost':6,'downTargetBloodMarkerCost':3,'additionalBaseDice':1,'sumAllBaseDice':True,'nonstandardExample':{'weapon':'Адская Бомба Артиллерийской ведьмы','normalBaseDice':3,'bloodbathBaseDice':4},'source':{'document':'core','pages':[6],'sectionId':'core-bloodbath'}},
 {'id':'core-critical-weapon-injury','kind':'criticalWeapon','criticalActionThreshold':12,'injuryDiceBonus':2,'replacesNormalCriticalDiceBonus':True,'source':{'document':'core','pages':[12],'sectionId':'core-keyword-critical'}}
 ],'constraints':[
 {'id':'core-starting-budget','kind':'startingBudget','value':{'ducats':700,'glory':0},'gloryStatus':'Как правило, при создании отряда очки славы недоступны; специальные исключения задаёт список фракции.','source':{'document':'core','pages':[14],'sectionId':'core-recruitment'}},
 {'id':'core-gear-capacity','kind':'equipmentCapacity','rangedChoices':[{'hands':2,'max':1},{'hands':1,'max':2}],'meleeChoices':[{'hands':2,'max':1},{'hands':1,'max':2}],'armourMax':1,'headgearMax':1,'grenadeTypesMax':1,'sameEquipmentTypeMax':1,'source':{'document':'core','pages':[14,15,118],'sectionId':'core-equipment-capacity'}},
 {'id':'core-allies-exemption','kind':'allyExemption','from':['warbandBonuses','warbandRestrictions','equipmentLimit'],'unless':'Правило прямо указывает влияние на союзников.','source':{'document':'core','pages':[16],'sectionId':'core-allies-hiring'}},
 {'id':'core-ability-copy-limit','kind':'perModelAbilityCopy','max':1,'unless':'Если не указано иное. Применяется также к бонусам, получаемым от снаряжения.','source':{'document':'core','pages':[16],'sectionId':'core-purchasable-abilities'}}
 ]},'pages':[PAGES[n]for n in INSPECTED],'issues':ISSUES,'reviewStatus':'awaiting-independent-image-review'}
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
print(f'Authored {len(SECTIONS)} sections, {len(ITEMS)} common items, {len(KEYWORDS)} keywords; {len(PAGES)} images inspected, independent review pending')
