import { ArrowLeft, ArrowRight, Flag, Users } from 'lucide-react'
import { assetUrl, catalog, ruleHref } from '../data/registry'
import { CostView, RuleLink, Source, StatsGrid } from '../components/Common'
export function Factions({ factionId }: { factionId?: string }) {
  const faction = catalog.factions.find((f) => f.id === factionId)
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
  const units = catalog.units.filter((u) => u.factionId === faction.id && !u.variantId),
    variants = catalog.variants.filter((v) => v.factionId === faction.id)
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
            <Flag size={15} /> {variants.length} вариантов
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
      <div className="section-intro">
        <div>
          <span className="eyebrow">ЛИЧНЫЙ СОСТАВ</span>
          <h2>Бойцы</h2>
        </div>
        <RuleLink id={faction.arsenalRuleId}>Арсенал фракции</RuleLink>
      </div>
      <div className="unit-grid">
        {units.map((u) => (
          <article className="unit-card" key={u.id}>
            <div className="unit-card-top">
              <span className="eyebrow">
                {u.keywords.includes('ELITE') ? 'ЭЛИТА' : 'ВОЙСКА'} ·{' '}
                {u.min ? `${u.min} ОБЯЗАТЕЛЬНО` : u.max === null ? 'БЕЗ ЛИМИТА' : `0–${u.max}`}
              </span>
              <CostView cost={u.cost} compact />
            </div>
            <h3>
              <a href={ruleHref(u.ruleId)}>{u.name}</a>
            </h3>
            <StatsGrid stats={u.stats} />
            <div className="tags">
              {u.keywords.map((k) => (
                <span className="tag" key={k}>
                  {k}
                </span>
              ))}
            </div>
            <RuleLink id={u.ruleId}>Профиль и способности</RuleLink>
            <Source source={u.source} />
          </article>
        ))}
      </div>
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
