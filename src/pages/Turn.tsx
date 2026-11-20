import { useState } from 'react'
import { ArrowRight, BookOpen, Check, Crosshair, Dice5, Plus, Trash2 } from 'lucide-react'
import { articlesById } from '../data/content'
import { unitArticle } from '../data/article-format'
import { catalog, getEdition } from '../data/registry'
import type { Catalog, Model, Warband } from '../domain/schema'
import {
  addModel,
  createWarband,
  effectiveUnit,
  factionUnits,
  getVariant,
  modelGear,
  modelKeywords,
  modelStats,
  offerApplies,
  removeModel,
  updateModel,
} from '../domain/warband'
import { purchase, rosterGuard } from '../domain/roster-actions'
import { validateWarband } from '../domain/validation'
import { loadWarbands } from '../domain/storage'
import {
  BATTLE_KEY,
  battleOrder,
  isActivated,
  isOut,
  living,
  loadBattle,
  newBattle,
  nextTurn,
  numberFighters,
  ready,
  setActingParty,
  toggleActivation,
  toggleOut,
  type Battle,
  type BattleParty,
} from '../domain/turn'
import { Modal, RuleLink, Source, StatsGrid } from '../components/Common'
import { EquippedGear } from '../components/Equipment'
import { Markdown } from '../components/Markdown'
import { UnitConditions, UnitLore, UnitRuleLinks } from '../components/UnitDetails'
import './turn.css'

const partyCatalog = (party: BattleParty) =>
  getEdition(party.band.editionId, party.band.revision)?.catalog
const defaultSide = 'Моя сторона'

