import type { Catalog, Model, SourceRef, Unit, Warband } from './schema'
import {
  effectiveOffer, effectiveUnit, getVariant, leaderChoice, modelCost, modelGear,
  modelKeywords, offerApplies, upgradeApplies, warbandCost, type ModelGear,
} from './warband'
import {
  equipmentExceptions, findItem, itemHasName, namesEqual, number, profileChoices, record,
  records, rulesOf, selectedUpgrades, sourceFrom, string, strings,
} from './rules'

export interface Diagnostic {
  code: string
  severity: 'error' | 'warning' | 'info' | 'manual'
  message: string
  modelId?: string
  ruleId?: string
  source?: SourceRef
}
export interface ValidationResult {
  diagnostics: Diagnostic[]
  status: 'invalid' | 'needs-review' | 'valid'
}

export function validateWarband(c: Catalog, w: Warband): ValidationResult {
  const diagnostics: Diagnostic[] = [], activeRules = new Set<string>()
  const add = (code: string, severity: Diagnostic['severity'], message: string,
    model?: Model, ruleId?: string, source?: SourceRef) => {
    if (!diagnostics.some((d) => d.code === code && d.modelId === model?.id && d.ruleId === ruleId && d.message === message))
      diagnostics.push({ code, severity, message, modelId: model?.id, ruleId, source })
  }
  const activate = (entity: { ruleId: string; source: SourceRef }) => {
    activeRules.add(entity.ruleId)
    if (entity.source.sectionId) activeRules.add(entity.source.sectionId)
  }
  const faction = c.factions.find((f) => f.id === w.factionId), variant = getVariant(c, w)
  const fr = faction ? rulesOf(faction) : {}, vr = variant ? rulesOf(variant) : {}
  const regular = w.units.filter((m) => !c.units.find((u) => u.id === m.unitId)?.mercenary)
  const countUnit = (id: string) => w.units.filter((m) => m.unitId === id).length
  if (faction) {
    activate(faction)
    faction.specialRuleIds.forEach((id) => activeRules.add(id))
    activeRules.add(faction.arsenalRuleId)
  }
  if (variant) activate(variant)
  if (w.schemaVersion !== c.schemaVersion || w.editionId !== c.edition || w.revision !== c.revision)
    add('edition', 'error', 'Редакция или ревизия отряда недоступна. Расчёт по другой базе запрещён.')
  if (!faction) add('faction', 'error', 'Фракция не найдена в этой редакции.')
  if (w.variantId && !variant) add('variant', 'error', 'Этот вариант не принадлежит выбранной фракции.')
  const total = warbandCost(c, w)
  if (!total.complete) add('incomplete-cost', 'error', 'Стоимость неполная: в отряде есть неизвестные сущности или недоступная ревизия.')
  for (const currency of ['ducats', 'glory'] as const) if (total.cost[currency] > w.budget[currency])
    add(`budget-${currency}`, 'error', `Превышен бюджет: ${currency === 'ducats' ? 'дукаты' : 'Слава'} — ${total.cost[currency]} из ${w.budget[currency]}.`)
  if (!w.units.length) add('empty', 'warning', 'Отряд пока пуст. Добавьте бойцов.')
  if (fr.allegianceRequired && !records(fr.allegiances).some((a) => a.id === w.allegiance))
    add('allegiance', 'error', 'Выберите указанную в источнике верность отряда.', undefined, faction?.ruleId, faction?.source)

  for (const unit of c.units.filter((u) => u.factionId === w.factionId || u.mercenary)) {
    if (unit.variantId && unit.variantId !== w.variantId) continue
    const effective = effectiveUnit(c, w, unit.id)!, count = countUnit(unit.id)
    if (count < effective.min) add(`min-${unit.id}`, 'error', `${unit.name}: требуется минимум ${effective.min}, сейчас ${count}.`, undefined,
      variant?.unitMinimums?.[unit.id] !== undefined ? variant.ruleId : unit.ruleId,
      variant?.unitMinimums?.[unit.id] !== undefined ? variant.source : unit.source)
    if (effective.max !== null && count > effective.max) add(`max-${unit.id}`, 'error', `${unit.name}: допустимо ${effective.max}, сейчас ${count}.`, undefined,
      variant?.unitLimits?.[unit.id] !== undefined ? variant.ruleId : unit.ruleId,
      variant?.unitLimits?.[unit.id] !== undefined ? variant.source : unit.source)
    for (const aggregate of records(rulesOf(unit).aggregateLimits)) {
      const ids = strings(aggregate.unitIds), count = w.units.filter((m) => ids.includes(m.unitId)).length
      if (count > number(aggregate.max, Infinity)) add('aggregate-limit', 'error', `Совокупный лимит профилей: ${aggregate.max}, сейчас ${count}.`, undefined, unit.ruleId, unit.source)
    }
    const ur = rulesOf(unit), countRule = record(ur.modelCountRule)
    const keywordRatio = strings(record(record(ur.composition).countOfThisUnit).lt && record(record(record(ur.composition).countOfThisUnit).lt).countKeywords)
    const supporters = string(countRule.otherKeyword) ? [string(countRule.otherKeyword)] : keywordRatio
    if (count && supporters.length) {
      const other = regular.filter((m) => supporters.every((key) => modelKeywords(c, w, m).includes(key))).length
      if (count >= other) add('composition-ratio', 'error', `${unit.name} должно быть меньше, чем моделей с ${supporters.join(', ')}: ${count} против ${other}.`, undefined, unit.ruleId, unit.source)
    }
  }
  for (const aggregate of records(vr.aggregateLimits)) {
    const count = w.units.filter((m) => strings(aggregate.unitIds).includes(m.unitId)).length
    if (count > number(aggregate.max, Infinity)) add('aggregate-limit', 'error', `Совокупный лимит профилей: ${aggregate.max}, сейчас ${count}.`, undefined, variant?.ruleId, variant?.source)
    if (count < number(aggregate.min)) add('aggregate-minimum', 'error', `Совокупный минимум профилей: ${aggregate.min}, сейчас ${count}.`, undefined, variant?.ruleId, variant?.source)
  }
  if (!vr.leadershipRuleReplaces && Array.isArray(fr.leaderChoices)) {
    const ids = strings(fr.leaderChoices), choices = records(fr.leaderChoices).filter((choice) => choice.requiresUnitId)
    const selectedLeader = w.units.find((m) => m.id === w.leaderId)
    if (ids.length) {
      if (!w.units.some((m) => ids.includes(m.unitId))) add('leader-required', 'error', 'Отряд должен включать одного из разрешённых предводителей.', undefined, faction?.ruleId, faction?.source)
      if (w.leaderId && (!selectedLeader || !ids.includes(selectedLeader.unitId))) add('leader-choice', 'error', 'Выбранная модель не может возглавлять этот отряд.', undefined, faction?.ruleId, faction?.source)
      if (!w.leaderId && w.units.filter((m) => ids.includes(m.unitId)).length > 1) add('leader-choice', 'error', 'Выберите модель, которая возглавляет отряд.', undefined, faction?.ruleId, faction?.source)
    } else if (choices.length) {
      const choice = leaderChoice(c, w)
      if (!choice) add('leader-required', 'error', 'Выберите и включите предводителя отряда.', undefined, faction?.ruleId, faction?.source)
      else if (countUnit(string(choice.requiresUnitId)) < number(choice.min, 1))
        add('leader-required', 'error', 'Не выполнен минимальный состав выбранного предводителя.', undefined, faction?.ruleId, faction?.source)
      if (w.leaderId && !selectedLeader) add('leader-choice', 'error', 'Выбранная модель предводителя отсутствует.', undefined, faction?.ruleId, faction?.source)
    }
  }

  const purchasesByLimit = new Map<string, { quantity: number; offerId: string }>()
  const boundAlchemists = new Set<string>()
  for (const model of w.units) {
    const unit = effectiveUnit(c, w, model.unitId, model)
    if (!unit) { add('unknown-unit', 'error', `Неизвестный профиль: ${model.unitId}.`, model); continue }
    activate(unit)
    unit.linkedRuleIds.forEach((id) => activeRules.add(id))
    unit.abilityIds.forEach((id) => { const ability = c.abilities.find((a) => a.id === id); if (ability) activate(ability) })
    const ur = rulesOf(unit), keywords = modelKeywords(c, w, model), ups = selectedUpgrades(c, model)
    if (unit.factionId && unit.factionId !== w.factionId) add('unit-faction', 'error', 'Боец недоступен выбранной фракции.', model, unit.ruleId, unit.source)
    if (unit.variantId && unit.variantId !== w.variantId) add('unit-variant', 'error', 'Профиль доступен только в другом варианте фракции.', model, unit.ruleId, unit.source)
    if (unit.mercenary && unit.allowedFactions && !unit.allowedFactions.includes(w.factionId))
      add('mercenary-faction', 'error', 'Этот союзник не может быть нанят выбранной фракцией.', model, unit.ruleId, unit.source)
    if (unit.mercenary && variant?.banMercenaries) add('mercenary-ban', 'error', 'Этот вариант запрещает союзников.', model, variant.ruleId, variant.source)
    if (unit.mercenary && strings(vr.banMercenaryNames).some((name) => namesEqual(name, unit.name)))
      add('mercenary-ban', 'error', 'Этот вариант прямо запрещает данного союзника.', model, variant?.ruleId, variant?.source)
    if (!unit.mercenary && variant?.banKeywords?.some((key) => keywords.includes(key)))
      add('keyword-ban', 'error', `Вариант запрещает ${variant.banKeywords.join(', ')}.`, model, variant.ruleId, variant.source)
    if (!unit.mercenary && variant?.minimumModelDucats && !variant.minimumCostExempt?.includes(unit.id) && modelCost(c, w, model).cost.ducats < variant.minimumModelDucats)
      add('minimum-model-cost', 'error', `Стоимость модели со снаряжением должна быть не меньше ${variant.minimumModelDucats} дукатов.`, model, variant.ruleId, variant.source)
    if (ur.cannotBecomeElite && keywords.includes('ELITE')) add('elite-prohibited', 'error', 'Этот профиль не может стать ELITE.', model, unit.ruleId, unit.source)
    if (new Set(model.upgrades).size !== model.upgrades.length) add('duplicate-upgrade', 'error', 'Способность нельзя приобрести повторно.', model, unit.ruleId, unit.source)
    if (unit.manualCheck) add('profile-manual', 'manual', string(ur.equipmentUncertainty, 'У профиля есть отмеченные в источнике условия, требующие ручной проверки.'), model, unit.ruleId, unit.source)
    if (ur.purchaseContext) add('purchase-context', 'manual', `Источник ограничивает способ получения профиля: ${ur.purchaseContext}. Подтвердите кампанийную историю.`, model, unit.ruleId, unit.source)

    const gear = modelGear(c, w, model)
    const purchased = gear.filter((entry) => !entry.fixed)
    for (const entry of gear.filter((entry) => entry.fixed && !entry.item && !entry.definition.hands))
      add('fixed-item-profile', 'manual', `${entry.name}: включённый предмет сохранён; его отдельный профиль не связан с каталогом.`, model, unit.ruleId, unit.source)
    for (const purchase of model.equipment) if (!c.offers.some((o) => o.id === purchase.offerId)) add('unknown-item', 'error', `Неизвестная покупка: ${purchase.offerId}.`, model)
    for (const entry of purchased) {
      const offer = entry.offer!, item = entry.item
      activate(offer)
      if (item) activate(item)
      if (!item) { add('unknown-item-profile', 'error', `Нет профиля предмета ${offer.itemId}.`, model, offer.ruleId, offer.source); continue }
      if (!offerApplies(c, w, model, offer)) add('equipment-access', 'error', `${offer.name}: недоступен бойцу или выбранному варианту. ${offer.notes}`, model, offer.ruleId, offer.source)
      if (offer.manualCheck || item.unresolved || item.definition.manualCheck)
        add('special-item-manual', 'manual', string(record(offer.definition.profileLink).note, `${offer.name}: профиль или дополнительные условия покупки требуют сверки.`), model, offer.ruleId, offer.source)
      if (offer.category === 'armour' && item.armourModifier == null)
        add('armour-profile', 'manual', `${offer.name}: числовой модификатор брони не представлен в проверенной записи; показанный профиль неполон.`, model, item.ruleId, item.source)
      const raw = { ...offer.definition, ...record(offer.definition.restrictions) }
      const requiredNames = [...strings(raw.requiresItemNames), ...(raw.requiresItemName ? [string(raw.requiresItemName)] : [])]
      const requiredIds = offer.requiresItemIds ?? []
      const hasRequired = gear.some((g) => requiredIds.includes(g.item?.id ?? '') || requiredNames.some((name) => gearHasName(c, g, name, w.factionId))) ||
        ups.some((up) => requiredNames.some((name) => namesEqual(name, string(rulesOf(up).countsAs))))
      if ((requiredNames.length || requiredIds.length) && !hasRequired)
        add('item-prerequisite', 'error', `${offer.name}: отсутствует обязательное снаряжение.`, model, offer.ruleId, offer.source)
      if (rulesOf(item).requiresBayonetLug && !gear.some((g) => g.offer?.definition.bayonetLug || /штыковое крепление/i.test(string(record(g.offer?.definition.restrictions).sourceText))))
        add('bayonet-mount', 'error', 'Штык требует оружие со штыковым креплением.', model, item.ruleId, item.source)
      for (const name of strings(item.definition.forbiddenWithItemNames)) if (gear.some((g) => g !== entry && gearHasName(c, g, name, w.factionId)))
        add('incompatible-items', 'error', `${entry.name} несовместим с ${name}.`, model, item.ruleId, item.source)
      if (unit.maxItemDucats !== undefined && offer.cost.glory > 0)
        add('glory-price-bound', 'manual', 'Источник ограничивает цену в дукатах и не определяет применение этого ограничения к Славе.', model, unit.ruleId, unit.source)
      if (!unit.mercenary) {
        const banned = variant?.banWeaponKeywords?.find((key) => item.keywords.some((k) => k.startsWith(key)))
        const convertedGas = vr.grenadeLauncherGasVariant && item.englishName === 'Grenade Launcher'
        if (banned && !convertedGas && !variant?.weaponKeywordExceptions?.includes(item.id))
          add('weapon-keyword-ban', 'error', `${entry.name}: вариант запрещает ${banned}.`, model, variant?.ruleId, variant?.source)
        const exempt = [...(offer.exemptLimitUnitIds ?? []), ...strings(raw.limitExemptUnitIds)]
        if (!exempt.includes(unit.id)) {
          const key = string(raw.sharedLimitGroup, offer.itemId)
          const old = purchasesByLimit.get(key)
          purchasesByLimit.set(key, { quantity: (old?.quantity ?? 0) + entry.quantity, offerId: old?.offerId ?? offer.id })
        }
      }
    }
    const compulsory = record(ur.compulsoryPurchase)
    if (compulsory.name) {
      const replacement = record(compulsory.replacement)
      const count = purchased.filter((g) => gearHasName(c, g, string(compulsory.name), w.factionId) || g.category === replacement.category)
        .reduce((sum, g) => sum + g.quantity, 0)
      if (count < number(compulsory.quantity, 1)) add('compulsory-purchase', 'error', `Обязательная покупка: ${compulsory.name} или разрешённая замена.`, model, unit.ruleId, unit.source)
    }
    for (const requirement of records(ur.equipmentRequirements)) {
      const categories = requirement.category ? [string(requirement.category)] : strings(requirement.categories)
      const count = gear.filter((g) => categories.includes(g.category) && !(requirement.excludeShields && g.item?.shield))
        .reduce((sum, g) => sum + g.quantity, 0)
      if (requirement.kind === 'atLeastOne' && count < number(requirement.min, 1)) add('equipment-required', 'error', `Требуется снаряжение категории ${categories.join(', ')}.`, model, unit.ruleId, unit.source)
    }
    if (unit.requireWeapon && !gear.some((g) => ['ranged', 'melee'].includes(g.category))) add('weapon-required', 'error', 'Профиль должен иметь хотя бы одно разрешённое оружие.', model, unit.ruleId, unit.source)
    if (unit.requireArmour && !gear.some((g) => g.category === 'armour' && !g.item?.shield)) add('armour-required', 'error', 'Профиль должен иметь броню, кроме щита.', model, unit.ruleId, unit.source)
    const requiredArmour = !unit.mercenary && record(vr.requiredArmourByUnit)[unit.id]
    if (requiredArmour && !gear.some((g) => gearHasName(c, g, string(requiredArmour), w.factionId)))
      add('variant-armour-required', 'error', `Вариант требует ${requiredArmour}.`, model, variant?.ruleId, variant?.source)
    checkCapacity(c, w, unit, model, gear, add)

    for (const group of unit.loadoutGroups) {
      const selected = model.loadouts[group.id]
      if (selected && !group.choices.some((choice) => choice.id === selected)) add('loadout-choice', 'error', `Неизвестный набор: ${selected}.`, model, group.source.sectionId, group.source)
      if (!selected && group.min > 0) add('loadout-required', 'error', `Выберите набор: ${group.name}.`, model, group.source.sectionId, group.source)
    }
    if (model.loadouts.profile && !profileChoices(unit).some((choice) => choice.id === model.loadouts.profile))
      add('profile-choice', 'error', 'Выбран неизвестный вариант профиля.', model, unit.ruleId, unit.source)
    for (const ban of records(vr.bannedProfileChoices)) if (!unit.mercenary && ban.unitId === unit.id && ban.choiceId === model.loadouts.profile)
      add('profile-choice-ban', 'error', 'Вариант отряда запрещает выбранный профиль.', model, variant?.ruleId, variant?.source)
    const ability = record(ur.abilitySelection)
    if (Object.keys(ability).length) {
      const replacement = record(record(vr.abilityOptionsReplacing)[unit.id])
      const options = [...strings(ability.options).filter((name) => name !== replacement.replaces),
        ...strings(record(vr.abilityOptionsAdded)[unit.id]), ...strings(replacement.options)]
      if (!options.includes(model.loadouts.ability ?? '')) add('ability-choice', 'error', 'Выберите допустимую способность профиля.', model, variant?.ruleId ?? unit.ruleId, variant?.source ?? unit.source)
    }
    const purchasePolicy = record(ur.purchasePolicy)
    const purchasedWeapons = purchased.filter((g) => g.category === purchasePolicy.category).reduce((n, g) => n + g.quantity, 0)
    if (typeof purchasePolicy.maxWeapons === 'number' && purchasedWeapons > purchasePolicy.maxWeapons)
      add('purchase-policy-limit', 'error', `Допустимо покупок оружия: ${purchasePolicy.maxWeapons}.`, model, unit.ruleId, sourceFrom(purchasePolicy.source, unit.source))
    const ranged = record(record(ur.allowedEquipment).ranged)
    if (typeof ranged.maxWeapons === 'number' && purchased.filter((g) => g.category === 'ranged').reduce((sum, g) => sum + g.quantity, 0) > ranged.maxWeapons)
      add('ranged-count', 'error', `Допустимо дальнобойных оружий: ${ranged.maxWeapons}.`, model, unit.ruleId, unit.source)
    const fixedReplacement = record(ur.fixedWeaponReplacement)
    if (Object.keys(fixedReplacement).length && purchased.filter((g) => record(g.offer?.definition.restrictions).replacesFixedItemName).reduce((sum, g) => sum + g.quantity, 0) > number(fixedReplacement.count, 1))
      add('fixed-weapon-replacement', 'error', 'Можно заменить только один указанный встроенный предмет.', model, variant?.ruleId, variant?.source)

    const groups = new Map<string, number>()
    for (const id of model.upgrades) {
      const up = c.upgrades.find((up) => up.id === id)
      if (!up) { add('unknown-upgrade', 'error', `Неизвестная способность: ${id}.`, model); continue }
      activate(up)
      const rule = rulesOf(up)
      if (!upgradeApplies(c, w, model, up)) add('upgrade-access', 'error', `${up.name}: улучшение недоступно этому профилю.`, model, up.ruleId, up.source)
      if (up.requiresUpgradeIds?.some((required) => !model.upgrades.includes(required))) add('upgrade-prerequisite', 'error', `${up.name}: отсутствуют обязательные улучшения.`, model, up.ruleId, up.source)
      if (up.forbiddenUpgradeIds?.some((forbidden) => model.upgrades.includes(forbidden))) add('upgrade-incompatible', 'error', `${up.name}: несовместимое сочетание улучшений.`, model, up.ruleId, up.source)
      const exclusion = record(rule.conditionalExclusion)
      if (model.upgrades.includes(string(exclusion.otherUpgradeId)) && !model.upgrades.includes(string(exclusion.unlessUpgradeId)))
        add('upgrade-conditional-exclusion', 'error', `${up.name}: это сочетание требует ${c.upgrades.find((u) => u.id === exclusion.unlessUpgradeId)?.name ?? exclusion.unlessUpgradeId}.`, model, up.ruleId, up.source)
      if (up.group) {
        const count = (groups.get(up.group) ?? 0) + 1
        groups.set(up.group, count)
        if (count > up.groupLimitPerModel) add('upgrade-group', 'error', `Из группы «${up.group}» допустимо ${up.groupLimitPerModel} улучшений.`, model, up.ruleId, up.source)
      }
      if (up.manualCheck) add('upgrade-manual', 'manual', `${up.name}: источник содержит условия для ручной проверки.`, model, up.ruleId, up.source)
      if (rule.acquisition === 'after-recruitment') add('upgrade-acquisition', 'manual', `${up.name}: подтвердите получение после найма.`, model, up.ruleId, up.source)
    }
    const powerPurchase = record(ur.powerPurchase)
    if (Object.keys(powerPurchase).length) {
      const count = ups.filter((up) => up.power && rulesOf(up).countsTowardPowerLimit !== false).length
      const max = number(record(powerPurchase.maxByAllegiance)[w.allegiance], number(powerPurchase.max))
      if (count < number(powerPurchase.min) || count > max) add('powers', 'error', `GOETIC: допустимо ${number(powerPurchase.min)}–${max} приобретённых сил, сейчас ${count}.`, model, unit.ruleId, unit.source)
    }
    if (ur.requiresBoundAlchemist) {
      const boundUnitId = string(ur.boundUnitId), boundId = model.loadouts['bound-alchemist']
      if (!boundUnitId) add('bound-alchemist-rule', 'manual', 'Целевой профиль связанного Алхимика не представлен структурированно.', model, unit.ruleId, unit.source)
      else if (!boundId || !w.units.some((m) => m.id === boundId && m.unitId === boundUnitId))
        add('bound-alchemist', 'error', 'Выберите присутствующего в отряде связанного Алхимика.', model, unit.ruleId, unit.source)
      else if (boundAlchemists.has(boundId)) add('homunculus-ratio', 'error', 'У одного Алхимика может быть только один Гомункул.', model, unit.ruleId, unit.source)
      else boundAlchemists.add(boundId)
      if (ur.cannotDeployWithoutLivingBoundAlchemist && w.format === 'campaign') add('bound-alchemist-alive', 'manual', 'Перед выставлением подтвердите, что связанный Алхимик жив и участвует в битве.', model, unit.ruleId, unit.source)
    }
    const bullSpecific = purchased.filter((g) => (g.offer?.allowedUnitIds ?? []).some((id) => number(rulesOf(c.units.find((u) => u.id === id) ?? unit).maxBullSpecificWeapons) > 0)).reduce((sum, g) => sum + g.quantity, 0)
    const bullMax = ups.map((up) => number(rulesOf(up).allowedBullSpecificWeaponCount)).find((max) => max > 0) ?? number(ur.maxBullSpecificWeapons, Infinity)
    if (bullSpecific > bullMax) add('specific-weapon-limit', 'error', `Допустимо специальных оружий Бронзового Быка: ${bullMax}.`, model, unit.ruleId, unit.source)
  }

  for (const { quantity, offerId } of purchasesByLimit.values()) {
    const offer = effectiveOffer(c, w, offerId)
    if (!offer || offer.limit === null || offer.limit === 0) continue
    if (offer.limitScope === 'campaign' && w.format !== 'campaign') continue
    if (quantity > offer.limit) add('item-limit', 'error', `${offer.name}: лимит ${offer.limit}, приобретено ${quantity}.`, undefined, offer.ruleId, offer.source)
    if (offer.limitScope === 'campaign') add('campaign-item-limit', 'manual', `${offer.name}: в лимит кампании могут входить покупки вне текущего состава. Подтвердите историю арсенала.`, undefined, offer.ruleId, offer.source)
    if (String(offer.limitScope) === 'unspecified') add('item-limit-scope', 'manual', `${offer.name}: источник не задаёт область учёта лимита; текущий состав проверен.`, undefined, offer.ruleId, offer.source)
  }
  const checkedRatios = new Set<string>()
  for (const up of c.upgrades) {
    const rule = rulesOf(up), override = record(vr.unitUpgradeLimits)[up.id]
    const limit = typeof override === 'number' ? override : up.limit
    if (limit !== null && w.units.filter((m) => m.upgrades.includes(up.id)).length > limit)
      add('upgrade-limit', 'error', `${up.name}: лимит ${limit}.`, undefined, override === undefined ? up.ruleId : variant?.ruleId, override === undefined ? up.source : variant?.source)
    const ratio = record(rule.limitRule), key = JSON.stringify(ratio)
    if (ratio.fractionOfUnit && !checkedRatios.has(key)) {
      checkedRatios.add(key)
      const equivalent = c.upgrades.filter((other) => JSON.stringify(record(rulesOf(other).limitRule)) === key).map((other) => other.id)
      const count = w.units.filter((m) => m.upgrades.some((id) => equivalent.includes(id))).length
      const max = Math.floor(countUnit(string(ratio.fractionOfUnit)) * number(ratio.numerator, 1) / number(ratio.denominator, 1))
      if (count > max) add('upgrade-ratio', 'error', `${up.name}: долевой лимит ${max}, улучшено моделей ${count}.`, undefined, up.ruleId, up.source)
    }
    for (const scoped of records(rule.limitRules)) {
      const models = w.units.filter((m) => m.upgrades.includes(up.id))
      const count = scoped.scope === 'non-ELITE' ? models.filter((m) => !modelKeywords(c, w, m).includes('ELITE')).length
        : scoped.scope === 'lieutenant' ? models.filter((m) => c.units.find((u) => u.id === m.unitId)?.keywords.includes('LEADER')).length : models.length
      if (count > number(scoped.max, Infinity)) add('upgrade-scope-limit', 'error', `${up.name}: лимит ${scoped.max} для ${scoped.scope}.`, undefined, up.ruleId, up.source)
    }
  }
  if (variant?.heavyRangedLimit !== undefined) {
    const count = regular.reduce((sum, m) => sum + modelGear(c, w, m).filter((g) => g.category === 'ranged' && g.item?.keywords.includes('HEAVY')).reduce((n, g) => n + g.quantity, 0), 0)
    if (count > variant.heavyRangedLimit) add('heavy-ranged-limit', 'error', `Допустимо дальнобойных HEAVY: ${variant.heavyRangedLimit}, сейчас ${count}.`, undefined, variant.ruleId, variant.source)
  }
  checkFireteams(c, w, add)
  checkForeignArsenals(c, w, add)
  if (variant?.manualCheck) add('variant-manual', 'manual', 'Вариант содержит отмеченные источником условия для ручной проверки.', undefined, variant.ruleId, variant.source)
  for (const constraint of c.constraints) if ((!constraint.factionId || constraint.factionId === w.factionId) &&
    (!constraint.variantId || constraint.variantId === w.variantId) &&
    ((constraint.factionId || constraint.variantId) || activeRules.has(constraint.ruleId) || activeRules.has(constraint.source.sectionId ?? '')))
    add(constraint.id, constraint.severity, constraint.message, undefined, constraint.ruleId, constraint.source)
  return { diagnostics, status: diagnostics.some((d) => d.severity === 'error') ? 'invalid'
    : diagnostics.some((d) => d.severity === 'manual') ? 'needs-review' : 'valid' }
}

