import { useMemo, useState } from 'react'
import { Dice5, Info, Minus, Plus, RotateCcw, ChevronDown, Crosshair } from 'lucide-react'
import {
  actionProbabilities,
  injuryProbabilities,
  percent,
  reduceFraction,
  rollDistribution,
  type Fraction,
} from '../domain/probability'
import { catalog, edition } from '../data/registry'
import { RuleLink } from '../components/Common'
function Stepper({
  label,
  value,
  onChange,
  max = 8,
  detail,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  max?: number
  detail?: string
}) {
  return (
    <div className="stepper-field">
      <div>
        <label>{label}</label>
        {detail && <p>{detail}</p>}
      </div>
      <div className="stepper">
        <button
          aria-label={`Уменьшить ${label}`}
          disabled={!value}
          onClick={() => onChange(value - 1)}
        >
          <Minus size={16} />
        </button>
        <input
          aria-label={label}
          type="number"
          min="0"
          max={max}
          value={value}
          onChange={(e) =>
            onChange(Math.min(max, Math.max(0, Math.floor(Number(e.target.value) || 0))))
          }
        />
        <button
          aria-label={`Увеличить ${label}`}
          disabled={value === max}
          onClick={() => onChange(value + 1)}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  )
}
function ProbabilityRow({
  label,
  value,
  color,
  range,
}: {
  label: string
  value: Fraction
  color: string
  range: string
}) {
  const p = percent(value),
    f = reduceFraction(value)
  return (
    <div className="probability-row">
      <div className="probability-top">
        <div>
          <span className="outcome-dot" style={{ background: color }} />
          <strong>{label}</strong>
          <span className="outcome-range">{range}</span>
        </div>
        <span className="probability-value">
          {p.toFixed(2).replace('.', ',')}
          <small>%</small>
        </span>
      </div>
      <div className="probability-track">
        <div style={{ width: `${p}%`, background: color }} />
      </div>
      <div className="probability-exact">
        <span>
          {value.numerator.toString()} / {value.denominator.toString()} исходов
        </span>
        <span>
          точно {f.numerator.toString()}/{f.denominator.toString()}
        </span>
      </div>
    </div>
  )
}
export function Calculator() {
  const [mode, setMode] = useState<'action' | 'injury'>('action'),
    [positive, setPositive] = useState(0),
    [negative, setNegative] = useState(0),
    [fixedPositive, setFixedPositive] = useState(0),
    [fixedNegative, setFixedNegative] = useState(0),
    [baseDice, setBaseDice] = useState(2),
    [extra, setExtra] = useState(0),
    [bloodbath, setBloodbath] = useState(false)
  const bloodbathProcedure = catalog.procedures.find((p) => p.kind === 'bloodbath')
  const bloodbathDice = mode === 'injury' && bloodbath && typeof bloodbathProcedure?.additionalBaseDice === 'number'
    ? bloodbathProcedure.additionalBaseDice : 0
  const effectiveBaseDice = baseDice + bloodbathDice
  const spec = useMemo(
    () => ({ baseDice: effectiveBaseDice, positiveDice: positive, negativeDice: negative, sumExtraDice: extra }),
    [effectiveBaseDice, positive, negative, extra],
  )
  const action = useMemo(() => actionProbabilities(spec), [spec]),
    injury = useMemo(
      () => injuryProbabilities(spec, fixedPositive, fixedNegative),
      [spec, fixedPositive, fixedNegative],
    )
  const distribution = useMemo(
      () => [...rollDistribution(spec).distribution].sort((a, b) => a[0] - b[0]),
      [spec],
    ),
    net = positive - negative
  const maxCount = Math.max(...distribution.map(([, n]) => Number(n)))
  const rule = edition.articles.find((a) =>
    a.title.toLowerCase().includes(mode === 'action' ? 'таблица успеха' : 'таблица ранений'),
  )
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">МАТЕМАТИКА ПОЛЯ БОЯ</span>
        <h1>Калькулятор вероятностей</h1>
        <p>Каждый исход учтён. Решение — за вами.</p>
      </div>
      <div className="calculator-tabs" role="tablist" aria-label="Таблица броска">
        <button
          role="tab"
          aria-selected={mode === 'action'}
          className={mode === 'action' ? 'active' : ''}
          onClick={() => setMode('action')}
        >
          <Crosshair size={18} />
          Успех действий<span>7+ / 12+</span>
        </button>
        <button
          role="tab"
          aria-selected={mode === 'injury'}
          className={mode === 'injury' ? 'active' : ''}
          onClick={() => setMode('injury')}
        >
          <Dice5 size={19} />
          Таблица ранений<span>2–6 / 7–8 / 9+</span>
        </button>
      </div>
      <div className="calculator-layout">
        <section className="panel calculator-controls">
          <div className="panel-header">
            <h2>Параметры броска</h2>
            <button
              className="icon-button"
              aria-label="Сбросить модификаторы"
              onClick={() => {
                setPositive(0)
                setNegative(0)
                setFixedPositive(0)
                setFixedNegative(0)
                setBaseDice(2)
                setExtra(0)
                setBloodbath(false)
              }}
            >
              <RotateCcw size={17} />
            </button>
          </div>
          <div className="control-section">
            <span className="eyebrow">МОДИФИКАТОРЫ КОЛИЧЕСТВА КУБИКОВ</span>
            <Stepper
              label="+DICE"
              value={positive}
              onChange={setPositive}
              detail="Выберите наибольшие результаты"
            />
            <Stepper
              label="−DICE"
              value={negative}
              onChange={setNegative}
              detail="Выберите наименьшие результаты"
            />
            <div className="net-dice">
              <span>После компенсации</span>
              <strong>
                {net > 0 ? '+' : ''}
                {net} DICE
              </strong>
            </div>
          </div>
          {mode === 'injury' && (
            <div className="control-section">
              {bloodbathProcedure && (
                <>
                  <label>
                    <input type="checkbox" checked={bloodbath} onChange={(e) => setBloodbath(e.target.checked)} />
                    {' '}Кровавая баня
                  </label>
                  <p className="muted small">
                    {String(bloodbathProcedure.bloodMarkerCost)} Маркеров Крови; для цели в состоянии «Повален» — {String(bloodbathProcedure.downTargetBloodMarkerCost)}.
                    {' '}Дополнительный D6 увеличивает исходный пул перед применением DICE.
                    {' '}<RuleLink id={bloodbathProcedure.ruleId}>Правило и пример</RuleLink>
                  </p>
                </>
              )}
              <span className="eyebrow">МОДИФИКАТОРЫ СУММЫ</span>
              <Stepper
                label="Положительный модификатор"
                value={fixedPositive}
                onChange={setFixedPositive}
                max={20}
                detail="Добавляется к сумме выбранных кубиков"
              />
              <Stepper
                label="Отрицательный модификатор"
                value={fixedNegative}
                onChange={setFixedNegative}
                max={20}
                detail="Вычитается из суммы выбранных кубиков"
              />
            </div>
          )}
          <details className="advanced-controls">
            <summary>
              Особые броски
              <ChevronDown size={16} />
            </summary>
            <p className="muted small">
              Используйте только процедуру, прямо указанную в правиле. Нестандартные параметры —
              математическая настройка, а не новое игровое правило.
            </p>
            <label>
              Исходный бросок
              <select
                value={baseDice}
                aria-label="Исходное количество кубиков"
                onChange={(e) => setBaseDice(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option value={n} key={n}>
                    {n}D6
                    {n === 2
                      ? ' · стандарт'
                      : n === 3
                        ? ' · например, Колесо Екатерины'
                        : n === 4
                          ? ' · например, Устройство Мученичества'
                          : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Дополнительно суммировать
              <select
                value={extra}
                aria-label="Дополнительно суммируемые кубики"
                onChange={(e) => setExtra(Number(e.target.value))}
              >
                {[0, 1, 2, 3, 4].map((n) => (
                  <option value={n} key={n}>
                    {n === 0 ? 'Нет дополнительных кубиков' : `+${n}D6 к сумме`}
                  </option>
                ))}
              </select>
            </label>
          </details>
        </section>
        <section className="panel calculator-results" aria-live="polite">
          <div className="panel-header">
            <div>
              <span className="eyebrow">ТОЧНОЕ РАСПРЕДЕЛЕНИЕ</span>
              <h2>{mode === 'action' ? 'Успех действий' : 'Результат ранения'}</h2>
            </div>
            <span className="dice-badge">
              <Dice5 size={18} />
              {effectiveBaseDice + Math.abs(net)}D6
            </span>
          </div>
          <div className="roll-formula">
            Бросить <strong>{effectiveBaseDice + Math.abs(net)}D6</strong>,{' '}
            {net === 0
              ? `суммировать все ${effectiveBaseDice}`
              : `оставить ${effectiveBaseDice} ${net > 0 ? 'наибольших' : 'наименьших'}`}
            {extra > 0 && `, прибавить ещё ${extra}D6`}
            {mode === 'injury' && (
              <span>
                {' '}
                · сумма {fixedPositive ? `+ ${fixedPositive}` : ''}{' '}
                {fixedNegative ? `− ${fixedNegative}` : ''}
                {!fixedPositive && !fixedNegative ? 'без фиксированных модификаторов' : ''}
              </span>
            )}
          </div>
          <div className="probability-list">
            {mode === 'action' ? (
              <>
                <ProbabilityRow label="Провал" range="2–6" value={action.failure} color="#a84c42" />
                <ProbabilityRow label="Успех" range="7–11" value={action.success} color="#8c9b76" />
                <ProbabilityRow
                  label="Критический успех"
                  range="12+"
                  value={action.critical}
                  color="#c7ae73"
                />
              </>
            ) : (
              <>
                <ProbabilityRow
                  label="Без эффекта"
                  range="≤1"
                  value={injury.none}
                  color="#848b89"
                />
                <ProbabilityRow
                  label="Лёгкое ранение"
                  range="2–6"
                  value={injury.minor}
                  color="#8c9b76"
                />
                <ProbabilityRow label="Повален" range="7–8" value={injury.down} color="#c7ae73" />
                <ProbabilityRow
                  label="Выведен из строя"
                  range="9+"
                  value={injury.out}
                  color="#a84c42"
                />
              </>
            )}
          </div>
          <div className="probability-total">
            <span>Все взаимоисключающие исходы</span>
            <strong>100%</strong>
          </div>
          <p className="muted small">
            Проценты округлены до двух знаков. Дроби показывают точные значения.
          </p>
        </section>
      </div>
      <section className="panel distribution-panel">
        <div className="panel-header">
          <h2>Распределение суммы</h2>
          <span className="muted small">До фиксированных модификаторов</span>
        </div>
        <div className="distribution-chart" aria-label="Распределение суммы выбранных кубиков">
          {distribution.map(([sum, count]) => (
            <div
              className="distribution-column"
              key={sum}
              title={`${sum}: ${count.toString()} исходов`}
            >
              <div
                className="distribution-bar"
                style={{ height: `${(Number(count) / maxCount) * 100}%` }}
              />
              <span>{sum}</span>
            </div>
          ))}
        </div>
      </section>
      <div className="info-note">
        <Info size={19} />
        <div>
          <strong>Кубики и фиксированные модификаторы — разные механики.</strong>
          <p>
            Положительные и отрицательные DICE взаимно сокращаются. Затем выбираются кубики, и
            только после этого применяются фиксированные модификаторы к сумме.
          </p>
          {rule && <RuleLink id={rule.id}>Исходная таблица и правила</RuleLink>}
        </div>
      </div>
    </>
  )
}
