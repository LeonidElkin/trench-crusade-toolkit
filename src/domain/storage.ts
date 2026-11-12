import { ExportSchema, WarbandSchema, type Warband } from './schema'
import { z } from 'zod'
export const STORAGE_KEY = 'trench-toolkit.warbands.v2'
export const LEGACY_STORAGE_KEY = 'trench-toolkit.warbands.v1'
const EnvelopeSchema = z
  .object({ version: z.literal(2), warbands: z.array(WarbandSchema).max(1000) })
  .strict()
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}
export function legacyWarbandsNotice(storage: StorageLike): string | null {
  const previous = storage.getItem(LEGACY_STORAGE_KEY)
  if (!previous) return null
  try {
    const value: unknown = JSON.parse(previous)
    if (value && typeof value === 'object' && 'warbands' in value && Array.isArray(value.warbands) && value.warbands.length === 0)
      return null
  } catch {
    // Preserve an unreadable old payload as well; it is never migrated or overwritten.
  }
  return 'В хранилище есть отряды прежней базы. Они несовместимы с восстановленными правилами и сохранены отдельно. Для новой базы создайте новый отряд.'
}
export function loadWarbands(storage: StorageLike): Warband[] {
  const value = storage.getItem(STORAGE_KEY)
  if (value === null) return []
  const parsed = EnvelopeSchema.safeParse(JSON.parse(value))
  if (!parsed.success)
    throw new Error(
      'Сохранение имеет неизвестный или повреждённый формат. Исходные данные сохранены; автоматическая перезапись остановлена.',
    )
  return parsed.data.warbands
}
export function saveWarbands(storage: StorageLike, warbands: Warband[]) {
  const envelope = EnvelopeSchema.parse({ version: 2, warbands })
  storage.setItem(STORAGE_KEY, JSON.stringify(envelope))
}
export const exportWarband = (warband: Warband) =>
  JSON.stringify(
    ExportSchema.parse({ format: 'trench-crusade-warband', version: 2, warband }),
    null,
    2,
  )
export function importWarband(text: string): Warband {
  if (text.length > 2_000_000) throw new Error('Файл отряда превышает 2 МБ.')
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('Некорректный JSON. Выберите экспортированный файл отряда.')
  }
  const result = ExportSchema.safeParse(value)
  if (value && typeof value === 'object' && 'version' in value && value.version === 1)
    throw new Error('Отряд создан по прежней базе правил (v1) и несовместим с восстановленной базой. Автоматический перенос не выполняется.')
  if (!result.success)
    throw new Error(
      'Формат отряда не поддерживается или повреждён. Требуется trench-crusade-warband v2.',
    )
  return result.data.warband
}
export function duplicateWarband(w: Warband, name = `${w.name} — копия`): Warband {
  const ids = new Map(w.units.map((m) => [m.id, crypto.randomUUID()]))
  return {
    ...structuredClone(w),
    id: crypto.randomUUID(),
    name,
    leaderId: ids.get(w.leaderId) ?? '',
    units: w.units.map((m) => ({
      ...structuredClone(m),
      id: ids.get(m.id)!,
      loadouts: {
        ...m.loadouts,
        ...(m.loadouts['bound-alchemist'] ? { 'bound-alchemist': ids.get(m.loadouts['bound-alchemist']) ?? '' } : {}),
      },
      equipment: m.equipment.map((e) => ({ ...e, id: crypto.randomUUID() })),
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}
export function shareWarband(w: Warband, originAndPath: string): string {
  const bytes = new TextEncoder().encode(exportWarband(w))
  const encoded = btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
  if (encoded.length > 12000)
    throw new Error('Для такого отряда ссылка слишком длинная. Используйте JSON-экспорт.')
  return `${originAndPath}#/import/${encoded}`
}
export function importShare(encoded: string): Warband {
  if (encoded.length > 12000) throw new Error('Ссылка слишком длинная.')
  try {
    return importWarband(
      new TextDecoder('utf-8', { fatal: true }).decode(
        Uint8Array.from(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
          c.charCodeAt(0),
        ),
      ),
    )
  } catch {
    throw new Error('Не удалось прочитать отряд из ссылки.')
  }
}
