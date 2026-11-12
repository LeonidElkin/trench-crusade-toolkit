import type { Catalog, Category, Cost, Item, Model, Offer, SourceRef, Stats, Unit, Upgrade, Warband } from './schema'
import {
  eligibilityMatches, findItem, itemHasName, namesEqual, number, record, records,
  rulesOf, selectedProfile, selectedUpgrades, string, strings,
} from './rules'

export const zeroCost = (): Cost => ({ ducats: 0, glory: 0 })
export const plusCost = (a: Cost, b: Cost, count = 1): Cost => ({
  ducats: a.ducats + b.ducats * count,
  glory: a.glory + b.glory * count,
})
const asCost = (value: unknown): Cost => {
  const raw = record(value)
  return { ducats: number(raw.ducats), glory: number(raw.glory) }
}
const uuid = () => crypto.randomUUID()
const allCategories: Category[] = ['ranged', 'melee', 'armour', 'equipment']
export const getVariant = (c: Catalog, w: Warband) =>
  c.variants.find((v) => v.id === w.variantId && v.factionId === w.factionId)

export function createWarband(c: Catalog, factionId: string, variantId: string | null = null,
  format: Warband['format'] = 'battle'): Warband {
  const faction = c.factions.find((f) => f.id === factionId)
  if (!faction) throw new Error('Неизвестная фракция')
  const variant = c.variants.find((v) => v.id === variantId && v.factionId === factionId)
  const now = new Date().toISOString()
  return {
    schemaVersion: 2, id: uuid(), name: 'Новый отряд', editionId: c.edition,
    revision: c.revision, factionId, variantId, format,
    budget: { ...(format === 'campaign'
      ? variant?.startingBudget ?? faction.startingBudget
      : variant?.battleBudget ?? faction.battleBudget) },
    units: [], notes: '', allegiance: '', foreignOfferIds: [], leaderId: '',
    createdAt: now, updatedAt: now,
  }
}

export function leaderChoice(c: Catalog, w: Warband) {
  const choices = records(c.factions.find((f) => f.id === w.factionId)?.definition.leaderChoices)
  const selectedUnit = w.units.find((m) => m.id === w.leaderId)?.unitId
  return choices.find((choice) => choice.id === w.leaderId || choice.requiresUnitId === selectedUnit)
    ?? choices.find((choice) => w.units.some((m) => m.unitId === choice.requiresUnitId))
}

