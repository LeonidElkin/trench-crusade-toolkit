import type { Catalog, Model, SourceRef, Warband } from './schema'
import {
  effectiveOffer,
  effectiveUnit,
  getVariant,
  modelCost,
  modelKeywords,
  offerApplies,
  upgradeApplies,
  warbandCost,
} from './warband'
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
  const diagnostics: Diagnostic[] = []
  const add = (
    code: string,
    severity: Diagnostic['severity'],
    message: string,
    model?: Model,
    ruleId?: string,
    source?: SourceRef,
  ) => diagnostics.push({ code, severity, message, modelId: model?.id, ruleId, source })
  const v = getVariant(c, w),
    faction = c.factions.find((f) => f.id === w.factionId)
  if (w.editionId !== c.edition || w.revision !== c.revision)
    add(
      'edition',
      'error',
      'Редакция или ревизия отряда недоступна. Расчёт по другой базе запрещён.',
    )
  if (!faction) add('faction', 'error', 'Фракция не найдена в этой редакции.')
  if (w.variantId && !v) add('variant', 'error', 'Этот вариант не принадлежит выбранной фракции.')
  const total = warbandCost(c, w)
  if (!total.complete)
    add(
      'incomplete-cost',
      'error',
      'Стоимость неполная: в отряде есть неизвестные сущности или недоступная ревизия.',
    )
  for (const currency of ['ducats', 'glory'] as const)
    if (total.cost[currency] > w.budget[currency])
      add(
        `budget-${currency}`,
        'error',
        `Превышен бюджет: ${currency === 'ducats' ? 'дукаты' : 'Слава'} — ${total.cost[currency]} из ${w.budget[currency]}.`,
      )
  if (!w.units.length) add('empty', 'warning', 'Отряд пока пуст. Добавьте бойцов.')
  const countUnit = (id: string) => w.units.filter((m) => m.unitId === id).length
  const regular = w.units.filter((m) => !effectiveUnit(c, w, m.unitId)?.mercenary)
  for (const u of c.units.filter((u) => u.factionId === w.factionId || u.mercenary)) {
    if (u.variantId && u.variantId !== w.variantId) continue
    const effective = effectiveUnit(c, w, u.id)!,
      n = countUnit(u.id)
    if (n < effective.min)
      add(
        `min-${u.id}`,
        'error',
        `Обязательный состав: ${u.name} — минимум ${effective.min}, сейчас ${n}.`,
        undefined,
        u.ruleId,
        u.source,
      )
    if (effective.max !== null && n > effective.max)
      add(
        `max-${u.id}`,
        'error',
        `${u.name}: допустимо ${effective.max}, в отряде ${n}.`,
        undefined,
        v?.ruleId ?? u.ruleId,
        v?.source ?? u.source,
      )
  }
  if (w.factionId === 'court' && !countUnit('court.praetor') && !countUnit('court.sorcerer'))
    add(
      'court-leader',
      'error',
      'При создании отряд Двора должен включать Претора или Колдуна в роли лидера.',
      undefined,
      c.units.find((u) => u.id === 'court.praetor')?.ruleId,
    )
  if (
    w.factionId === 'court' &&
    !['wrath', 'envy', 'lust', 'pride', 'sloth', 'gluttony', 'greed'].includes(w.allegiance)
  )
    add('sin', 'error', 'Выберите один из Семи Смертных Грехов.', undefined, faction?.ruleId)
  if (
    w.factionId === 'grail' &&
    w.variantId !== 'hegemon' &&
    !countUnit('grail.lord') &&
    !countUnit('grail.knight')
  )
    add(
      'grail-leader',
      'error',
      'Выберите предводителя: Повелитель Опухолей или Чумной Рыцарь.',
      undefined,
      c.units.find((u) => u.id === 'grail.lord')?.ruleId,
    )
  const itemTotals = new Map<string, number>()
  for (const m of w.units) {
    const u = effectiveUnit(c, w, m.unitId, m)
    if (!u) {
      add('unknown-unit', 'error', `Неизвестный профиль: ${m.unitId}.`, m)
      continue
    }
    const ks = modelKeywords(c, w, m)
    if (u.factionId && u.factionId !== w.factionId)
      add('unit-faction', 'error', 'Боец недоступен выбранной фракции.', m, u.ruleId)
    if (u.variantId && u.variantId !== w.variantId)
      add(
        'unit-variant',
        'error',
        'Профиль доступен только в другом варианте фракции.',
        m,
        u.ruleId,
      )
    if (u.mercenary && !u.allowedFactions?.includes(w.factionId))
      add(
        'mercenary-faction',
        'error',
        'Этот наёмник не может быть нанят выбранной фракцией.',
        m,
        u.ruleId,
      )
    if (u.mercenary && v?.banMercenaries)
      add('mercenary-ban', 'error', 'Этот вариант запрещает наёмников.', m, v.ruleId)
    if (!u.mercenary && v?.banKeywords?.some((k) => ks.includes(k)))
      add(
        'keyword-ban',
        'error',
        `Вариант запрещает модели с ${v.banKeywords.join(', ')}.`,
        m,
        v.ruleId,
      )
    if (
      v?.minimumModelDucats &&
      !u.mercenary &&
      !v.minimumCostExempt?.includes(u.id) &&
      modelCost(c, w, m).cost.ducats < v.minimumModelDucats
    )
      add(
        'minimum-model-cost',
        'error',
        `Модель вместе со снаряжением должна стоить минимум ${v.minimumModelDucats} дукатов.`,
        m,
        v.ruleId,
      )
    if (new Set(m.upgrades).size !== m.upgrades.length)
      add('duplicate-upgrade', 'error', 'Способность нельзя приобрести повторно.', m, u.ruleId)
    const groups = new Map<string, number>(),
      byItem = new Map<string, number>()
    const purchases = m.equipment.flatMap((e) => {
      const o = effectiveOffer(c, w, e.offerId)
      if (!o) {
        add('unknown-item', 'error', `Неизвестная покупка: ${e.offerId}.`, m)
        return []
      }
      const item = c.items.find((i) => i.id === o.itemId)
      if (!item) {
        add('unknown-item-profile', 'error', `Нет профиля предмета ${o.itemId}.`, m, o.ruleId)
        return []
      }
      if (!offerApplies(c, w, m, o))
        add(
          'equipment-access',
          'error',
          `${o.name}: недоступен этому бойцу или выбранному варианту. ${o.notes}`,
          m,
          o.ruleId,
          o.source,
        )
      if (!u.mercenary) itemTotals.set(o.itemId, (itemTotals.get(o.itemId) ?? 0) + e.quantity)
      byItem.set(o.itemId, (byItem.get(o.itemId) ?? 0) + e.quantity)
      if (o.manualCheck)
        add(
          'special-item-manual',
          'manual',
          `${o.name}: дополнительные условия специального арсенала требуют сверки.`,
          m,
          o.ruleId,
          o.source,
        )
      if (item.unresolved)
        add(
          'unresolved-item',
          'manual',
          `${o.name}: профиль не формализован; нужна сверка с источником.`,
          m,
          o.ruleId,
          o.source,
        )
      if (
        o.requiresItemIds &&
        !m.equipment.some((other) =>
          o.requiresItemIds?.includes(effectiveOffer(c, w, other.offerId)?.itemId ?? ''),
        ) &&
        !(
          o.requiresItemIds.some(
            (id) => c.items.find((i) => i.id === id)?.englishName === 'Machine Armour',
          ) && m.upgrades.includes('machine-armour')
        )
      )
        add(
          'item-prerequisite',
          'error',
          `${o.name}: отсутствует требуемое вооружение или броня.`,
          m,
          o.ruleId,
        )
      if (
        !u.mercenary &&
        v?.banWeaponKeywords?.some((k) => item.keywords.some((kw) => kw.startsWith(k))) &&
        !v.weaponKeywordExceptions?.includes(o.itemId)
      )
        add(
          'weapon-keyword-ban',
          'error',
          `${o.name}: вариант запрещает ${v.banWeaponKeywords.join(', ')}.`,
          m,
          v.ruleId,
        )
      if (
        u.specialRules?.includes('heavy-weapons-only') &&
        ['ranged', 'melee'].includes(o.category) &&
        !item.keywords.includes('HEAVY')
      )
        add(
          'heavy-only',
          'error',
          'Бронзовый Бык может использовать только оружие HEAVY.',
          m,
          u.ruleId,
        )
      if (
        u.specialRules?.includes('no-grenades') &&
        (item.keywords.includes('GRENADE') || /гранат/i.test(o.name))
      )
        add('no-grenades', 'error', 'Амальгама не может нести гранаты.', m, u.ruleId)
      if (
        u.specialRules?.includes('unrestricted-melee-only') &&
        (o.limit !== null ||
          o.allowedUnitIds ||
          o.requiredKeywords.length ||
          o.forbiddenKeywords.length)
      )
        add(
          'unrestricted-only',
          'error',
          'Хранитель Писаний может купить только оружие без ограничений.',
          m,
          u.ruleId,
        )
      return [{ e, o, item }]
    })
    if (u.requireWeapon && !purchases.some((p) => ['ranged', 'melee'].includes(p.o.category)))
      add('weapon-required', 'error', 'Несчастный должен иметь хотя бы одно оружие.', m, u.ruleId)
    if (
      !ks.includes('STRONG') &&
      purchases
        .filter((p) => p.item.keywords.includes('HEAVY'))
        .reduce((n, p) => n + p.e.quantity, 0) > 1
    )
      add(
        'heavy-limit',
        'error',
        'Без STRONG модель может нести только один предмет HEAVY.',
        m,
        c.keywords.find((k) => k.name === 'HEAVY')?.ruleId,
      )
    const armours = purchases.filter((p) => p.o.category === 'armour' && !p.item.shield)
    if (u.requireArmour && !armours.length)
      add(
        'armour-required',
        'error',
        'Чумной Рыцарь не может быть выставлен без комплекта брони.',
        m,
        u.ruleId,
      )
    if (
      armours.reduce((n, p) => n + p.e.quantity, 0) +
        (u.fixedItems.some((i) => i.category === 'armour') ? 1 : 0) >
      1
    )
      add(
        'one-armour',
        'error',
        'Можно носить только один комплект брони. Неснимаемая броня уже входит в профиль.',
        m,
        u.ruleId,
      )
    if (purchases.filter((p) => p.item.headgear).reduce((n, p) => n + p.e.quantity, 0) > 1)
      add('headgear', 'error', 'Модель не может носить несколько головных уборов.', m, u.ruleId)
    const shields = purchases.filter((p) => p.item.shield).reduce((n, p) => n + p.e.quantity, 0)
    if (shields > 1) add('shields', 'error', 'Модель несёт более одного щита.', m, u.ruleId)
    if (
      shields &&
      purchases.some((p) => p.item.englishName === 'Machine Armour') &&
      purchases.some((p) => p.item.englishName !== 'Heavy Ballistic Shield' && p.item.shield)
    )
      add('machine-shield', 'error', 'Машинная броня несовместима с обычным щитом.', m, u.ruleId)
    const held = purchases.reduce((n, p) => n + (p.item.carriedHands ?? 0) * p.e.quantity, 0)
    const special = u.specialRules ?? []
    const slots = (category: 'ranged' | 'melee') =>
      purchases
        .filter((p) => p.o.category === category)
        .reduce((n, p) => {
          let hands = p.item.hands ?? 0
          if (
            hands === 2 &&
            category === 'melee' &&
            !special.includes('six-arms') &&
            ks.includes('STRONG') &&
            !p.item.keywords.includes('CUMBERSOME')
          )
            hands = 1
          if (
            shields &&
            /совместим/i.test(p.o.notes) &&
            hands === 2 &&
            !special.includes('six-arms')
          )
            hands = 1
          return n + hands * p.e.quantity
        }, 0)
    if (special.includes('six-arms')) {
      if (slots('ranged') + slots('melee') + shields > 6)
        add('six-arms', 'error', 'Вооружение Амальгамы занимает более шести рук.', m, u.ruleId)
      if ([...byItem.values()].some((n) => n > 2))
        add(
          'two-identical',
          'error',
          'Амальгама может нести не более двух видов оружия одного типа.',
          m,
          u.ruleId,
        )
    } else if (special.includes('saint-arms')) {
      if (
        purchases.filter((p) => p.o.category === 'melee').reduce((n, p) => n + p.e.quantity, 0) >
          3 ||
        purchases.filter((p) => p.item.hands === 2).reduce((n, p) => n + p.e.quantity, 0) > 1
      )
        add(
          'saint-arms',
          'error',
          'Святой может нести до трёх оружий ближнего боя, только одно двуручное.',
          m,
          u.ruleId,
        )
    } else if (!u.equipmentLocked && u.id !== 'pilgrims.anchorite') {
      const extra = special.includes('hunter-hand') ? 1 : 0
      const capacity =
        u.id === 'sultanate.homunculus' &&
        m.upgrades.includes('additional-arm') &&
        m.upgrades.includes('human-hands')
          ? 3
          : 2
      if (
        slots('ranged') + shields + held > capacity ||
        slots('melee') + shields + held + extra > capacity
      )
        add(
          'hands',
          'error',
          'Превышены доступные слоты оружия: учитываются щит, знамена и неснимаемый Лук Леты.',
          m,
          u.ruleId,
        )
    }
    if (
      special.includes('one-ranged-under-30') &&
      (purchases.filter((p) => p.o.category === 'ranged').reduce((n, p) => n + p.e.quantity, 0) >
        1 ||
        purchases.some(
          (p) => p.o.category === 'ranged' && (p.o.cost.ducats > 30 || p.o.cost.glory > 0),
        ))
    )
      add(
        'yoke-ranged',
        'error',
        'Иго-Демон может нести одно дальнобойное оружие стоимостью не более 30 дукатов.',
        m,
        u.ruleId,
      )
    if (special.includes('one-melee') && purchases.reduce((n, p) => n + p.e.quantity, 0) > 1)
      add(
        'one-melee',
        'error',
        'Хранитель Писаний может купить одно оружие ближнего боя.',
        m,
        u.ruleId,
      )
    for (const upId of m.upgrades) {
      const up = c.upgrades.find((x) => x.id === upId)
      if (!up) {
        add('unknown-upgrade', 'error', `Неизвестное улучшение ${upId}.`, m)
        continue
      }
      if (!upgradeApplies(c, w, m, up))
        add('upgrade-access', 'error', `${up.name}: улучшение недоступно.`, m, up.ruleId)
      if (up.group) groups.set(up.group, (groups.get(up.group) ?? 0) + 1)
      if (up.locksEquipment && purchases.length)
        add(
          'upgrade-locks-equipment',
          'error',
          `${up.name}: нельзя носить другое оружие или экипировку.`,
          m,
          up.ruleId,
        )
      if (up.noArmour && armours.length)
        add(
          'upgrade-no-armour',
          'error',
          `${up.name}: броня запрещена, разрешённый щит допускается.`,
          m,
          up.ruleId,
        )
      if (up.noRanged && purchases.some((p) => p.o.category === 'ranged'))
        add(
          'upgrade-no-ranged',
          'error',
          `${up.name}: дальнобойное оружие запрещено.`,
          m,
          up.ruleId,
        )
      if (up.manualCheck)
        add(
          'upgrade-manual',
          'manual',
          `${up.name}: проверьте дополнительные условия в правиле.`,
          m,
          up.ruleId,
          up.source,
        )
      if (
        up.requiresUpgradeIds?.some((id) => !m.upgrades.includes(id)) ||
        up.forbiddenUpgradeIds?.some((id) => m.upgrades.includes(id))
      )
        add(
          'formula-compatibility',
          'error',
          `${up.name}: несовместимое сочетание формул или не выполнены требования.`,
          m,
          up.ruleId,
        )
    }
    if ([...groups.values()].some((n) => n > 1))
      add(
        'exclusive-upgrades',
        'error',
        'Выбраны взаимоисключающие ранги или улучшения.',
        m,
        u.ruleId,
      )
    const powers = m.upgrades.filter((id) => c.upgrades.find((up) => up.id === id)?.power).length
    const powerMax = u.id === 'court.praetor' && w.allegiance === 'wrath' ? 1 : u.powerMax
    if (powers < (u.powerMin ?? 0) || (powerMax !== undefined && powers > powerMax))
      add(
        'powers',
        'error',
        `Гоэтические силы: требуется ${u.powerMin ?? 0}–${powerMax ?? 0}, выбрано ${powers}.`,
        m,
        u.ruleId,
      )
    if (u.id === 'sultanate.homunculus') {
      if (
        m.upgrades.includes('hawk-eyes') &&
        m.upgrades.includes('hypnotic-eyes') &&
        !m.upgrades.includes('two-heads')
      )
        add(
          'two-heads-required',
          'error',
          'Орлиные и Гипнотические глаза требуют Двух Голов.',
          m,
          u.ruleId,
        )
      if (
        purchases
          .filter((p) => p.o.allowedUnitIds?.includes('sultanate.bull'))
          .reduce((n, p) => n + p.e.quantity, 0) > 1
      )
        add(
          'gargantuan-one-weapon',
          'error',
          'Гигантский Гомункул может использовать одно оружие только для Бронзового Быка.',
          m,
          u.ruleId,
        )
    }
    if (u.id === 'pilgrims.anchorite' && w.variantId === 'methodius') {
      if (
        purchases.filter((p) => p.o.category === 'ranged').reduce((n, p) => n + p.e.quantity, 0) > 1
      )
        add(
          'anchorite-replacement',
          'error',
          'Анахорет может заменить Колесо Екатерины одним орудием.',
          m,
          u.ruleId,
        )
      if (
        purchases
          .filter((p) => p.o.category === 'equipment')
          .reduce((n, p) => n + p.e.quantity, 0) > 2
      )
        add(
          'anchorite-upgrades',
          'error',
          'Анахорет может приобрести до двух особых предметов снаряжения.',
          m,
          u.ruleId,
        )
    }
    if (u.manualCheck)
      add(
        'profile-manual',
        'manual',
        'Особые правила профиля требуют сверки: кампанийные условия, встроенные способности и исключения.',
        m,
        u.ruleId,
        u.source,
      )
    if (!u.mercenary && ['eire', 'prussia', 'alba'].includes(w.variantId ?? '')) {
      const exempt =
        u.id === 'antioch.mechanized' || (w.variantId !== 'eire' && u.id === 'antioch.lieutenant')
      if (
        !exempt &&
        (purchases.some((p) =>
          ['Machine Armour', 'Reinforced Armour'].includes(p.item.englishName ?? ''),
        ) ||
          (w.variantId === 'eire' && purchases.some((p) => p.item.keywords.includes('HEAVY'))))
      )
        add(
          'light-armour',
          'error',
          'Вариант ограничивает тяжёлую броню и вооружение для этого профиля.',
          m,
          v?.ruleId,
        )
    }
    if (
      w.variantId === 'methodius' &&
      u.id === 'pilgrims.nun' &&
      !purchases.some((p) => p.item.englishName === 'Standard Armour')
    )
      add(
        'modest-nun',
        'error',
        'Монахиня Святого Мефодия должна носить стандартную броню.',
        m,
        v?.ruleId,
      )
  }
  // Limits are inherited from the purchase's source arsenal; mercenaries are exempt (p.16).
  const limitChecked = new Set<string>()
  for (const m of regular)
    for (const e of m.equipment) {
      const o = effectiveOffer(c, w, e.offerId)
      if (!o || o.limit === null || limitChecked.has(o.id)) continue
      limitChecked.add(o.id)
      const exempt = regular
        .filter((m) => o.exemptLimitUnitIds?.includes(m.unitId))
        .reduce(
          (n, m) =>
            n +
            m.equipment
              .filter((e) => effectiveOffer(c, w, e.offerId)?.itemId === o.itemId)
              .reduce((n, e) => n + e.quantity, 0),
          0,
        )
      if ((itemTotals.get(o.itemId) ?? 0) - exempt > o.limit)
        add(
          'item-limit',
          'error',
          `${o.name}: лимит ${o.limit}, приобретено ${(itemTotals.get(o.itemId) ?? 0) - exempt}.`,
          undefined,
          v?.ruleId ?? o.ruleId,
          o.source,
        )
    }
  for (const up of c.upgrades) {
    let limit = up.limit
    if (up.id === 'trench-mole' && w.budget.ducats > 1000) limit = 3
    if (up.id === 'zealot-strength' && w.variantId === 'affliction') limit = 3
    if (limit !== null && w.units.filter((m) => m.upgrades.includes(up.id)).length > limit)
      add('upgrade-limit', 'error', `${up.name}: лимит ${limit}.`, undefined, up.ruleId, up.source)
  }
  const legion = regular.filter((m) =>
    m.upgrades.some((id) => id === 'legion-ranged' || id === 'legion-melee'),
  ).length
  if (legion > Math.floor(countUnit('heretic.trooper') / 2))
    add(
      'legion-ratio',
      'error',
      'Легионерами могут стать не более половины Пехоты Еретиков (округление вниз).',
      undefined,
      c.units.find((u) => u.id === 'heretic.trooper')?.ruleId,
    )
  for (const [unitId, keyword] of [
    ['heretic.wretch', 'HERETIC'],
    ['court.wretch', 'DEMONIC'],
  ] as const) {
    const n = countUnit(unitId),
      supporters = regular.filter((m) => modelKeywords(c, w, m).includes(keyword)).length
    if (n && n >= supporters)
      add(
        'wretch-ratio',
        'error',
        `Несчастных должно быть меньше, чем моделей с ${keyword}: ${n} против ${supporters}.`,
        undefined,
        c.units.find((u) => u.id === unitId)?.ruleId,
      )
  }
  const teams = new Map<string, Model[]>()
  for (const m of w.units)
    if (m.fireteam) teams.set(m.fireteam, [...(teams.get(m.fireteam) ?? []), m])
  const paidDogTeams = [...teams.values()].filter((models) =>
    models.some((m) => m.upgrades.includes('dog-fireteam')),
  ).length
  if (teams.size - paidDogTeams > (v?.fireteamLimit ?? (w.factionId === 'antioch' ? 2 : 0)))
    add(
      'fireteam-limit',
      'error',
      'Превышено число Боевых групп. Собака с улучшением FIRETEAM требует отдельной сверки.',
      undefined,
      v?.ruleId ?? faction?.arsenalRuleId,
    )
  for (const [name, models] of teams)
    if (models.length !== 2)
      add('fireteam-size', 'error', `Боевая группа «${name}» должна состоять из двух моделей.`)
  if (v?.heavyRangedLimit !== undefined) {
    const count = regular.reduce(
      (n, m) =>
        n +
        m.equipment.reduce((n, e) => {
          const o = effectiveOffer(c, w, e.offerId),
            i = c.items.find((i) => i.id === o?.itemId)
          return n + (o?.category === 'ranged' && i?.keywords.includes('HEAVY') ? e.quantity : 0)
        }, 0),
      0,
    )
    if (count > v.heavyRangedLimit)
      add(
        'heavy-ranged-limit',
        'error',
        `Разрешено не более ${v.heavyRangedLimit} дальнобойных оружий HEAVY.`,
        undefined,
        v.ruleId,
      )
  }
  if (v?.manualCheck)
    add(
      'variant-manual',
      'manual',
      'Текстовые эффекты варианта, кампанийные условия и специальные исключения необходимо сверить с правилами.',
      undefined,
      v.ruleId,
      v.source,
    )
  for (const constraint of c.constraints)
    if (
      (!constraint.factionId || constraint.factionId === w.factionId) &&
      (!constraint.variantId || constraint.variantId === w.variantId)
    )
      add(
        constraint.id,
        constraint.severity,
        constraint.message,
        undefined,
        constraint.ruleId,
        constraint.source,
      )
  return {
    diagnostics,
    status: diagnostics.some((d) => d.severity === 'error')
      ? 'invalid'
      : diagnostics.some((d) => d.severity === 'manual')
        ? 'needs-review'
        : 'valid',
  }
}
