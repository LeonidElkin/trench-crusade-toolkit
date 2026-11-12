#!/usr/bin/env python3
"""Rebuild pp.18–65 using explicit editorial selections from the original PDF.

This is an edition-specific authored layout plan, not a heading/reading-order
inference engine. The selections were made after opening every rendered page.
It never reads the former corpus. A separate agent must perform the second pass.
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
PAGES = {
    n: [b for b in DOC[n-1].get_text('dict')['blocks'] if b['type'] == 0]
    for n in range(18, 66)
}
SECTIONS = []
ENTITIES = {k: [] for k in ['factions', 'variants', 'units', 'items', 'offers', 'upgrades', 'abilities', 'constraints']}
ISSUES = []
USED = set()
TABLES = []


def clean(t):
    return re.sub(r'\s+', ' ', t.replace('\xad', '')).strip()


def line_text(l, style=True):
    pieces = []
    for s in l['spans']:
        t = s['text']
        if not t.strip():
            pieces.append(t)
            continue
        if style and ('Bold' in s['font'] or 'Semibold' in s['font']):
            a, b = len(t)-len(t.lstrip()), len(t.rstrip())
            t = t[:a] + '**' + t[a:b] + '**' + t[b:]
        pieces.append(t)
    return clean(''.join(pieces))


def join_lines(lines, style=True):
    result = ''
    for l in lines:
        t = line_text(l, style)
        if not t:
            continue
        result += ('' if result.endswith('-') else ' ' if result else '') + t
    # Consolidate adjoining style spans without changing words.
    result = re.sub(r'\*\*\s+\*\*', ' ', result)
    return clean(result)


def text(n, i, style=True):
    return join_lines(PAGES[n][i]['lines'], style)


def source(n, ids, section_id):
    boxes = [PAGES[n][i]['bbox'] for i in ids]
    return {'document': 'core', 'pages': [n], 'sectionId': section_id,
            'bbox': [round(min(b[0] for b in boxes), 2), round(min(b[1] for b in boxes), 2),
                     round(max(b[2] for b in boxes), 2), round(max(b[3] for b in boxes), 2)],
            'textBlockIndices': list(ids)}


def block(n, i, role='body', prefix=''):
    USED.add((n, i))
    b = PAGES[n][i]
    lines = [l for l in b['lines'] if line_text(l, False)]
    if not lines:
        return ''
    t = prefix + join_lines(lines)
    if role == 'lore':
        return '> **Лор:** ' + t
    if role == 'quote':
        return '> ' + t
    if role == 'heading':
        return '## ' + join_lines(lines, False)
    # Source blocks which contain an equipment/ability label and its paragraph
    # are separated by the actual label; no inferred headings are introduced.
    first = line_text(lines[0], False)
    if first in ['Экипировка', 'Способности', 'Ключевые слова', 'Особые правила']:
        return '**' + first + '**' + ('\n\n' + join_lines(lines[1:]) if len(lines) > 1 else '')
    # Italic body copy is explicitly lore in these inspected faction layouts.
    # Preserve the boundary even when the PDF places title and lore in one block.
    groups=[]
    for l in lines:
        substantive=[s for s in l['spans'] if s['text'].strip()]
        italic=bool(substantive) and all('Italic' in s['font'] for s in substantive)
        if groups and groups[-1][0]==italic:
            groups[-1][1].append(l)
        else:
            groups.append((italic,[l]))
    if any(italic for italic,_ in groups):
        return '\n\n'.join(('> **Лор:** ' if italic else '')+join_lines(ls) for italic,ls in groups)
    return t


def table(n, ids, section_id):
    for i in ids:
        USED.add((n, i))
    lines = [l for i in ids for l in PAGES[n][i]['lines'] if line_text(l, False)]
    top = min(l['bbox'][1] for l in lines)
    heads = sorted([l for l in lines if l['bbox'][1] < top + 3], key=lambda l: l['bbox'][0])
    xs = [l['bbox'][0] for l in heads]
    headers = [line_text(l, False) for l in heads]
    assert headers[0] == 'Название', (n, ids, headers)
    values = [l for l in lines if l not in heads]
    def col(l):
        return max([j for j, x in enumerate(xs) if x <= l['bbox'][0]+2] or [0])
    # The Witch's name and movement share a PDF text span. Their positions are
    # unambiguous on the image; split at the movement column via original chars.
    if n == 26 and ids == [5]:
        values = []
        raw_blocks = [b for b in DOC[n-1].get_text('rawdict')['blocks'] if b['type'] == 0]
        for i in ids:
            for l in raw_blocks[i]['lines']:
                if l['bbox'][1] < top + 3:
                    continue
                for c in range(len(headers)):
                    spans=[]
                    for s in l['spans']:
                        chars=[ch for ch in s['chars'] if max([j for j,x in enumerate(xs) if x <= ch['bbox'][0]+2] or [0]) == c]
                        if chars:
                            spans.append({'text':''.join(ch['c'] for ch in chars),'font':s['font']})
                    if spans:
                        values.append({'bbox':[xs[c], l['bbox'][1], xs[c],l['bbox'][3]],'spans':spans})
    starts = sorted(set(round(l['bbox'][1], 1) for l in values if col(l) == 1))
    assert starts, (n, ids)
    rows = [[''] * len(headers) for _ in starts]
    for l in sorted(values, key=lambda l: (l['bbox'][1], l['bbox'][0])):
        row = max([j for j, y in enumerate(starts) if y <= l['bbox'][1] + 2] or [0])
        c = col(l)
        t = line_text(l)
        rows[row][c] += ('' if rows[row][c].endswith('-') else ' ' if rows[row][c] else '') + t
    rows = [[clean(t) for t in r] for r in rows]
    TABLES.append({'sectionId': section_id, 'source': source(n, ids, section_id), 'headers': headers, 'rows': rows})
    return '\n'.join(['| ' + ' | '.join(headers) + ' |', '| ' + ' | '.join(['---'] * len(headers)) + ' |'] +
                     ['| ' + ' | '.join(r) + ' |' for r in rows])


def add(sid, title, category, groups, original=None):
    parts = []
    refs = []
    pages = []
    for g in groups:
        n, ids = g[0], g[1]
        role = g[2] if len(g) > 2 else 'body'
        prefix = g[3] if len(g) > 3 else ''
        if isinstance(ids, int):
            ids = [ids]
        if n not in pages:
            pages.append(n)
        refs.append(source(n, ids, sid))
        if role == 'table':
            parts.append(table(n, ids, sid))
        elif role == 'join':
            for i in ids:
                USED.add((n, i))
            parts.append(prefix + clean(''.join(text(n, i) if j == 0 or text(n, ids[j-1]).endswith('-') else ' '+text(n, i) for j, i in enumerate(ids))))
        elif role == 'continue':
            continuation = ' '.join(block(n, i) for i in ids)
            parts[-1] += ('' if parts[-1].endswith('-') else ' ') + continuation
        else:
            parts.extend(block(n, i, role, prefix if j == 0 else '') for j, i in enumerate(ids))
    SECTIONS.append({'id': sid, 'title': title, 'category': category,
                     'originalSection': original or title, 'pages': sorted(pages),
                     'sourceBlocks': refs, 'markdown': '# ' + title + '\n\n' + '\n\n'.join(p for p in parts if p) + '\n'})
    return sid


def seq(n, a, b, role='body'):
    return (n, list(range(a, b+1)), role)


# The following selections and table groups are editorial decisions recorded
# after viewing page images, including the red sidebar and the three drop caps.
add('core-heretic-lore', 'Легион Еретиков: описание', 'Лор', [(18,6,'lore','М'),seq(18,7,12,'lore'),seq(18,13,14,'quote'),seq(19,3,4,'lore')])
USED.add((18,29))
add('core-heretic-recruitment', 'Легион Еретиков: создание отряда', 'Фракции', [seq(19,5,6)])
add('core-heretic-arsenal', 'Арсенал Легиона Еретиков', 'Арсеналы', [seq(19,7,8)])
add('core-heretic-sacrificial-knife', 'Жертвенный нож', 'Снаряжение', [(20,5),(20,[6,7],'table'),(20,8)])
add('core-heretic-staff', 'Богохульный посох', 'Снаряжение', [(20,9),(20,[10,11],'table'),(20,12)])
add('core-heretic-hellblade', 'Адский меч', 'Снаряжение', [(20,13),(20,[14],'table'),(20,15)])
add('core-heretic-tartarus-claws', 'Когти Тартара', 'Снаряжение', [(20,16),(20,[17,18],'table'),(20,19)])
add('core-heretic-special-equipment', 'Особое снаряжение Еретиков', 'Арсеналы', [seq(20,3,4)])
add('core-heretic-priest', 'Священник Еретиков', 'Бойцы', [seq(22,4,5),(22,[6,7],'table'),seq(22,8,12)])
add('core-heretic-death-commando', 'Еретический Коммандос Смерти', 'Бойцы', [seq(22,13,14),(22,[15,16],'table'),seq(22,17,19),seq(23,3,5)])
add('core-heretic-chorister', 'Хорист Еретиков', 'Бойцы', [seq(23,6,10),(23,[11],'table'),seq(23,12,16)])
add('core-heretic-trooper', 'Пехота Еретиков и Легионеры', 'Бойцы', [seq(24,4,5),(24,[6],'table'),seq(24,7,10)])
add('core-heretic-anointed', 'Помазанная Тяжёлая Пехота', 'Бойцы', [seq(24,11,12),(24,[13],'table'),seq(24,14,17)])
add('core-heretic-warwolf', 'Боевой Волк: Штурмовой зверь', 'Бойцы', [seq(25,3,4),(25,[5],'table'),seq(25,6,13)])
add('core-heretic-artillery-witch', 'Ведьма-Артиллеристка', 'Бойцы', [seq(26,3,4),(26,[5],'table'),seq(26,6,12),(26,13,'quote')])
add('core-heretic-wretch', 'Несчастный Легиона Еретиков', 'Бойцы', [seq(27,3,7),(27,[8],'table'),seq(27,9,14)])
add('core-heretic-naval-raiding-party', 'Еретический десантный флот', 'Варианты фракций', [seq(28,3,10)])
add('core-heretic-trench-ghosts', 'Призраки окопов', 'Варианты фракций', [seq(28,12,21),seq(29,3,8)])
add('core-heretic-knights-of-avarice', 'Рыцари Алчности', 'Варианты фракций', [(30,[3,4],'join'),seq(30,5,16)])
add('core-heretic-tarnished-armour', 'Потускневшая броня', 'Снаряжение', [seq(31,9,10)])
add('core-heretic-standard-of-mammon', 'Знамя Маммона', 'Снаряжение', [seq(31,11,12)])
add('core-heretic-golden-calf-altar', 'Алтарь Золотого Тельца', 'Снаряжение', [seq(31,13,14)])
add('core-heretic-coin-hammer', 'Молот с монетой', 'Снаряжение', [(31,15),(31,[16],'table'),(31,17)])
add('core-heretic-mammon-quote', 'Рыцари Алчности: слова Беры', 'Лор', [seq(31,3,7,'quote')])

add('core-pilgrim-lore', 'Паломники Траншей: описание', 'Лор', [(33,6,'lore','П'),seq(33,7,8,'lore'),(33,[9,10],'join'),seq(33,11,13,'lore'),seq(33,14,15,'quote'),seq(34,3,4,'lore')])
USED.add((33,16))
add('core-pilgrim-recruitment', 'Паломники Траншей: создание отряда', 'Фракции', [seq(34,5,6)])
add('core-pilgrim-arsenal', 'Арсенал Траншейных Паломников', 'Арсеналы', [seq(34,14,15)])
add('core-pilgrim-special-equipment', 'Особое снаряжение Паломников', 'Арсеналы', [seq(35,3,4)])
add('core-pilgrim-iron-capirote', 'Железный капирот', 'Снаряжение', [seq(35,5,6),(35,22)])
add('core-pilgrim-molotov', 'Коктейль Молотова', 'Снаряжение', [(35,7),(35,[8,9],'table'),(35,10)])
add('core-pilgrim-war-cross', 'Боевой крест', 'Снаряжение', [(35,11),(35,[12],'table'),(35,13)])
add('core-pilgrim-punt-gun', 'Ружьё-пушка', 'Снаряжение', [(35,14),(35,[15,16],'table'),(35,17)])
add('core-pilgrim-antitank-hammer', 'Противотанковый молот', 'Снаряжение', [(35,18),(35,[19,20],'table'),(35,21)])
add('core-pilgrim-war-prophet', 'Пророк войны', 'Бойцы', [seq(37,4,5),(37,[6],'table'),seq(37,7,12)])
add('core-pilgrim-castigator', 'Каратель', 'Бойцы', [seq(37,13,14),(37,[15],'table'),seq(37,16,18),(38,[3],'continue'),seq(38,4,6)])
add('core-pilgrim-communicant', 'Коммуникант', 'Бойцы', [seq(38,7,9),(38,[10],'table'),seq(38,11,18),seq(38,21,22,'quote')])
add('core-pilgrim-trooper', 'Траншейный Паломник и Мученик-Покаянник', 'Бойцы', [seq(39,4,5),(39,[6],'table'),seq(39,7,11)])
add('core-pilgrim-prisoner', 'Церковные Узники', 'Бойцы', [seq(39,12,13),(39,[14],'table'),seq(39,15,16),(40,[3],'continue'),seq(40,4,7)])
add('core-pilgrim-stigmatic-nun', 'Стигматизированные Монахини', 'Бойцы', [seq(40,8,10),(40,11,'quote'),(40,[12],'table'),seq(40,13,17),seq(40,18,19,'quote')])
add('core-pilgrim-anchorite', 'Святилище Анахорет', 'Бойцы', [seq(41,3,4),(41,[5],'table'),seq(41,6,13),seq(41,26,27,'quote')])
add('core-pilgrim-procession-of-sacred-affliction', 'Процессия Священной Муки', 'Варианты фракций', [seq(43,3,13)])
add('core-pilgrim-holy-icon-armour', 'Доспехи со Святыми Иконами', 'Снаряжение', [(43,14)])
add('core-pilgrim-cavalcade-of-tenth-plague', 'Кавалькада Десятой Чумы', 'Варианты фракций', [seq(43,15,25)])
add('core-pilgrim-sacrificial-lamb', 'Жертвенный Агнец', 'Снаряжение', [seq(44,3,4)])
add('core-pilgrim-saint-methodius', 'Военное Паломничество Святого Мефодия', 'Варианты фракций', [seq(44,5,10),(44,[11],'continue'),seq(44,12,22)])
add('core-pilgrim-anchorite-heavy-flamethrower', 'Тяжёлый огнемёт Анахорета', 'Снаряжение', [(45,3)])
add('core-pilgrim-anchorite-antimateriel-rifle', 'Противотанковая винтовка Анахорета', 'Снаряжение', [(45,4)])
add('core-pilgrim-anchorite-punt-gun', 'Ружьё-пушка Анахорета', 'Снаряжение', [(45,5)])
add('core-pilgrim-trench-mortar', 'Траншейный миномёт', 'Снаряжение', [(45,6),(45,[7,8,9],'table'),(45,10)])
add('core-pilgrim-autocannon', 'Автопушка', 'Снаряжение', [(45,11),(45,[12,13],'table'),(45,14)])
add('core-pilgrim-gas-censer', 'Газовая кадильница', 'Снаряжение', [(45,15),(45,[16,17],'table'),(45,18)])
add('core-pilgrim-anchorite-upgrades', 'Особое снаряжение для Анахорета', 'Улучшения', [(46,3)])
for sid, title, a in [('gas-filters','Газовые фильтры',4),('holy-diesel-engine','Святой дизельный двигатель',6),
                      ('sacred-geometry','Священная геометрия',8),('grand-anchorite','Великий Анахорет',10),
                      ('piston-legs','Поршневые ноги',12),('hallowed-anchorite','Освящённый Отшельник',14),
                      ('wrathful-cherub-face','Лик гневного херувима',16)]:
    add('core-pilgrim-'+sid,title,'Улучшения',[seq(46,a,a+1)])

add('core-sultanate-lore','Железный Султанат: описание','Лор',[(48,6,'lore','К'),seq(48,7,8,'lore'),seq(48,10,11,'lore'),(48,14,'quote')])
USED.add((48,15))
add('core-sultanate-recruitment','Железный Султанат: создание отряда','Фракции',[seq(49,3,4)])
add('core-sultanate-arsenal','Арсенал Железного Султаната','Арсеналы',[seq(49,5,6)])
add('core-sultanate-special-equipment','Оружие, броня и снаряжение Султаната','Арсеналы',[seq(50,3,4)])
add('core-sultanate-jezzail','Джеззайль','Снаряжение',[(50,5),(50,[6],'table')])
add('core-sultanate-murad-bombard','МУРАД Бомбарда','Снаряжение',[(50,7),(50,[8,9],'table'),(50,10)])
add('core-sultanate-flame-cannon','Огненная пушка','Снаряжение',[(50,11),(50,[12,13],'table'),(50,14)])
add('core-sultanate-titan-zulfiqar','Титан Зульфикар','Снаряжение',[(50,15),(50,[16],'table'),(50,17)])
add('core-sultanate-assassins-dagger','Кинжал ассасина','Снаряжение',[(51,3),(51,[4,5],'table'),(51,6)])
add('core-sultanate-halberd-gun','Алебарда-пушка','Снаряжение',[(51,7),(51,[8,9],'table'),(51,10)])
add('core-sultanate-siege-jezzail','Осадный Джеззайль','Снаряжение',[(51,11),(51,[12,13],'table'),(51,14)])
add('core-sultanate-alaybozan','Алаибозан','Снаряжение',[(51,15),(51,[16],'table')])
add('core-sultanate-alchemist-armour','Алхимический доспех','Снаряжение',[seq(51,17,18)])
add('core-sultanate-alchemical-ammunition','Алхимическое вооружение','Снаряжение',[seq(51,19,20)])
add('core-sultanate-cloak-of-alamut','Плащ Аламута','Снаряжение',[seq(52,3,4)])
add('core-sultanate-wind-amulet','Амулет ветров','Снаряжение',[seq(52,5,6)])
add('core-sultanate-marid-shovel','Лопата Марида','Снаряжение',[seq(52,7,8)])
add('core-sultanate-yuzbashi','Капитан Юзбаши','Бойцы',[seq(54,4,5),(54,[6],'table'),seq(54,7,11)])
add('core-sultanate-jabirean-alchemist','Алхимик Джабира','Бойцы',[seq(54,12,13),(54,[14],'table'),seq(54,15,17),(55,[3],'continue'),(55,4)])
add('core-sultanate-assassin','Ассасин Султаната','Бойцы',[seq(55,5,6),(55,[7],'table'),seq(55,8,13)])
add('core-sultanate-azeb','Азебы','Бойцы',[seq(56,4,5),(56,[6],'table'),seq(56,7,8)])
add('core-sultanate-sapper','Саперы Султаната','Бойцы',[seq(56,9,10),(56,[11],'table'),seq(56,12,18)])
add('core-sultanate-lion','Львы Джабира','Бойцы',[seq(57,3,4),(57,[5],'table'),seq(57,6,11)])
add('core-sultanate-janissary','Янычары','Бойцы',[seq(57,12,13),(57,[14],'table'),seq(57,15,17),seq(58,3,4)])
add('core-sultanate-brazen-bull','Бронзовый Бык','Бойцы',[seq(58,5,6),(58,[7],'table'),seq(58,8,14),(58,33)])
add('core-sultanate-fidai','Фидаи Аламута – Кабал Ассасинов','Варианты фракций',[seq(59,3,15)])
for sid,title,ids in [('hallucinogenic-camouflage','Галлюциногенный камуфляж',[16]),('thunderbolt','Громовержец Аламута',[17]),
                     ('time-mirage','Мираж времени',[18]),('secret-paths','Тайные пути',[19,20])]:
    add('core-sultanate-'+sid,title,'Улучшения',[(59,ids)])
add('core-sultanate-fidai-equipment','Особое оружие и оборудование Фидаи Аламута','Арсеналы',[seq(60,3,4)])
add('core-sultanate-golden-khanjar','Золотой Ханджар','Снаряжение',[(60,5),(60,[6,7,8],'table'),seq(60,9,10)])
add('core-sultanate-bow-of-alamut','Лук Аламута','Снаряжение',[seq(60,11,12),(60,[13],'table'),seq(60,14,15)])
add('core-sultanate-hashashin-leaf','Лист Хашашин','Снаряжение',[seq(60,16,18)])
add('core-sultanate-house-of-wisdom','Дом Мудрости','Варианты фракций',[seq(61,3,9),(61,[10],'continue'),seq(61,11,17)])
add('core-sultanate-house-secrets','Тайны Дома Мудрости','Улучшения',[seq(62,3,4)])
for sid,title,i in [('medicine','Медицина',5),('cartography-geometry','Картография и геометрия',6),('secrets-of-takwin','Тайны Таквин',7),
                    ('chemistry-alchemy','Химия и алхимия',8),('philosophy-poetry-theology','Философия, поэзия и теология',9)]:
    add('core-sultanate-'+sid,title,'Улучшения',[(62,i)])
add('core-sultanate-takwin-recruitment','Существа Таквин: связь с Алхимиком','Создание отряда',[seq(63,3,4)])
add('core-sultanate-homunculus','Гомункул Таквин','Бойцы',[(63,5),(63,[6],'table'),seq(63,7,11)])
add('core-sultanate-alchemical-formulas','Алхимические формулы: приобретение','Улучшения',[seq(63,12,13)])
FORMULAS = [('wings','Крылья',63,14),('elemental-resistance','Элементальная устойчивость',63,15),('massive-size','Массивный размер',63,16),
            ('enslaved-mind','Порабощенный разум',63,17),('human-hands','Человеческие руки',63,18),('inhuman-strength','Нечеловеческая сила',63,19),
            ('terrifying-appearance','Устрашающий вид',63,20),('additional-arm','Дополнительная рука',63,21),('two-heads','Две головы',63,22),
            ('hypnotic-eyes','Гипнотические глаза',63,23),('hawk-eyes','Орлиные глаза',64,3),('startling-speed','Ошеломляющая скорость',64,4),
            ('seal-of-solomon','Печать Соломона',64,5),('gargantuan-size','Гигантский размер',64,6),('regenerative-tissue','Регенеративная ткань',64,7)]
for sid,title,n,i in FORMULAS:
    add('core-sultanate-formula-'+sid,title,'Улучшения',[(n,i)])
add('core-sultanate-house-arsenal','Специальный арсенал Дома Мудрости','Арсеналы',[seq(64,8,9)])
add('core-sultanate-elixir','Эликсир Аль-Хидр','Снаряжение',[seq(64,10,12)])
add('core-sultanate-fire-shield','Огненный щит','Снаряжение',[seq(64,13,15)])


def arsenal(n, ids, right_x, faction_id, section_id):
    for i in ids:
        USED.add((n,i))
    lines = sorted([l for i in ids for l in PAGES[n][i]['lines'] if line_text(l, False)], key=lambda l:(round(l['bbox'][1],1),l['bbox'][0]))
    cats = {'Оружие дальнего боя':'ranged','Оружие ближнего боя':'melee','Броня':'armour','Снаряжение':'equipment'}
    cat = None
    pairs=[]
    pending=None
    for l in lines:
        t=line_text(l,False); x,y=l['bbox'][:2]
        if t in cats:
            cat=cats[t]; continue
        if x < right_x-3:
            # A wrapped item name has no price on its second line.
            price_on_row=any(abs(z['bbox'][1]-y)<2 and z['bbox'][0]>right_x-3 and re.match(r'\d',line_text(z,False)) for z in lines)
            if price_on_row:
                pending={'name':t,'category':cat,'priceText':'','y':y}
                pairs.append(pending)
            elif pending:
                pending['name'] += ' '+t
            else:
                raise ValueError((n,t,'orphan arsenal name'))
        else:
            assert pending,(n,t)
            pending['priceText'] += ('' if pending['priceText'].endswith('-') else ' ' if pending['priceText'] else '')+t
    for ix,p in enumerate(pairs):
        raw=p['priceText']; costnum=int(re.match(r'\d+',raw)[0])
        glory='слав' in raw.lower().split('(')[0]
        m=re.search(r'лимит\s*:\s*(\d+)',raw,re.I)
        p.update({'id':f'{faction_id}-offer-{ix+1:02}', 'factionId':faction_id,'cost':{'ducats':0 if glory else costnum,'glory':costnum if glory else 0},
                  'limit':int(m[1]) if m else None, 'source':{**source(n,ids,section_id),'rowY':round(p['y'],2)},'itemName':p['name']})
        del p['y']
        ENTITIES['offers'].append(p)
    s=next(s for s in SECTIONS if s['id']==section_id)
    s['markdown']+='\n| Категория | Предмет | Стоимость и ограничения |\n| --- | --- | --- |\n'+''.join('| '+p['category']+' | '+p['name']+' | '+p['priceText']+' |\n' for p in pairs)
    s['sourceBlocks'].append(source(n,ids,section_id))
    return pairs


ARSENALS = {
    'heretic':arsenal(19,[10],416.8,'heretic','core-heretic-arsenal'),
    'pilgrim':arsenal(34,[16,17,18],395.8,'pilgrim','core-pilgrim-arsenal'),
    'sultanate':arsenal(49,[8],395.8,'sultanate','core-sultanate-arsenal'),
}


def issue(iid,n,message,section):
    ISSUES.append({'id':iid,'document':'core','pages':[n],'sectionId':section,'message':message,'status':'unresolved-source','resolution':None})


issue('source-hereti',24,'В строке ключевых слов Помазанника напечатано HERETI, в других профилях — HERETIC. Исходное HERETI сохранено; автоматическое приравнивание не подтверждено источником.','core-heretic-anointed')
issue('source-cumbersom',20,'В таблице Когтей Тартара напечатано CUMBERSOM без конечной E; определённое в общих правилах слово — CUMBERSOME. Исходная таблица сохранена.','core-heretic-tartarus-claws')
issue('source-mortar-range',45,'Таблица Траншейного миномёта даёт дальность 48”, а текст выбора точки ограничивает её 36”. Оба значения сохранены; окончательная трактовка не задана.','core-pilgrim-trench-mortar')
issue('source-autocannon-row',45,'В разделе Автопушка строка таблицы названа «Пулемёт». Название строки сохранено, её отдельные характеристики привязаны к разделу Автопушки.','core-pilgrim-autocannon')
issue('source-house-collection',61,'Коллекции оружия сначала требуют выбрать два оружия, затем говорят «Только одно оружие может быть выбрано из этого списка». Неясно, имеется в виду по одному из арсеналов или общий предел. Ограничение требует ручной проверки.','core-sultanate-house-of-wisdom')
issue('source-auto-pistole',34,'В арсенале напечатано «Автоматический пистоле» без последней т. Исходная строка сохранена, связь с общим описанием Автоматического пистолета задаётся явно как редакторская нормализация названия.','core-pilgrim-arsenal')
issue('source-wretch-glory-price',27,'Предметы Несчастного ограничены стоимостью 10 дукатов за единицу. Текст не задаёт соотношения со Славой и не формулирует отдельный запрет на предметы за Славу. Для таких покупок нельзя автоматически считать ограничение выполненным.','core-heretic-wretch')
issue('source-castigator-name',43,'Правило Гнев Божий называет «Кастигатора», а профиль этой фракции назван «Каратель» (стр.37–38). Связь названий является явной редакторской интерпретацией и требует ручной проверки; исходные формулировки сохранены.','core-pilgrim-procession-of-sacred-affliction')


def section(sid):
    return next(s for s in SECTIONS if s['id']==sid)


def sref(sid):
    return {'document':'core','pages':section(sid)['pages'],'sectionId':sid}


def plain(t):
    return t.replace('**','')


def profile(sid,row=0):
    t=next(t for t in TABLES if t['sectionId']==sid)
    r=[plain(v) for v in t['rows'][row]]
    return dict(zip(['name','movement','ranged','melee','armour','base'],r))


def keywords_at(n,i):
    t=text(n,i,False).replace('Ключевые слова','').strip()
    return [] if t=='-' else [k.strip() for k in t.split(',') if k.strip()]


def unit(sid,faction,cost,minimum,maximum,keyref,*,row=0,name=None,variant=None,**rules):
    stats=profile(sid,row)
    u={'id':sid,'name':name or section(sid)['title'],'factionId':faction,'variantId':variant,'mercenary':False,
       'cost':{'ducats':cost,'glory':0},'min':minimum,'max':maximum,'stats':stats,
       'profileRows':next(t for t in TABLES if t['sectionId']==sid)['rows'],
       'keywords':keywords_at(*keyref),'source':sref(sid),'ruleId':sid,
       'fixedEquipment':[],'equipmentLocked':False,'allowedCategories':['ranged','melee','armour','equipment'],
       'rules':rules,'manualCheck':False}
    ENTITIES['units'].append(u)
    return u


def derived_unit(uid,name,base,variant,cost,minimum,maximum,keywords_add=None,keywords_remove=None,**rules):
    # The PDF explicitly instructs use of another profile. This records that
    # inheritance as a source fact, and also emits the resolved profile for use.
    parent=next(u for u in ENTITIES['units'] if u['id']==base)
    sid={'fidai':'core-sultanate-fidai','house-of-wisdom':'core-sultanate-house-of-wisdom',
         'trench-ghosts':'core-heretic-trench-ghosts'}[variant]
    u={**parent,'id':uid,'name':name,'variantId':variant,'cost':{'ducats':cost,'glory':0},'min':minimum,'max':maximum,
       'keywords':sorted((set(parent['keywords'])|set(keywords_add or []))-set(keywords_remove or [])),
       'source':sref(sid),'ruleId':sid,'explicitProfileReference':{'unitId':base,'source':sref(sid)},
       'rules':{**parent['rules'],**rules}}
    ENTITIES['units'].append(u)
    return u


def upgrade(uid,name,ducats,sid,unit_ids,**rules):
    value={'id':uid,'name':name,'cost':{'ducats':ducats,'glory':0},'unitIds':unit_ids,'ruleId':sid,'source':sref(sid),
           'limit':rules.pop('limit',None),'variantId':rules.pop('variantId',None),'rules':rules,'manualCheck':False}
    ENTITIES['upgrades'].append(value)
    return value


def build_entities():
    for fid,name,p in [('heretic','Легион Еретиков',19),('pilgrim','Паломники Траншей',34),('sultanate','Железный Султанат',49)]:
        sid='core-'+fid+'-recruitment'
        ENTITIES['factions'].append({'id':fid,'name':name,'source':sref(sid),'ruleId':sid,
            'loreRuleId':'core-'+fid+'-lore','arsenalRuleId':'core-'+fid+'-arsenal',
            'startingBudget':{'ducats':700,'glory':0},'battleBudget':{'ducats':900,'glory':8},
            'budgetStatus':'recommended-battle-format','rules':{'arsenalLimitScope':'campaign' if fid in ['heretic','sultanate'] else 'as-source'}})

    priest=unit('core-heretic-priest','heretic',80,1,1,(22,12))
    commando=unit('core-heretic-death-commando','heretic',90,0,1,(23,5))
    commando['rules'].update({'allowedRangedItemNames':['Пистолет с глушителем','Газовая граната']})
    unit('core-heretic-chorister','heretic',65,0,1,(23,16))
    unit('core-heretic-trooper','heretic',30,0,None,(24,10))
    anointed=unit('core-heretic-anointed','heretic',95,0,5,(24,17))
    anointed['fixedEquipment']=[{'name':'Усиленная броня','category':'armour','includedInCost':True,'removable':False},
                               {'name':'Адское Клеймо','sourceName':'Адский Клеймённый Знак','category':'equipment','includedInCost':True,'removable':False}]
    anointed['manualCheck']=True
    wolf=unit('core-heretic-warwolf','heretic',140,0,1,(25,13))
    wolf.update({'equipmentLocked':True,'allowedCategories':[],'fixedEquipment':[{'name':'Броня Тартаруса','category':'armour'},
        {'name':'Рот-Бензопила','category':'melee','hands':0},{'name':'Измельчающие Когти','category':'melee','hands':2}]})
    wolf['rules'].update({'maxAttacksPerActivation':2,'attacksExactlyOneEachFixedWeapon':True})
    witch=unit('core-heretic-artillery-witch','heretic',90,0,1,(26,12))
    witch['fixedEquipment']=[{'name':'Адская бомба','category':'ranged','includedInCost':True,'removable':False}]
    witch['allowedCategories']=['melee','armour','equipment']
    witch['rules'].update({'conditionalMax':{'when':{'warbandDucats':{'gt':1000}},'max':2}})
    wretch=unit('core-heretic-wretch','heretic',25,0,None,(27,14))
    wretch['allowedCategories']=['melee','armour','equipment']
    wretch['rules'].update({'maxItemDucats':10,'requireWeapon':True,'unresolvedGloryPurchase':True,
        'composition':{'countOfThisUnit':{'lt':{'countKeywords':['HERETIC']}}}})
    wretch['manualCheck']=True

    unit('core-pilgrim-war-prophet','pilgrim',80,1,1,(37,12))
    unit('core-pilgrim-castigator','pilgrim',50,0,1,(38,6))
    communicant=unit('core-pilgrim-communicant','pilgrim',100,0,1,(38,18))
    communicant['fixedEquipment']=[{'name':'Крест Коммуниканта','category':'equipment','removable':False,'countsAs':['Железный капирот','Боевой шлем','Противогаз']}]
    unit('core-pilgrim-trooper','pilgrim',30,0,None,(39,11),name='Траншейный Паломник')
    martyr=unit('core-pilgrim-trooper','pilgrim',45,0,None,(39,11),row=1,name='Мученик-Покаянник',purchaseContext='resurrection-only')
    martyr['id']='core-pilgrim-martyr-penitent'
    martyr['rules'].update({'receivesInjuryDice':-1,'retainsPreviousEquipment':True,'losesCampaignScarsAndEliteUpgrades':True})
    prisoner=unit('core-pilgrim-prisoner','pilgrim',20,0,None,(40,7))
    prisoner.update({'allowedCategories':[],'equipmentLocked':True,'fixedEquipment':[{'name':'Железный капирот','category':'equipment','removable':False,'exceptRule':'Broken on the Wheel'}]})
    prisoner['rules'].update({'permittedOptionalEquipment':['Устройство Мученичества'],'unarmedPenaltyAlreadyInProfile':True})
    nun=unit('core-pilgrim-stigmatic-nun','pilgrim',50,0,4,(40,17))
    nun['rules'].update({'allowedRangedItemNames':['Пистолет','Автоматический пистолет','Боевой крест']})
    anchor=unit('core-pilgrim-anchorite','pilgrim',140,0,1,(41,13))
    anchor.update({'allowedCategories':[],'equipmentLocked':True,'fixedEquipment':[{'name':'Особый доспех Анахорета','category':'armour'},
        {'name':'Боевой шлем','category':'equipment'},{'name':'Колесо Екатерины','category':'melee','hands':1},
        {'name':'Костоломная Булава','category':'melee','hands':1}]})
    anchor['rules'].update({'maxAttacksPerActivation':2,'attacksExactlyOneEachFixedWeapon':True,
        'wheelInjuryPool':{'dice':3,'method':'sum-all'},'wheelVolunteer':{'source':'core-pilgrim-anchorite','phase':'before-battle','unitNames':['Траншейный Паломник','Церковный Узник']}})

    unit('core-sultanate-yuzbashi','sultanate',70,1,1,(54,11))
    unit('core-sultanate-jabirean-alchemist','sultanate',55,0,1,(55,4))
    unit('core-sultanate-assassin','sultanate',85,0,1,(55,13))
    unit('core-sultanate-azeb','sultanate',25,0,None,(56,8))
    sapper=unit('core-sultanate-sapper','sultanate',50,0,2,(56,18))
    sapper['fixedEquipment']=[{'name':'Лопата','category':'equipment','includedInCost':True,'removable':False}]
    lion=unit('core-sultanate-lion','sultanate',60,0,2,(57,11))
    lion['allowedCategories']=['armour','equipment']
    lion['rules'].update({'allowedEquipmentNames':['Амулет ветров'],'forbidShields':True,'noUnarmedPenalty':True,'injuryDiceAgainst':-1,
        'baseChoices':['30х60мм','50 мм']})
    unit('core-sultanate-janissary','sultanate',55,0,6,(58,4))
    bull=unit('core-sultanate-brazen-bull','sultanate',100,0,1,(58,33))
    bull['rules'].update({'weaponsMustHaveKeywords':['HEAVY'],'maxBullSpecificWeapons':2,'injuryDiceAgainst':-1,
        'trample':{'additionalMeleeAction':1,'onlyDowned':True,'targetBaseMaxMm':32,'countsAs':'Окопная дубинка','ignoreArmour':True}})
    hom=unit('core-sultanate-homunculus','sultanate',40,0,None,(63,11),variant='house-of-wisdom')
    hom.update({'equipmentLocked':True,'allowedCategories':[]})
    hom['rules'].update({'onePerAlchemist':True,'requiresBoundAlchemist':True,'cannotDeployWithoutLivingBoundAlchemist':True,
        'purchaseInDucatsInsteadOfGlory':True,'noUnarmedPenalty':True,'injuryDiceAgainst':-1,'recreateDucats':40})
    derived_unit('core-sultanate-master-assassin','Мастер-Ассасин','core-sultanate-assassin','fidai',95,1,1,['TOUGH'],
                 countsTowardsLimitOf='core-sultanate-assassin',aggregateLimit=3)
    dervish=derived_unit('core-sultanate-dervish','Дервиш','core-sultanate-janissary','fidai',55,0,4,keywords_remove=['STRONG'],
                        forbidItemNames=['Усиленная броня'],rangedAttackDiceAgainst=-1,noOffhandPenalty=True)
    faris=derived_unit('core-sultanate-faris','Фарис Дома Мудрости','core-sultanate-janissary','house-of-wisdom',55,0,2,['ELITE','STRONG'])
    kavass=derived_unit('core-sultanate-kavass','Кавасс','core-sultanate-azeb','house-of-wisdom',25,0,None,forbidUpgradeKinds=['skirmisher'])
    banshee=derived_unit('core-heretic-barbed-wire-banshee','Баньши из колючей проволоки','core-heretic-chorister','trench-ghosts',65,0,1,
                        removeAbilityNames=['Unholy Hymns'],replaceAbilityName='Death Wail')

    # Independent source records for the complete passive/action abilities. Their
    # text remains in the one canonical section, referenced by page and block.
    ability_blocks={
        'core-heretic-priest':[(22,[10,11])], 'core-heretic-death-commando':[(22,[19]),(23,[3,4])],
        'core-heretic-chorister':[(23,[14,15])], 'core-heretic-anointed':[(24,[16])],
        'core-heretic-warwolf':[(25,[7,8,10,11,12])], 'core-heretic-artillery-witch':[(26,[8,10,11])],
        'core-heretic-wretch':[(27,[11,12,13])], 'core-pilgrim-war-prophet':[(37,[9,10,11])],
        'core-pilgrim-castigator':[(37,[18]),(38,[4])], 'core-pilgrim-communicant':[(38,[12,14,15,16,17])],
        'core-pilgrim-trooper':[(39,[9])], 'core-pilgrim-prisoner':[(39,[16]),(40,[4,6])],
        'core-pilgrim-stigmatic-nun':[(40,[15,16])], 'core-pilgrim-anchorite':[(41,[7,8,10,11,12])],
        'core-sultanate-yuzbashi':[(54,[9,10])], 'core-sultanate-jabirean-alchemist':[(54,[17])],
        'core-sultanate-assassin':[(55,[10,11,12])], 'core-sultanate-sapper':[(56,[14,15,16,17])],
        'core-sultanate-lion':[(57,[8,9,10])], 'core-sultanate-janissary':[(57,[17]),(58,[3])],
        'core-sultanate-brazen-bull':[(58,[10,11,12,13,14])], 'core-sultanate-homunculus':[(63,[9,10])],
    }
    for uid,groups in ability_blocks.items():
        values=[]
        for n,ids in groups:
            for i in ids:
                raw=text(n,i,False)
                name=raw.split(':',1)[0].strip()
                aid=f'{uid}-ability-{len(values)+1}'
                values.append(aid)
                ENTITIES['abilities'].append({'id':aid,'name':name,'unitIds':[uid],'ruleId':uid,'source':source(n,[i],uid)})
        next(u for u in ENTITIES['units'] if u['id']==uid)['abilities']=values
    for u in ENTITIES['units']:
        if 'explicitProfileReference' in u:
            parent=next(v for v in ENTITIES['units'] if v['id']==u['explicitProfileReference']['unitId'])
            u['abilities']=parent.get('abilities',[])[:]
            if u['id']=='core-sultanate-dervish':
                u['abilities']=[aid for aid in u['abilities'] if not next(a for a in ENTITIES['abilities'] if a['id']==aid)['name'].startswith('Сильный')]
            if u['id']=='core-heretic-barbed-wire-banshee':
                u['abilities']=[aid for aid in u['abilities'] if 'Unholy Hymns' not in next(a for a in ENTITIES['abilities'] if a['id']==aid)['name']]
                aid='core-heretic-barbed-wire-banshee-death-wail'
                ENTITIES['abilities'].append({'id':aid,'name':'Смертельный вой (Death Wail)','unitIds':[u['id']],
                                             'ruleId':u['ruleId'],'source':source(29,[6,7],u['ruleId'])})
                u['abilities'].append(aid)

    # Weapon entries follow their displayed table; range values are kept as raw
    # strings, because e.g. the mortar has a contradictory textual restriction.
    for t in TABLES:
        if t['headers'][1]!='Тип':
            continue
        sid=t['sectionId']; r=[plain(v) for v in t['rows'][0]]
        cat='melee' if r[2]=='ББ' else 'ranged'
        ENTITIES['items'].append({'id':sid,'name':section(sid)['title'],'sourceTableName':r[0],'category':cat,
            'type':r[1],'hands':1 if 'Одноруч' in r[1] else 2 if 'Двуруч' in r[1] else 0 if r[1]=='Граната' else None,
            'range':r[2],'modifiers':r[3],'keywords':[] if r[4]=='-' else [x.strip() for x in r[4].split(',')],
            'source':t['source'],'ruleId':sid,'manualCheck':sid in ['core-pilgrim-trench-mortar','core-heretic-tartarus-claws']})
    extras=[
        ('core-heretic-tarnished-armour','armour',-2,0,['Боевой шлем','Противогаз']),
        ('core-heretic-standard-of-mammon','equipment',None,1,[]),('core-heretic-golden-calf-altar','equipment',None,None,[]),
        ('core-pilgrim-iron-capirote','equipment',None,0,[]),('core-pilgrim-holy-icon-armour','armour',-1,0,[]),
        ('core-pilgrim-sacrificial-lamb','equipment',None,0,[]),('core-sultanate-alchemist-armour','armour',-2,0,[]),
        ('core-sultanate-alchemical-ammunition','equipment',None,0,[]),('core-sultanate-cloak-of-alamut','equipment',None,0,[]),
        ('core-sultanate-wind-amulet','equipment',None,0,[]),('core-sultanate-marid-shovel','equipment',None,None,[]),
        ('core-sultanate-hashashin-leaf','equipment',None,0,[]),('core-sultanate-elixir','equipment',None,0,[]),
        ('core-sultanate-fire-shield','armour',-1,1,[]),
    ]
    for sid,cat,armour,hands,counts_as in extras:
        ENTITIES['items'].append({'id':sid,'name':section(sid)['title'],'category':cat,'armourModifier':armour,'hands':hands,
                                 'keywords':[],'countsAs':counts_as,'source':sref(sid),'ruleId':sid,'manualCheck':False})
    for sid,ks in [('core-heretic-golden-calf-altar',['HEAVY','CONSUMABLE']),('core-pilgrim-sacrificial-lamb',['CONSUMABLE']),
                   ('core-sultanate-marid-shovel',['HEAVY']),('core-sultanate-hashashin-leaf',['CONSUMABLE']),('core-sultanate-elixir',['CONSUMABLE'])]:
        next(i for i in ENTITIES['items'] if i['id']==sid)['keywords']=ks
    next(i for i in ENTITIES['items'] if i['id']=='core-pilgrim-iron-capirote')['headgear']=True
    next(i for i in ENTITIES['items'] if i['id']=='core-sultanate-fire-shield')['shield']=True
    next(i for i in ENTITIES['items'] if i['id']=='core-pilgrim-holy-icon-armour')['rules']={'injuryModifierEvenWhenArmourIgnored':-1,'stacksWithShield':True}
    next(i for i in ENTITIES['items'] if i['id']=='core-pilgrim-trench-mortar')['rules']={'rangeFromTable':'48”','targetPointRangeFromText':'36”','ignoreCover':True}

    # Explicit links between the three price tables and authored item sections.
    mappings={
        'heretic':{'Жертвенный нож':'core-heretic-sacrificial-knife','Богохульный посох':'core-heretic-staff',
                   'Адский меч':'core-heretic-hellblade','Когти Тартара':'core-heretic-tartarus-claws'},
        'pilgrim':{'Железный Капироте':'core-pilgrim-iron-capirote','Коктейль Молотова':'core-pilgrim-molotov',
                   'Боевой крест':'core-pilgrim-war-cross','Ружьё-пушка':'core-pilgrim-punt-gun','Противотанковый молот':'core-pilgrim-antitank-hammer'},
        'sultanate':{'Джеззайль':'core-sultanate-jezzail','Осадный Джеззайль':'core-sultanate-siege-jezzail','Алаибозан':'core-sultanate-alaybozan',
                    'Алебарда-пушка':'core-sultanate-halberd-gun','Бомбарда МУРАД':'core-sultanate-murad-bombard','Огненная пушка':'core-sultanate-flame-cannon',
                    'Титан Зульфикар':'core-sultanate-titan-zulfiqar','Кинжал Ассасина':'core-sultanate-assassins-dagger','Алхимические доспехи':'core-sultanate-alchemist-armour',
                    'Алхимические боеприпасы':'core-sultanate-alchemical-ammunition','Плащ Аламута':'core-sultanate-cloak-of-alamut',
                    'Амулет ветров':'core-sultanate-wind-amulet','Лопата Марида':'core-sultanate-marid-shovel'},
    }
    for o in ENTITIES['offers']:
        o['itemId']=mappings[o['factionId']].get(o['itemName'])
        low=o['priceText'].lower()
        o['restrictions']={'eliteOnly':'только для элиты' in low or 'только элиты' in low,
                           'nonEliteOnly':'не-элиты' in low or 'не для элиты' in low,
                           'sourceText':o['priceText']}
        o['manualCheck']=True if 'только' in low else False
    # Typed exceptions from the actual table cells.
    def offer(fid,name):
        return next(o for o in ENTITIES['offers'] if o['factionId']==fid and o['itemName']==name)
    for fid,name,uids in [('heretic','Когти Тартара',['core-heretic-death-commando']),('heretic','Контракт с Адом',['core-heretic-trooper']),
                         ('sultanate','Алаибозан',['core-sultanate-sapper']),('sultanate','Кинжал Ассасина',['core-sultanate-assassin','core-sultanate-master-assassin']),
                         ('sultanate','Зажигательная граната',['core-sultanate-jabirean-alchemist']),('sultanate','Бомбарда МУРАД',['core-sultanate-brazen-bull']),
                         ('sultanate','Огненная пушка',['core-sultanate-brazen-bull']),('sultanate','Титан Зульфикар',['core-sultanate-brazen-bull']),
                         ('sultanate','Лопата Марида',['core-sultanate-brazen-bull'])]:
        offer(fid,name)['restrictions']['allowedUnitIds']=uids
        offer(fid,name)['manualCheck']=False
    offer('heretic','Усиленная броня')['restrictions'].update({'eliteOnly':False,'keywordsOrUnits':{'keywords':['ELITE'],'unitIds':['core-heretic-anointed']}})
    for name in ['Усиленная броня','Снайперская винтовка']:
        offer('sultanate',name)['restrictions'].update({'eliteOnly':False,'keywordsOrUnits':{'keywords':['ELITE'],'unitIds':['core-sultanate-janissary']}})
    offer('sultanate','Алхимические боеприпасы')['restrictions']['requiresItemNames']=['Джеззайль','Осадный Джеззайль','Алаибозан','Алебарда-пушка']

    # Purchasable features have independent resource and availability records.
    upgrade('heretic-legionary-ranged','Легионер: дальний бой',10,'core-heretic-trooper',['core-heretic-trooper'],
            statChanges={'ranged':1},exclusiveGroup='legionary-specialty',limitRule={'fractionOfUnit':'core-heretic-trooper','numerator':1,'denominator':2,'round':'down'})
    upgrade('heretic-legionary-melee','Легионер: ближний бой',10,'core-heretic-trooper',['core-heretic-trooper'],
            statChanges={'melee':1},exclusiveGroup='legionary-specialty',limitRule={'fractionOfUnit':'core-heretic-trooper','numerator':1,'denominator':2,'round':'down'})
    upgrade('pilgrim-castigator-zealot-strength','Сила фанатика Карателя',5,'core-pilgrim-castigator',['core-pilgrim-castigator'],keywords=['STRONG'])
    upgrade('pilgrim-zealot-strength','Сила Фанатика Паломника',5,'core-pilgrim-trooper',['core-pilgrim-trooper'],keywords=['STRONG'],limit=1)
    upgrade('pilgrim-martyrdom-device','Устройство Мученичества',35,'core-pilgrim-prisoner',['core-pilgrim-prisoner'],keywords=['CONSUMABLE'],limit=4,consumable=True)
    upgrade('sultanate-skirmisher','Стрелок',5,'core-sultanate-azeb',['core-sultanate-azeb'],keywords=['SKIRMISHER'])
    upgrade('sultanate-ferocious-lion','Яростный Лев Джабира',5,'core-sultanate-lion',['core-sultanate-lion'],immuneToKeywords=['FEAR'])
    upgrade('heretic-naval-infiltrator','Незаметное продвижение',10,'core-heretic-naval-raiding-party',[],
            variantId='naval-raiding-party',factionId='heretic',forbiddenKeywords=['ELITE'],keywords=['INFILTRATOR'],limit=3)
    upgrade('heretic-ghost-sarcophagus-mine','Мина-Саркофаг',30,'core-heretic-trench-ghosts',[],variantId='trench-ghosts',factionId='heretic',
            limit=2,statSet={'armour':'-3'},locksEquipment=True)
    upgrade('heretic-ghost-mechanised-palanquin','Механизированный паланкин',60,'core-heretic-trench-ghosts',['core-heretic-priest'],
            variantId='trench-ghosts',keywords=['STRONG'],base='50 мм',countsAs='Машинная броня',platformHeight='2”')
    upgrade('pilgrim-wrath-of-god','Гнев Божий',15,'core-pilgrim-procession-of-sacred-affliction',['core-pilgrim-trooper','core-pilgrim-castigator'],
            variantId='procession-of-sacred-affliction',limit=1,noArmour=True,noRanged=True,allowShields=True,immuneToKeywords=['FEAR'],ignoreBloodMarkers=True)
    upgrade('sultanate-assassin-acolyte','Аколит-ассасин',10,'core-sultanate-fidai',['core-sultanate-azeb'],variantId='fidai',limit=3,keywords=['INFILTRATOR'])
    upgrade('sultanate-kavass-melee','Обученный Кавасс',5,'core-sultanate-house-of-wisdom',['core-sultanate-kavass'],variantId='house-of-wisdom',limit=3,statChanges={'melee':1})
    for suffix,name,price in [('hallucinogenic-camouflage','Галлюциногенный камуфляж',20),('thunderbolt','Громовержец Аламута',20),
                              ('time-mirage','Мираж времени',15),('secret-paths','Тайные пути',10)]:
        upgrade('sultanate-assassin-'+suffix,name,price,'core-sultanate-'+suffix,['core-sultanate-assassin','core-sultanate-master-assassin'],
                variantId='fidai',limit=1,exclusiveGroup='art-of-assassination',groupLimitPerModel=1)
    for suffix,name,price in [('medicine','Медицина',15),('cartography-geometry','Картография и геометрия',20),('secrets-of-takwin','Тайны Таквин',20),
                             ('chemistry-alchemy','Химия и алхимия',25),('philosophy-poetry-theology','Философия, поэзия и теология',20)]:
        upgrade('sultanate-house-'+suffix,name,price,'core-sultanate-'+suffix,['core-sultanate-jabirean-alchemist'],variantId='house-of-wisdom',
                limit=1,exclusiveGroup='house-secret',groupLimitPerModel=1)
    prices=[30,40,30,10,10,15,10,15,5,15,10,10,10,20,25]
    for (suffix,name,_,_),price in zip(FORMULAS,prices):
        upgrade('sultanate-formula-'+suffix,name,price,'core-sultanate-formula-'+suffix,['core-sultanate-homunculus'],
                variantId='house-of-wisdom',maxPerModel=1,persistent=True)
    formula=lambda suffix:next(u for u in ENTITIES['upgrades'] if u['id']=='sultanate-formula-'+suffix)
    formula('wings')['rules'].update({'statSet':{'movement':'8”/Полет'},'forbiddenUpgradeIds':['sultanate-formula-massive-size','sultanate-formula-human-hands']})
    formula('massive-size')['rules'].update({'base':'50 мм','keywords':['TOUGH'],'forbiddenUpgradeIds':['sultanate-formula-wings']})
    formula('human-hands')['rules'].update({'unlockWeaponPurchases':True,'forbidEliteItems':True,'forbidGrenades':True,
        'forbidUnitRestrictedWeapons':True,'allowedShieldNames':['Окопный щит','Огненный щит'],'forbiddenUpgradeIds':['sultanate-formula-wings']})
    formula('inhuman-strength')['rules'].update({'statChanges':{'melee':1},'keywords':['STRONG'],'base':'32 мм','baseWithMassiveSize':'50 мм'})
    formula('terrifying-appearance')['rules']['keywords']=['FEAR']
    formula('additional-arm')['rules'].update({'additionalRangedOrMeleeAction':1,'handsWithHumanHands':3,'oneOffhandWeaponOnly':True})
    formula('two-heads')['rules']['permitsBothEyeFormulas']=True
    for suffix,other in [('hypnotic-eyes','hawk-eyes'),('hawk-eyes','hypnotic-eyes')]:
        formula(suffix)['rules']['conditionalExclusion']={'otherUpgradeId':'sultanate-formula-'+other,'unlessUpgradeId':'sultanate-formula-two-heads'}
    formula('hawk-eyes')['rules']['statChanges']={'ranged':1}
    formula('seal-of-solomon')['rules'].update({'unlockEquipmentPurchases':True,'forbidEliteItems':True,'maxHeadgear':1})
    formula('gargantuan-size')['rules'].update({'requiresUpgradeIds':['sultanate-formula-human-hands','sultanate-formula-inhuman-strength','sultanate-formula-massive-size'],
                                               'base':'60 мм','allowedBullSpecificWeaponCount':1})
    for suffix,name,price in [('gas-filters','Газовые фильтры',5),('holy-diesel-engine','Святой дизельный двигатель',10),('sacred-geometry','Священная геометрия',10),
                             ('grand-anchorite','Великий Анахорет',15),('piston-legs','Поршневые ноги',10),('hallowed-anchorite','Освящённый Отшельник',10),
                             ('wrathful-cherub-face','Лик гневного херувима',20)]:
        upgrade('pilgrim-anchorite-'+suffix,name,price,'core-pilgrim-'+suffix,['core-pilgrim-anchorite'],variantId='saint-methodius',
                limit=1 if suffix in ['sacred-geometry','grand-anchorite','hallowed-anchorite'] else None,group='anchorite-special-equipment',groupLimitPerModel=2)
    next(u for u in ENTITIES['upgrades'] if u['id']=='pilgrim-anchorite-sacred-geometry')['rules']['statChanges']={'ranged':1}

    variants=[
        ('naval-raiding-party','Еретический десантный флот','heretic','core-heretic-naval-raiding-party',{
            'unitLimits':{'core-heretic-anointed':1,'core-heretic-artillery-witch':1,'core-heretic-warwolf':0},'dashDice':1,
            'offerChanges':[{'itemName':'Пистолет-пулемёт','cost':{'ducats':25,'glory':0}}]}),
        ('trench-ghosts','Призраки окопов','heretic','core-heretic-trench-ghosts',{
            'addKeywords':['FEAR'],'rangedInjuryDiceAgainst':-1,'ignoreDifficultTerrain':True,'ignoreExtraGasBlood':True,'banMercenaries':True,
            'forbiddenKeywords':['ARTIFICIAL'],'forbiddenItemNames':['Контракт с Адом','Адское Клеймо'],
            'removeFixedItemsWithoutRefund':['Контракт с Адом','Адское Клеймо'],'dashDistance':'3”','freeAttacksAgainstRetreatingDice':-1,
            'unitLimits':{'core-heretic-chorister':0},'replaceUnits':{'core-heretic-chorister':'core-heretic-barbed-wire-banshee'},'replacementAbility':{'removed':'Unholy Hymns','added':'Death Wail'}}),
        ('knights-of-avarice','Рыцари Алчности','heretic','core-heretic-knights-of-avarice',{
            'minimumModelDucats':80,'minimumExemptUnitIds':['core-heretic-wretch'],'forbiddenWeaponKeywords':['FIRE','SHRAPNEL'],
            'unitLimits':{'core-heretic-death-commando':0},'artilleryWitchGasBombs':True,'grenadeLauncherGasVariant':True,
            'foreignArsenalSelections':[{'factionId':'new-antioch','count':1},{'factionId':'sultanate','count':1}],
            'goeticWarlockDucats':110,'goeticWarlockRemainsMercenary':True,'campaignPatron':'Маммон','optionalPriestAbilityReplacement':'Price of Greed'}),
        ('procession-of-sacred-affliction','Процессия Священной Муки','pilgrim','core-pilgrim-procession-of-sacred-affliction',{
            'forbiddenItemNames':['Железный капирот'],'removeFixedItemsWithoutRefund':['Железный капирот'],
            'holyIconShield':{'cost':{'ducats':20,'glory':0},'eliteOnly':False,'exceptUnitIds':['core-pilgrim-anchorite']},
            'antiTankHammerEliteOnly':False,'unitUpgradeLimits':{'pilgrim-zealot-strength':3},
            'itemLimits':{'Пулемёт':0,'Ружьё-пушка':1},'extraMeleeInjuryDiceAgainstDowned':1,'extraMeleeInjuryExceptUnits':['core-pilgrim-prisoner']}),
        ('cavalcade-of-tenth-plague','Кавалькада Десятой Чумы','pilgrim','core-pilgrim-cavalcade-of-tenth-plague',{
            'unitLimits':{'core-pilgrim-prisoner':2,'core-pilgrim-martyr-penitent':0},
            'unitCostOverrides':{'core-pilgrim-communicant':{'ducats':0,'glory':3}},
            'forbiddenAbilityNames':['Laying on Hands'],'prophetReplacementAbility':'Day of his Wrath','oneBlessingAtStartOfEveryTurn':True}),
        ('saint-methodius','Военное Паломничество Святого Мефодия','pilgrim','core-pilgrim-saint-methodius',{
            'unitLimits':{'core-pilgrim-anchorite':2,'core-pilgrim-communicant':0,'core-pilgrim-stigmatic-nun':3,'core-pilgrim-martyr-penitent':0},
            'banMercenaryNames':['Коммуникант Истребитель Танков'],'forbiddenUpgradeIds':['pilgrim-martyrdom-device'],
            'forbiddenAbilityNames':['Broken on the Wheel'],'requiredArmourByUnit':{'core-pilgrim-stigmatic-nun':'Стандартная броня'},
            'statsByUnit':{'core-pilgrim-anchorite':{'ranged':'0'}},'anchoriteWeaponReplacement':{'slot':'Колесо Екатерины','count':1,'treatedAsHands':1},
            'offerChanges':[{'itemName':'Пулемёт','cost':{'ducats':50,'glory':0},'limit':2},{'itemName':'Автоматическая винтовка','cost':{'ducats':40,'glory':0},'limit':1},
                            {'itemName':'Пистолет-пулемёт','cost':{'ducats':30,'glory':0},'limit':1}], 'campaignPatron':'Ученый Святой'}),
        ('fidai','Фидаи Аламута – Кабал Ассасинов','sultanate','core-sultanate-fidai',{
            'unitLimits':{'core-sultanate-assassin':3,'core-sultanate-master-assassin':1,'core-sultanate-dervish':4,
                          'core-sultanate-yuzbashi':0,'core-sultanate-jabirean-alchemist':0,'core-sultanate-janissary':0,'core-sultanate-lion':0,'core-sultanate-brazen-bull':0},
            'unitMinimums':{'core-sultanate-yuzbashi':0,'core-sultanate-master-assassin':1},
            'aggregateLimits':[{'unitIds':['core-sultanate-assassin','core-sultanate-master-assassin'],'max':3}],
            'fireteamLimit':1,'fireteamModels':2,'fireteamAnyModels':True,'addKeywordsToFireteams':['FIRETEAM']}),
        ('house-of-wisdom','Дом Мудрости','sultanate','core-sultanate-house-of-wisdom',{
            'unitLimits':{'core-sultanate-jabirean-alchemist':2,'core-sultanate-lion':3,'core-sultanate-faris':2,
                          'core-sultanate-yuzbashi':0,'core-sultanate-assassin':0,'core-sultanate-janissary':0,'core-sultanate-azeb':0},
            'unitMinimums':{'core-sultanate-yuzbashi':0,'core-sultanate-jabirean-alchemist':1},
            'replaceUnits':{'core-sultanate-azeb':'core-sultanate-kavass','core-sultanate-janissary':'core-sultanate-faris'},
            'itemLimits':{'Алхимические доспехи':2},'forbiddenUpgradeIds':['sultanate-skirmisher'],
            'foreignWeaponCollection':{'factions':['new-antioch','pilgrim'],'requiresAbsentFromBaseArsenal':True,'manualCheck':True}}),
    ]
    for vid,name,fid,sid,rules in variants:
        ENTITIES['variants'].append({'id':vid,'name':name,'factionId':fid,'ruleId':sid,'source':sref(sid),
            'inheritance':'base-faction-with-explicit-exceptions','rules':rules,'manualCheck':vid in ['trench-ghosts','knights-of-avarice','house-of-wisdom']})

    # Additional prices outside the three base arsenals are first-class offers.
    extra_offers=[
        ('core-heretic-tarnished-armour','heretic','knights-of-avarice',45,0,1),('core-heretic-standard-of-mammon','heretic','knights-of-avarice',25,0,1),
        ('core-heretic-golden-calf-altar','heretic','knights-of-avarice',20,0,3),('core-heretic-coin-hammer','heretic','knights-of-avarice',20,0,2),
        ('core-pilgrim-holy-icon-armour','pilgrim','procession-of-sacred-affliction',30,0,None),('core-pilgrim-sacrificial-lamb','pilgrim','cavalcade-of-tenth-plague',5,0,None),
        ('core-pilgrim-trench-mortar','pilgrim','saint-methodius',40,0,None),('core-pilgrim-autocannon','pilgrim','saint-methodius',55,0,None),
        ('core-pilgrim-gas-censer','pilgrim','saint-methodius',50,0,None),('core-sultanate-golden-khanjar','sultanate','fidai',20,0,2),
        ('core-sultanate-bow-of-alamut','sultanate','fidai',50,0,1),('core-sultanate-hashashin-leaf','sultanate','fidai',5,0,4),
        ('core-sultanate-elixir','sultanate','house-of-wisdom',15,0,1),('core-sultanate-fire-shield','sultanate','house-of-wisdom',20,0,2),
    ]
    for sid,fid,vid,ducats,glory,limit in extra_offers:
        item=next(i for i in ENTITIES['items'] if i['id']==sid)
        ENTITIES['offers'].append({'id':sid+'-purchase','itemId':sid,'itemName':item['name'],'name':item['name'],'category':item['category'],
            'factionId':fid,'variantId':vid,'cost':{'ducats':ducats,'glory':glory},'limit':limit,'ruleId':sid,'source':sref(sid),
            'restrictions':{},'manualCheck':False})
    for sid,rule in [('core-pilgrim-holy-icon-armour',{'requiredKeywords':['ELITE']}),
                     ('core-pilgrim-sacrificial-lamb',{'forbiddenUnitIds':['core-pilgrim-prisoner']}),
                     ('core-sultanate-golden-khanjar',{'allowedUnitIds':['core-sultanate-assassin','core-sultanate-master-assassin']}),
                     ('core-sultanate-bow-of-alamut',{'allowedUnitIds':['core-sultanate-assassin','core-sultanate-master-assassin']}),
                     ('core-sultanate-elixir',{'forbiddenUnitIds':['core-sultanate-lion','core-sultanate-brazen-bull','core-sultanate-homunculus']})]:
        next(o for o in ENTITIES['offers'] if o['id']==sid+'-purchase')['restrictions']=rule
    for suffix,name,ducats,glory in [('heavy-flamethrower','Тяжёлый огнемёт',45,0),('antimateriel-rifle','Противотанковая винтовка',0,2),('punt-gun','Ружьё-пушка',10,0)]:
        sid='core-pilgrim-anchorite-'+suffix
        ENTITIES['offers'].append({'id':sid+'-purchase','itemId':None,'itemName':name,'name':name,'category':'ranged','factionId':'pilgrim',
            'variantId':'saint-methodius','cost':{'ducats':ducats,'glory':glory},'limit':None,'ruleId':sid,'source':sref(sid),
            'restrictions':{'allowedUnitIds':['core-pilgrim-anchorite'],'replacesFixedItemName':'Колесо Екатерины','treatedAsHands':1},'manualCheck':False})
    for sid in ['core-pilgrim-trench-mortar','core-pilgrim-autocannon','core-pilgrim-gas-censer']:
        next(o for o in ENTITIES['offers'] if o['id']==sid+'-purchase')['restrictions'].update({'allowedUnitIds':['core-pilgrim-anchorite'],
            'replacesFixedItemName':'Колесо Екатерины','treatedAsHands':1})
    for iss in ISSUES:
        ENTITIES['constraints'].append({'id':iss['id'],'message':iss['message'],'severity':'manual','source':{'document':'core','pages':iss['pages'],'sectionId':iss['sectionId']},'ruleId':iss['sectionId']})


def dump():
    illustrations={21,32,36,42,47,53,65}
    page_records=[]
    for n in range(18,66):
        linked=[s['id'] for s in SECTIONS if n in s['pages']]
        if n in illustrations:
            order=['Полностраничная иллюстрация; игровые правила отсутствуют.']
        elif n in (18,33,48):
            order=['Заголовок фракции.','Левая основная колонка; декоративная буквица включена в первое слово.','Правая основная колонка; на стр.33 она продолжает слово «Мученика-Покаянника».','Красный правый боковой блок — отдельная цитата/лор.']
        elif n in (19,34,49):
            order=['Левая колонка: продолжение лора, создание отряда и вводная арсенала (в указанном на странице порядке).','Правая таблица: названия слева, цена/валюта/ограничения справа; переносы внутри ячейки объединены.']
        elif n in (28,30,43,44,59,61):
            order=['Левая основная колонка сверху вниз.','Правая основная колонка сверху вниз; переходы предложения соединены в исходном разделе.','Варианты и отдельные предметы/способности разделены только по самостоятельным названиям оригинала.']
        else:
            order=['Основная текстовая область сверху вниз вокруг иллюстрации.','Профиль/таблица читается по строкам слева направо; переносы внутри ячеек объединены.','Цитаты и лор отделены от механик.']
        page_records.append({'pdfPage':n,'printedPage':n,'contentType':'illustration' if n in illustrations else 'rules-and-lore',
                             'readingOrder':order,'sectionIds':linked,'extractionStatus':'excluded-illustration' if n in illustrations else 'authored',
                             'visualInspection':{'agent':'factions_first','status':'inspected','image':f'tools/import-cache/reconstruction-first/{n:03}.png',
                                                 'notes':'Оригинальное изображение страницы непосредственно открыто через view_image; это первый авторский проход, не независимая проверка.'},
                             'independentReview':{'status':'pending'},'issues':[x['id'] for x in ISSUES if n in x['pages']]})
    missing=[]
    for n,blocks in PAGES.items():
        if n in illustrations:
            continue
        for i,b in enumerate(blocks):
            t=text(n,i,False)
            if t and 55<b['bbox'][1]<767 and (n,i) not in USED:
                missing.append({'page':n,'block':i,'text':t})
    # These are chapter titles/group labels already represented by section titles.
    allowed={(18,4),(22,3),(24,3),(31,8),(33,4),(37,3),(39,3),(48,4),(54,3),(56,3)}
    unexpected=[m for m in missing if (m['page'],m['block']) not in allowed]
    assert not unexpected,unexpected
    data={'schemaVersion':2,'author':'factions_first','document':'core','pageRange':[18,65],
          'sourcePdf':{'path':str(PDF.relative_to(ROOT)),'sha256':hashlib.sha256(PDF.read_bytes()).hexdigest()},
          'sections':SECTIONS,'entities':ENTITIES,'tables':TABLES,'pages':page_records,'issues':ISSUES,
          'coverage':{'unassignedSubstantiveBlocks':unexpected,'representedChapterLabels':missing,'independentReview':'pending'}}
    out=ROOT/'reconstruction/1.6.3/authored/factions-first.json'
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    print(f'Authored {len(SECTIONS)} sections, {len(TABLES)} tables; 48 visually inspected pages; independent review PENDING')


if __name__=='__main__':
    build_entities()
    dump()