export function effectiveUnit(c: Catalog, w: Warband, unitId: string, model?: Model): Unit | undefined {
  const unit = c.units.find((u) => u.id === unitId)
  if (!unit) return
  const variant = getVariant(c, w), vr = variant ? rulesOf(variant) : {}
  const ur = rulesOf(unit), ups = model ? selectedUpgrades(c, model) : []
  const result: Unit = { ...unit, stats: { ...unit.stats }, keywords: [...unit.keywords],
    fixedItems: unit.fixedItems.map((item) => ({ ...item })), allowedCategories: [...unit.allowedCategories] }
  if (unit.mercenary && (variant?.banMercenaries || strings(vr.banMercenaryNames).some((name) => namesEqual(name, unit.name)))) result.max = 0
  if (!unit.mercenary) {
    result.cost = variant?.unitCostOverrides?.[unitId] ?? unit.cost
    result.min = variant?.unitMinimums?.[unitId] ?? unit.min
    result.max = variant?.unitLimits?.[unitId] ?? unit.max
    result.keywords = [...new Set([...result.keywords, ...(variant?.keywords ?? []),
      ...(variant?.keywordsByUnit?.[unitId] ?? [])])]
    const change = record(record(vr.unitChanges)[unitId])
    result.keywords = [...new Set([...result.keywords, ...strings(change.addKeywords)])]
      .filter((key) => !strings(change.removeKeywords).includes(key))
    for (const key of ['movement', 'ranged', 'melee', 'armour', 'base'] as const) {
      const value = record(change.statSet)[key] ?? record(record(vr.statsByUnit)[unitId])[key]
      if (typeof value === 'string') result.stats[key] = value
    }
    if (typeof change.equipmentLocked === 'boolean') result.equipmentLocked = change.equipmentLocked
    result.allowedCategories = [...new Set([...result.allowedCategories,
      ...strings(change.allowCategories).filter((cat): cat is Category => allCategories.includes(cat as Category))])]
    result.definition = { ...result.definition, effectiveAdditionalItemNames: strings(change.allowItemNames) }
    const removed = strings(vr.removeFixedItemsWithoutRefund)
    result.fixedItems = result.fixedItems.filter((item) => !removed.some((name) => namesEqual(name, item.name)))
    const conditional = record(ur.conditionalMax)
    if (variant?.unitLimits?.[unitId] === undefined &&
      w.budget.ducats > number(record(record(conditional.when).warbandDucats).gt, Infinity))
      result.max = number(conditional.max, unit.max ?? Infinity)
    for (const limit of records(ur.limitRules)) {
      const condition = record(limit.condition)
      const matches = condition.warbandValueDucatsGreaterThan !== undefined
        ? w.budget.ducats > number(condition.warbandValueDucatsGreaterThan)
        : condition.leaderChoice !== undefined && leaderChoice(c, w)?.id === condition.leaderChoice
      if (matches && variant?.unitLimits?.[unitId] === undefined) {
        if (typeof limit.max === 'number') result.max = limit.max
        if (typeof limit.min === 'number') result.min = limit.min
      }
    }
    const replacement = record(vr.anchoriteWeaponReplacement)
    if (result.fixedItems.some((item) => namesEqual(item.name, string(replacement.slot)))) {
      result.equipmentLocked = false
      result.allowedCategories = ['ranged']
      result.definition = { ...result.definition, fixedWeaponReplacement: replacement }
    }
  }
  // Explicit exceptions to the ally exemption are preserved by the authoring.
  if (unit.mercenary && strings(vr.affectsMercenaryUnitIds).includes(unit.id))
    result.cost = variant?.unitCostOverrides?.[unit.id] ?? unit.cost
  const profile = selectedProfile(unit, model)
  if (profile) {
    if (typeof profile.base === 'string') result.stats.base = profile.base
    if (typeof profile.armour === 'string') result.stats.armour = profile.armour
    if (typeof profile.armourItemName === 'string') {
      const item = findItem(c, profile.armourItemName, w.factionId)
      result.fixedItems = result.fixedItems.filter((fixed) => fixed.category !== 'armour')
      result.fixedItems.push({ name: profile.armourItemName, category: 'armour' })
      if (item?.armourModifier !== undefined && item.armourModifier !== null) result.stats.armour = String(item.armourModifier)
    }
  }
  for (const group of unit.loadoutGroups) {
    const choice = group.choices.find((choice) => choice.id === model?.loadouts[group.id])
    if (choice) {
      result.fixedItems.push(...choice.equipment.map((name) => ({ name,
        category: findItem(c, name, w.factionId)?.category ?? 'equipment' as Category })))
      if (choice.armour !== undefined) result.stats.armour = choice.armour
    }
  }
  for (const upgrade of ups) {
    const rule = rulesOf(upgrade)
    if (rule.unlockWeaponPurchases) {
      result.equipmentLocked = false
      result.allowedCategories = [...new Set([...result.allowedCategories, 'ranged', 'melee', 'armour'] as Category[])]
    }
    if (rule.unlockEquipmentPurchases) {
      result.equipmentLocked = false
      result.allowedCategories = [...new Set([...result.allowedCategories, 'equipment'] as Category[])]
    }
  }
  if (model) {
    const replaced = model.equipment.flatMap((purchase) => {
      const offer = c.offers.find((o) => o.id === purchase.offerId)
      return string(record(offer?.definition.restrictions).replacesFixedItemName) || []
    })
    result.fixedItems = result.fixedItems.filter((fixed) => !replaced.some((name) => namesEqual(name, fixed.name)))
  }
  return result
}

