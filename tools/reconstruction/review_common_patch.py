"""Corrections/enrichment established by review_common's second image pass.

This is an explicit editorial recipe for this PDF, never a source parser or a
replacement for opening each page. It does not assign visual review statuses.
"""
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
PATH = ROOT / 'reconstruction/1.6.3/authored/core-common.json'
data = json.loads(PATH.read_text())
sections = {s['id']: s for s in data['sections']}

# Duplicate source headings were accidentally repeated in the authored body.
for key, duplicate in {
    'core-item-semi-automatic-rifle': '**Полуавтоматическая винтовка (Semi-Automatic Rifle)** ',
    'core-melee-weapons-intro': 'Оружие Ближнего Боя\n\n',
    'core-armour-intro': 'Броня\n\n',
    'core-equipment-intro': 'Экипировка\n\n',
}.items():
    s = sections[key]
    heading, body = s['markdown'].split('\n\n', 1)
    if body.startswith(duplicate):
        s['markdown'] = heading + '\n\n' + body[len(duplicate):]

# Spaces at font-span boundaries are editorial whitespace, not source words.
for s in data['sections']:
    s['markdown'] = s['markdown'].replace('на**успех действия**', 'на **успех действия**')
    s['markdown'] = s['markdown'].replace('DICE***ко всем', 'DICE*** *ко всем')
    s['markdown'] = s['markdown'].replace('(Trench Pilgrim)*получила', '(Trench Pilgrim) *получила')
    s['markdown'] = s['markdown'].replace('(Heretic Trooper)*стреляет', '(Heretic Trooper) *стреляет')

for key in ['core-bloodbath', 'core-falling', 'core-terrain', 'core-movement-types', 'core-melee']:
    s = sections[key]
    heading, body = s['markdown'].split('\n\n', 1)
    duplicate = '## ' + s['title'] + '\n\n'
    if body.startswith(duplicate):
        s['markdown'] = heading + '\n\n' + body[len(duplicate):]

s = sections['core-equipment-capacity']
for left, right in [('дальнобойных', 'оружий.'), ('ближнего', 'боя.'), ('носить один', 'комплект брони'), ('один тип', 'гранаты.'), ('любое количество', 'предметов экипировки'), ('траншейный щит),', 'который'), ('штандарт/знамя/флаг, который', 'всегда'), ('музыкальный инструмент, который', 'всегда')]:
    s['markdown'] = s['markdown'].replace(left + '\n\n' + right, left + ' ' + right)
sections['core-scenarios-general']['markdown'] = sections['core-scenarios-general']['markdown'].replace('флаги,\n\nмонеты', 'флаги, монеты')
sections['core-scenario-3']['markdown'] = sections['core-scenario-3']['markdown'].replace('целей для\n\nустранения', 'целей для устранения')

# Preserve source paragraphs from the single-column introduction.
s = sections['core-introduction']
for start in ['Мы рады представить', 'Благодарим за поддержку!', 'Этот черновик', 'Очевидно, что', 'Обратите внимание, что', 'Мы планируем выпустить', 'Для получения актуальных', 'Я надеюсь, что', 'Туомас Пиринен']:
    s['markdown'] = s['markdown'].replace(' ' + start, '\n\n' + start)

sections['core-dice']['markdown'] = sections['core-dice']['markdown'].replace('**Пример игрового процесса:**' + sections['core-dice']['markdown'].split('**Пример игрового процесса:**', 1)[1].split('\n\n', 1)[0], '**Пример игрового процесса:** *Модель Паломника стреляет по солдату Еретика из мушкета. Еретик находится в укрытии, что даёт штраф* **- 1 DICE** *ко всем атакам дальнего боя. Паломник бросает 3D6 и получает 5, 5 и 1. Два самых низких результата (1 и 5) составляют итоговый результат 6. Так как для попадания нужно было выбросить 7 или выше, выстрел промахнулся.*')
sections['core-bloodbath']['markdown'] = sections['core-bloodbath']['markdown'].split('**Пример игрового процесса:**', 1)[0] + '**Пример игрового процесса:** *Модель Паломников Траншей* (**Trench Pilgrim**) *получила ранение в ходе битвы и имеет два* **Маркера Крови**. *Солдат* Еретик (**Heretic Trooper**) *стреляет в Паломника из своей надёжной винтовки с затворным механизмом, бросает 8 и попадает! Игрок за Еретиков решает использовать один из Маркеров Крови, чтобы повысить вероятность нанесения ранения. Он бросает 3D6 (2D6* **+1 DICE** *за потраченный маркер) и обращается к* **Таблице ранений**. *Результаты бросков — 4, 5 и 1. Так как использовался* **+1 DICE**, *игрок выбирает два самых высоких числа, которые в сумме дают 9. Паломник выведен из строя!*\n'
sections['core-bloodbath']['markdown'] = sections['core-bloodbath']['markdown'].replace('(Down)', '(**Down**)')

