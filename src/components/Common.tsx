import { useEffect, useId, useRef, type ReactNode } from 'react'
import { ArrowUpRight, Check, Copy, X, BookOpen } from 'lucide-react'
import type { Cost, SourceRef, Stats } from '../domain/schema'
import { ruleHref } from '../data/registry'
export function CostView({ cost, compact = false }: { cost: Cost; compact?: boolean }) {
  return (
    <span className="cost">
      <span>
        {cost.ducats.toLocaleString('ru-RU')} <small>{compact ? 'дк' : 'дукатов'}</small>
      </span>
      {cost.glory > 0 && (
        <span className="glory">
          ✦ {cost.glory} <small>{compact ? 'ОС' : 'Славы'}</small>
        </span>
      )}
    </span>
  )
}
export function Source({ source }: { source: SourceRef }) {
  return (
    <span className="source">
      {source.source === 'core' ? 'Правила 1.6.3' : 'Союзники и наёмники'} · стр.{' '}
      {source.pages.join(', ')}
    </span>
  )
}
export function RuleLink({
  id,
  children = 'Открыть правило',
  onClick,
}: {
  id: string
  children?: ReactNode
  onClick?: () => void
}) {
  return (
    <a className="text-link" href={ruleHref(id)} onClick={onClick}>
      <BookOpen size={14} aria-hidden="true" />
      {children}
      <ArrowUpRight size={13} aria-hidden="true" />
    </a>
  )
}
export function StatsGrid({ stats }: { stats: Stats }) {
  return (
    <dl className="stats-grid">
      {(
        [
          ['movement', 'Движ.'],
          ['ranged', 'ДБ'],
          ['melee', 'ББ'],
          ['armour', 'Броня'],
          ['base', 'База'],
        ] as const
      ).map(([key, label]) => (
        <div key={key}>
          <dt>{label}</dt>
          <dd>{stats[key]}</dd>
        </div>
      ))}
    </dl>
  )
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId()
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'modal-wide' : ''}`}
      aria-labelledby={titleId}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" aria-label="Закрыть окно" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  )
}
export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      {icon}
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  )
}
export function CopyButton({ text, label = 'Копировать' }: { text: string; label?: string }) {
  const ref = useRef<HTMLButtonElement>(null)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      if (ref.current) {
        ref.current.dataset.copied = 'true'
        ref.current.setAttribute('aria-label', 'Скопировано')
      }
    } catch {
      window.prompt('Скопируйте текст', text)
    }
  }
  return (
    <button
      ref={ref}
      className="button button-quiet copy-button"
      onClick={() => {
        void copy()
      }}
    >
      <Copy className="copy-default" size={16} />
      <Check className="copy-done" size={16} />
      <span>{label}</span>
    </button>
  )
}