export function addModel(c: Catalog, w: Warband, unitId: string): Warband {
  const unit = c.units.find((u) => u.id === unitId)
  if (!unit) throw new Error('Неизвестный боец')
  const model: Model = { id: uuid(), unitId, name: unit.name, equipment: [], upgrades: [],
    notes: '', fireteam: '', loadouts: {} }
  const compulsory = record(rulesOf(unit).compulsoryPurchase)
  if (compulsory.name) {
    const offer = c.offers.find((o) => o.factionId === w.factionId && !o.variantId &&
      (namesEqual(o.name, string(compulsory.name)) || itemHasName(c.items.find((i) => i.id === o.itemId), string(compulsory.name))))
    if (offer) model.equipment.push({ id: uuid(), offerId: offer.id, quantity: number(compulsory.quantity, 1) })
  }
  const profile = records(rulesOf(unit).profileChoices)[0]
  if (profile) model.loadouts.profile = string(profile.id)
  for (const group of unit.loadoutGroups) if (group.min > 0 && group.choices[0]) model.loadouts[group.id] = group.choices[0].id
  return { ...w, units: [...w.units, model], updatedAt: new Date().toISOString() }
}
export const removeModel = (w: Warband, modelId: string): Warband => ({ ...w,
  units: w.units.filter((m) => m.id !== modelId), updatedAt: new Date().toISOString() })
export const updateModel = (w: Warband, modelId: string, patch: Partial<Omit<Model, 'id' | 'unitId'>>): Warband => ({
  ...w, units: w.units.map((m) => m.id === modelId ? { ...m, ...patch } : m), updatedAt: new Date().toISOString(),
})
export function buyEquipment(w: Warband, modelId: string, offerId: string): Warband {
  const model = w.units.find((m) => m.id === modelId)
  if (!model) throw new Error('Боец не найден')
  return updateModel(w, modelId, { equipment: [...model.equipment, { id: uuid(), offerId, quantity: 1 }] })
}
export function toggleUpgrade(w: Warband, modelId: string, upgradeId: string): Warband {
  const model = w.units.find((m) => m.id === modelId)
  if (!model) throw new Error('Боец не найден')
  return updateModel(w, modelId, { upgrades: model.upgrades.includes(upgradeId)
    ? model.upgrades.filter((id) => id !== upgradeId) : [...model.upgrades, upgradeId] })
}

export function effectiveOffer(c: Catalog, w: Warband, offerId: string, model?: Model): Offer | undefined {
  const offer = c.offers.find((o) => o.id === offerId)
  if (!offer) return
  if (model && c.units.find((u) => u.id === model.unitId)?.mercenary) return offer
  const variant = getVariant(c, w), vr = variant ? rulesOf(variant) : {}
  const result = { ...offer, ...variant?.offerOverrides?.[offer.itemId], requiredKeywords: [...offer.requiredKeywords],
    forbiddenKeywords: [...offer.forbiddenKeywords] }
  const item = c.items.find((i) => i.id === offer.itemId)
  const matches = (name: string) => namesEqual(name, offer.name) || itemHasName(item, name)
  for (const change of records(vr.offerChanges)) if (matches(string(change.itemName))) {
    if (change.cost) result.cost = asCost(change.cost)
    if (typeof change.limit === 'number') result.limit = change.limit
  }
  for (const [name, cost] of Object.entries(record(vr.offerCostsByName))) if (matches(name)) result.cost = asCost(cost)
  for (const [name, limit] of Object.entries(record(vr.itemLimits ?? vr.offerLimitsByName)))
    if (matches(name)) result.limit = number(limit)
  for (const [name, change] of Object.entries(record(vr.offerEligibilityChanges))) if (matches(name))
    result.requiredKeywords = result.requiredKeywords.filter((keyword) => keyword !== record(change).removeRequiredKeyword)
  const holyShield = record(vr.holyIconShield)
  if (Object.keys(holyShield).length && item?.englishName === 'Holy Icon Shield') {
    result.cost = asCost(holyShield.cost)
    if (holyShield.eliteOnly === false) result.requiredKeywords = result.requiredKeywords.filter((k) => k !== 'ELITE')
  }
  if (vr.antiTankHammerEliteOnly === false && item?.englishName === 'Anti-Tank Hammer')
    result.requiredKeywords = result.requiredKeywords.filter((k) => k !== 'ELITE')
  return result
}

