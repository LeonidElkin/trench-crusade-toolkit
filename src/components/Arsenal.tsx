import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import { categoryNames } from '../data/registry'
import { articlesById } from '../data/content'
import { articleBody } from '../data/article-format'
import { Markdown } from './Markdown'
import type { Catalog, Offer, Warband } from '../domain/schema'
import { effectiveOffer, factionUnits, getVariant, offerAccessReason } from '../domain/warband'
import { CostView } from './Common'
import { equipmentCategories, weaponHands } from '../data/equipment-format'
import { RulePreview } from './RulePreview'

export function Arsenal({
  c,
  band,
  specialOnly = false,
}: {
  c: Catalog
  band: Warband
  specialOnly?: boolean
}) {
  const [preview, setPreview] = useState<{ id: string; offer: Offer }>()
  const units = factionUnits(c, band)
  const variant = getVariant(c, band)
  const faction = c.factions.find((entry) => entry.id === band.factionId)
  const article = faction && articlesById.get(faction.arsenalRuleId)
  const introduction =
    article &&
    articleBody(article.markdown)
      .split(/^#{1,6}\s|^\|/m)[0]
      ?.split(/\n\s*\n/)
      .filter((part) => !part.startsWith('Арсенал '))
      .join('\n\n')
      .trim()
  const offers = c.offers
    .filter(
      (offer) =>
        offer.factionId === band.factionId &&
        (!offer.variantId || offer.variantId === band.variantId) &&
        (!specialOnly ||
          offer.variantId === band.variantId ||
          variant?.offerOverrides?.[offer.itemId]),
    )
    .map((offer) => effectiveOffer(c, band, offer.id)!)
    .filter((offer) => offer.limit !== 0)
  return (
    <>
      {!specialOnly && introduction && <Markdown content={introduction} currentId={article?.id} />}
      <div className="reference-arsenal">
        {equipmentCategories.map((category) => {
          const entries = offers.filter((o) => o.category === category)
          if (!entries.length) return null
          return (
            <details key={category} open>
              <summary>{categoryNames[category]}</summary>
              <ul>
                {entries.map((offer) => {
                  const item = c.items.find((entry) => entry.id === offer.itemId)
                  const allowed = offer.allowedUnitIds?.map(
                    (id) => c.units.find((u) => u.id === id)?.name ?? id,
                  )
                  const reasons = variant
                    ? units.map((unit) =>
                        offerAccessReason(
                          c,
                          band,
                          {
                            id: '',
                            unitId: unit.id,
                            equipment: [],
                            upgrades: [],
                            loadouts: {},
                            fireteam: '',
                            name: unit.name,
                            notes: '',
                          },
                          offer,
                        ),
                      )
                    : []
                  const unavailable = reasons.length > 0 && reasons.every(Boolean)
                  const status = unavailable
                    ? new Set(reasons).size === 1
                      ? reasons[0]
                      : 'Условия доступа зависят от профиля и улучшений.'
                    : undefined
                  return (
                    <li key={offer.id}>
                      <div>
                        <button
                          className="text-button"
                          onClick={() => setPreview({ id: item?.ruleId ?? offer.ruleId, offer })}
                        >
                          {offer.name} <BookOpen size={14} />
                        </button>
                        <p className="small muted">
                          {[
                            weaponHands(item),
                            item?.range,
                            offer.limit !== null ? `Лимит: ${offer.limit}` : '',
                            allowed?.length ? allowed.join(', ') : '',
                            offer.notes,
                            status,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <CostView cost={offer.cost} compact />
                    </li>
                  )
                })}
              </ul>
            </details>
          )
        })}
        {!offers.length && <p className="muted">У варианта нет отдельных предложений арсенала.</p>}
      </div>
      {preview && (
        <RulePreview id={preview.id} offer={preview.offer} onClose={() => setPreview(undefined)} />
      )}
    </>
  )
}
