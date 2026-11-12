import { CatalogSchema, SourceSchema, type Catalog, type SourceRef } from '../src/domain/schema.ts'

export type RecordValue = Record<string, unknown>
export const record = (value: unknown): RecordValue =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
export const list = (value: unknown): RecordValue[] =>
  Array.isArray(value) ? value.map(record) : []
export const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []
export const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback
const numeric = (value: unknown, fallback: number | null = null): number | null =>
  typeof value === 'number' ? value : fallback
const norm = (value: string) => value.toLowerCase().replaceAll('ё', 'е').replace(/[^а-яa-z0-9]+/g, '')
const unique = <T>(values: T[]): T[] => [...new Set(values)]
export function sourceOf(value: unknown): SourceRef {
  const ref = record(value)
  return SourceSchema.parse({ ...ref, source: ref.document ?? ref.source })
}
const ruleOf = (value: RecordValue) => str(value.ruleId, str(record(value.source).sectionId))
const allCategories = ['ranged', 'melee', 'armour', 'equipment']
const factionAlias: Record<string, string> = {
  heretic: 'heretic', pilgrim: 'pilgrim', pilgrims: 'pilgrim', sultanate: 'sultanate',
  'core-antioch': 'antioch', 'new-antioch': 'antioch', antioch: 'antioch',
  'core-grail': 'grail', grail: 'grail', 'core-court': 'court', court: 'court',
}
export const factionKey = (value: unknown) => factionAlias[str(value)] ?? str(value)
const factionImages: Record<string, string> = {
  heretic: 'art/heretic.jpeg', pilgrim: 'art/pilgrims.jpeg',
  sultanate: 'art/sultanate.jpeg', antioch: 'art/antioch.jpeg',
  grail: 'art/grail.jpeg', court: 'art/court.jpeg',
}