type Add = (code: string, severity: Diagnostic['severity'], message: string, model?: Model, ruleId?: string, source?: SourceRef) => void
const gearHasName = (c: Catalog, gear: ModelGear, name: string, faction: string): boolean =>
  namesEqual(gear.name, name) || itemHasName(gear.item, name) ||
  [string(gear.definition.countsAs), ...strings(gear.definition.countsAs), ...strings(gear.item?.definition.countsAs),
    string(gear.item?.definition.countsAsItemName)].some((alias) => alias && (namesEqual(alias, name) || itemHasName(findItem(c, alias, faction), name)))

function checkCapacity(c: Catalog, w: Warband, unit: Unit, model: Model, gear: ModelGear[], add: Add) {
  const ur = rulesOf(unit), keywords = modelKeywords(c, w, model), strong = keywords.includes('STRONG')
  const exceptions = records(ur.equipmentExceptions), ups = selectedUpgrades(c, model).map(rulesOf)
  const source = c.procedures.find((p) => p.kind === 'equipmentCapacity')?.source ?? unit.source
  const ruleId = source.sectionId ?? unit.ruleId
  const functional = equipmentExceptions(unit, 'functionalHands')[0]
  const extraHands = ups.map((rule) => number(rule.handsWithHumanHands)).find((n) => n > 0)
  const hands = number(functional?.count, extraHands && ups.some((rule) => rule.unlockWeaponPurchases) ? extraHands : 2)
  const strongHands = equipmentExceptions(unit, 'strongHands')[0]
  const shields = gear.filter((g) => g.item?.shield)
  const incompatibleArmour = gear.filter((g) => g.item && rulesOf(g.item).disallowShields)
  for (const shield of shields) if (incompatibleArmour.length) {
    const requirements = { ...shield.definition, ...record(shield.offer?.definition.restrictions) }
    const names = [...strings(requirements.requiresItemNames), ...(requirements.requiresItemName ? [string(requirements.requiresItemName)] : [])]
    const contradictory = incompatibleArmour.some((armour) => names.some((name) => gearHasName(c, armour, name, w.factionId)))
    if (contradictory) add('shield-source-conflict', 'manual', 'Источник одновременно требует эту броню для щита (стр.67) и запрещает броне любые щиты (стр.127). Согласуйте трактовку с оппонентом.', model, shield.offer?.ruleId ?? ruleId, { source: 'core', pages: [67, 127] })
    else add('shield-prohibited', 'error', 'Выбранная броня запрещает любые щиты.', model, incompatibleArmour[0]?.item?.ruleId ?? ruleId, incompatibleArmour[0]?.item?.source ?? source)
  }
  const ignoreCompatibility = exceptions.some((e) => e.kind === 'ignoreShieldCompatibility')
  let heavyDiscounted = 0
  const handUse = (g: ModelGear): number | null => {
    if (rulesOf(g.item ?? { definition: g.definition }).excludedFromMeleeCapacity) return 0
    const rawHands = g.definition.treatedAsHands ?? g.definition.hands ?? g.item?.hands
    if (typeof rawHands !== 'number') return null
    let value = rawHands
    if (strongHands && g.item?.keywords.includes('HEAVY') && heavyDiscounted < number(strongHands.maxHeavyWeapons)) {
      heavyDiscounted += g.quantity
      value = number(strongHands.handsPerHeavyWeapon, 1)
    } else if (g.category === 'melee' && strong && value === 2) value = 1
    const compatible = g.definition.shieldCompatible || /совместим с щитом/i.test(string(record(g.offer?.definition.restrictions).sourceText))
    if (shields.length && compatible && !ignoreCompatibility) value = Math.min(value, 1)
    return value
  }
  const weapons = gear.filter((g) => ['ranged', 'melee'].includes(g.category) && !g.item?.keywords.includes('GRENADE') && !number(g.definition.alwaysOccupiesHands))
  const carried = gear.filter((g) => !weapons.includes(g)).reduce((sum, g) =>
    sum + number(g.definition.alwaysOccupiesHands, number(g.item?.carriedHands, g.item?.shield ? 1 : 0)) * g.quantity, 0)
  const uses = weapons.map((g) => ({ gear: g, hands: handUse(g) }))
  if (uses.some((g) => g.hands === null && !g.gear.fixed))
    add('unknown-hands', 'manual', 'У выбранного оружия не представлены проверенные данные о руках; вместимость неполна.', model, ruleId, source)
  if (functional) {
    const used = carried + uses.reduce((sum, entry) => sum + number(entry.hands) * entry.gear.quantity, 0)
    if (used > hands) add('hands', 'error', `Доступно рук: ${hands}, требуется ${used}.`, model, unit.ruleId, unit.source)
  } else for (const category of ['ranged', 'melee']) {
    const used = carried + uses.filter((entry) => entry.gear.category === category).reduce((sum, entry) => sum + number(entry.hands) * entry.gear.quantity, 0)
    if (used > hands) {
      const privateCombination = unit.loadoutGroups.some((group) => group.choices.some((choice) => choice.id === model.loadouts[group.id]))
        && uses.filter((entry) => entry.gear.category === category).every((entry) => entry.gear.fixed)
      add('hands', privateCombination ? 'manual' : 'error', `Оружие ${category === 'ranged' ? 'дальнего' : 'ближнего'} боя и постоянно занятые руки: ${used} из ${hands}.${privateCombination ? ' Личный набор прямо указан в профиле, но его сочетание требует согласовать с общим правилом рук.' : ''}`, model, privateCombination ? unit.ruleId : ruleId, privateCombination ? unit.source : source)
    }
  }
  const heavy = gear.filter((g) => g.item?.keywords.includes('HEAVY')).reduce((sum, g) => sum + g.quantity, 0)
  const heavyMax = strongHands ? number(strongHands.maxHeavyWeapons, Infinity) : strong ? Infinity : 1
  if (heavy > heavyMax) add('heavy-limit', 'error', `Допустимо предметов HEAVY: ${heavyMax}, сейчас ${heavy}.`, model, unit.ruleId, unit.source)
  const maxWeapons = equipmentExceptions(unit, 'maxWeapons')[0]
  if (maxWeapons && weapons.reduce((sum, g) => sum + g.quantity, 0) > number(maxWeapons.max)) add('weapon-count', 'error', `Допустимо оружий: ${maxWeapons.max}.`, model, unit.ruleId, unit.source)
  const maxTwo = equipmentExceptions(unit, 'maxTwoHandedWeapons')[0]
  if (maxTwo && weapons.filter((g) => (g.definition.hands ?? g.item?.hands) === 2).reduce((sum, g) => sum + g.quantity, 0) > number(maxTwo.max))
    add('two-handed-count', 'error', `Допустимо двуручных оружий: ${maxTwo.max}.`, model, unit.ruleId, unit.source)
  const armour = gear.filter((g) => g.category === 'armour' && !g.item?.shield)
  if (armour.reduce((sum, g) => sum + g.quantity, 0) > 1) add('one-armour', 'error', 'Допустим только один комплект брони, включая встроенную.', model, ruleId, source)
  const headgear = gear.filter((g) => g.item?.headgear || strings(g.definition.countsAs).some((name) => findItem(c, name, w.factionId)?.headgear))
  if (headgear.reduce((sum, g) => sum + g.quantity, 0) > 1) add('one-headgear', 'error', 'Допустим только один тип головного убора, включая встроенный.', model, ruleId, source)
  const grenadeTypes = new Set(gear.filter((g) => g.item?.keywords.includes('GRENADE') || /гранат/i.test(string(g.item?.definition.type))).map((g) => g.item?.id ?? g.name))
  if (grenadeTypes.size > 1) add('grenade-types', 'error', 'Можно нести только один тип гранат.', model, ruleId, source)
  const totals = new Map<string, number>()
  for (const g of gear) {
    const key = g.item?.id ?? g.name
    totals.set(key, (totals.get(key) ?? 0) + g.quantity)
  }
  for (const g of gear) {
    const maxType = equipmentExceptions(unit, 'maxQuantityPerWeaponType')[0]
    const maxSpecific = equipmentExceptions(unit, 'maxItemQuantity').find((e) => gearHasName(c, g, string(e.itemName), w.factionId))
    const weaponsTypeLimit = maxType && ['ranged', 'melee'].includes(g.category) ? number(maxType.max) : Infinity
    const personal = number(g.offer?.definition.perModelLimit, number(g.item?.definition.perModelLimit, g.category === 'equipment' ? 1 : Infinity))
    const max = Math.min(weaponsTypeLimit, maxSpecific ? number(maxSpecific.max) : Infinity, personal)
    if ((totals.get(g.item?.id ?? g.name) ?? 0) > max) add('item-per-model-limit', 'error', `${g.name}: на модель допустимо ${max}.`, model, g.item?.ruleId ?? ruleId, g.source)
    for (const exception of exceptions) {
      if ((exception.kind === 'forbidKeyword' && g.item?.keywords.includes(string(exception.keyword))) ||
        (exception.kind === 'forbidWeaponType' && namesEqual(string(g.item?.definition.type), string(exception.type))))
        add('equipment-exception', 'error', `${g.name}: профиль запрещает этот тип вооружения.`, model, unit.ruleId, unit.source)
    }
  }
  if (shields.reduce((sum, g) => sum + g.quantity, 0) > 1) add('one-shield', 'error', 'Модель может нести только один щит.', model, ruleId, source)
}

