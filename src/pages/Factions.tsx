import { countLabel } from '../data/format'
import { useState } from 'react'
import { ArrowLeft, ArrowRight, Flag, Users } from 'lucide-react'
import { assetUrl, catalog, edition, ruleHref } from '../data/registry'
import { articlesById } from '../data/content'
import { articleBody } from '../data/article-format'
import { createWarband, effectiveUnit } from '../domain/warband'
import type { Unit } from '../domain/schema'
import { CostView, RuleLink, Source } from '../components/Common'
import { Markdown } from '../components/Markdown'
import { UnitConditions, UnitProfileStats, UnitRuleLinks } from '../components/UnitDetails'
import { UnitPortrait } from '../components/UnitPortrait'

function ProfileCard({ unit }: { unit: Unit }) {
  return (
    <article className="unit-card">
      <UnitPortrait
        editionId={edition.id}
        unitId={unit.id}
        name={unit.name}
        zoom
        className="dossier-portrait"
      />
      <div className="unit-card-top">
        <span className="eyebrow">
          {unit.mercenary ? 'НАЁМНИК' : unit.keywords.includes('ELITE') ? 'ЭЛИТА' : 'ВОЙСКА'} ·{' '}
          {unit.min
            ? `${unit.min} ОБЯЗАТЕЛЬНО`
            : unit.max === null
              ? 'БЕЗ ЛИМИТА'
              : `0–${unit.max}`}
        </span>
        <CostView cost={unit.cost} compact />
      </div>
      <h3>
        <a href={ruleHref(unit.ruleId)}>{unit.name}</a>
      </h3>
      <UnitProfileStats unit={unit} />
      <div className="tags">
        {unit.keywords.map((keyword) => (
          <span className="tag" key={keyword}>
            <strong>{keyword}</strong>
          </span>
        ))}
      </div>
      <UnitConditions c={catalog} unit={unit} />
      <UnitRuleLinks c={catalog} unit={unit} />
      <RuleLink id={unit.ruleId}>Полный профиль и способности</RuleLink>
      <Source source={unit.source} />
    </article>
  )
}