export function modelCost(c: Catalog, w: Warband, model: Model): { cost: Cost; complete: boolean } {
  const unit = effectiveUnit(c, w, model.unitId, model)
  const ups = selectedUpgrades(c, model)
  let cost = ups.find((u) => u.replacesBaseCost)?.cost ?? unit?.cost ?? zeroCost()
  let complete = Boolean(unit) && ups.length === model.upgrades.length
  if (unit) cost = plusCost(cost, asCost(selectedProfile(unit, model)?.costDelta))
  const compulsory = record(unit && rulesOf(unit).compulsoryPurchase)
  const replacement = record(compulsory.replacement), compulsoryPrice = asCost(compulsory.cost)
  let included = false
  for (const purchase of model.equipment) {
    const offer = effectiveOffer(c, w, purchase.offerId, model)
    if (!offer) { complete = false; continue }
    let quantity = purchase.quantity
    if (!included && compulsory.name && (namesEqual(offer.name, string(compulsory.name)) ||
      (replacement.category === offer.category && replacement.payOnlyPositivePriceDifference))) {
      included = true
      const exact = namesEqual(offer.name, string(compulsory.name))
      cost = plusCost(cost, exact ? compulsoryPrice : {
        ducats: compulsoryPrice.ducats + Math.max(0, offer.cost.ducats - number(replacement.sourcePriceBaseline, compulsoryPrice.ducats)),
        glory: compulsoryPrice.glory + Math.max(0, offer.cost.glory),
      })
      quantity -= 1
    }
    cost = plusCost(cost, offer.cost, quantity)
  }
  if (compulsory.name && !included) cost = plusCost(cost, compulsoryPrice)
  for (const up of ups) if (!up.replacesBaseCost) cost = plusCost(cost, up.cost)
  return { cost, complete }
}
export function warbandCost(c: Catalog, w: Warband): { cost: Cost; complete: boolean } {
  return w.units.reduce((acc, model) => {
    const result = modelCost(c, w, model)
    return { cost: plusCost(acc.cost, result.cost), complete: acc.complete && result.complete }
  }, { cost: zeroCost(), complete: w.schemaVersion === c.schemaVersion && w.editionId === c.edition && w.revision === c.revision })
}

