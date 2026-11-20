import { list, record, str, strings, type RecordValue } from './reconstruct-catalog.ts'

const claws = 'core-item-tartarus-claws'
const clawAlias = 'core-heretic-tartarus-claws'
const mortar = 'core-pilgrim-trench-mortar'
const standardMortar = 'core-item-trench-mortar'
const riskyAction = 'core-keyword-risky-action'
const risky = 'core-keyword-risky'
const anointed = 'core-heretic-anointed'
const house = 'core-sultanate-house-of-wisdom'
const yeoman = 'core-antioch-yeoman'

const assault =
  'If the target is taken Down or Out of Action by a Melee Attack made with Tartarus Claws, you can immediately move the model up to 3”. You can use this move to move within 1” another enemy model, and if you do so, this model can take another Fight ACTION. However, it cannot make the 3” move if the second attack takes the target Down or Out of Action.'
const assaultRu =
  'Если атака ближнего боя Когтями Тартара повалила или вывела цель из строя, модель может немедленно переместиться на расстояние до 3”. Она может использовать это перемещение, чтобы оказаться в пределах 1” от другой вражеской модели. В таком случае она может выполнить ещё одно **Fight ACTION** (Действие атаки ближнего боя). Если вторая атака повалила или вывела цель из строя, модель не может совершить это перемещение на 3”.'
const paired =
  'Когти Тартара всегда используются парой и не позволяют использовать другое оружие ближнего боя. Модель может выполнить две атаки Когтями за активацию без обычного штрафа **−1 DICE** для второй. Действие атаки после перемещения расходует оставшуюся атаку.'
const collectionText =
  '**Коллекция оружия (Weapon Collections):** При создании отряда выберите по одному оружию из базовых арсеналов Новой Антиохии и Траншейных Паломников. Оружия не должно быть в базовом арсенале Железного Султаната. Применяются стоимость и ограничения исходного арсенала. Потерянное оружие можно купить снова по указанной стоимости.'

const correctedIssues = new Set([
  'core-risky-keyword-alias',
  'core-source-typographical-errors',
  'source-hereti',
  'source-cumbersom',
  'source-mortar-range',
  'source-autocannon-row',
  'source-house-collection',
  'source-auto-pistole',
  'source-tartarus-claws-conflict',
  'core-issue-lieutenant-source-typo',
  'core-issue-grail-lord-source-typo',
])