function checkFireteams(c: Catalog, w: Warband, add: Add) {
  const faction = c.factions.find((f) => f.id === w.factionId), variant = getVariant(c, w)
  const factionRule = faction ? record(rulesOf(faction).fireteam) : {}, vr = variant ? rulesOf(variant) : {}
  const teams = new Map<string, Model[]>()
  for (const model of w.units) if (model.fireteam.trim()) teams.set(model.fireteam, [...(teams.get(model.fireteam) ?? []), model])
  let ordinary = 0
  for (const [name, members] of teams) {
    const special = members.flatMap((model) => {
      const unit = c.units.find((u) => u.id === model.unitId)
      const entries = unit ? [{ rule: record(rulesOf(unit).fireteam), source: unit.source, ruleId: unit.ruleId }] : []
      entries.push(...selectedUpgrades(c, model).map((up) => ({ rule: record(rulesOf(up).fireteam), source: up.source, ruleId: up.ruleId })))
      return entries.filter((entry) => entry.rule.additional).map((entry) => ({ ...entry, model }))
    })
    if (members.length !== number(factionRule.size, number(vr.fireteamModels, 2)))
      add('fireteam-size', 'error', `FIRETEAM «${name}» должна состоять из двух моделей.`, undefined, faction?.ruleId, faction?.source)
    if (special.length) {
      for (const entry of special) {
        const partner = members.find((model) => model.id !== entry.model.id)
        if (partner && strings(entry.rule.partnerRequiredKeywords).some((key) => !modelKeywords(c, w, partner).includes(key)))
          add('fireteam-partner', 'error', 'Партнёр этой модели в FIRETEAM должен иметь ELITE.', entry.model, entry.ruleId, entry.source)
      }
    } else {
      ordinary += 1
      const limit = variant?.fireteamLimit ?? faction?.fireteamLimit ?? 0
      if (!limit) add('fireteam-access', 'error', 'Этот отряд не может формировать обычную FIRETEAM.', members[0], variant?.ruleId ?? faction?.ruleId, variant?.source ?? faction?.source)
      if (factionRule.excludeMercenaries && members.some((model) => c.units.find((u) => u.id === model.unitId)?.mercenary))
        add('fireteam-mercenary', 'error', 'Обычная FIRETEAM фракции не может включать союзников без явного исключения.', undefined, faction?.ruleId, faction?.source)
    }
  }
  if (ordinary > (variant?.fireteamLimit ?? faction?.fireteamLimit ?? 0)) add('fireteam-limit', 'error', 'Превышено число обычных FIRETEAM отряда.', undefined, variant?.ruleId ?? faction?.ruleId, variant?.source ?? faction?.source)
}

