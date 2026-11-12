import { useState } from 'react'
import { Expand, ExternalLink, ImageOff } from 'lucide-react'
import { getPortrait, getPortraitAssignment, sourcePdfUrl } from '../data/portraits'
import { assetUrl } from '../data/registry'
import { Modal, Source } from './Common'

export function UnitPortrait({
  editionId,
  unitId,
  name,
  className = '',
  zoom = false,
  decorative = false,
}: {
  editionId: string
  unitId: string
  name: string
  className?: string
  zoom?: boolean
  decorative?: boolean
}) {
  const [open, setOpen] = useState(false)
  const portrait = getPortrait(editionId, unitId)
  if (!portrait)
    return (
      <span
        className={`unit-portrait unit-portrait-missing ${className}`}
        title={getPortraitAssignment(editionId, unitId)?.note}
        aria-label={decorative ? undefined : `${name} — иллюстрация не назначена`}
        aria-hidden={decorative || undefined}
      >
        <ImageOff size={24} aria-hidden="true" />
        <span>Иллюстрация не назначена</span>
      </span>
    )
  const picture = (
    <img
      src={assetUrl(portrait.thumbnail)}
      width={portrait.width}
      height={portrait.height}
      alt={decorative ? '' : `${name} — иллюстрация профиля`}
      loading="lazy"
      decoding="async"
    />
  )
  return (
    <>
      {zoom ? (
        <button
          className={`unit-portrait portrait-zoom ${className}`}
          aria-label={`Рассмотреть: ${name}`}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          {picture}
          <span className="portrait-expand" aria-hidden="true">
            <Expand size={15} />
          </span>
        </button>
      ) : (
        <span className={`unit-portrait ${className}`}>{picture}</span>
      )}
      {open && (
        <Modal title={name} onClose={() => setOpen(false)}>
          <figure className="portrait-full">
            <img
              src={assetUrl(portrait.path)}
              width={portrait.width}
              height={portrait.height}
              alt={portrait.caption}
              decoding="async"
            />
            <figcaption>
              <span className="eyebrow">
                {portrait.origin.kind === 'generated'
                  ? 'СОЗДАНО AI ПО ОПИСАНИЮ ПРАВИЛ'
                  : 'ИЛЛЮСТРАЦИЯ ИЗ PDF'}
              </span>
              {portrait.note && <p>{portrait.note}</p>}
              <Source source={portrait.source} />
              <a
                className="text-link"
                href={sourcePdfUrl(editionId, portrait.source.source, portrait.source.pages[0])}
                target="_blank"
                rel="noreferrer"
              >
                {portrait.origin.kind === 'generated' ? 'Описание в PDF' : 'Открыть страницу PDF'}{' '}
                <ExternalLink size={13} />
              </a>
              <p className="muted small">{portrait.attribution}</p>
            </figcaption>
          </figure>
        </Modal>
      )}
    </>
  )
}