// The checked transcriptions remain immutable evidence. These explicit corrections
// feed both the application compiler and the exported edition after the review gate.
export function applyRulesErrata(
  reviewed: { records: RecordValue[]; sections: RecordValue[] },
  originalLinks: RecordValue[],
) {
  const sections = structuredClone(reviewed.sections)
  const records = structuredClone(reviewed.records)
  const links = structuredClone(originalLinks)
  const section = (id: string) => {
    const entry = sections.find((s) => s.id === id)
    if (!entry) throw new Error(`Errata section missing: ${id}`)
    return entry
  }
  const entities = (group: string) => records.flatMap((r) => list(record(r.entities)[group]))
  const entity = (group: string, id: string) => {
    const entry = entities(group).find((e) => e.id === id)
    if (!entry) throw new Error(`Errata entity missing: ${group}/${id}`)
    return entry
  }
  const edit = (id: string, before: string | RegExp, after: string) => {
    const entry = section(id)
    const markdown = str(entry.markdown)
    const next = markdown.replace(before, after)
    if (markdown === next) throw new Error(`Errata no longer matches ${id}: ${before}`)
    entry.markdown = next
  }

  edit(anointed, /\bHERETI\b/g, 'HERETIC')
  const anointedUnit = entity('units', anointed)
  anointedUnit.keywords = strings(anointedUnit.keywords).map((key) =>
    key === 'HERETI' ? 'HERETIC' : key,
  )
  anointedUnit.manualCheck = false
  edit('core-injuries', 'больгих', 'больших')
  edit('core-keyword-black-grail', 'Грааля").', 'Грааля".')
  edit('core-antioch-lieutenant', 'ДЕЙСВТИЕ', 'ДЕЙСТВИЕ')
  edit('core-grail-lord', 'дубиркой', 'дубинкой')
  edit('core-heretic-trooper', 'по стоимость +10', 'стоимостью +10')
  for (const id of ['heretic-legionary-ranged', 'heretic-legionary-melee']) {
    const ratio = record(record(entity('upgrades', id).rules).limitRule)
    delete ratio.fractionOfUnit
    ratio.fractionOfWarband = true
  }
  edit('core-pilgrim-autocannon', '| Пулемёт |', '| Автопушка |')
  entity('items', 'core-pilgrim-autocannon').sourceTableName = 'Автопушка'
  edit('core-pilgrim-arsenal', '| Автоматический пистоле |', '| Автоматический пистолет |')
  const pistol = entity('offers', 'pilgrim-offer-04')
  pistol.name = pistol.itemName = 'Автоматический пистолет'
  pistol.itemId = 'core-item-automatic-pistol'
  const pistolLink = links.find((link) => link.name === 'Автоматический пистоле')
  if (pistolLink) {
    pistolLink.name = pistol.name
    pistolLink.note = 'Название предложения исправлено по заголовку полного профиля.'
  }
  edit('core-sultanate-azeb', /SKIRMISHER\.\)/g, 'SKIRMISHER)')
  edit('core-sultanate-azeb', 'Стрелок Аzeb', 'Стрелок Азеб')
  edit(house, /SKIRMISHER\.\)/g, 'SKIRMISHER)')
  edit('core-heretic-naval-raiding-party', '**Незаметное продвижение:**', '**Infiltrato:**')
  entity('upgrades', 'heretic-naval-infiltrator').name = 'Infiltrato'

  const originalClaws = section(claws)
  edit(claws, '| **-** |', '| **CUMBERSOME** |')
  edit(
    claws,
    /\*\*Правила\*\*:[\s\S]*$/,
    `**Парное оружие.** ${paired}\n\n**Harrowing Assault**\n\n${assaultRu}\n\n> ${assault}\n`,
  )
  originalClaws.pages = [20, 125]
  const oldClaws = section(clawAlias)
  oldClaws.canonicalRuleId = claws
  oldClaws.markdown = `# Когти Тартара\n\n[Действующий профиль Когтей Тартара](#/rules/${claws}).\n`
  const clawItem = entity('items', claws)
  clawItem.source = { document: 'core', pages: [20, 125], sectionId: claws }
  clawItem.keywords = ['CUMBERSOME']
  clawItem.rawKeywords = 'CUMBERSOME'
  const table = clawItem.tableRows as string[][]
  table[1]![4] = '**CUMBERSOME**'
  clawItem.rules = {
    text: paired,
    harrowingAssault: { english: assault, russian: assaultRu },
    source: clawItem.source,
  }
  entity('items', clawAlias) // fail if the superseded profile has moved
  for (const offer of entities('offers').filter((o) => o.itemId === clawAlias)) {
    offer.itemId = claws
    offer.manualCheck = false
    delete offer.sourceConflictId
  }

  const oldMortar = section(mortar)
  const mortarItem = entity('items', mortar)
  const standardSection = {
    ...oldMortar,
    id: standardMortar,
    title: 'Траншейный миномёт',
    category: 'Дальнобойное оружие',
    markdown: str(oldMortar.markdown).replace(' 40 дукатов', '').replace('| 48” |', '| 36” |'),
  }
  sections.push(standardSection)
  const generalMortar = {
    ...mortarItem,
    id: standardMortar,
    englishName: 'Trench Mortar',
    range: '36”',
    source: { ...record(mortarItem.source), sectionId: standardMortar },
    ruleId: standardMortar,
    manualCheck: false,
    rules: { ignoreCover: true, targetPointRangeInches: 36 },
  }
  oldMortar.title = 'Траншейный миномёт Анахорета'
  edit(mortar, /Траншейный миномёт(?=\n| \(| \|)/g, 'Траншейный миномёт Анахорета')
  edit(mortar, 'в пределах 36”', 'в пределах 48”')
  edit(
    mortar,
    '**Правила**:',
    '**Доступ.** Только Святилище Анахорет в Военном Паломничестве Святого Мефодия.\n\n**Правила**:',
  )
  Object.assign(mortarItem, {
    name: oldMortar.title,
    englishName: 'Anchorite Trench Mortar',
    sourceTableName: oldMortar.title,
    manualCheck: false,
    rules: { ignoreCover: true, targetPointRangeInches: 48 },
  })
  const mortarOffer = entity('offers', 'core-pilgrim-trench-mortar-purchase')
  mortarOffer.name = mortarOffer.itemName = oldMortar.title

  const variant = entity('variants', 'house-of-wisdom')
  const variantRules = record(variant.rules)
  variantRules.foreignWeaponCollection = {
    factions: ['antioch', 'pilgrim'],
    countPerFaction: 1,
    requiresAbsentFromBaseArsenal: true,
  }
  variant.manualCheck = false
  edit(house, /\*\*Коллекции оружия \(Weapon Collections\):\*\*[^\n]+/, collectionText)
  for (const id of [yeoman, 'core-antioch-trench-mole']) {
    const compulsory = record(entity('units', id).compulsoryPurchase)
    record(compulsory.replacement).refundDucatsForGloryWeapon = true
  }
  edit(
    yeoman,
    'Если стоимость выше, вы должны оплатить разницу в дукатах.',
    'Если стоимость выше, вы должны оплатить разницу в дукатах. При замене винтовки оружием за Очки Славы верните в бюджет 5 дукатов за винтовку и оплатите новое оружие по его цене.',
  )

  const riskyArticle = section(riskyAction)
  sections.push({
    ...riskyArticle,
    id: risky,
    title: 'RISKY',
    pages: [13, 121, 125],
    markdown:
      '# **RISKY**\n\n**RISKY** в профиле оружия обозначает [**RISKY ACTION**](#/rules/core-keyword-risky-action). При провале броска на успех этого действия активация модели немедленно заканчивается.\n',
  })
  const core = records.find((r) =>
    list(record(r.entities).keywords).some((k) => k.id === riskyAction),
  )!
  const coreEntities = record(core.entities)
  coreEntities.keywords = [
    ...list(coreEntities.keywords),
    {
      id: risky,
      name: 'RISKY',
      ruleId: risky,
      source: { document: 'core', pages: [13, 121, 125], sectionId: risky },
    },
  ]
  coreEntities.items = [...list(coreEntities.items), generalMortar]

  for (const entry of records) {
    const groups = record(entry.entities)
    if (Array.isArray(groups.items))
      groups.items = list(groups.items).filter((i) => i.id !== clawAlias)
    if (Array.isArray(groups.constraints))
      groups.constraints = list(groups.constraints).filter((i) => !correctedIssues.has(str(i.id)))
    entry.issues = list(entry.issues).filter((i) => !correctedIssues.has(str(i.id)))
  }
  return { sections, records, links }
}
