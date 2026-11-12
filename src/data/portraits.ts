import raw from '../../data/visuals/1.6.3/portraits.json'
import aliasesRaw from '../../data/visuals/1.6.3/unit-aliases.json'
import { PortraitAliasesSchema, PortraitIndexSchema } from './portrait-schema'

// Visual metadata is independent of frozen gameplay revisions and saved warbands.
const indexes = [PortraitIndexSchema.parse(raw)]
const aliases = [PortraitAliasesSchema.parse(aliasesRaw)]
export function getPortraitAssignment(editionId: string, unitId: string) {
  return aliases
    .find((index) => index.editionId === editionId)
    ?.units.find((unit) => unit.unitId === unitId)
}
export function getPortrait(editionId: string, unitId: string) {
  const index = indexes.find((i) => i.editionId === editionId)
  const alias = getPortraitAssignment(editionId, unitId)
  if (alias?.visualUnitId === null) return undefined
  const assignment = index?.units.find((u) => u.unitId === (alias?.visualUnitId ?? unitId))
  const asset = index?.assets.find((a) => a.id === assignment?.assetId)
  return asset && index
    ? {
        ...asset,
        note: [alias?.note, assignment?.note].filter(Boolean).join(' ') || undefined,
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
