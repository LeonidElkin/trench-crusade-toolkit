import type { Catalog, Unit } from '../domain/schema'
import { articlesById } from '../data/content'
import { articleSection, unitArticle } from '../data/article-format'
import { CostView, RuleLink, Source, StatsGrid } from './Common'
import { Markdown } from './Markdown'
import { record, rulesOf } from '../domain/rules'
import './catalog-details.css'

export function UnitQuantity({ unit, cost = false }: { unit: Unit; cost?: boolean }) {
  const compulsory = record(rulesOf(unit).compulsoryPurchase)
  return (
    <div className="unit-quantity">
      <strong>{unit.max === null ? 'Без лимита' : `Лимит: ${unit.max}`}</strong>
      {unit.min > 0 && <strong>Обязательно: {unit.min}</strong>}
      {cost && <CostView cost={unit.cost} compact />}
      {cost && Boolean(compulsory.name) &&
        <span className="muted small">+ {String(record(compulsory.cost).ducats)} дк за обязательную винтовку</span>}
    </div>
  )
}

export function UnitLore({ unit }: { unit: Unit }) {
  const article = articlesById.get(unit.ruleId)
  const lore = article && unitArticle(article.markdown).lore
  if (!lore) return null
  return <details className="unit-lore"><summary>Лор</summary>
    <Markdown content={lore} currentId={unit.ruleId} minimumHeadingLevel={4} />
  </details>
}

export function UnitProfileStats({ unit }: { unit: Unit }) {
  const extraRows = unit.profileRows.slice(1).filter((row) => row.length >= 6)
  return (
    <>
      <StatsGrid stats={unit.stats} />
      {extraRows.map((row, index) => (
        <div key={`${row[0]}-${index}`}>
          <span className="muted small">{row[0]}</span>
          <StatsGrid
            stats={{
              name: row[0]!,
              movement: row[1]!,
              ranged: row[2]!,
              melee: row[3]!,
              armour: row[4]!,
              base: row[5]!,
            }}
          />
        </div>
      ))}
    </>
  )
}

export function UnitRuleLinks({
  c,
  unit,
  onPreview,
  currentId,
}: {
  c: Catalog
  unit: Unit
  onPreview?: (id: string) => void
  currentId?: string
}) {
  const abilities = c.abilities.filter((ability) => unit.abilityIds.includes(ability.id) && ability.ruleId !== currentId)
  const links = unit.linkedRuleIds.filter((id) => id !== currentId)
  const reference = (id: string, name: string) =>
    onPreview ? (
      <button className="text-button" onClick={() => onPreview(id)}>
        {name}
      </button>
    ) : (
      <RuleLink id={id}>{name}</RuleLink>
    )
  return (
    <div className="unit-rule-links">
      {abilities.length > 0 && (
        <div>
          <span className="eyebrow">СПОСОБНОСТИ</span>
          <ul>
            {abilities.map((ability) => (
              <li key={ability.id}>{reference(ability.ruleId, ability.name)}</li>
            ))}
          </ul>
        </div>
      )}
      {links.length > 0 && (
        <div>
          <span className="eyebrow">СВЯЗАННЫЕ ПРАВИЛА ПРОФИЛЯ</span>
          <ul>
            {links.map((id) => (
              <li key={id}>{reference(id, articlesById.get(id)?.title ?? id)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function UnitConditions({
  c,
  unit,
  equipment = true,
  hiring = true,
  fixedEquipment = true,
}: {
  c: Catalog
  unit: Unit
  equipment?: boolean
  hiring?: boolean
  fixedEquipment?: boolean
}) {
  const article = articlesById.get(unit.ruleId)
  const ruleIds = [...new Set([unit.ruleId, ...unit.linkedRuleIds])]
  const equipmentSections = equipment
    ? ruleIds.flatMap((id) => {
        const rule = articlesById.get(id)
        const text = rule ? articleSection(rule.markdown, /экипировка|оружие и снаряжение/i) : ''
        return rule && text ? [{ rule, text }] : []
      })
    : []
  const issues = [...c.issues, ...c.constraints].filter((issue) => ruleIds.includes(issue.ruleId))
  return (
    <div className="unit-conditions">
      {hiring && unit.mercenary && article && (
        <div className="unit-hiring">
          <span className="eyebrow">УСЛОВИЯ НАЙМА</span>
          <Markdown
            content={unitArticle(article.markdown).body.split(/^#{1,6}\s+/m)[0] ?? ''}
            currentId={article.id}
            minimumHeadingLevel={4}
          />
        </div>
      )}
      {equipment && fixedEquipment && unit.fixedItems.length > 0 && (
        <p className="small">
          <strong>Включено в профиль: </strong>
          {unit.fixedItems.map((item) => item.name).join(' · ')}
        </p>
      )}
      {equipment && unit.equipmentAccessNote && <p className="small">{unit.equipmentAccessNote}</p>}
      {equipmentSections.length > 0 && (
        <details className="unit-equipment-rules">
          <summary>Экипировка и ограничения</summary>
          {equipmentSections.map(({ rule, text }) => (
            <div key={rule.id}>
              <Markdown content={text} currentId={rule.id} minimumHeadingLevel={4} />
              <Source source={rule} />
            </div>
          ))}
        </details>
      )}
      {issues.map((issue) => (
        <p className="small unit-source-issue" key={issue.id}>
          <strong>
            {'severity' in issue && issue.severity === 'info'
              ? 'Примечание: '
              : 'Требуется сверка: '}
          </strong>
          {issue.message}
        </p>
      ))}
    </div>
  )
}
