import { countLabel } from '../data/format'
import { useRef, useState, lazy, Suspense, type FormEvent } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  Download,
  Flag,
  FolderOpen,
  Info,
  Plus,
  Save,
  Search,
  Settings2,
  Share2,
  Shield,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { categoryNames, edition, editions, getEdition } from '../data/registry'
import type { Catalog, Category, Model, Warband } from '../domain/schema'
import {
  addModel,
  buyEquipment,
  createWarband,
  effectiveOffer,
  effectiveUnit,
  getVariant,
  modelCost,
  modelKeywords,
  modelStats,
  offerApplies,
  removeModel,
  toggleUpgrade,
  updateModel,
  upgradeApplies,
  warbandCost,
} from '../domain/warband'
import {
  duplicateWarband,
  exportWarband,
  importShare,
  importWarband,
  loadWarbands,
  saveWarbands,
  shareWarband,
} from '../domain/storage'
import { validateWarband } from '../domain/validation'
import { CostView, EmptyState, Modal, StatsGrid, CopyButton } from '../components/Common'
const RulePreview = lazy(() =>
  import('../components/RulePreview').then((m) => ({ default: m.RulePreview })),
)
const go = (id: string) => {
  window.location.hash = `/warbands/${id}`
}
function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename.replace(/[^\p{L}\p{N} ._-]/gu, '-')
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function NewWarband({
  defaultFaction,
  onCreate,
  onClose,
}: {
  defaultFaction?: string
  onCreate: (w: Warband) => void
  onClose: () => void
}) {
  const [editionId, setEditionId] = useState(edition.id)
  const rules = getEdition(editionId)!.catalog
  const [factionId, setFaction] = useState(
      defaultFaction && rules.factions.some((f) => f.id === defaultFaction)
        ? defaultFaction
        : rules.factions[0]!.id,
    ),
    [variantId, setVariant] = useState(''),
    [format, setFormat] = useState<'campaign' | 'battle'>('battle'),
    [name, setName] = useState('')
  const f = rules.factions.find((f) => f.id === factionId)!,
    v = rules.variants.find((v) => v.id === variantId),
    budget =
      format === 'campaign'
        ? (v?.startingBudget ?? f.startingBudget)
        : (v?.battleBudget ?? f.battleBudget)
  function submit(e: FormEvent) {
    e.preventDefault()
    const w = createWarband(rules, factionId, variantId || null, format)
    onCreate({ ...w, name: name.trim() || `${f.name} — новый отряд` })
  }
  return (
    <Modal title="Новое знамя над траншеями" onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <p className="muted">
          Выберите сторону Великой войны. Изменения отряда будут сохраняться на этом устройстве
          автоматически.
        </p>
        <label>
          Название отряда
          <input
            autoFocus
            aria-label="Название нового отряда"
            maxLength={200}
            placeholder="Например, Последняя литания"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Редакция правил
          <select
            aria-label="Редакция правил"
            value={editionId}
            onChange={(e) => {
              setEditionId(e.target.value)
              setFaction(getEdition(e.target.value)!.catalog.factions[0]!.id)
              setVariant('')
            }}
          >
            {editions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Фракция
          <select
            aria-label="Фракция нового отряда"
            value={factionId}
            onChange={(e) => {
              setFaction(e.target.value)
              setVariant('')
            }}
          >
            {rules.factions.map((f) => (
              <option value={f.id} key={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Вариант отряда
          <select
            aria-label="Вариант нового отряда"
            value={variantId}
            onChange={(e) => setVariant(e.target.value)}
          >
            <option value="">Основной список фракции</option>
            {rules.variants
              .filter((v) => v.factionId === factionId)
              .map((v) => (
                <option value={v.id} key={v.id}>
                  {v.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Формат
          <select
            aria-label="Формат отряда"
            value={format}
            onChange={(e) => setFormat(e.target.value as typeof format)}
          >
            <option value="battle">Разовая битва</option>
            <option value="campaign">Начало кампании</option>
          </select>
        </label>
        <div className="new-budget">
          <span>Начальный бюджет</span>
          <CostView cost={budget} />
        </div>
        <div className="info-note compact">
          <Info size={18} />
          <p>
            Временно невалидный состав разрешён. Все нарушения и непроверенные условия будут
            показаны в диагностике.
          </p>
        </div>
        <button type="submit" className="button button-primary full-width">
          <Flag size={17} />
          Создать отряд
          <ArrowRight size={17} />
        </button>
      </form>
    </Modal>
  )
}
function ImportDialog({
  encoded,
  onImport,
  onClose,
}: {
  encoded?: string
  onImport: (w: Warband) => void
  onClose: () => void
}) {
  const [text, setText] = useState(() => {
      if (!encoded) return ''
      try {
        return exportWarband(importShare(encoded))
      } catch {
        return ''
      }
    }),
    [error, setError] = useState(''),
    input = useRef<HTMLInputElement>(null)
  const submit = () => {
    try {
      onImport(importWarband(text))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось прочитать отряд')
    }
  }
  return (
    <Modal title="Восстановить отряд" onClose={onClose}>
      <div className="form-stack">
        <p className="muted">
          Выберите ранее экспортированный JSON или вставьте его содержимое. Существующие отряды
          сохранятся; импорт создаст отдельную копию.
        </p>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          aria-label="Файл отряда"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) {
              if (file.size > 2_000_000) {
                setError('Файл превышает 2 МБ')
                return
              }
              void file
                .text()
                .then(setText)
                .catch(() => setError('Не удалось прочитать файл'))
            }
          }}
        />
        <label>
          JSON отряда
          <textarea
            aria-label="JSON для импорта"
            rows={9}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setError('')
            }}
            placeholder='{"format":"trench-crusade-warband","version":1,…}'
          />
        </label>
        {encoded && !text && (
          <p className="error-message">Ссылка повреждена или имеет неподдерживаемый формат.</p>
        )}
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <button
          className="button button-primary full-width"
          disabled={!text.trim()}
          onClick={submit}
        >
          <Upload size={17} />
          Импортировать отряд
        </button>
      </div>
    </Modal>
  )
}

function WarbandSettings({
  c,
  band,
  onChange,
  onClose,
}: {
  c: Catalog
  band: Warband
  onChange: (w: Warband) => void
  onClose: () => void
}) {
  const v = getVariant(c, band)
  return (
    <Modal title="Параметры отряда" onClose={onClose}>
      <div className="form-stack">
        <label>
          Название
          <input
            aria-label="Название отряда"
            value={band.name}
            maxLength={200}
            onChange={(e) => onChange({ ...band, name: e.target.value || 'Без названия' })}
          />
        </label>
        <label>
          Бюджет в дукатах
          <input
            aria-label="Бюджет в дукатах"
            type="number"
            min="0"
            max="100000"
            value={band.budget.ducats}
            onChange={(e) =>
              onChange({
                ...band,
                format: 'custom',
                budget: {
                  ...band.budget,
                  ducats: Math.min(100000, Math.max(0, Math.floor(Number(e.target.value)))),
                },
              })
            }
          />
        </label>
        <label>
          Бюджет Славы
          <input
            aria-label="Бюджет Славы"
            type="number"
            min="0"
            max="10000"
            value={band.budget.glory}
            onChange={(e) =>
              onChange({
                ...band,
                format: 'custom',
                budget: {
                  ...band.budget,
                  glory: Math.min(10000, Math.max(0, Math.floor(Number(e.target.value)))),
                },
              })
            }
          />
        </label>
        <div className="info-note compact">
          <Info size={18} />
          <p>
            Редакция, фракция и вариант закреплены при создании отряда. Для другого списка создайте
            новый отряд.
          </p>
        </div>
        {v?.foreignArsenals?.map((fid) => (
          <label key={fid}>
            Трофейный предмет: {c.factions.find((f) => f.id === fid)?.name}
            <select
              value={
                band.foreignOfferIds.find(
                  (id) => c.offers.find((o) => o.id === id)?.factionId === fid,
                ) ?? ''
              }
              onChange={(e) =>
                onChange({
                  ...band,
                  foreignOfferIds: [
                    ...band.foreignOfferIds.filter(
                      (id) => c.offers.find((o) => o.id === id)?.factionId !== fid,
                    ),
                    ...(e.target.value ? [e.target.value] : []),
                  ],
                })
              }
            >
              <option value="">Не выбран</option>
              {c.offers
                .filter((o) => o.factionId === fid && !o.variantId)
                .map((o) => (
                  <option value={o.id} key={o.id}>
                    {o.name} · {o.cost.ducats} дк / {o.cost.glory} ОС
                  </option>
                ))}
            </select>
          </label>
        ))}
        <button className="button button-primary" onClick={onClose}>
          <Check size={17} />
          Готово
        </button>
      </div>
    </Modal>
  )
}
function AddFighter({
  c,
  band,
  onAdd,
  onClose,
  onPreview,
}: {
  c: Catalog
  band: Warband
  onAdd: (id: string) => void
  onClose: () => void
  onPreview: (id: string) => void
}) {
  const [query, setQuery] = useState(''),
    [mercenaries, setMercenaries] = useState(false),
    [showAll, setAll] = useState(false)
  const options = c.units.filter(
    (u) =>
      (mercenaries ? u.mercenary : u.factionId === band.factionId) &&
      (showAll ||
        ((!u.variantId || u.variantId === band.variantId) &&
          effectiveUnit(c, band, u.id)?.max !== 0 &&
          (!u.mercenary || u.allowedFactions?.includes(band.factionId)))) &&
      u.name.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')),
  )
  return (
    <Modal title="Пополнение отряда" onClose={onClose} wide>
      <div className="segmented">
        <button className={!mercenaries ? 'active' : ''} onClick={() => setMercenaries(false)}>
          Бойцы фракции
        </button>
        <button className={mercenaries ? 'active' : ''} onClick={() => setMercenaries(true)}>
          Союзники и наёмники
        </button>
      </div>
      <div className="search-field">
        <Search size={18} />
        <input
          aria-label="Поиск бойца"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Найти профиль…"
        />
      </div>
      <label className="checkbox-line">
        <input type="checkbox" checked={showAll} onChange={(e) => setAll(e.target.checked)} />
        Показать также недоступные профили
      </label>
      <div className="recruit-list">
        {options.map((base) => {
          const u = effectiveUnit(c, band, base.id)!
          return (
            <article key={u.id} className="recruit-card">
              <div>
                <div className="recruit-top">
                  <h3>{u.name}</h3>
                  <CostView cost={u.cost} compact />
                </div>
                <StatsGrid stats={u.stats} />
                <div className="recruit-meta">
                  <span>
                    {u.min ? `Обязательно: ${u.min} · ` : ''}
                    {u.max === null ? 'Без лимита' : `Лимит: ${u.max}`} · в отряде{' '}
                    {band.units.filter((m) => m.unitId === u.id).length}
                  </span>
                  <button className="text-button" onClick={() => onPreview(u.ruleId)}>
                    Правила
                    <BookOpen size={13} />
                  </button>
                </div>
              </div>
              <button
                className="button button-small button-primary"
                aria-label={`Добавить: ${u.name}`}
                onClick={() => onAdd(u.id)}
              >
                <Plus size={16} />
                Добавить
              </button>
            </article>
          )
        })}
        {!options.length && <p className="empty-text">Профили не найдены.</p>}
      </div>
    </Modal>
  )
}
function FighterEditor({
  c,
  band,
  model,
  onChange,
  onPreview,
  onRemove,
}: {
  c: Catalog
  band: Warband
  model: Model
  onChange: (w: Warband) => void
  onPreview: (id: string) => void
  onRemove: () => void
}) {
  const [tab, setTab] = useState<Category>('ranged'),
    [query, setQuery] = useState(''),
    [showAll, setAll] = useState(false)
  const u = effectiveUnit(c, band, model.unitId, model),
    stats = modelStats(c, band, model)
  if (!u || !stats)
    return (
      <div className="error-message">
        Профиль отсутствует в этой редакции. Экспортируйте отряд для восстановления.
      </div>
    )
  const offers = c.offers.filter(
    (o) =>
      (o.factionId === band.factionId ||
        band.foreignOfferIds.includes(o.id) ||
        (model.upgrades.includes('rotten-cross') &&
          ['antioch', 'heretic'].includes(o.factionId))) &&
      o.category === tab &&
      (showAll || offerApplies(c, band, model, o)) &&
      o.name.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')),
  )
  const upgrades = c.upgrades.filter(
    (up) => upgradeApplies(c, band, model, up) || model.upgrades.includes(up.id),
  )
  const changes = (patch: Partial<Model>) => onChange(updateModel(band, model.id, patch))
  return (
    <section className="fighter-editor panel" tabIndex={-1}>
      <div className="fighter-editor-heading">
        <div>
          <span className="eyebrow">
            ПРОФИЛЬ БОЙЦА /{' '}
            {u.mercenary ? 'НАЁМНИК' : u.keywords.includes('ELITE') ? 'ЭЛИТА' : 'ВОЙСКА'}
          </span>
          <h2>{u.name}</h2>
        </div>
        <button
          className="icon-button danger-text"
          aria-label={`Удалить бойца ${model.name}`}
          onClick={onRemove}
        >
          <Trash2 size={18} />
        </button>
      </div>
      <div className="fighter-profile">
        <label className="fighter-name-label">
          Имя бойца
          <input
            aria-label="Имя бойца"
            value={model.name}
            maxLength={200}
            onChange={(e) => changes({ name: e.target.value })}
          />
        </label>
        <StatsGrid stats={stats} />
        <div className="tags">
          {modelKeywords(c, band, model).map((k) => {
            const keyword = c.keywords.find((x) => x.name === k)
            return keyword ? (
              <button className="tag" key={k} onClick={() => onPreview(keyword.ruleId)}>
                {k}
              </button>
            ) : (
              <span className="tag" key={k}>
                {k}
              </span>
            )
          })}
        </div>
        <div className="fighter-profile-bottom">
          <button className="text-button" onClick={() => onPreview(u.ruleId)}>
            <BookOpen size={15} />
            Способности и правила профиля
          </button>
          <CostView cost={modelCost(c, band, model).cost} />
        </div>
      </div>
      {u.fixedItems.length > 0 && (
        <div className="fixed-equipment">
          <span className="eyebrow">
            <Shield size={13} /> ВКЛЮЧЕНО В ПРОФИЛЬ
          </span>
          <p>{u.fixedItems.map((i) => i.name).join(' · ')}</p>
          <span className="muted small">
            Неснимаемое снаряжение учтено в базовой стоимости и характеристиках.
          </span>
        </div>
      )}
      <div className="equipment-section">
        <div className="subsection-heading">
          <h3>Экипировка</h3>
          <span>
            {countLabel(
              model.equipment.reduce((n, e) => n + e.quantity, 0),
              ['предмет', 'предмета', 'предметов'],
            )}
          </span>
        </div>
        {model.equipment.length > 0 ? (
          <div className="equipped-list">
            {model.equipment.map((e) => {
              const o = effectiveOffer(c, band, e.offerId)
              return (
                <div key={e.id}>
                  <button
                    className="equipped-name"
                    onClick={() =>
                      o && onPreview(c.items.find((i) => i.id === o.itemId)?.ruleId ?? o.ruleId)
                    }
                  >
                    <BookOpen size={14} />
                    {o?.name ?? `Неизвестный предмет ${e.offerId}`}
                    {e.quantity > 1 && ` ×${e.quantity}`}
                  </button>
                  {o && (
                    <CostView
                      cost={{
                        ducats: o.cost.ducats * e.quantity,
                        glory: o.cost.glory * e.quantity,
                      }}
                      compact
                    />
                  )}
                  <button
                    className="icon-button"
                    aria-label={`Снять: ${o?.name ?? e.offerId}`}
                    onClick={() =>
                      changes({ equipment: model.equipment.filter((x) => x.id !== e.id) })
                    }
                  >
                    <X size={16} />
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="muted small">Дополнительное снаряжение не выбрано.</p>
        )}
        {u.equipmentLocked ? (
          <div className="locked-note">
            <Shield size={17} />
            Профиль запрещает изменение экипировки. Доступные улучшения перечислены ниже.
          </div>
        ) : (
          <>
            <div className="equipment-tabs" role="tablist" aria-label="Категория снаряжения">
              {(['ranged', 'melee', 'armour', 'equipment'] as const).map((cat) => (
                <button
                  role="tab"
                  aria-selected={tab === cat}
                  className={tab === cat ? 'active' : ''}
                  onClick={() => {
                    setTab(cat)
                    setQuery('')
                  }}
                  key={cat}
                >
                  {cat === 'ranged'
                    ? 'Дальний бой'
                    : cat === 'melee'
                      ? 'Ближний бой'
                      : cat === 'armour'
                        ? 'Броня'
                        : 'Снаряжение'}
                </button>
              ))}
            </div>
            <div className="search-field">
              <Search size={16} />
              <input
                aria-label="Поиск снаряжения"
                placeholder={`Найти: ${categoryNames[tab].toLowerCase()}…`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <label className="checkbox-line">
              <input type="checkbox" checked={showAll} onChange={(e) => setAll(e.target.checked)} />
              Показать недоступные покупки
            </label>
            <div className="offer-list">
              {offers.map((base) => {
                const o = effectiveOffer(c, band, base.id)!
                return (
                  <div className="offer-row" key={o.id}>
                    <div>
                      <button
                        className="text-button offer-name"
                        onClick={() =>
                          onPreview(c.items.find((i) => i.id === o.itemId)?.ruleId ?? o.ruleId)
                        }
                      >
                        {o.name}
                        <BookOpen size={12} />
                      </button>
                      {o.notes && <p>{o.notes}</p>}
                    </div>
                    <CostView cost={o.cost} compact />
                    <button
                      className="icon-button add-equipment"
                      aria-label={`Купить: ${o.name}`}
                      onClick={() => onChange(buyEquipment(band, model.id, o.id))}
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                )
              })}
              {!offers.length && (
                <p className="empty-text">В этой категории нет доступных покупок.</p>
              )}
            </div>
          </>
        )}
      </div>
      {upgrades.length > 0 && (
        <div className="upgrade-section">
          <div className="subsection-heading">
            <h3>Улучшения и способности</h3>
            <span>{model.upgrades.length} выбрано</span>
          </div>
          {upgrades.map((up) => (
            <div className="upgrade-row" key={up.id}>
              <label>
                <input
                  type="checkbox"
                  checked={model.upgrades.includes(up.id)}
                  onChange={() => onChange(toggleUpgrade(band, model.id, up.id))}
                />
                <span>
                  {up.name}
                  {up.limit !== null && <small>Лимит: {up.limit}</small>}
                </span>
              </label>
              <CostView cost={up.cost} compact />
              <button
                className="icon-button"
                aria-label={`Правило: ${up.name}`}
                onClick={() => onPreview(up.ruleId)}
              >
                <BookOpen size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
      <details className="model-notes">
        <summary>Заметки и боевая группа</summary>
        <label>
          Боевая группа
          <input
            aria-label="Боевая группа бойца"
            placeholder="Одинаковая метка для двух бойцов"
            maxLength={50}
            value={model.fireteam}
            onChange={(e) => changes({ fireteam: e.target.value })}
          />
        </label>
        <label>
          Заметки бойца
          <textarea
            aria-label="Заметки бойца"
            rows={3}
            value={model.notes}
            onChange={(e) => changes({ notes: e.target.value })}
          />
        </label>
      </details>
    </section>
  )
}
function Editor({
  band,
  onChange,
  onPreview,
  onExport,
  onDuplicate,
  onDelete,
  saveError,
}: {
  band: Warband
  onChange: (w: Warband) => void
  onPreview: (id: string) => void
  onExport: () => void
  onDuplicate: () => void
  onDelete: () => void
  saveError: string
}) {
  const [selectedId, setSelected] = useState(band.units[0]?.id ?? ''),
    [adding, setAdding] = useState(false),
    [settings, setSettings] = useState(false),
    [tab, setTab] = useState<'roster' | 'validation' | 'notes'>('roster'),
    [share, setShare] = useState(''),
    [shareError, setShareError] = useState('')
  const c = getEdition(band.editionId, band.revision)?.catalog
  if (!c)
    return (
      <div className="panel">
        <h1>{band.name}</h1>
        <p className="error-message">
          Редакция {band.editionId} / {band.revision} недоступна. Отряд сохранён без изменения.
          Расчёт по другой редакции не выполняется.
        </p>
        <button className="button" onClick={onExport}>
          <Download size={17} />
          Экспортировать исходный отряд
        </button>
        <a href="#/warbands" className="button">
          Все отряды
        </a>
      </div>
    )
  const total = warbandCost(c, band),
    validation = validateWarband(c, band),
    errors = validation.diagnostics.filter((d) => d.severity === 'error'),
    manual = validation.diagnostics.filter((d) => d.severity === 'manual'),
    model = band.units.find((m) => m.id === selectedId) ?? band.units[0],
    faction = c.factions.find((f) => f.id === band.factionId),
    variant = getVariant(c, band)
  const update = (w: Warband) => onChange({ ...w, updatedAt: new Date().toISOString() })
  return (
    <>
      <a href="#/warbands" className="back-link">
        <ArrowLeft size={15} />
        Мои отряды
      </a>
      <div className="warband-heading">
        <div>
          <span className="eyebrow">
            {faction?.name} {variant ? ` / ${variant.name}` : ''}
          </span>
          <h1>{band.name}</h1>
          <div className="warband-meta">
            <span className="edition-pill">{band.editionId}</span>
            <span>{countLabel(band.units.length, ['боец', 'бойца', 'бойцов'])}</span>
            <span className={saveError ? 'danger-text' : 'save-state'}>
              <Save size={13} />
              {saveError ? 'Не сохранено' : 'Сохранено на устройстве'}
            </span>
          </div>
        </div>
        <div className="warband-actions">
          <button
            className="icon-button"
            aria-label="Параметры отряда"
            onClick={() => setSettings(true)}
          >
            <Settings2 size={19} />
          </button>
          <button className="icon-button" aria-label="Дублировать отряд" onClick={onDuplicate}>
            <Copy size={19} />
          </button>
          <button className="icon-button" aria-label="Экспортировать отряд" onClick={onExport}>
            <Download size={19} />
          </button>
          <button
            className="icon-button"
            aria-label="Поделиться отрядом"
            onClick={() => {
              try {
                setShare(shareWarband(band, `${window.location.origin}${window.location.pathname}`))
                setShareError('')
              } catch (e) {
                setShareError(e instanceof Error ? e.message : 'Не удалось создать ссылку')
              }
            }}
          >
            <Share2 size={18} />
          </button>
          <button className="icon-button danger-text" aria-label="Удалить отряд" onClick={onDelete}>
            <Trash2 size={18} />
          </button>
        </div>
      </div>
      {saveError && (
        <p role="alert" className="error-message">
          {saveError} Экспортируйте текущий отряд, чтобы сохранить изменения.
        </p>
      )}
      {shareError && (
        <p role="alert" className="error-message">
          {shareError}
        </p>
      )}
      <div className="budget-strip">
        <div>
          <span>СТОИМОСТЬ ОТРЯДА</span>
          <CostView cost={total.cost} />
        </div>
        <div className={total.cost.ducats > band.budget.ducats ? 'over-budget' : ''}>
          <span>ОСТАЛОСЬ ДУКАТОВ</span>
          <strong>
            {band.budget.ducats - total.cost.ducats}
            <small> / {band.budget.ducats}</small>
          </strong>
        </div>
        <div className={total.cost.glory > band.budget.glory ? 'over-budget' : ''}>
          <span>ОСТАЛОСЬ СЛАВЫ</span>
          <strong>
            ✦ {band.budget.glory - total.cost.glory}
            <small> / {band.budget.glory}</small>
          </strong>
        </div>
        <button
          onClick={() => setTab('validation')}
          className={`validation-summary ${errors.length ? 'has-errors' : ''}`}
        >
          <AlertCircle size={20} />
          <span>
            <strong>{errors.length ? `${errors.length} ошибок` : 'Ошибок не найдено'}</strong>
            <small>
              {manual.length ? 'Требуется ручная сверка' : 'Автоматические проверки выполнены'}
            </small>
          </span>
          <ChevronRight size={17} />
        </button>
      </div>
      <div className="editor-tabs">
        <button className={tab === 'roster' ? 'active' : ''} onClick={() => setTab('roster')}>
          <Users size={17} />
          Состав<span>{band.units.length}</span>
        </button>
        <button
          className={tab === 'validation' ? 'active' : ''}
          onClick={() => setTab('validation')}
        >
          <Shield size={17} />
          Проверка{errors.length > 0 && <span className="error-count">{errors.length}</span>}
        </button>
        <button className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}>
          <BookOpen size={16} />
          Заметки
        </button>
      </div>
      {tab === 'roster' && (
        <>
          {band.factionId === 'court' && (
            <label className="allegiance-select">
              Посвящение Смертному Греху
              <select
                aria-label="Смертный Грех"
                value={band.allegiance}
                onChange={(e) => update({ ...band, allegiance: e.target.value })}
              >
                <option value="">Выберите грех</option>
                {[
                  ['wrath', 'Гнев'],
                  ['envy', 'Зависть'],
                  ['lust', 'Похоть'],
                  ['pride', 'Гордыня'],
                  ['sloth', 'Лень'],
                  ['gluttony', 'Чревоугодие'],
                  ['greed', 'Алчность'],
                ].map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="builder-grid">
            <aside className="roster-panel panel">
              <div className="panel-header">
                <h2>Личный состав</h2>
                <span className="muted">{band.units.length}</span>
              </div>
              <div className="roster-list">
                {band.units.map((m) => {
                  const u = effectiveUnit(c, band, m.unitId),
                    hasErrors = errors.some((d) => d.modelId === m.id)
                  return (
                    <button
                      className={`roster-model ${model?.id === m.id ? 'active' : ''}`}
                      key={m.id}
                      onClick={() => setSelected(m.id)}
                    >
                      <span
                        className={`roster-model-icon ${u?.keywords.includes('ELITE') ? 'elite' : ''}`}
                      >
                        {u?.keywords.includes('ELITE') ? <Flag size={16} /> : <Users size={16} />}
                      </span>
                      <span>
                        <strong>{m.name || u?.name}</strong>
                        <small>{u?.name}</small>
                        <CostView cost={modelCost(c, band, m).cost} compact />
                      </span>
                      {hasErrors ? (
                        <AlertCircle size={16} className="danger-text" />
                      ) : (
                        <ChevronRight size={15} />
                      )}
                    </button>
                  )
                })}
              </div>
              <button className="button button-primary full-width" onClick={() => setAdding(true)}>
                <Plus size={18} />
                Добавить бойца
              </button>
              <p className="roster-note">
                Каждая покупка сразу учитывается в стоимости и проверках.
              </p>
            </aside>
            {model ? (
              <FighterEditor
                c={c}
                key={model.id}
                band={band}
                model={model}
                onChange={update}
                onPreview={onPreview}
                onRemove={() => update(removeModel(band, model.id))}
              />
            ) : (
              <EmptyState
                icon={<Flag size={44} strokeWidth={1} />}
                title="Соберите своё войско"
                action={
                  <button className="button button-primary" onClick={() => setAdding(true)}>
                    <Plus size={17} />
                    Добавить первого бойца
                  </button>
                }
              >
                Выберите командующего, добавьте бойцов и подготовьте их к Великой войне.
              </EmptyState>
            )}
          </div>
        </>
      )}
      {tab === 'validation' && (
        <section className="diagnostics">
          <div className="info-note">
            <Info size={20} />
            <div>
              <strong>
                {validation.status === 'invalid'
                  ? 'Найдены нарушения правил'
                  : validation.status === 'needs-review'
                    ? 'Автоматические проверки пройдены; нужна ручная сверка'
                    : 'Состав прошёл реализованные проверки'}
              </strong>
              <p>
                Отряд можно сохранять и редактировать при любом результате. Сообщения «Нужна сверка»
                не считаются автоматически проверенными правилами.
              </p>
            </div>
          </div>
          {validation.diagnostics.map((d, i) => (
            <article className={`diagnostic diagnostic-${d.severity}`} key={`${d.code}-${i}`}>
              <AlertCircle size={18} />
              <div>
                <span className="eyebrow">
                  {d.severity === 'error'
                    ? 'ОШИБКА'
                    : d.severity === 'manual'
                      ? 'НУЖНА СВЕРКА'
                      : d.severity === 'warning'
                        ? 'ПРЕДУПРЕЖДЕНИЕ'
                        : 'ИНФОРМАЦИЯ'}
                  {d.modelId ? ` · ${band.units.find((m) => m.id === d.modelId)?.name}` : ''}
                </span>
                <p>{d.message}</p>
                {d.ruleId && (
                  <button className="text-button" onClick={() => onPreview(d.ruleId!)}>
                    Правило-источник
                    <BookOpen size={13} />
                  </button>
                )}
              </div>
              {d.modelId && (
                <button
                  className="icon-button"
                  aria-label="Перейти к бойцу"
                  onClick={() => {
                    setSelected(d.modelId!)
                    setTab('roster')
                  }}
                >
                  <ArrowRight size={18} />
                </button>
              )}
            </article>
          ))}
        </section>
      )}
      {tab === 'notes' && (
        <section className="panel warband-notes">
          <h2>Полевой журнал</h2>
          <p className="muted">
            История отряда, достижения, кампанийные условия и договорённости с соперником.
          </p>
          <textarea
            aria-label="Заметки отряда"
            rows={12}
            value={band.notes}
            maxLength={20000}
            onChange={(e) => update({ ...band, notes: e.target.value })}
          />
          <p className="muted small">Заметки сохраняются и экспортируются вместе с отрядом.</p>
        </section>
      )}
      {adding && (
        <AddFighter
          c={c}
          band={band}
          onClose={() => setAdding(false)}
          onPreview={onPreview}
          onAdd={(id) => {
            const next = addModel(c, band, id)
            update(next)
            setSelected(next.units.at(-1)!.id)
            setAdding(false)
            requestAnimationFrame(() => {
              const panel = document.querySelector<HTMLElement>('.fighter-editor')
              panel?.focus({ preventScroll: true })
              if (window.innerWidth <= 760) panel?.scrollIntoView({ block: 'start' })
            })
          }}
        />
      )}
      {settings && (
        <WarbandSettings c={c} band={band} onClose={() => setSettings(false)} onChange={update} />
      )}
      {share && (
        <Modal title="Поделиться отрядом" onClose={() => setShare('')}>
          <p className="muted">
            Ссылка содержит весь отряд. Данные не загружаются на сервер. Получатель сможет сохранить
            отдельную копию.
          </p>
          <label>
            Ссылка
            <input
              aria-label="Ссылка на отряд"
              value={share}
              readOnly
              onFocus={(e) => e.target.select()}
            />
          </label>
          <CopyButton text={share} label="Скопировать ссылку" />
          <p className="muted small">
            Для долговременной резервной копии используйте экспорт JSON.
          </p>
        </Modal>
      )}
    </>
  )
}
export function Warbands({
  routeId,
  defaultFaction,
  encoded,
}: {
  routeId?: string
  defaultFaction?: string
  encoded?: string
}) {
  const [initial] = useState(() => {
    try {
      return { bands: loadWarbands(localStorage), error: '' }
    } catch (e) {
      return {
        bands: [] as Warband[],
        error: e instanceof Error ? e.message : 'Хранилище недоступно',
      }
    }
  })
  const [bands, setBands] = useState(initial.bands),
    [saveError, setSaveError] = useState(initial.error),
    [creating, setCreating] = useState(false),
    [importing, setImporting] = useState(false),
    [preview, setPreview] = useState('')
  const current = bands.find((w) => w.id === routeId)
  function persist(next: Warband[]) {
    setBands(next)
    if (initial.error) {
      setSaveError(initial.error)
      return
    }
    try {
      saveWarbands(localStorage, next)
      setSaveError('')
    } catch {
      setSaveError('Не удалось записать данные: хранилище недоступно или заполнено.')
    }
  }
  function add(w: Warband) {
    persist([...bands, w])
    setCreating(false)
    setImporting(false)
    go(w.id)
  }
  const closeCreation = () => {
    setCreating(false)
    if (routeId === 'new') window.location.hash = '/warbands'
  }
  const closeImport = () => {
    setImporting(false)
    if (encoded) window.location.hash = '/warbands'
  }
  return (
    <>
      {current ? (
        <Editor
          key={current.id}
          band={current}
          saveError={saveError}
          onChange={(w) => persist(bands.map((x) => (x.id === w.id ? w : x)))}
          onPreview={setPreview}
          onExport={() => download(exportWarband(current), `${current.name}.json`)}
          onDuplicate={() => add(duplicateWarband(current))}
          onDelete={() => {
            if (window.confirm(`Удалить отряд «${current.name}» с этого устройства?`)) {
              persist(bands.filter((w) => w.id !== current.id))
              window.location.hash = '/warbands'
            }
          }}
        />
      ) : (
        <>
          <div className="page-heading library-heading">
            <div>
              <span className="eyebrow">ЛИЧНЫЙ ПОЛЕВОЙ АРХИВ</span>
              <h1>Мои отряды</h1>
              <p>Ваши знамёна, ваши воины. Сохранены на этом устройстве.</p>
            </div>
            <div className="library-actions">
              <button className="button button-outline" onClick={() => setImporting(true)}>
                <Upload size={17} />
                Импорт
              </button>
              <button className="button button-primary" onClick={() => setCreating(true)}>
                <Plus size={18} />
                Создать отряд
              </button>
            </div>
          </div>
          {saveError && (
            <p role="alert" className="error-message">
              {saveError} Исходные данные не перезаписываются. Сохраняйте новые отряды через
              JSON-экспорт.
            </p>
          )}
          {bands.length ? (
            <div className="warband-library">
              {bands.map((w) => {
                const c = getEdition(w.editionId, w.revision)?.catalog
                return (
                  <article className="saved-warband panel" key={w.id}>
                    <span className="eyebrow">
                      {c?.factions.find((f) => f.id === w.factionId)?.name ?? w.factionId} ·{' '}
                      {w.editionId}
                    </span>
                    <a className="saved-warband-title" href={`#/warbands/${w.id}`}>
                      <Flag size={26} />
                      <h2>{w.name}</h2>
                    </a>
                    <div className="saved-warband-meta">
                      <span>{countLabel(w.units.length, ['боец', 'бойца', 'бойцов'])}</span>
                      {c && <CostView cost={warbandCost(c, w).cost} compact />}
                    </div>
                    <div className="saved-warband-bottom">
                      <a className="text-link" href={`#/warbands/${w.id}`}>
                        Открыть отряд
                        <ArrowRight size={16} />
                      </a>
                      <button
                        className="icon-button"
                        aria-label={`Экспорт: ${w.name}`}
                        onClick={() => download(exportWarband(w), `${w.name}.json`)}
                      >
                        <Download size={17} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Копия: ${w.name}`}
                        onClick={() => add(duplicateWarband(w))}
                      >
                        <Copy size={17} />
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <EmptyState
              icon={<FolderOpen size={48} strokeWidth={1} />}
              title="Каждой войне нужно своё знамя"
              action={
                <button className="button button-primary" onClick={() => setCreating(true)}>
                  <Plus size={17} />
                  Создать первый отряд
                </button>
              }
            >
              Создайте отряд любой из шести фракций, выберите вариант и экипируйте бойцов. Можно
              начать с импорта готового списка.
            </EmptyState>
          )}
          <div className="info-note">
            <Save size={20} />
            <div>
              <strong>Сохраняйте резервные копии</strong>
              <p>
                Отряды хранятся только в вашем браузере. Экспорт JSON позволяет перенести их на
                другое устройство и восстановить после очистки данных сайта.
              </p>
            </div>
          </div>
          <div className="library-foot">
            <span>Редакция: {edition.id}</span>
            <span>Никакой авторизации · Никакой синхронизации с сервером</span>
          </div>
        </>
      )}
      {(creating || routeId === 'new') && (
        <NewWarband defaultFaction={defaultFaction} onClose={closeCreation} onCreate={add} />
      )}
      {(importing || encoded !== undefined) && (
        <ImportDialog
          encoded={encoded}
          onClose={closeImport}
          onImport={(w) => add(duplicateWarband(w, w.name))}
        />
      )}
      {preview && (
        <Suspense fallback={null}>
          <RulePreview id={preview} onClose={() => setPreview('')} />
        </Suspense>
      )}
    </>
  )
}
