import { countLabel } from '../data/format'
import { ArrowLeft, ArrowRight, Flag, Users } from 'lucide-react'
import { assetUrl, catalog, edition, factionHref } from '../data/registry'
import { articlesById } from '../data/content'
import { ruleBody } from '../data/article-format'
import { referenceHref } from '../data/reference-navigation'
import { createWarband, factionUnits } from '../domain/warband'
import type { Unit, Warband } from '../domain/schema'
import { RuleLink, Source } from '../components/Common'
import { Markdown } from '../components/Markdown'
import { UnitConditions, UnitLore, UnitProfileStats, UnitQuantity, UnitRuleLinks } from '../components/UnitDetails'
import { UnitPortrait } from '../components/UnitPortrait'
import { Arsenal } from '../components/Arsenal'

function ProfileCard({ unit, band }: { unit: Unit; band: Warband }) {
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
          {unit.mercenary ? 'НАЁМНИК' : unit.keywords.includes('ELITE') ? 'ЭЛИТА' : 'ВОЙСКА'}
        </span>
        <UnitQuantity unit={unit} cost />
      </div>
      <h3><a href={referenceHref(unit.ruleId, band, unit)}>{unit.name}</a></h3>
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
      <a className="text-link" href={referenceHref(unit.ruleId, band, unit)}>Полный профиль и способности<ArrowRight size={14} /></a>
      <Source source={unit.source} />
      <UnitLore unit={unit} />
    </article>
  )
}

export function Factions({ factionId, variantId }: { factionId?: string; variantId?: string }) {
  const faction = catalog.factions.find((f) => f.id === factionId)
  const selectedVariant = catalog.variants.find(
    (variant) => variant.factionId === faction?.id && variant.id === variantId,
  )
  const selectedVariantId = selectedVariant?.id ?? null
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
  const band = createWarband(catalog, faction.id, selectedVariantId, 'battle')
  const units = factionUnits(catalog, band)
  const variants = catalog.variants.filter((v) => v.factionId === faction.id)
  const mercenaries = factionUnits(catalog, band, true)
  const ruleIds = [...new Set([...faction.specialRuleIds, ...(selectedVariant ? [selectedVariant.ruleId] : [])])]
  const mainRuleId = selectedVariant?.ruleId ?? faction.loreRuleId ?? `core-${faction.id}-lore`
  return (
    <>
      <a className="back-link" href="#/factions">
        <ArrowLeft size={15} />
        Все фракции
      </a>
      <section
        className="faction-banner"
        style={{
          backgroundImage: `var(--faction-banner-overlay), url("${assetUrl(faction.image)}")`,
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
          <a className="button button-primary" href={`#/warbands/new/${faction.id}${selectedVariant ? '/' + selectedVariant.id : ''}`}>
            <Flag size={16} />
            Создать отряд
          </a>
          <a className="text-link" href={referenceHref(mainRuleId, band)}>Правила фракции<ArrowRight size={16} /></a>
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
              <summary>{id === 'core-court-recruitment' ? 'Семь смертных грехов' : article.title}</summary>
              <Markdown
                content={ruleBody(id, article.markdown)}
                currentId={id}
                minimumHeadingLevel={3}
              />
              <a className="text-link" href={referenceHref(id, band)}>Открыть в справочнике<ArrowRight size={14} /></a>
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
        <a className="text-link" href={referenceHref(faction.arsenalRuleId, band)}>Арсенал фракции<ArrowRight size={14} /></a>
      </div>
      {variants.length > 0 && (
        <label className="select-label faction-roster-select">
          Состав и профили варианта
          <select
            aria-label="Профили варианта фракции"
            value={selectedVariantId ?? ''}
            onChange={(event) => window.location.assign(factionHref(faction.id, event.target.value))}
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
          <ProfileCard key={unit.id} unit={unit} band={band} />
        ))}
      </div>
      <details className="faction-rule panel faction-arsenal">
        <summary>Экипировка · Арсенал</summary>
        <Arsenal c={catalog} band={band} />
      </details>
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
              <ProfileCard key={unit.id} unit={unit} band={band} />
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
              <a className="variant-card" href={factionHref(faction.id, v.id)} key={v.id}>
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