function checkForeignArsenals(c: Catalog, w: Warband, add: Add) {
  if (!w.foreignOfferIds.length) return
  const variant = getVariant(c, w), vr = variant ? rulesOf(variant) : {}
  const selections = records(vr.foreignArsenalSelections), collection = record(vr.foreignWeaponCollection)
  if (!selections.length && !Object.keys(collection).length) {
    add('foreign-arsenal', 'error', 'Вариант не предоставляет выбор иностранных арсеналов.', undefined, variant?.ruleId, variant?.source)
    return
  }
  if (new Set(w.foreignOfferIds).size !== w.foreignOfferIds.length) add('foreign-duplicate', 'error', 'Один иностранный предмет выбран повторно.', undefined, variant?.ruleId, variant?.source)
  const aliases = (id: string) => id === 'new-antioch' ? 'antioch' : id
  const allowed = selections.map((selection) => aliases(string(selection.factionId)))
  if (collection.factions) allowed.push(...strings(collection.factions).map(aliases))
  for (const id of w.foreignOfferIds) {
    const offer = c.offers.find((o) => o.id === id)
    if (!offer || !allowed.includes(offer.factionId) || offer.variantId) {
      add('foreign-arsenal', 'error', 'Выбран недоступный иностранный предмет.', undefined, variant?.ruleId, variant?.source)
      continue
    }
    if (collection.factions && !['ranged', 'melee'].includes(offer.category)) add('foreign-weapon', 'error', 'Коллекция может содержать только оружие.', undefined, variant?.ruleId, variant?.source)
    if (collection.requiresAbsentFromBaseArsenal && c.offers.some((o) => o.factionId === w.factionId && !o.variantId && o.itemId === offer.itemId))
      add('foreign-base-item', 'error', 'Это оружие уже присутствует в базовом арсенале.', undefined, variant?.ruleId, variant?.source)
  }
  for (const selection of selections) if (w.foreignOfferIds.filter((id) => c.offers.find((o) => o.id === id)?.factionId === aliases(string(selection.factionId))).length > number(selection.count))
    add('foreign-selection-count', 'error', 'Превышено число выбранных предметов иностранного арсенала.', undefined, variant?.ruleId, variant?.source)
  if (collection.manualCheck) add('foreign-collection-manual', 'manual', 'Источник неоднозначно задаёт общий размер коллекции оружия; требуется ручное решение.', undefined, variant?.ruleId, variant?.source)
}
