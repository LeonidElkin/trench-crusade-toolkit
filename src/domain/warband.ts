import type { Catalog, Cost, Model, Offer, Stats, Unit, Upgrade, Warband } from './schema'
export const zeroCost = (): Cost => ({ ducats: 0, glory: 0 })
export const plusCost = (a: Cost, b: Cost, count = 1): Cost => ({
  ducats: a.ducats + b.ducats * count,
  glory: a.glory + b.glory * count,
})
const uuid = () => crypto.randomUUID()
export function createWarband(
  c: Catalog,
  factionId: string,
  variantId: string | null = null,
  format: Warband['format'] = 'battle',
): Warband {
  const faction = c.factions.find((f) => f.id === factionId)
  if (!faction) throw new Error('Неизвестная фракция')
  const variant = c.variants.find((v) => v.id === variantId && v.factionId === factionId)
  const now = new Date().toISOString()
  return {
    schemaVersion: 1,
    id: uuid(),
    name: 'Новый отряд',
    editionId: c.edition,
    revision: c.revision,
    factionId,
    variantId,
    format,
    budget:
      format === 'campaign'
        ? (variant?.startingBudget ?? faction.startingBudget)
        : (variant?.battleBudget ?? faction.battleBudget),
    units: [],
    notes: '',
    allegiance: '',
    foreignOfferIds: [],
    leaderId: '',
    createdAt: now,
    updatedAt: now,
  }
}
export const getVariant = (c: Catalog, w: Warband) =>
  c.variants.find((v) => v.id === w.variantId && v.factionId === w.factionId)