export function Factions({ factionId }: { factionId?: string }) {
  const [variantId, setVariant] = useState('')
  const faction = catalog.factions.find((f) => f.id === factionId)
  const selectedVariant = catalog.variants.find(
    (variant) => variant.factionId === faction?.id && variant.id === variantId,
  )
  const selectedVariantId = selectedVariant?.id ?? null
  const band = faction ? createWarband(catalog, faction.id, selectedVariantId, 'battle') : undefined
  if (!faction)
    return (
      <>
        <div className="page-heading">
          <span className="eyebrow">СТОРОНЫ ВЕЛИКОЙ ВОЙНЫ</span>
          <h1>Фракции</h1>
          <p>Шесть сторон конфликта. Собственные бойцы, арсеналы и варианты отрядов.</p>
        </div>
        <div className="faction-grid">
          {catalog.factions.map((f) => (
            <a className="faction-card" href={`#/factions/${f.id}`} key={f.id}>
              <img src={assetUrl(f.image)} alt="" />
              <div className="faction-shade" />
              <div className="faction-card-content">
                <h2>{f.name}</h2>
                <span className="faction-bottom">
                  Профили и правила
                  <ArrowRight size={18} />
                </span>
              </div>
            </a>
          ))}
        </div>
      </>
    )
  const units = catalog.units
      .filter(
        (unit) =>
          unit.factionId === faction.id &&
          (!unit.variantId || unit.variantId === selectedVariantId),
      )
      .map((unit) => effectiveUnit(catalog, band!, unit.id))
      .filter((unit): unit is Unit => !!unit && unit.max !== 0),
    variants = catalog.variants.filter((v) => v.factionId === faction.id),
    mercenaries = selectedVariant?.banMercenaries
      ? []
      : catalog.units.filter(
          (unit) =>
            unit.mercenary && (!unit.allowedFactions || unit.allowedFactions.includes(faction.id)),
        ),
    ruleIds = [
      ...new Set([
        faction.ruleId,
        ...faction.specialRuleIds,
        ...(selectedVariant ? [selectedVariant.ruleId] : []),
      ]),
    ]
  return (
    <>
      <a className="back-link" href="#/factions">
        <ArrowLeft size={15} />
        Все фракции
      </a>
      <section
        className="faction-banner"
        style={{
          backgroundImage: `linear-gradient(90deg, #191c1b 20%, #191c1b66 100%), url("${assetUrl(faction.image)}")`,
        }}
      >
        <span className="eyebrow">ДОСЬЕ ФРАКЦИИ / 1.6.3</span>
        <h1>{faction.name}</h1>
        <div className="meta-row">
          <span>
            <Users size={15} /> {units.length} профилей
          </span>
          <span>
            <Flag size={15} /> {countLabel(variants.length, ['вариант', 'варианта', 'вариантов'])}
          </span>
        </div>
        <div className="hero-actions">
          <a className="button button-primary" href={`#/warbands/new/${faction.id}`}>
            <Flag size={16} />
            Создать отряд
          </a>
          <RuleLink id={faction.ruleId}>Правила фракции</RuleLink>
        </div>
      </section>
      <div className="faction-tabs" aria-label="Быстрый переход к фракции">
        {catalog.factions.map((f) => (
          <a className={f.id === faction.id ? 'active' : ''} key={f.id} href={`#/factions/${f.id}`}>
            {f.name}
          </a>
        ))}
      </div>
      <section className="faction-rules" aria-label="Правила и состав фракции">
        <div className="section-intro">
          <div>
            <span className="eyebrow">СОЗДАНИЕ ОТРЯДА</span>
            <h2>Правила фракции</h2>
          </div>
          {faction.loreRuleId && <RuleLink id={faction.loreRuleId}>История фракции</RuleLink>}
        </div>
        {ruleIds.map((id) => {
          const article = articlesById.get(id)
          return article ? (
            <details
              className="faction-rule panel"
              key={id}
              open={selectedVariant?.ruleId === id || undefined}
            >
              <summary>{article.title}</summary>
              <Markdown
                content={articleBody(article.markdown)}
                currentId={id}
                minimumHeadingLevel={3}
              />
              <RuleLink id={id}>Открыть в справочнике</RuleLink>
              <Source source={article} />
            </details>
          ) : (
            <RuleLink id={id} key={id}>
              Правило фракции
            </RuleLink>
          )
        })}
      </section>
      <div className="section-intro">
        <div>
          <span className="eyebrow">ЛИЧНЫЙ СОСТАВ</span>
          <h2>Бойцы</h2>
        </div>
        <RuleLink id={faction.arsenalRuleId}>Арсенал фракции</RuleLink>
      </div>
      {variants.length > 0 && (
        <label className="select-label faction-roster-select">
          Состав и профили варианта
          <select
            aria-label="Профили варианта фракции"
            value={selectedVariantId ?? ''}
            onChange={(event) => setVariant(event.target.value)}
          >
            <option value="">Основной список фракции</option>
            {variants.map((variant) => (
              <option value={variant.id} key={variant.id}>
                {variant.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="unit-grid">
        {units.map((unit) => (
          <ProfileCard key={unit.id} unit={unit} />
        ))}
      </div>
      {mercenaries.length > 0 && (
        <>
          <div className="section-intro">
            <div>
              <span className="eyebrow">ПОД ОБЩИМ ЗНАМЕНЕМ</span>
              <h2>Союзники и наёмники</h2>
            </div>
          </div>
          <div className="unit-grid">
            {mercenaries.map((unit) => (
              <ProfileCard key={unit.id} unit={unit} />
            ))}
          </div>
        </>
      )}
      {variants.length > 0 && (
        <>
          <div className="section-intro">
            <div>
              <span className="eyebrow">ОСОБЫЕ ФОРМИРОВАНИЯ</span>
              <h2>Варианты отрядов</h2>
            </div>
          </div>
          <div className="variant-grid">
            {variants.map((v) => (
              <a className="variant-card" href={ruleHref(v.ruleId)} key={v.id}>
                <Flag size={21} />
                <div>
                  <h3>{v.name}</h3>
                  <Source source={v.source} />
                </div>
                <ArrowRight size={19} />
              </a>
            ))}
          </div>
        </>
      )}
    </>
  )
}
