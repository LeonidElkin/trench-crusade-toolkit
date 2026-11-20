import { BookOpen, X } from 'lucide-react'
import type { Catalog, Model, Warband } from '../domain/schema'
import { number } from '../domain/rules'
import { compulsorySlot, equipmentPurchaseCost, modelGear } from '../domain/warband'
import { categoryNames } from '../data/registry'
import { equipmentCategories, weaponHands } from '../data/equipment-format'
import { CostView, RuleLink } from './Common'

export function EquippedGear({
  c,
  band,
  model,
  onPreview,
  onRemove,
  removalReason,
}: {
  c: Catalog
  band: Warband
  model: Model
  onPreview?: (ruleId: string) => void
  onRemove?: (purchaseId: string) => void
  removalReason?: (purchaseId: string) => string | undefined
}) {
  const gear = modelGear(c, band, model)
  const slotId = compulsorySlot(c, band, model).purchase?.id
  const unknown = model.equipment.filter(
    (purchase) => !gear.some((entry) => entry.purchaseId === purchase.id),
  )
  return (
    <div className="equipped-groups">
      {equipmentCategories.map((category) => {
        const entries = gear.filter((entry) => entry.category === category)
        if (!entries.length) return null
        return (
          <section key={category}>
            <h4>{categoryNames[category]}</h4>
            <div className="equipped-list">
              {entries.map((entry, index) => {
                const purchase = model.equipment.find((p) => p.id === entry.purchaseId)
                const cost = purchase && equipmentPurchaseCost(c, band, model, purchase)
                const slot = purchase && purchase.id === slotId
                const reason = entry.fixed
                  ? 'Входит в профиль'
                  : slot
                    ? 'Обязательное оружие. Выберите замену из арсенала.'
                    : purchase && onRemove
                      ? removalReason?.(purchase.id)
                      : undefined
                const ruleId = entry.item?.ruleId
                const used = number(entry.definition.treatedAsHands, number(entry.definition.hands))
                const hands = weaponHands(entry.item)
                const use =
                  used === 1 && entry.item?.hands !== 1 ? 'Боец использует одной рукой' : undefined
                return (
                  <div key={purchase?.id ?? index}>
                    <div>
                      {ruleId && onPreview ? (
                        <button className="equipped-name" onClick={() => onPreview(ruleId)}>
                          <BookOpen size={14} />
                          {entry.name}
                        </button>
                      ) : ruleId ? (
                        <RuleLink id={ruleId}>{entry.name}</RuleLink>
                      ) : (
                        <strong>{entry.name}</strong>
                      )}
                      {(entry.quantity > 1 || hands || use || reason) && (
                        <p className="muted small gear-detail">
                          {[entry.quantity > 1 ? `×${entry.quantity}` : '', hands, use, reason]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                    </div>
                    {cost && <CostView cost={cost} compact />}
                    {onRemove && (
                      <button
                        className="icon-button"
                        aria-label={`Снять: ${entry.name}`}
                        title={reason}
                        disabled={Boolean(reason)}
                        onClick={() => purchase && onRemove(purchase.id)}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
      {unknown.map((purchase) => (
        <div key={purchase.id} className="equipment-unknown">
          <span>Неизвестный предмет {purchase.offerId}</span>
          {onRemove && (
            <button className="text-button" onClick={() => onRemove(purchase.id)}>
              Снять
            </button>
          )}
        </div>
      ))}
      {!gear.length && !unknown.length && <p className="muted small">Экипировка отсутствует.</p>}
    </div>
  )
}