# English game keywords remain English and are emphasized as required by the
# project. No letters, values or punctuation are normalized by this operation.
names = sorted({k['name'] for k in data['entities']['keywords']} | {'RISKY'}, key=len, reverse=True)
keyword_re = re.compile(r'(?<![A-Za-z])(?:' + '|'.join(re.escape(n) for n in names if n not in {'+DICE', '-DICE'}) + r')(?![A-Za-z])|(?<![A-Za-z])(?:[+−-]\s*\d*\s*DICE|\+/-\s*DICE)(?![A-Za-z])')
for s in data['sections']:
    parts = re.split(r'(\*\*[^*]+\*\*)', s['markdown'])
    s['markdown'] = ''.join(part if part.startswith('**') else keyword_re.sub(lambda m: '**' + m.group(0) + '**', part) for part in parts)

def source(pages, section_id):
    return {'document': 'core', 'pages': pages, 'sectionId': section_id}

items = {i['id']: i for i in data['entities']['items']}
for i in items.values():
    t = i.get('type', '')
    i['hands'] = 1 if t.startswith('Одноруч') else 2 if t.startswith('Двуруч') else None
    i['shield'] = None
    i['headgear'] = None
    i['armourModifier'] = None
    i['carriedHands'] = 0 if t == 'Граната' else None
    i['countsAsItemName'] = None
    i['prerequisites'] = []
    # Store full verified rule prose independently from flavour and profile.
    rule_match = re.search(r'\*\*Правила\*\*:\s*|\*\*Правила:\*\*\s*', sections[i['ruleId']]['markdown'])
    i['rules'] = {'text': sections[i['ruleId']]['markdown'][rule_match.end():].strip() if rule_match else '', 'source': i['source']}
    i['mechanicalFieldSources'] = {}
    if i['hands'] is not None:
        i['mechanicalFieldSources']['hands'] = dict(i['source'], evidence='Столбец Тип исходной таблицы')
    if t == 'Граната':
        i['mechanicalFieldSources']['carriedHands'] = source([13], 'core-keyword-grenade')

for key in ['trench-shield', 'heavy-ballistic-shield', 'holy-icon-shield']:
    i = items['core-item-' + key]
    i.update(hands=1, carriedHands=1, shield=True)
    for field in ['hands', 'carriedHands', 'shield']:
        i['mechanicalFieldSources'][field] = i['source']

for key, value in {'trench-shield': -1, 'standard-armour': -1, 'reinforced-armour': -2, 'machine-armour': -3, 'holy-icon-shield': -1, 'holy-icon-armour': -1}.items():
    i = items['core-item-' + key]
    i['armourModifier'] = value
    i['mechanicalFieldSources']['armourModifier'] = i['source']

for key in ['combat-helmet', 'iron-capirote']:
    i = items['core-item-' + key]
    i['headgear'] = True
    i['mechanicalFieldSources']['headgear'] = dict(i['source'], evidence='Название/описание прямо называет предмет шлемом')

for key in ['troop-flag', 'musical-instrument']:
    i = items['core-item-' + key]
    i.update(hands=1, carriedHands=1)
    for field in ['hands', 'carriedHands']:
        i['mechanicalFieldSources'][field] = source([118] + i['source']['pages'], i['ruleId'])

items['core-item-bayonet']['prerequisites'] = [{
    'kind': 'bayonet-lug', 'scope': 'attachment',
    'description': 'Может быть прикреплён только к оружию со штыковым креплением, как указано в Арсенале Войска.',
    'source': source([124], 'core-item-bayonet'),
}]
items['core-item-bayonet'].pop('excludedFromMeleeWeaponCapacity', None)
items['core-item-bayonet']['rules'].update(excludedFromMeleeCapacity=True, requiresBayonetLug=True)
for field in ['rules.excludedFromMeleeCapacity', 'rules.requiresBayonetLug']:
    items['core-item-bayonet']['mechanicalFieldSources'][field] = source([124], 'core-item-bayonet')

items['core-item-machine-armour']['prerequisites'] = [{
    'kind': 'incompatible-with-shield', 'description': 'Механизированная броня не сочетается с любыми щитами.',
    'source': source([127], 'core-item-machine-armour'),
}]
items['core-item-machine-armour']['rules']['disallowShields'] = True
items['core-item-machine-armour']['mechanicalFieldSources']['rules.disallowShields'] = source([127], 'core-item-machine-armour')
items['core-item-tartarus-claws']['prerequisites'] = [{
    'kind': 'exclusive-melee-use', 'description': 'Всегда идут парой и не позволяют использовать другие оружия ближнего боя.',
    'source': source([125], 'core-item-tartarus-claws'),
}]
for key in ['armour-piercing-bullets', 'dum-dum-bullets', 'incendiary-ammunition', 'tracer-bullets']:
    i = items['core-item-' + key]
    i['prerequisites'] = [{
        'kind': 'equipped-rifle-or-pistol', 'scope': 'use-before-battle',
        'description': 'Наделяет указанным эффектом одну винтовку или пистолет, которыми модель оснащена.',
        'source': i['source'],
    }]
