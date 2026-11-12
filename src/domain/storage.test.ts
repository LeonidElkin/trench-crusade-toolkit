import { describe, expect, it } from 'vitest'
import { WarbandSchema } from './schema'
import { exportWarband, importWarband, legacyWarbandsNotice, loadWarbands, saveWarbands, STORAGE_KEY, LEGACY_STORAGE_KEY, duplicateWarband } from './storage'

const warband = () => WarbandSchema.parse({
  schemaVersion: 2, id: 'test-roster', name: 'Новый отряд', editionId: '1.6.3', revision: 'ru-1.6.3-visual-r2',
  factionId: 'sultanate', variantId: null, format: 'battle', budget: { ducats: 900, glory: 8 },
  units: [
    { id: 'alchemist', unitId: 'core-sultanate-jabirean-alchemist', name: 'Алхимик', equipment: [], upgrades: [], notes: '' },
    { id: 'creature', unitId: 'core-sultanate-homunculus', name: 'Существо', equipment: [], upgrades: [], notes: '', loadouts: { 'bound-alchemist': 'alchemist' } },
  ], notes: '', createdAt: '2026-11-12T00:00:00Z', updatedAt: '2026-11-12T00:00:00Z',
})
function memory() {
  const map = new Map<string, string>()
  return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value) } }
}
describe('incompatible database revisions', () => {
  it('preserves old saved rosters and informs the user without filling new values into them', () => {
    const storage = memory(), old = '{"version":1,"warbands":[{"id":"old"}]}'
    storage.setItem(LEGACY_STORAGE_KEY, old)
    expect(loadWarbands(storage)).toEqual([])
    expect(legacyWarbandsNotice(storage)).toContain('несовместимы')
    saveWarbands(storage, [warband()])
    expect(storage.getItem(LEGACY_STORAGE_KEY)).toBe(old)
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).version).toBe(2)
  })
  it('round trips all new selections and rejects a v1 export explicitly', () => {
    expect(importWarband(exportWarband(warband()))).toEqual(warband())
    expect(() => importWarband('{"format":"trench-crusade-warband","version":1,"warband":{}}')).toThrow('прежней базе')
  })
  it('duplicates a bound creature together with the new identity of its alchemist', () => {
    const copy = duplicateWarband(warband())
    expect(copy.units[1]!.loadouts['bound-alchemist']).toBe(copy.units[0]!.id)
    expect(copy.units[0]!.id).not.toBe('alchemist')
  })
  it('does not overwrite an unsupported current envelope', () => {
    const storage = memory(), original = '{"version":99,"warbands":[]}'
    storage.setItem(STORAGE_KEY, original)
    expect(() => loadWarbands(storage)).toThrow()
    expect(storage.getItem(STORAGE_KEY)).toBe(original)
  })
})