export interface ModelGear {
  name: string
  category: Category
  quantity: number
  fixed: boolean
  item?: Item
  offer?: Offer
  source: SourceRef
  definition: Record<string, unknown>
}
export function modelGear(c: Catalog, w: Warband, model: Model): ModelGear[] {
  const unit = effectiveUnit(c, w, model.unitId, model)
  if (!unit) return []
  const rawFixed = Array.isArray(unit.definition.fixedEquipment) ? unit.definition.fixedEquipment : []
  const fixed: ModelGear[] = unit.fixedItems.map((gear) => {
    const raw = rawFixed.find((entry) => namesEqual(typeof entry === 'string' ? entry : string(record(entry).name), gear.name))
    let item = findItem(c, gear.name, w.factionId)
    const choice = unit.loadoutGroups.flatMap((group) => group.choices.filter((choice) => choice.id === model.loadouts[group.id]))
      .find((choice) => choice.equipment.some((name) => namesEqual(name, gear.name)))
    const trait = records(rulesOf(unit).fixedWeaponTraits).find((entry) => namesEqual(string(entry.name), gear.name) || itemHasName(item, string(entry.name)))
    const definition = { ...record(raw), ...trait, ...(choice ? { ignoredKeywords: choice.ignoredKeywords } : {}) }
    if (item && trait) item = { ...item, keywords: [...new Set([...item.keywords, ...strings(trait.addKeywords)])] }
    if (item && choice?.ignoredKeywords) item = { ...item, keywords: item.keywords.filter((key) => !choice.ignoredKeywords?.includes(key)) }
    return { ...gear, item, quantity: 1, fixed: true, source: unit.source, definition }
  })
  const purchases: ModelGear[] = model.equipment.flatMap((purchase) => {
    const offer = effectiveOffer(c, w, purchase.offerId, model)
    if (!offer) return []
    return [{ name: offer.name, category: offer.category, quantity: purchase.quantity, fixed: false,
      item: c.items.find((i) => i.id === offer.itemId), offer, source: offer.source,
      definition: { ...offer.definition, ...record(offer.definition.restrictions) } }]
  })
  return [...fixed, ...purchases]
}
export function modelKeywords(c: Catalog, w: Warband, model: Model): string[] {
  const ups = selectedUpgrades(c, model)
  const removed = ups.flatMap((up) => [...(up.removesKeywords ?? []), ...strings(rulesOf(up).removeKeywords)])
  const gearKeywords = modelGear(c, w, model).flatMap((gear) => strings(gear.item?.definition.grantsKeywords))
  return [...new Set([...(effectiveUnit(c, w, model.unitId, model)?.keywords ?? []),
    ...ups.flatMap((up) => up.keywords), ...gearKeywords, ...(model.fireteam ? ['FIRETEAM'] : [])])]
    .filter((key) => !removed.includes(key))
}
export function modelStats(c: Catalog, w: Warband, model: Model): Stats | undefined {
  const unit = effectiveUnit(c, w, model.unitId, model)
  if (!unit) return
  const stats = { ...unit.stats }, ups = selectedUpgrades(c, model), gear = modelGear(c, w, model)
  const armour = gear.filter((entry) => !entry.fixed && !entry.item?.shield && entry.item?.armourModifier != null)
  if (armour.length && !unit.fixedItems.some((entry) => entry.category === 'armour'))
    stats.armour = String(Math.min(...armour.map((entry) => entry.item!.armourModifier!)))
  const shield = gear.filter((entry) => !entry.fixed && entry.item?.shield)
    .reduce((sum, entry) => sum + (entry.item?.armourModifier ?? 0) * entry.quantity, 0)
  if (shield) stats.armour = String(Number.parseInt(stats.armour, 10) + shield)
  const changes = [...ups.map((up) => ({ delta: up.statChanges, set: up.statSet ?? {}, base: up.base })),
    ...gear.filter((entry) => !entry.fixed).map((entry) => ({
      delta: record(entry.item?.definition.statChanges), set: record(entry.item?.definition.statSet), base: undefined,
    }))]
  for (const change of changes) {
    for (const key of ['ranged', 'melee', 'armour'] as const) {
      const delta = number(change.delta[key], number(change.delta[`${key}Dice`]))
      if (delta && Number.isFinite(Number.parseInt(stats[key], 10))) {
        const value = Number.parseInt(stats[key], 10) + delta
        stats[key] = key === 'armour' ? String(value) : value === 0 ? '0' : `${value > 0 ? '+' : ''}${value}D`
      }
      const set = change.set[key]
      if (typeof set === 'string') stats[key] = set
    }
    if (typeof change.set.movement === 'string') stats.movement = change.set.movement
  }
  // Size formula ordering in the UI must not change the resulting base.
  const bases = ups.flatMap((up) => up.base ? [up.base] : [])
  if (bases.length) stats.base = bases.reduce((a, b) => number(Number.parseInt(a, 10)) >= number(Number.parseInt(b, 10)) ? a : b)
  return stats
}

export function upgradeApplies(c: Catalog, w: Warband, model: Model, upgrade: Upgrade): boolean {
  const unit = effectiveUnit(c, w, model.unitId, model), rule = rulesOf(upgrade)
  if (!unit || (upgrade.variantId && upgrade.variantId !== w.variantId) ||
    (upgrade.factionId && upgrade.factionId !== w.factionId)) return false
  if (!unit.mercenary && getVariant(c, w)?.banUpgradeIds?.includes(upgrade.id)) return false
  if (upgrade.unitIds.length ? !upgrade.unitIds.includes(unit.id) : unit.mercenary) return false
  const keywords = modelKeywords(c, w, model)
  const tags = selectedUpgrades(c, model).flatMap((up) => string(rulesOf(up).grantsTag) || [])
  if (upgrade.power && (!unit.powerMax || (upgrade.sin && upgrade.sin !== w.allegiance))) return false
  if (upgrade.forbiddenKeywords?.some((key) => keywords.includes(key))) return false
  if (upgrade.requiredKeywords?.some((key) => !keywords.includes(key))) return false
  if (typeof rule.eligibility === 'object' && !eligibilityMatches(rule.eligibility, model, keywords, tags)) return false
  if (rulesOf(unit).cannotBecomeElite && upgrade.keywords.includes('ELITE')) return false
  return true
}