items['core-item-sniper-scope']['prerequisites'] = [{
    'kind': 'rifle-name', 'scope': 'use', 'nameContains': 'винтовка',
    'description': 'Используется только с винтовками — оружием с словом «винтовка» в названии. Эффект прицела требует отсутствия движения в этой Активации.',
    'source': source([130], 'core-item-sniper-scope'),
}]
items['core-item-shovel'].update(hands=2, countsAsItemName='Окопная Дубинка', prerequisites=[{
    'kind': 'both-hands-free', 'scope': 'melee-use-only',
    'description': 'При обеих свободных руках может использоваться в ближнем бою как Окопная Дубина; переносимый предмет остаётся экипировкой.',
    'source': source([130], 'core-item-shovel'),
}])
for field in ['hands', 'countsAsItemName', 'prerequisites']:
    items['core-item-shovel']['mechanicalFieldSources'][field] = source([130], 'core-item-shovel')
items['core-item-shovel']['rules'].update(countsAsMeleeOnly=True, requiresBothHandsFree=True)
for key in ['trench-shield', 'heavy-ballistic-shield']:
    i = items['core-item-' + key]
    i['rules']['shieldCompatibleDoesNotOccupyHand'] = True
    i['mechanicalFieldSources']['rules.shieldCompatibleDoesNotOccupyHand'] = i['source']

new_issues = [
    ('core-charge-line-of-sight', [5, 7], 'Краткое описание Charge на p5 требует видимую цель; развёрнутое Нападение на p7 допускает отсутствие прямой видимости после РИСКОВАННОГО ДЕЙСТВИЯ. Оба текста сохранены; различие не устранено догадкой.'),
    ('core-turn-first-activation', [4, 11], 'На p4 игрок с меньшим количеством моделей на столе решает, кто начинает активации; на p11 игрок с меньшим количеством моделей в отряде сам начинает новый ход. Обе формулировки сохранены.'),
    ('core-source-typographical-errors', [9, 12, 125, 129], 'В оригинале встречаются «больгих» (p9), лишняя закрывающая скобка BLACK GRAIL (p12), «ДЕЙСТВИК» (p125) и «болгий Ада» (p129). Они сохранены в транскрипции, а не молча исправлены.'),
    ('core-scenario-glory-victory-wording', [135, 137, 139], 'В Славных подвигах источник сначала выдаёт Очко Славы, затем пишет «Очки победы за них можно получить только один раз». Формулировки сохранены; валюты не объединяются.'),
    ('core-scenario3-objective-type', [138, 139], 'Сценарий3 просит разместить три маркера Целей, но начисление контроля описывает нахождение внутри здания-Цели. Устройства/границы зданий на этих маркерах источник явно не задаёт.'),
    ('core-scenario4-mine-placement', [140, 141], 'Схема p140 отмечает область постановки мин шириной12дюймов рядом с зоной Обороняющегося; текст p141 говорит «не ближе12» от своей зоны. Схема и текст сохранены; направление ограничения не исправлено предположением.'),
    ('core-gas-mask-headgear-unspecified', [118, 129], 'Общее правило ограничивает один тип головного убора. Combat Helmet и Iron Capirote названы шлемами, но Gas Mask не классифицирован как головной убор; headgear для него оставлен null.'),
    ('core-scenario5-attacker-unspecified', [142, 143], 'Великая война предписывает начинать развёртывание с Атакующего, но не содержит назначения Атакующего. Схема подписывает обе стороны Player, поэтому роль не назначается автоматически.'),
    ('core-random-campaign-victory-minimum', [133, 162], 'Общие сценарии p133 дают победителю5ОП, если результат иначе указывает меньшее количество; генератор p162 говорит5ОП, «если результат не указывает меньшее». Обе исходные формулировки сохранены без выбора за игрока.'),
    ('core-field-artillery-not-provided', [147, 151], 'Сценарии отсылают к правилам Полевой Артиллерии для профиля Орудийной Башни/Мортиры. Сам раздел и эти профили отсутствуют в предоставленном основном PDF: повторный просмотр common-диапазона и поиск по свежему rawdict всего документа обнаружили только эти две отсылки. Не заменять их профильными миномётами фракций или другой редакцией.'),
]
existing = {i['id'] for i in data['issues']}
for key, pages, description in new_issues:
    if key not in existing:
        data['issues'].append({'id': key, 'document': 'core', 'pages': pages, 'description': description})

PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
print('Updated verified core item mechanics and editorial corrections; review status unchanged.')