export function reconstructCatalog(records: RecordValue[], edition: string, revision: string,
  confirmedLinks: Record<string, string> = {}, linkDefinitions: RecordValue[] = [], integrationIssues: RecordValue[] = []): { catalog: Catalog; unresolvedLinks: RecordValue[] } {
  const group = (key: string) => records.flatMap((r) => list(record(r.entities)[key]))
  const rawFactions = group('factions'), rawItems = group('items'), rawUnits = group('units')
  const unresolvedLinks: RecordValue[] = []
  const normalizedItems: RecordValue[] = rawItems.map((item) => {
    const type = str(item.type)
    return {
      ...item, englishName: item.englishName ?? null, category: item.category,
      hands: Object.hasOwn(item, 'hands') ? item.hands : /^одно[рp]уч/i.test(type) ? 1 : /^двуруч/i.test(type) ? 2 : null,
      range: item.range ?? null, modifiers: item.modifiers ?? null, keywords: strings(item.keywords),
      shield: item.shield, headgear: item.headgear,
      source: sourceOf(item.source), ruleId: ruleOf(item), definition: { ...item,
        aliases: unique([...strings(item.aliases), ...linkDefinitions.filter((link) => link.itemId === item.id && link.status !== 'unresolved').map((link) => str(link.name))]),
      },
    }
  })
  const aliases = (item: RecordValue) => unique([
    str(item.name), str(item.englishName), str(item.profileName), str(item.sourceTableName),
    ...strings(item.aliases), ...list(item.tableRows).map((r) => str(r[0])),
    ...(Array.isArray(item.tableRows) && Array.isArray(item.tableRows[1]) ? [str(item.tableRows[1][0])] : []),
  ].filter(Boolean).map(norm))
  function localFaction(item: RecordValue) {
    const id = str(item.id)
    if (id.startsWith('core-heretic-')) return 'heretic'
    if (id.startsWith('core-pilgrim-')) return 'pilgrim'
    if (id.startsWith('core-sultanate-')) return 'sultanate'
    if (id.startsWith('core-grail-') || id.startsWith('core-dirge-')) return 'grail'
    if (id.startsWith('core-court-')) return 'court'
    if (/^core-(prussia|alba|abyssinia|antioch)-/.test(id)) return 'antioch'
    return ''
  }
  function findItem(name: string, faction = '', explicitId = ''): RecordValue | undefined {
    if (explicitId) {
      const explicit = normalizedItems.find((i) => i.id === explicitId)
      if (explicit) return explicit
    }
    const link = confirmedLinks[`${faction}:${name}`] ?? confirmedLinks[name]
    if (link) {
      const linked = normalizedItems.find((i) => i.id === link)
      if (!linked) throw new Error(`Confirmed link points to absent item: ${name} -> ${link}`)
      return linked
    }
    const matches = normalizedItems.filter((i) => record(i.definition).status !== 'profile-link-unresolved' && aliases(i).includes(norm(name)))
    return matches.find((i) => localFaction(i) === faction)
      ?? matches.find((i) => str(i.id).startsWith('core-item-'))
      ?? (matches.length === 1 ? matches[0] : undefined)
  }
  const findItemId = (name: string, faction: string) => str(findItem(name, faction)?.id)
  const namesToItems = (names: unknown, faction: string) => unique(strings(names).map((name) => findItemId(name, faction)).filter(Boolean))
  const idMap = (value: unknown) => Object.fromEntries(Object.entries(record(value)).map(([k, v]) => [k, v]))
  const factions: RecordValue[] = rawFactions.map((f) => {
    const id = factionKey(f.id)
    return {
      ...f, id, source: sourceOf(f.source), ruleId: ruleOf(f),
      arsenalRuleId: f.arsenalRuleId ?? f.arsenalSectionId,
      image: f.image ?? factionImages[id],
      specialRuleIds: unique([...strings(f.specialRuleIds), ...strings(f.specialRuleSectionIds)]),
      definition: { ...f, rules: { ...record(f.rules), ...(typeof f.fireteamLimit === 'number'
        ? { fireteam: { size: 2, excludeMercenaries: true, source: f.source } } : {}) } },
    }
  })
  const variants = group('variants').map((v) => {
    const rules = { ...v, ...record(v.rules) }
    const factionId = factionKey(v.factionId)
    const limits = { ...idMap(rules.unitLimits), ...Object.fromEntries(strings(rules.bannedUnitIds).map((id) => [id, 0])) }
    const overrides: Record<string, RecordValue> = {}
    for (const change of list(rules.offerChanges)) {
      const itemId = findItemId(str(change.itemName), factionId)
      if (itemId) overrides[itemId] = { ...overrides[itemId], ...change }
    }
    for (const [name, limit] of Object.entries(record(rules.itemLimits ?? rules.offerLimitsByName))) {
      const itemId = findItemId(name, factionId)
      if (itemId) overrides[itemId] = { ...overrides[itemId], limit }
    }
    for (const [name, cost] of Object.entries(record(rules.offerCostsByName))) {
      const itemId = findItemId(name, factionId)
      if (itemId) overrides[itemId] = { ...overrides[itemId], cost }
    }
    const unitCosts = { ...record(rules.unitCostOverrides), ...(typeof rules.goeticWarlockDucats === 'number'
      ? { 'allies-goetic-warlock': { ducats: rules.goeticWarlockDucats, glory: 0 } } : {}) }
    return {
      ...v, source: sourceOf(v.source), ruleId: ruleOf(v), factionId,
      manualCheck: Boolean(v.manualCheck) || strings(rules.unresolvedRuleIds).length > 0,
      unitLimits: limits, unitMinimums: record(rules.unitMinimums),
      unitCostOverrides: unitCosts, offerOverrides: overrides,
      banMercenaries: rules.banMercenaries,
      banKeywords: strings(rules.forbiddenKeywords),
      banItemIds: namesToItems(rules.forbiddenItemNames ?? rules.bannedItemNames, factionId),
      keywords: strings(rules.addKeywords),
      minimumModelDucats: rules.minimumModelDucats,
      minimumCostExempt: rules.minimumExemptUnitIds,
      banWeaponKeywords: rules.forbiddenWeaponKeywords,
      banUpgradeIds: rules.forbiddenUpgradeIds,
      fireteamLimit: rules.fireteamLimit,
      heavyRangedLimit: rules.rangedHeavyWeaponLimit,
      definition: { ...v, rules: { ...rules, unitCostOverrides: unitCosts,
        ...(typeof rules.goeticWarlockDucats === 'number' ? { affectsMercenaryUnitIds: ['allies-goetic-warlock'] } : {}) } },
    }
  })
  const offers = group('offers').map((o) => {
    const factionId = factionKey(o.factionId)
    const name = str(o.itemName, str(o.name))
    const linkDefinition = linkDefinitions.find((link) => link.name === name && (!link.factionId || link.factionId === factionId))
    let item = findItem(name, factionId, str(o.itemId))
    if (!item) {
      const id = `${str(o.id)}-unresolved-profile`
      unresolvedLinks.push({ offerId: o.id, name, factionId, source: o.source })
      item = {
        id, name, englishName: null, category: o.category, hands: null, range: null,
        modifiers: null, keywords: [], source: sourceOf(o.source), ruleId: ruleOf(o),
        unresolved: true, definition: { status: 'profile-link-unresolved', offerId: o.id },
      }
      normalizedItems.push(item)
    }
    const restrictions = record(o.restrictions)
    const either = record(o.keywordsOrUnits ?? restrictions.keywordsOrUnits)
    const factionRules = record(rawFactions.find((f) => factionKey(f.id) === factionId)?.rules)
    const rawLimitScope = o.limitScope ?? factionRules.arsenalLimitScope
    return {
      ...o, factionId, itemId: item.id, source: sourceOf(o.source), ruleId: ruleOf(o),
      limit: numeric(o.limit), notes: str(o.notes, str(restrictions.sourceText, str(o.priceText))),
      allowedUnitIds: Array.isArray(o.allowedUnitIds) ? o.allowedUnitIds : restrictions.allowedUnitIds ?? either.unitIds ?? null,
      requiredKeywords: unique([...strings(o.requiredKeywords), ...strings(restrictions.requiredKeywords), ...strings(either.keywords), ...(restrictions.eliteOnly ? ['ELITE'] : [])]),
      forbiddenKeywords: unique([...strings(o.forbiddenKeywords), ...strings(restrictions.forbiddenKeywords), ...(restrictions.nonEliteOnly ? ['ELITE'] : [])]),
      keywordsOrUnits: typeof o.keywordsOrUnits === 'boolean' ? o.keywordsOrUnits : Object.keys(either).length > 0,
      requiresItemIds: namesToItems(o.requiresItemNames ?? restrictions.requiresItemNames, factionId),
      manualCheck: Boolean(o.manualCheck) || Boolean(item.unresolved) || linkDefinition?.status === 'documented-assumption',
      definition: { ...o, ...(linkDefinition ? { profileLink: linkDefinition } : {}) },
      limitScope: ['campaign', 'warband'].includes(str(rawLimitScope)) ? rawLimitScope : 'unspecified',
    }
  })
  const units = rawUnits.map((u) => {
    const factionId = u.factionId ? factionKey(u.factionId) : null
    const rules = { ...record(u.rules) }, allowed = record(u.allowedEquipment)
    if (rules.requiresBoundAlchemist) rules.boundUnitId = 'core-sultanate-jabirean-alchemist'
    const swornSword = list(u.abilityRefs).find((ability) => str(ability.name).includes('Sworn Sword'))
    if (swornSword) rules.fireteam = { additional: true, partnerRequiredKeywords: ['ELITE'], source: swornSword.source }
    const martialProwess = list(u.abilityRefs).find((ability) => str(ability.name).includes('Martial Prowess'))
    if (martialProwess) rules.fixedWeaponTraits = [{ name: 'Джезайл', shieldCompatible: true, addKeywords: ['ASSAULT'], source: martialProwess.source }]
    let categories = Array.isArray(u.allowedCategories) ? strings(u.allowedCategories)
      : Array.isArray(allowed.categories) ? strings(allowed.categories) : allCategories
    if (allowed.ranged && !categories.includes('ranged')) categories = [...categories, 'ranged']
    const policy = str(u.equipmentPolicy)
    if (policy === 'fixed' || policy === 'personal-loadout') categories = []
    if (policy === 'weapons-fixed') categories = ['armour', 'equipment']
    if (policy === 'one-unrestricted-melee') categories = ['melee']
    const fixed = (Array.isArray(u.fixedEquipment) ? u.fixedEquipment : []).map((value) => {
      const info = record(value), name = typeof value === 'string' ? value : str(info.name)
      const item = findItem(name, factionId ?? '')
      return { name, category: str(info.category, str(item?.category, /брон|доспех/i.test(name) ? 'armour' : 'equipment')) }
    })
    const explicitItemNames = allowed.itemNames ?? rules.allowedEquipmentNames
    if (Array.isArray(explicitItemNames)) categories = []
    const conditional = record(rules.conditionalMax)
    const profileRows = Array.isArray(u.profileRows) ? u.profileRows : [Object.values(record(u.stats))]
    const unit: RecordValue = {
      ...u, factionId, variantId: u.variantId || undefined, mercenary: Boolean(u.mercenary),
      source: sourceOf(u.source), ruleId: ruleOf(u), profileRows,
      keywords: strings(u.keywords), fixedItems: fixed, allowedCategories: categories,
      equipmentLocked: policy === 'fixed' || policy === 'personal-loadout' || Boolean(u.equipmentLocked),
      manualCheck: Boolean(u.manualCheck) || ['unspecified', 'weapons-fixed'].includes(policy),
      max: numeric(u.max), min: numeric(u.min, 0),
      allowedItemIds: Array.isArray(explicitItemNames) ? namesToItems(explicitItemNames, factionId ?? '') : u.allowedItemIds,
      forbiddenItemIds: namesToItems(allowed.forbiddenItemNames ?? rules.forbidItemNames, factionId ?? ''),
      rangedItemIds: namesToItems(rules.allowedRangedItemNames, factionId ?? ''),
      maxItemDucats: rules.maxItemDucats ?? allowed.maxItemDucats,
      requireWeapon: Boolean(rules.requireWeapon) || list(u.equipmentRequirements).some((r) => r.kind === 'atLeastOne' && strings(r.categories).includes('melee')),
      requireArmour: list(u.equipmentRequirements).some((r) => r.category === 'armour' && r.kind === 'atLeastOne'),
      abilityIds: unique([...strings(u.abilities), ...strings(u.abilityIds)]),
      linkedRuleIds: unique([str(record(u.explicitProfileReference).unitId), str(u.inheritsFromUnitId), str(u.inheritsUnitId), str(u.derivesFromUnitId)].map((id) => ruleOf(rawUnits.find((x) => x.id === id) ?? {})).filter(Boolean)),
      powerMin: record(u.powerPurchase).min,
      powerMax: record(u.powerPurchase).max,
      loadoutGroups: list(u.loadoutGroups).map((g) => ({ ...g, source: sourceOf(g.source) })),
      allowedFactions: Array.isArray(u.allowedFactionNames) ? strings(u.allowedFactionNames).map((name) => {
        const f = factions.find((x) => norm(str(x.name)) === norm(name) || (name.includes('Грааля') && x.id === 'grail'))
        if (!f) throw new Error(`Unknown explicit allied faction ${name}`)
        return str(f.id)
      }) : undefined,
      definition: { ...u, rules: { ...rules, ...(Object.keys(conditional).length ? { conditionalMax: conditional } : {}) } },
    }
    if (unit.equipmentLocked) unit.allowedCategories = []
    return unit
  })
  const derivedAbilities: RecordValue[] = []
  const rawAbilities = group('abilities')
  // Explicit child lists include the editor's exclusions; never re-add removed abilities.
  for (const unit of units) {
    const definition = record(unit.definition)
    const parentId = str(definition.inheritsFromUnitId, str(record(definition.explicitProfileReference).unitId, str(definition.inheritsUnitId)))
    const parent = units.find((candidate) => candidate.id === parentId)
    if (parent && !Object.hasOwn(definition, 'abilities') && !Object.hasOwn(definition, 'abilityIds'))
      unit.abilityIds = unique([...strings(parent.abilityIds), ...strings(unit.abilityIds)])
    const replacements = record(record(record(definition.inheritance).exceptions).replaceAbilityNames)
    const removedNames = [...Object.keys(replacements), ...strings(record(definition.rules).removeAbilityNames)]
    unit.abilityIds = strings(unit.abilityIds).filter((id) => {
      const name = str(rawAbilities.find((ability) => ability.id === id)?.name)
      return !removedNames.some((removed) => name.includes(removed))
    })
    for (const replacement of Object.values(replacements)) {
      const name = str(replacement)
      const existing = rawAbilities.find((ability) => str(ability.name).includes(name))
      const id = existing ? str(existing.id) : `${str(unit.id)}-replacement-${norm(name)}`
      if (!existing) derivedAbilities.push({ id, name, source: unit.source, ruleId: unit.ruleId, unitIds: [unit.id] })
      unit.abilityIds = unique([...strings(unit.abilityIds), id])
    }
  }
  const upgrades = group('upgrades').map((up) => {
    const rules = { ...record(up.effects), ...record(up.rules) }
    if (up.id === 'allies-dog-fireteam') rules.fireteam = { additional: true, partnerAny: true, source: up.source }
    const statChanges = { ...record(up.statChanges), ...record(rules.statChanges) }
    if (typeof statChanges.rangedDice === 'number') statChanges.ranged = statChanges.rangedDice
    if (typeof statChanges.meleeDice === 'number') statChanges.melee = statChanges.meleeDice
    delete statChanges.rangedDice; delete statChanges.meleeDice
    const power = up.kind === 'goeticPower'
    const unitIds = strings(up.unitIds)
    if (power) {
      const eligibility = str(up.eligibility)
      unitIds.push(...units.filter((u) => u.factionId === 'court' && (
        eligibility === 'sorcerer' ? str(u.id).endsWith('-sorcerer') :
        eligibility === 'praetor-or-sorcerer' ? /-(praetor|sorcerer)$/.test(str(u.id)) :
        eligibility === 'ELITE' ? strings(u.keywords).includes('ELITE') : Boolean(record(record(u.definition).powerPurchase).max)
      )).map((u) => str(u.id)))
    }
    const owner = units.find((u) => u.id === unitIds[0])?.factionId
    const factionId = up.factionId ? factionKey(up.factionId) : rules.factionId ? factionKey(rules.factionId) : typeof owner === 'string' ? owner : null
    return {
      ...up, source: sourceOf(up.source), ruleId: ruleOf(up), cost: up.cost,
      factionId: factionId || null, variantId: up.variantId || null, unitIds: unique(unitIds),
      group: up.group ?? rules.exclusiveGroup ?? rules.group ?? null,
      groupLimitPerModel: rules.groupLimitPerModel ?? 1,
      limit: numeric(up.limit), keywords: unique([...strings(up.keywords), ...strings(rules.keywords), ...strings(rules.addKeywords)]),
      statChanges, statSet: up.statSet ?? rules.statSet, manualCheck: Boolean(up.manualCheck),
      locksEquipment: rules.locksEquipment, base: rules.base, noArmour: rules.noArmour, noRanged: rules.noRanged,
      power, sin: up.allegiance ?? null, removesKeywords: rules.removeKeywords,
      requiresUpgradeIds: rules.requiresUpgradeIds, forbiddenUpgradeIds: rules.forbiddenUpgradeIds,
      requiredKeywords: rules.requiredKeywords, forbiddenKeywords: rules.forbiddenKeywords,
      definition: { ...up, rules },
    }
  })
  const abilities: RecordValue[] = rawAbilities.map((a) => ({ ...a, unitIds: strings(a.unitIds), source: sourceOf(a.source), ruleId: ruleOf(a) }))
  abilities.push(...derivedAbilities)
  for (const u of rawUnits) for (const [index, ability] of list(u.abilityRefs).entries()) {
    const id = `${str(u.id)}-ability-${index + 1}`
    abilities.push({ id, name: ability.name, unitIds: [str(u.id)], source: sourceOf(ability.source), ruleId: str(record(ability.source).sectionId) })
    const target = units.find((unit) => unit.id === u.id)
    if (target) target.abilityIds = [...strings(target.abilityIds), id]
  }
  const issues: RecordValue[] = records.flatMap((r) => list(r.issues).map((issue) => {
    const ref = sourceOf(issue.source ?? issue)
    const sectionId = str(ref.sectionId, str(list(r.sections).find((s) =>
      Array.isArray(s.pages) && s.pages.includes(ref.pages[0]))?.id))
    return { id: issue.id, message: issue.message ?? issue.description ?? issue.text ?? issue.title,
      source: { ...ref, sectionId }, ruleId: sectionId }
  }))
  issues.push(...integrationIssues.map((issue) => ({ id: issue.id, message: issue.message,
    source: sourceOf(issue.source), ruleId: str(record(issue.source).sectionId) })))
  const constraints = group('constraints').filter((c) => c.message && c.severity).map((c) => ({ ...c,
    source: sourceOf(c.source), ruleId: ruleOf(c), factionId: c.factionId ? factionKey(c.factionId) : undefined,
  }))
  const catalog = CatalogSchema.parse({ schemaVersion: 2, edition, revision, factions, variants, units,
    items: normalizedItems, offers, upgrades, abilities, issues, constraints,
    keywords: group('keywords').map((k) => ({ ...k, source: sourceOf(k.source), ruleId: ruleOf(k) })),
    procedures: [...group('procedures'), ...group('constraints').filter((c) => c.kind)].map((p) => ({ ...p, source: sourceOf(p.source), ruleId: ruleOf(p) })),
  })
  return { catalog, unresolvedLinks }
}