export function offerApplies(c: Catalog, w: Warband, model: Model, candidate: Offer): boolean {
  const unit = effectiveUnit(c, w, model.unitId, model), offer = effectiveOffer(c, w, candidate.id, model)
  if (!unit || !offer) return false
  const ur = rulesOf(unit), vr = getVariant(c, w) ? rulesOf(getVariant(c, w)!) : {}
  const restriction = record(offer.definition.restrictions), raw = { ...offer.definition, ...restriction }
  const item = c.items.find((i) => i.id === offer.itemId), ups = selectedUpgrades(c, model)
  const upRules = ups.map(rulesOf), keywords = modelKeywords(c, w, model)
  const tags = upRules.flatMap((rule) => string(rule.grantsTag) || [])
  if (offer.variantId && offer.variantId !== w.variantId) return false
  if (offer.unitIds && !offer.unitIds.includes(unit.id)) return false
  const matches = (name: string) => namesEqual(name, offer.name) || itemHasName(item, name)
  const permittedNames = [...strings(record(ur.allowedEquipment).additionalItemNames),
    ...strings(ur.effectiveAdditionalItemNames), ...strings(ur.permittedOptionalEquipment)]
  const explicit = unit.allowedItemIds?.includes(offer.itemId) || permittedNames.some(matches)
  const fixedReplacement = record(ur.fixedWeaponReplacement)
  const replacement = Boolean(raw.replacesFixedItemName && namesEqual(string(raw.replacesFixedItemName), string(fixedReplacement.slot)))
  if (unit.equipmentLocked && !explicit && !replacement) return false
  if (!unit.allowedCategories.includes(offer.category) && !explicit && !replacement) return false
  if (Object.keys(fixedReplacement).length && !replacement) return false
  if (unit.allowedItemIds?.length && !unit.allowedItemIds.includes(offer.itemId)) return false
  if (unit.forbiddenItemIds?.includes(offer.itemId) || strings(raw.forbiddenUnitIds).includes(unit.id)) return false
  if (unit.rangedItemIds?.length && offer.category === 'ranged' && !unit.rangedItemIds.includes(offer.itemId)) return false
  const ranged = record(record(ur.allowedEquipment).ranged)
  if (offer.category === 'ranged' && typeof ranged.maxItemDucats === 'number' && offer.cost.ducats > ranged.maxItemDucats) return false
  if (unit.maxItemDucats !== undefined && offer.cost.ducats > unit.maxItemDucats) return false
  if (unit.forbidGloryItems && offer.cost.glory) return false
  const foreign = upRules.some((rule) => {
    const access = record(rule.foreignArsenalPurchase)
    const arsenalNames = strings(access.arsenalNames)
    const faction = c.factions.find((f) => f.id === offer.factionId)
    return strings(access.categories).includes(offer.category) &&
      (strings(access.factionIds).includes(offer.factionId) || arsenalNames.some((name) =>
        namesEqual(name, faction?.name ?? '') || (name === 'Новая Антиохия' && offer.factionId === 'antioch')))
  })
  if (offer.factionId !== w.factionId && !w.foreignOfferIds.includes(offer.id) && !foreign) return false
  const any = raw.eligibilityAny ?? record(raw.eligibility).any
  if (any && !eligibilityMatches(any, model, keywords, tags)) return false
  if (typeof raw.eligibility === 'object' && !eligibilityMatches(raw.eligibility, model, keywords, tags)) return false
  const keywordOrUnit = record(restriction.keywordsOrUnits)
  const orKeywords = strings(keywordOrUnit.keywords), orUnits = strings(keywordOrUnit.unitIds)
  if ((orKeywords.length || orUnits.length) &&
    !orKeywords.some((key) => keywords.includes(key)) && !orUnits.includes(unit.id)) return false
  const neededKeywords = [...offer.requiredKeywords, ...strings(restriction.requiredKeywords)]
  const allowedUnits = offer.allowedUnitIds ?? (Array.isArray(raw.allowedUnitIds) ? strings(raw.allowedUnitIds) : null)
  const bullWeapon = allowedUnits?.some((id) => c.units.find((u) => u.id === id && number(rulesOf(u).maxBullSpecificWeapons) > 0))
  const gargantuan = bullWeapon && upRules.some((rule) => number(rule.allowedBullSpecificWeaponCount) > 0)
  const keywordOK = neededKeywords.every((key) => keywords.includes(key))
  const unitOK = !allowedUnits || allowedUnits.includes(unit.id) || Boolean(gargantuan)
  if (offer.keywordsOrUnits ? !(keywordOK || unitOK) : !keywordOK || !unitOK) return false
  if ([...offer.forbiddenKeywords, ...strings(restriction.forbiddenKeywords)].some((key) => keywords.includes(key))) return false
  if (upRules.some((rule) => rule.forbidEliteItems) &&
    (neededKeywords.includes('ELITE') || restriction.eliteOnly || orKeywords.includes('ELITE') || records(any).some((e) => e.keyword === 'ELITE'))) return false
  const grenade = item?.keywords.includes('GRENADE') || /гранат/i.test(string(item?.definition.type))
  if (grenade && (upRules.some((rule) => rule.forbidGrenades) || records(ur.equipmentExceptions).some((e) => e.kind === 'forbidKeyword' && e.keyword === 'GRENADE'))) return false
  if (upRules.some((rule) => rule.unlockWeaponPurchases)) {
    if (offer.category === 'armour' && !upRules.flatMap((rule) => strings(rule.allowedShieldNames)).some(matches)) return false
    if (upRules.some((rule) => rule.forbidUnitRestrictedWeapons) && allowedUnits && !gargantuan) return false
  }
  if (ur.forbidShields && item?.shield) return false
  if (['ranged', 'melee'].includes(offer.category) && strings(ur.weaponsMustHaveKeywords).some((key) => !item?.keywords.includes(key))) return false
  for (const rule of upRules) {
    if (rule.locksEquipment) return false
    if (rule.noRanged && offer.category === 'ranged') return false
    if (rule.noArmour && offer.category === 'armour' && !(rule.allowShields && item?.shield)) return false
    if (strings(rule.forbidCategories).includes(offer.category) && !strings(rule.allowedArmourExceptions).some(matches)) return false
    if (strings(rule.forbidItemNames).some(matches)) return false
  }
  if (!unit.mercenary) {
    if (getVariant(c, w)?.banItemIds?.includes(offer.itemId)) return false
    if (strings(vr.forbiddenItemNames ?? vr.bannedItemNames).some(matches)) return false
    for (const [name] of Object.entries(record(vr.itemReplacements))) if (matches(name)) return false
    const holy = record(vr.holyIconShield)
    if (item?.englishName === 'Holy Icon Shield' && strings(holy.exceptUnitIds).includes(unit.id)) return false
    for (const restriction of records(vr.equipmentRestrictions)) {
      if (strings(restriction.exceptUnitIds).includes(unit.id)) continue
      if (restriction.kind === 'forbidHeavyWeapons' && ['ranged', 'melee'].includes(offer.category) && item?.keywords.includes('HEAVY')) return false
      if (restriction.kind === 'forbidArmourNames' && strings(restriction.names).some(matches)) return false
    }
  }
  const policy = record(ur.purchasePolicy)
  if (policy.requiresUnrestrictedOffer && (offer.limit !== null || allowedUnits || neededKeywords.length ||
    offer.forbiddenKeywords.length || Object.keys(keywordOrUnit).length || any)) return false
  return offer.limit !== 0
}