export function effectiveUnit(
  c: Catalog,
  w: Warband,
  unitId: string,
  model?: Model,
): Unit | undefined {
  const u = c.units.find((x) => x.id === unitId)
  if (!u) return
  const v = getVariant(c, w)
  let result: Unit = {
    ...u,
    cost: v?.unitCostOverrides?.[u.id] ?? u.cost,
    min: v?.unitMinimums?.[u.id] ?? u.min,
    max: v?.unitLimits?.[u.id] ?? u.max,
  }
  if (u.id === 'sultanate.homunculus' && model) {
    const human = model.upgrades.includes('human-hands'),
      seal = model.upgrades.includes('seal-solomon')
    result = {
      ...result,
      equipmentLocked: !human && !seal,
      allowedCategories: [
        ...(human ? (['ranged', 'melee', 'armour'] as const) : []),
        ...(seal ? (['equipment'] as const) : []),
      ],
    }
  }
  if (u.mercenary) return result
  result = {
    ...result,
    keywords: [
      ...new Set([...u.keywords, ...(v?.keywords ?? []), ...(v?.keywordsByUnit?.[u.id] ?? [])]),
    ],
    fixedItems: [...u.fixedItems],
  }
  if (w.variantId === 'ghosts')
    result.fixedItems = result.fixedItems.filter((i) => !/Клейм|Капирот/.test(i.name))
  if (w.variantId === 'affliction')
    result.fixedItems = result.fixedItems.filter((i) => !/Капирот/.test(i.name))
  if (w.variantId === 'methodius' && u.id === 'pilgrims.anchorite')
    result = {
      ...result,
      equipmentLocked: false,
      allowedCategories: ['ranged', 'equipment'],
      stats: { ...u.stats, ranged: '0' },
      fixedItems: model?.equipment.some(
        (e) => c.offers.find((o) => o.id === e.offerId)?.category === 'ranged',
      )
        ? result.fixedItems.filter((i) => !i.name.includes('Колесо'))
        : result.fixedItems,
    }
  if (w.variantId === 'hegemon' && ['grail.thrall', 'grail.fly-thrall'].includes(u.id))
    result = {
      ...result,
      stats: { ...u.stats, ranged: '0' },
      equipmentLocked: u.id !== 'grail.thrall',
      allowedCategories: u.id === 'grail.thrall' ? ['ranged', 'equipment'] : [],
    }
  if (
    w.factionId === 'grail' &&
    w.variantId !== 'hegemon' &&
    !w.units.some((m) => m.unitId === 'grail.lord') &&
    u.id === 'grail.knight'
  )
    result.max = 3
  if (u.id === 'heretic.witch' && w.budget.ducats > 1000 && w.variantId !== 'naval') result.max = 2
  return result
}
export function addModel(c: Catalog, w: Warband, unitId: string): Warband {
  const u = c.units.find((x) => x.id === unitId)
  if (!u) throw new Error('Неизвестный боец')
  const model: Model = {
    id: uuid(),
    unitId,
    name: u.name,
    equipment: [],
    upgrades: [],
    notes: '',
    fireteam: '',
  }
  if (unitId === 'antioch.yeoman') {
    const rifle = c.offers.find(
      (o) =>
        o.factionId === 'antioch' &&
        c.items.find((i) => i.id === o.itemId)?.englishName === 'Bolt Action Rifle',
    )
    if (rifle) model.equipment.push({ id: uuid(), offerId: rifle.id, quantity: 1 })
  }
  return { ...w, units: [...w.units, model], updatedAt: new Date().toISOString() }
}
export const removeModel = (w: Warband, modelId: string): Warband => ({
  ...w,
  units: w.units.filter((m) => m.id !== modelId),
  updatedAt: new Date().toISOString(),
})
export const updateModel = (
  w: Warband,
  modelId: string,
  patch: Partial<Omit<Model, 'id' | 'unitId'>>,
): Warband => ({
  ...w,
  units: w.units.map((m) => (m.id === modelId ? { ...m, ...patch } : m)),
  updatedAt: new Date().toISOString(),
})
export function buyEquipment(w: Warband, modelId: string, offerId: string): Warband {
  const model = w.units.find((m) => m.id === modelId)
  if (!model) throw new Error('Боец не найден')
  return updateModel(w, modelId, {
    equipment: [...model.equipment, { id: uuid(), offerId, quantity: 1 }],
  })
}
export function toggleUpgrade(w: Warband, modelId: string, upgradeId: string): Warband {
  const model = w.units.find((m) => m.id === modelId)
  if (!model) throw new Error('Боец не найден')
  return updateModel(w, modelId, {
    upgrades: model.upgrades.includes(upgradeId)
      ? model.upgrades.filter((id) => id !== upgradeId)
      : [...model.upgrades, upgradeId],
  })
}
export function effectiveOffer(c: Catalog, w: Warband, offerId: string): Offer | undefined {
  const o = c.offers.find((x) => x.id === offerId)
  if (!o) return
  const override = getVariant(c, w)?.offerOverrides?.[o.itemId]
  let result = { ...o, ...override }
  if (
    w.variantId === 'alba' &&
    c.items.find((i) => i.id === o.itemId)?.englishName === 'Great Sword/Axe'
  )
    result = { ...result, cost: { ducats: 7, glory: 0 } }
  if (
    w.variantId === 'eire' &&
    c.items.find((i) => i.id === o.itemId)?.englishName === 'Musical Instrument'
  )
    result = { ...result, forbiddenKeywords: [] }
  return result
}
export function modelCost(c: Catalog, w: Warband, m: Model): { cost: Cost; complete: boolean } {
  const u = effectiveUnit(c, w, m.unitId)
  const replacement = m.upgrades
    .map((id) => c.upgrades.find((u) => u.id === id))
    .find((up) => up?.replacesBaseCost)
  let cost = replacement?.cost ?? u?.cost ?? zeroCost(),
    complete = !!u
  let yeomanWeapon = false
  for (const e of m.equipment) {
    const o = effectiveOffer(c, w, e.offerId)
    if (!o) {
      complete = false
      continue
    }
    let price = o.cost
    if (m.unitId === 'antioch.yeoman' && !yeomanWeapon && o.category === 'ranged') {
      yeomanWeapon = true
      const bolt = c.items.find((i) => i.id === o.itemId)?.englishName === 'Bolt Action Rifle'
      price = { ducats: bolt ? 5 : Math.max(5, price.ducats), glory: price.glory }
    }
    cost = plusCost(cost, price, e.quantity)
  }
  if (m.unitId === 'antioch.yeoman' && !yeomanWeapon) cost = plusCost(cost, { ducats: 5, glory: 0 })
  for (const id of m.upgrades) {
    const upgrade = c.upgrades.find((u) => u.id === id)
    if (upgrade && !upgrade.replacesBaseCost) cost = plusCost(cost, upgrade.cost)
    else if (!upgrade) complete = false
  }
  return { cost, complete }
}
export function warbandCost(c: Catalog, w: Warband): { cost: Cost; complete: boolean } {
  return w.units.reduce(
    (acc, model) => {
      const m = modelCost(c, w, model)
      return { cost: plusCost(acc.cost, m.cost), complete: acc.complete && m.complete }
    },
    { cost: zeroCost(), complete: w.editionId === c.edition && w.revision === c.revision },
  )
}
export function modelKeywords(c: Catalog, w: Warband, m: Model): string[] {
  const removed = m.upgrades.flatMap(
    (id) => c.upgrades.find((up) => up.id === id)?.removesKeywords ?? [],
  )
  return [
    ...new Set([
      ...(effectiveUnit(c, w, m.unitId)?.keywords ?? []),
      ...m.upgrades.flatMap((id) => c.upgrades.find((u) => u.id === id)?.keywords ?? []),
      ...(m.fireteam ? ['FIRETEAM'] : []),
    ]),
  ].filter((k) => !removed.includes(k))
}
export function modelStats(c: Catalog, w: Warband, m: Model): Stats | undefined {
  const u = effectiveUnit(c, w, m.unitId)
  if (!u) return
  const stats = { ...u.stats }
  for (const id of m.upgrades) {
    const up = c.upgrades.find((x) => x.id === id)
    if (!up) continue
    for (const key of ['ranged', 'melee', 'armour'] as const) {
      const delta = up.statChanges[key]
      if (delta) {
        const value = Number.parseInt(stats[key], 10) + delta
        stats[key] = key === 'armour' ? String(value) : `${value > 0 ? '+' : ''}${value}D`
      }
      if (up.statSet?.[key]) stats[key] = up.statSet[key]!
    }
    if (up.statSet?.movement) stats.movement = up.statSet.movement
    if (up.base) stats.base = up.base
  }
  const equippedItems = m.equipment.flatMap((e) => {
    const o = effectiveOffer(c, w, e.offerId)
    const item = c.items.find((i) => i.id === o?.itemId)
    return item ? [{ item, quantity: e.quantity }] : []
  })
  const armour = equippedItems
    .filter((p) => !p.item.shield && p.item.armourModifier !== undefined)
    .map((p) => p.item.armourModifier!)
  if (armour.length && !u.fixedItems.some((i) => i.category === 'armour'))
    stats.armour = String(Math.min(...armour))
  const shieldModifier = equippedItems
    .filter((p) => p.item.shield)
    .reduce((n, p) => n + (p.item.armourModifier ?? 0) * p.quantity, 0)
  if (shieldModifier) stats.armour = String(Number.parseInt(stats.armour, 10) + shieldModifier)
  if (w.variantId === 'alba' && u.id === 'antioch.mechanized') {
    stats.ranged = '0'
    stats.melee = '+1D'
  }
  return stats
}
export function upgradeApplies(c: Catalog, w: Warband, m: Model, up: Upgrade): boolean {
  const u = effectiveUnit(c, w, m.unitId)
  if (
    !u ||
    (up.variantId && w.variantId !== up.variantId) ||
    (up.factionId && w.factionId !== up.factionId)
  )
    return false
  if (getVariant(c, w)?.banUpgradeIds?.includes(up.id)) return false
  if (up.unitIds.length && !up.unitIds.includes(u.id)) return false
  if (!up.unitIds.length && u.mercenary) return false
  if (up.power && (!u.powerMax || (up.sin && up.sin !== w.allegiance))) return false
  if (up.forbiddenKeywords?.some((k) => modelKeywords(c, w, m).includes(k))) return false
  if (up.requiredKeywords?.some((k) => !modelKeywords(c, w, m).includes(k))) return false
  return true
}
export function offerApplies(c: Catalog, w: Warband, m: Model, offer: Offer): boolean {
  const u = effectiveUnit(c, w, m.unitId, m),
    o = effectiveOffer(c, w, offer.id)!
  if (!u || u.equipmentLocked || !u.allowedCategories.includes(o.category)) return false
  if (o.variantId && o.variantId !== w.variantId) return false
  if (o.unitIds && !o.unitIds.includes(u.id)) return false
  const cross =
    (u.id === 'grail.knight' || u.id === 'grail.executor') &&
    m.upgrades.includes('rotten-cross') &&
    ['antioch', 'heretic'].includes(o.factionId) &&
    ['ranged', 'melee'].includes(o.category)
  if (o.factionId !== w.factionId && !w.foreignOfferIds.includes(o.id) && !cross) return false
  if (u.allowedItemIds && !u.allowedItemIds.includes(o.itemId)) return false
  if (u.forbiddenItemIds?.includes(o.itemId)) return false
  if (u.rangedItemIds && o.category === 'ranged' && !u.rangedItemIds.includes(o.itemId))
    return false
  if (
    u.maxItemDucats !== undefined &&
    (o.cost.ducats > u.maxItemDucats || (u.forbidGloryItems && o.cost.glory > 0))
  )
    return false
  const ks = modelKeywords(c, w, m)
  const keywordOK = o.requiredKeywords.every((k) => ks.includes(k))
  const gargantuan =
    u.id === 'sultanate.homunculus' &&
    m.upgrades.includes('gargantuan') &&
    o.allowedUnitIds?.includes('sultanate.bull')
  const unitOK = !o.allowedUnitIds || o.allowedUnitIds.includes(u.id) || !!gargantuan
  if (
    o.keywordsOrUnits
      ? !((keywordOK && o.requiredKeywords.length > 0) || (unitOK && !!o.allowedUnitIds))
      : !keywordOK || !unitOK
  )
    return false
  if (o.forbiddenKeywords.some((k) => ks.includes(k))) return false
  if (
    u.id === 'sultanate.homunculus' &&
    (o.requiredKeywords.length ||
      (o.category === 'armour' && !c.items.find((i) => i.id === o.itemId)?.shield) ||
      /гранат/i.test(o.name) ||
      (o.allowedUnitIds && !gargantuan))
  )
    return false
  if (
    w.variantId === 'plague' &&
    u.id === 'pilgrims.prisoner' &&
    o.itemId === 'item.sacrificial-lamb'
  )
    return false
  const v = getVariant(c, w)
  if (!u.mercenary && v?.banItemIds?.includes(o.itemId)) return false
  return o.limit !== 0
}
