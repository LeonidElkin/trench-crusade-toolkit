import type { Catalog, Model, Offer, Unit, Upgrade, Warband } from './schema'
import { rulesOf, string } from './rules'
import {
  addModel,
  equipOffer,
  offerAccessReason,
  toggleUpgrade,
  unitAccessReason,
  upgradeApplies,
  updateModel,
} from './warband'
import { validateWarband, type Diagnostic } from './validation'

const diagnosticKey = (entry: Diagnostic) =>
  JSON.stringify([entry.code, entry.modelId, entry.ruleId, entry.message])

export function rosterGuard(
  c: Catalog,
  current: Warband,
  diagnostics = validateWarband(c, current).diagnostics,
) {
  const existingErrors = new Set(
    diagnostics.filter((d) => d.severity === 'error').map(diagnosticKey),
  )
  return (next: Warband, pending: readonly string[] = []): string | undefined =>
    validateWarband(c, next).diagnostics.find(
      (d) =>
        d.severity === 'error' &&
        !d.code.startsWith('budget-') &&
        !pending.some((code) => d.code === code || d.code.startsWith(code + '-')) &&
        !existingErrors.has(diagnosticKey(d)),
    )?.message
}

export function availableAlchemists(w: Warband, unit: Unit, modelId?: string) {
  const boundUnitId = string(rulesOf(unit).boundUnitId)
  return w.units.filter(
    (model) =>
      model.unitId === boundUnitId &&
      !w.units.some(
        (other) => other.id !== modelId && other.loadouts['bound-alchemist'] === model.id,
      ),
  )
}

export function recruit(c: Catalog, w: Warband, unit: Unit, check: ReturnType<typeof rosterGuard>) {
  const unavailable = unitAccessReason(c, w, unit)
  if (unavailable) return { reason: unavailable }
  if (w.units.length >= 300) return { reason: 'В сохранённом отряде может быть до 300 бойцов.' }
  const rule = rulesOf(unit)
  if (rule.purchaseContext === 'resurrection-only')
    return { reason: 'Этот профиль получают воскрешением в кампании. Прямой найм запрещён.' }
  const alchemist =
    rule.requiresBoundAlchemist && rule.boundUnitId ? availableAlchemists(w, unit)[0] : undefined
  if (rule.requiresBoundAlchemist && rule.boundUnitId && !alchemist)
    return { reason: 'Нужен Алхимик без связанного Гомункула.' }
  let next = addModel(c, w, unit.id)
  if (alchemist) {
    const model = next.units.at(-1)!
    next = updateModel(next, model.id, {
      loadouts: { ...model.loadouts, 'bound-alchemist': alchemist.id },
    })
  }
  // These requirements can be completed on the fighter's sheet after recruiting.
  const reason = check(next, [
    'equipment-required',
    'armour-required',
    'variant-armour-required',
    'weapon-required',
    'minimum-model-cost',
    'powers',
    'ability-choice',
    'min',
    'aggregate-minimum',
  ])
  return reason ? { reason } : { next }
}

export function purchase(
  c: Catalog,
  w: Warband,
  model: Model,
  offer: Offer,
  check: ReturnType<typeof rosterGuard>,
) {
  const unavailable = offerAccessReason(c, w, model, offer)
  if (unavailable) return { reason: unavailable }
  const next = equipOffer(c, w, model, offer)
  const reason =
    next.units.find((entry) => entry.id === model.id)!.equipment.length > 200
      ? 'Достигнуто максимальное число записей экипировки.'
      : check(next)
  return reason ? { reason } : { next }
}

export function selectUpgrade(
  c: Catalog,
  w: Warband,
  model: Model,
  upgrade: Upgrade,
  check: ReturnType<typeof rosterGuard>,
) {
  const equipped = model.upgrades.includes(upgrade.id)
  if (!equipped && !upgradeApplies(c, w, model, upgrade))
    return { reason: 'Профиль или выбранные улучшения не отвечают условиям этой способности.' }
  const league = upgrade.group === 'legionary-specialty'
  const replaced =
    !equipped && league
      ? model.upgrades.filter(
          (id) =>
            !c.upgrades.some(
              (candidate) => candidate.id === id && candidate.group === upgrade.group,
            ),
        )
      : model.upgrades
  const preparation =
    replaced === model.upgrades ? w : updateModel(w, model.id, { upgrades: replaced })
  const next = toggleUpgrade(preparation, model.id, upgrade.id)
  const reason = check(next, equipped ? ['powers', 'minimum-model-cost'] : [])
  return reason ? { reason } : { next }
}