function BattleSetup({
  battle,
  bands,
  update,
}: {
  battle: Battle
  bands: Warband[]
  update: (next: Battle) => void
}) {
  const [savedId, setSavedId] = useState('')
  const [side, setSide] = useState(defaultSide)
  const [faction, setFaction] = useState(catalog.factions[0]!.id)
  const [variant, setVariant] = useState('')
  const [name, setName] = useState('')
  const available = bands.filter(
    (band) =>
      band.units.length &&
      getEdition(band.editionId, band.revision) &&
      !battle.parties.some((party) => party.band.id === band.id),
  )

  function add(party: BattleParty) {
    if (battle.parties.length >= 24) return
    update({ ...battle, parties: [...battle.parties, party], next: null, opening: null })
  }

  return (
    <details className="panel battle-setup" open={!battle.parties.length || undefined}>
      <summary>Участники битвы</summary>
      <div className="battle-setup-grid">
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault()
            const band = available.find((entry) => entry.id === savedId)
            if (band) {
              add({ band, side: side.trim() || defaultSide, mode: 'saved' })
              setSavedId('')
              if (!battle.parties.length) setSide('Противник')
            }
          }}
        >
          <h2>Сохранённый отряд</h2>
          {available.length ? (
            <>
              <label>
                Отряд из библиотеки
                <select value={savedId} onChange={(event) => setSavedId(event.target.value)}>
                  <option value="">Выберите отряд</option>
                  {available.map((band) => (
                    <option key={band.id} value={band.id}>
                      {band.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Сторона
                <input
                  maxLength={80}
                  value={side}
                  onChange={(event) => setSide(event.target.value)}
                  placeholder="Например, Моя сторона"
                />
              </label>
              <button
                className="button button-primary"
                disabled={!savedId || battle.parties.length >= 24}
              >
                <Plus size={16} />
                Добавить сохранённый отряд
              </button>
            </>
          ) : (
            <a className="text-link" href="#/warbands">
              Открыть библиотеку отрядов
              <ArrowRight size={15} />
            </a>
          )}
        </form>
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault()
            const band = createWarband(catalog, faction, variant || null)
            const label =
              name.trim() ||
              `Противник ${battle.parties.filter((party) => party.mode === 'quick').length + 1}`
            add({ band: { ...band, name: label }, mode: 'quick', side: label.slice(0, 80) })
            setName('')
          }}
        >
          <h2>Упрощённый отряд противника</h2>
          <label>
            Название противника
            <input maxLength={200} value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Фракция противника
            <select
              value={faction}
              onChange={(event) => {
                setFaction(event.target.value)
                setVariant('')
              }}
            >
              {catalog.factions.map((entry) => (
                <option value={entry.id} key={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Вариант противника
            <select value={variant} onChange={(event) => setVariant(event.target.value)}>
              <option value="">Основной список фракции</option>
              {catalog.variants
                .filter((entry) => entry.factionId === faction)
                .map((entry) => (
                  <option value={entry.id} key={entry.id}>
                    {entry.name}
                  </option>
                ))}
            </select>
          </label>
          <button className="button button-outline" disabled={battle.parties.length >= 24}>
            <Plus size={16} />
            Добавить противника
          </button>
        </form>
      </div>
    </details>
  )
}

function QuickRoster({
  c,
  party,
  edit,
}: {
  c: Catalog
  party: BattleParty
  edit: (party: BattleParty) => void
}) {
  const [unitId, setUnitId] = useState('')
  const units = [...factionUnits(c, party.band), ...factionUnits(c, party.band, true)]
  return (
    <form
      className="quick-roster"
      onSubmit={(event) => {
        event.preventDefault()
        if (units.some((unit) => unit.id === unitId) && party.band.units.length < 300)
          edit({ ...party, band: addModel(c, party.band, unitId) })
      }}
    >
      <label>
        Профиль противника
        <select value={unitId} onChange={(event) => setUnitId(event.target.value)}>
          <option value="">Выберите бойца</option>
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
      </label>
      <button
        className="button button-outline"
        disabled={!unitId || party.band.units.length >= 300}
      >
        <Plus size={16} />
        Добавить в отряд
      </button>
    </form>
  )
}

function BattleFighter({
  party,
  model,
  name,
  close,
  edit,
}: {
  party: BattleParty
  model: Model
  name: string
  close: () => void
  edit: (party: BattleParty) => void
}) {
  const [offerId, setOfferId] = useState('')
  const c = partyCatalog(party)
  const unit = c && effectiveUnit(c, party.band, model.unitId, model)
  const stats = c && modelStats(c, party.band, model)
  if (!c || !unit || !stats)
    return (
      <Modal title={name} onClose={close}>
        <p>Профиль недоступен.</p>
      </Modal>
    )
  const article = articlesById.get(unit.ruleId)
  const offers =
    party.mode === 'quick'
      ? c.offers.filter(
          (offer) =>
            offer.factionId === party.band.factionId && offerApplies(c, party.band, model, offer),
        )
      : []
  const selected = offers.find((offer) => offer.id === offerId)
  const action = selected && purchase(c, party.band, model, selected, rosterGuard(c, party.band))
  return (
    <Modal title={name} wide onClose={close}>
      <div className="battle-profile">
        <Source source={unit.source} />
        <StatsGrid stats={stats} />
        <div className="tags">
          {modelKeywords(c, party.band, model).map((key) => (
            <strong className="tag" key={key}>
              {key}
            </strong>
          ))}
        </div>
        <h3>Экипировка</h3>
        <EquippedGear
          c={c}
          band={party.band}
          model={model}
          onRemove={
            party.mode === 'quick'
              ? (id) =>
                  edit({
                    ...party,
                    band: updateModel(party.band, model.id, {
                      equipment: model.equipment.filter((entry) => entry.id !== id),
                    }),
                  })
              : undefined
          }
        />
        {offers.length > 0 && (
          <form
            className="quick-roster"
            onSubmit={(event) => {
              event.preventDefault()
              if (action?.next) {
                edit({ ...party, band: action.next })
                setOfferId('')
              }
            }}
          >
            <label>
              Предмет противника
              <select value={offerId} onChange={(event) => setOfferId(event.target.value)}>
                <option value="">Выберите экипировку</option>
                {offers.map((offer) => (
                  <option key={offer.id} value={offer.id}>
                    {offer.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="button button-outline" disabled={!action?.next}>
              <Plus size={15} />
              Записать предмет
            </button>
            {action?.reason && <p className="unavailable-reason">{action.reason}</p>}
          </form>
        )}
        {model.upgrades.length > 0 && (
          <>
            <h3>Улучшения и способности</h3>
            <ul>
              {c.upgrades
                .filter((up) => model.upgrades.includes(up.id))
                .map((up) => (
                  <li key={up.id}>
                    <RuleLink id={up.ruleId}>{up.name}</RuleLink>
                  </li>
                ))}
            </ul>
          </>
        )}
        <UnitConditions c={c} unit={unit} fixedEquipment={false} />
        <UnitRuleLinks c={c} unit={unit} currentId={unit.ruleId} />
        {article && (
          <Markdown
            content={unitArticle(article.markdown).body}
            currentId={article.id}
            minimumHeadingLevel={3}
          />
        )}
        {model.notes && <p className="battle-notes">{model.notes}</p>}
        <UnitLore unit={unit} />
      </div>
    </Modal>
  )
}

const rollD6 = () => 1 + Math.floor(Math.random() * 6)

export function Turn() {
  const [initial] = useState(() => {
    let bands: Warband[] = [],
      battle = newBattle(),
      error = '',
      bandsError = ''
    try {
      bands = loadWarbands(localStorage)
    } catch {
      bandsError = 'Библиотека отрядов недоступна.'
    }
    try {
      battle = loadBattle(localStorage)
    } catch {
      error = 'Сохранённая битва недоступна. Изменения записываются только в этой вкладке.'
    }
    return { bands, battle, error, bandsError }
  })
  const [battle, setBattle] = useState(initial.battle)
  const [error, setError] = useState(initial.error)
  const [preview, setPreview] = useState<{ partyId: string; modelId: string; name: string }>()
  const [dice, setDice] = useState<{ names: [string, string]; values: [number, number] }>()
  const [confirmEnd, setConfirmEnd] = useState(false)
  const order = battleOrder(battle)
  const remaining = order.candidates.reduce((sum, party) => sum + ready(battle, party).length, 0)
  const opening = !battle.activations.length && order.candidates.length === 2 && !order.manual
  const [first, second] = opening ? order.candidates : []
  const difference =
    first && second ? living(battle, first).length - living(battle, second).length : undefined

  function update(next: Battle) {
    setBattle(next)
    if (initial.error) return
    try {
      localStorage.setItem(BATTLE_KEY, JSON.stringify(next))
      setError('')
    } catch {
      setError('Не удалось сохранить состояние битвы на этом устройстве.')
    }
  }

  function edit(party: BattleParty) {
    update({
      ...battle,
      parties: battle.parties.map((entry) => (entry.band.id === party.band.id ? party : entry)),
    })
  }

  function end() {
    update(nextTurn(battle))
    setDice(undefined)
    setConfirmEnd(false)
  }

  const shownParty = preview && battle.parties.find((party) => party.band.id === preview.partyId)
  const shownModel = shownParty?.band.units.find((model) => model.id === preview?.modelId)
  return (
    <>
      <div className="page-heading">
        <h1>Индикатор хода</h1>
        <p>Отмечайте активации и потери во время партии.</p>
      </div>
      {(error || initial.bandsError) && (
        <p role="alert" className="error-message">
          {error || initial.bandsError}
        </p>
      )}
      <BattleSetup
        battle={battle}
        bands={initial.bands}
        update={(next) => {
          setDice(undefined)
          update(next)
        }}
      />
      {battle.parties.length > 0 && (
        <section className="panel turn-status" aria-label="Очередь активации">
          <div className="panel-header">
            <div>
              <h2>Ход {battle.turn}</h2>
              <p role="status">
                {order.current
                  ? `Активирует: ${order.current.band.name}`
                  : remaining
                    ? 'Выберите отряд для активации'
                    : 'Готовых к активации бойцов нет'}
              </p>
            </div>
            <button
              className="button button-primary"
              onClick={() => (remaining ? setConfirmEnd(true) : end())}
            >
              <Check size={16} />
              Завершить ход
            </button>
          </div>
          <div className="turn-status-content">
            {opening && first && second && (
              <>
                <p>
                  {difference === 0
                    ? 'Поровну моделей на поле. По правилу победитель броска D6 выбирает, чей отряд начнёт.'
                    : `Меньше моделей на поле у отряда «${difference! < 0 ? first.band.name : second.band.name}». По правилу на стр. 4 он выбирает, кто начнёт.`}
                </p>
                <p className="muted small">
                  На стр. 11 начало хода описано иначе. Подтвердите первый отряд по договорённости
                  игроков.
                </p>
                {difference === 0 && (
                  <button
                    className="button button-outline"
                    onClick={() =>
                      setDice({
                        names: [first.band.name, second.band.name],
                        values: [rollD6(), rollD6()],
                      })
                    }
                  >
                    <Dice5 size={17} />
                    Бросить D6 за оба отряда
                  </button>
                )}
                {dice && difference === 0 && (
                  <p role="status">
                    {dice.names[0]} · {dice.values[0]} / {dice.names[1]} · {dice.values[1]}.{' '}
                    {dice.values[0] === dice.values[1]
                      ? 'Ничья. Можно перебросить.'
                      : `Выбор за отрядом «${dice.names[dice.values[0] > dice.values[1] ? 0 : 1]}».`}
                  </p>
                )}
              </>
            )}
            {order.manual && order.candidates.length > 1 && (
              <p>Подтверждайте следующий отряд по договорённости игроков для этой битвы.</p>
            )}
            {order.candidates.length > 1 && (opening || order.manual) && (
              <div
                className="turn-choices"
                aria-label={opening ? 'Кто начнёт ход' : 'Кто активирует сейчас'}
              >
                {order.candidates.map((party) => (
                  <button
                    className="button button-outline"
                    key={party.band.id}
                    aria-pressed={order.current?.band.id === party.band.id}
                    onClick={() => update(setActingParty(battle, party.band.id))}
                  >
                    {opening ? 'Первый ход: ' : 'Активирует: '}
                    {party.band.name}
                  </button>
                ))}
              </div>
            )}
            <div className="turn-rule-links">
              <RuleLink id="core-activation">Ход игры и активации</RuleLink>
              <RuleLink id="core-end-turn">Конец хода</RuleLink>
              <RuleLink id="core-morale">Мораль</RuleLink>
            </div>
          </div>
        </section>
      )}
      <div className="battle-parties">
        {battle.parties.map((party) => {
          const c = partyCatalog(party)
          const id = party.band.id
          const active = order.current?.band.id === id
          const units = numberFighters(
            party,
            (unitId) => c?.units.find((u) => u.id === unitId)?.name ?? unitId,
          )
          const variant = c && getVariant(c, party.band)
          const fireteamErrors =
            c && party.band.units.some((model) => model.fireteam)
              ? validateWarband(c, party.band).diagnostics.filter(
                  (entry) => entry.severity === 'error' && entry.code.startsWith('fireteam-'),
                )
              : []
          return (
            <section
              className={`panel battle-party ${active ? 'is-active' : ''}`}
              key={id}
              aria-label={party.band.name}
            >
              <div className="panel-header">
                <div>
                  <h2>{party.band.name}</h2>
                  <p className="muted small">
                    {variant?.name ?? c?.factions.find((f) => f.id === party.band.factionId)?.name}
                    {' · '}
                    {living(battle, party).length}/{party.band.units.length} на поле
                  </p>
                </div>
                <button
                  className="icon-button"
                  aria-label={`Убрать отряд ${party.band.name} из битвы`}
                  onClick={() => {
                    if (!window.confirm(`Убрать «${party.band.name}» из этой битвы?`)) return
                    update({
                      ...battle,
                      opening: battle.opening === id ? null : battle.opening,
                      next: null,
                      parties: battle.parties.filter((entry) => entry.band.id !== id),
                      activations: battle.activations.filter((entry) => entry.partyId !== id),
                      out: battle.out.filter(
                        (key) =>
                          !party.band.units.some((model) => key === JSON.stringify([id, model.id])),
                      ),
                    })
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <label className="battle-side">
                Сторона
                <input
                  maxLength={80}
                  value={party.side}
                  onChange={(event) => edit({ ...party, side: event.target.value })}
                />
              </label>
              {party.mode === 'quick' && c && <QuickRoster c={c} party={party} edit={edit} />}
              <div className="battle-figures">
                {units.map(({ model, name }) => {
                  const stats = c && modelStats(c, party.band, model)
                  const weapons = c
                    ? modelGear(c, party.band, model)
                        .filter((gear) => ['melee', 'ranged'].includes(gear.category))
                        .map((gear) =>
                          gear.quantity > 1 ? `${gear.name} ×${gear.quantity}` : gear.name,
                        )
                    : []
                  const activated = isActivated(battle, id, model.id),
                    out = isOut(battle, id, model.id)
                  const team =
                    model.fireteam &&
                    units.filter(({ model: entry }) => entry.fireteam === model.fireteam)
                  const partner =
                    team &&
                    team.length === 2 &&
                    team.find(
                      ({ model: entry }) =>
                        entry.id !== model.id &&
                        !isOut(battle, id, entry.id) &&
                        !isActivated(battle, id, entry.id) &&
                        !fireteamErrors.some(
                          (error) =>
                            !error.modelId ||
                            error.modelId === model.id ||
                            error.modelId === entry.id,
                        ),
                    )
                  return (
                    <article key={model.id} className={`battle-figure ${out ? 'is-out' : ''}`}>
                      <button
                        className="text-button battle-figure-name"
                        onClick={() => setPreview({ partyId: id, modelId: model.id, name })}
                      >
                        <BookOpen size={16} />
                        <strong>{name}</strong>
                      </button>
                      {stats && <StatsGrid stats={stats} />}
                      <p className="battle-weapons">
                        {weapons.length ? weapons.join(' · ') : 'Вооружение не указано'}
                      </p>
                      <div className="battle-marks">
                        <button
                          className="button button-outline"
                          aria-label={`Совершил ход — ${name}`}
                          aria-pressed={activated}
                          disabled={!activated && (!active || out)}
                          onClick={() => update(toggleActivation(battle, id, model.id))}
                        >
                          <Check size={15} />
                          Совершил ход
                        </button>
                        <button
                          className="button button-outline"
                          aria-label={`Выведен из строя — ${name}`}
                          aria-pressed={out}
                          onClick={() => update(toggleOut(battle, id, model.id))}
                        >
                          <Crosshair size={15} />
                          Выведен из строя
                        </button>
                      </div>
                      {active && !activated && !out && partner && (
                        <button
                          className="text-button battle-fireteam"
                          onClick={() =>
                            update(toggleActivation(battle, id, model.id, partner.model.id))
                          }
                        >
                          Завершить общую активацию с {partner.name} <strong>FIRETEAM</strong>
                        </button>
                      )}
                      {party.mode === 'quick' && (
                        <button
                          className="text-button"
                          onClick={() => {
                            const next = removeModel(party.band, model.id)
                            update({
                              ...battle,
                              parties: battle.parties.map((item) =>
                                item.band.id === id ? { ...party, band: next } : item,
                              ),
                              out: battle.out.filter(
                                (key) => key !== JSON.stringify([id, model.id]),
                              ),
                              activations: battle.activations.flatMap((activation) => {
                                if (activation.partyId !== id) return [activation]
                                const modelIds = activation.modelIds.filter(
                                  (key) => key !== model.id,
                                )
                                return modelIds.length ? [{ ...activation, modelIds }] : []
                              }),
                            })
                          }}
                        >
                          Убрать из списка
                        </button>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
      {preview && shownParty && shownModel && (
        <BattleFighter
          party={shownParty}
          model={shownModel}
          name={preview.name}
          close={() => setPreview(undefined)}
          edit={edit}
        />
      )}
      {confirmEnd && (
        <Modal title="Завершить ход?" onClose={() => setConfirmEnd(false)}>
          <p>
            Осталось отметить активации: {remaining}. Продолжите, если на столе они уже разрешены.
          </p>
          <button className="button button-primary" onClick={end}>
            Подтвердить завершение хода
          </button>
        </Modal>
      )}
    </>
  )
}
