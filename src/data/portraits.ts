import raw from '../../data/visuals/1.6.3/portraits.json'
import { PortraitIndexSchema } from './portrait-schema'

// Visual metadata is independent of frozen gameplay revisions and saved warbands.
const indexes = [PortraitIndexSchema.parse(raw)]
export function getPortrait(editionId: string, unitId: string) {
  const index = indexes.find((i) => i.editionId === editionId)
  const assignment = index?.units.find((u) => u.unitId === unitId)
  const asset = index?.assets.find((a) => a.id === assignment?.assetId)
  return asset && index
    ? {
        ...asset,
        note: assignment?.note,
        attribution:
          asset.origin.kind === 'pdf'
            ? index.attribution
            : 'Создано встроенным Codex image_gen по описанию правил 1.6.3. Неофициальная художественная интерпретация.',
      }
    : undefined
}

export function sourcePdfUrl(editionId: string, source: string, page?: number) {
  const paths: Record<string, Record<string, string>> = {
    '1.6.3': {
      core: 'reference/trench-crusade-1.6.3-ru.pdf',
      allies: 'reference/allies-and-mercenaries-ru.pdf',
    },
  }
  const path = paths[editionId]?.[source]
  return path ? `${import.meta.env.BASE_URL}${path}${page ? `#page=${page}` : ''}` : undefined
}
