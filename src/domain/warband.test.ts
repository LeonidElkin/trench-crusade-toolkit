import { describe, expect, it } from 'vitest'
import { catalog } from '../data/registry'
import {
  addModel,
  buyEquipment,
  createWarband,
  effectiveOffer,
  modelCost,
  modelStats,
  removeModel,
  toggleUpgrade,
  warbandCost,
} from './warband'
import { validateWarband } from './validation'
import {
  duplicateWarband,
  exportWarband,
  importShare,
  importWarband,
  loadWarbands,
  saveWarbands,
  shareWarband,
  STORAGE_KEY,
} from './storage'
import type { Warband } from './schema'
const offer = (faction: string, english: string) =>
  catalog.offers.find(
    (o) =>
      o.factionId === faction &&
      !o.variantId &&
      catalog.items.find((i) => i.id === o.itemId)?.englishName === english,
  )!.id
const codes = (w: Warband) =>
  validateWarband(catalog, w)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.code)
const withUnit = (faction: string, unit: string, variant: string | null = null) =>
  addModel(catalog, createWarband(catalog, faction, variant), unit)
describe('warband cost and mutations on real 1.6.3 data', () => {
  it('adds/removes models, counts purchases and keeps two currencies independent', () => {
    let w = withUnit('heretic', 'heretic.priest')
    const id = w.units[0]!.id
    w = buyEquipment(w, id, offer('heretic', 'Bolt Action Rifle'))
    w = buyEquipment(w, id, offer('heretic', 'Automatic Rifle'))
    expect(warbandCost(catalog, w)).toEqual({ cost: { ducats: 90, glory: 2 }, complete: true })
    expect(removeModel(w, id).units).toHaveLength(0)
    expect(w.units).toHaveLength(1)
  })
  it('applies actual upgrades and profile stat changes', () => {
    let w = withUnit('heretic', 'heretic.trooper')
    w = toggleUpgrade(w, w.units[0]!.id, 'legion-melee')
    expect(modelCost(catalog, w, w.units[0]!).cost.ducats).toBe(40)
    expect(modelStats(catalog, w, w.units[0]!)?.melee).toBe('+1D')
    expect(codes(w)).toContain('legion-ratio')
    w = addModel(catalog, w, 'heretic.trooper')
    expect(codes(w)).not.toContain('legion-ratio')
  })
  it('handles mandatory yeoman rifles at the documented discounted price', () => {
    const w = withUnit('antioch', 'antioch.yeoman')
    expect(warbandCost(catalog, w).cost).toEqual({ ducats: 35, glory: 0 })
    expect(w.units[0]!.equipment).toHaveLength(1)
    const model = { ...w.units[0]!, equipment: [] }
    expect(modelCost(catalog, w, model).cost.ducats).toBe(35)
  })
  it('counts included reinforced armour once and diagnoses attempts to add armour', () => {
    let w = withUnit('heretic', 'heretic.anointed')
    expect(warbandCost(catalog, w).cost.ducats).toBe(95)
    w = buyEquipment(w, w.units[0]!.id, offer('heretic', 'Standard Armour'))
    expect(codes(w)).toContain('one-armour')
  })
  it('uses variant prices and currencies', () => {
    const base = createWarband(catalog, 'heretic'),
      naval = createWarband(catalog, 'heretic', 'naval'),
      smg = offer('heretic', 'Submachine Gun')
    expect(effectiveOffer(catalog, base, smg)?.cost).toEqual({ ducats: 0, glory: 2 })
    expect(effectiveOffer(catalog, naval, smg)?.cost).toEqual({ ducats: 25, glory: 0 })
    const plague = withUnit('pilgrims', 'pilgrims.communicant', 'plague')
    expect(warbandCost(catalog, plague).cost).toEqual({ ducats: 0, glory: 3 })
    expect(createWarband(catalog, 'antioch', 'papal', 'campaign').budget).toEqual({
      ducats: 500,
      glory: 11,
    })
  })
})
describe('declarative and specialized rule diagnostics', () => {
  it('checks required commanders and composition limits', () => {
    expect(codes(createWarband(catalog, 'heretic'))).toContain('min-heretic.priest')
    let w = withUnit('heretic', 'heretic.priest')
    w = addModel(catalog, w, 'heretic.priest')
    expect(codes(w)).toContain('max-heretic.priest')
    const papal = withUnit('antioch', 'antioch.cleric', 'papal')
    expect(codes(papal)).not.toContain('min-antioch.lieutenant')
  })
  it('enforces explicit variant bans and minimums', () => {
    expect(codes(withUnit('heretic', 'heretic.war-wolf', 'naval'))).toContain(
      'max-heretic.war-wolf',
    )
    expect(codes(withUnit('heretic', 'heretic.witch', 'ghosts'))).toContain('keyword-ban')
    expect(codes(createWarband(catalog, 'antioch', 'prussia'))).toContain(
      'min-antioch.stormtrooper',
    )
    expect(codes(createWarband(catalog, 'sultanate', 'wisdom'))).toContain(
      'min-sultanate.alchemist',
    )
    expect(codes(createWarband(catalog, 'sultanate', 'fidai'))).not.toContain(
      'min-sultanate.captain',
    )
  })
  it('checks ranged access, elite equipment, limits and two-hand compatibility', () => {
    let w = withUnit('heretic', 'heretic.commando'),
      id = w.units[0]!.id
    w = buyEquipment(w, id, offer('heretic', 'Bolt Action Rifle'))
    expect(codes(w)).toContain('equipment-access')
    w = withUnit('heretic', 'heretic.trooper')
    id = w.units[0]!.id
    w = buyEquipment(w, id, offer('heretic', 'Sacrificial Knife'))
    expect(codes(w)).toContain('equipment-access')
    w = withUnit('heretic', 'heretic.priest')
    id = w.units[0]!.id
    w = buyEquipment(
      buyEquipment(w, id, offer('heretic', 'Machine Gun')),
      id,
      offer('heretic', 'Machine Gun'),
    )
    expect(codes(w)).toContain('item-limit')
    expect(codes(w)).toContain('hands')
  })
  it('enforces affordable wretch equipment and strict numerical inferiority', () => {
    let w = withUnit('heretic', 'heretic.wretch')
    expect(codes(w)).toContain('weapon-required')
    expect(codes(w)).toContain('wretch-ratio')
    w = buyEquipment(w, w.units[0]!.id, offer('heretic', 'Great Sword/Axe'))
    expect(codes(w)).toContain('equipment-access')
  })
  it('validates locked mercenaries and compatible factions', () => {
    let w = withUnit('heretic', 'allies.medic')
    expect(codes(w)).toContain('mercenary-faction')
    w = buyEquipment(w, w.units[0]!.id, offer('heretic', 'Pistol/Revolver'))
    expect(codes(w)).toContain('equipment-access')
    expect(codes(withUnit('heretic', 'allies.sin-eater', 'ghosts'))).toContain('mercenary-ban')
  })
  it('checks goetic minimums and selected sin', () => {
    const w = withUnit('court', 'court.sorcerer')
    expect(codes(w)).toContain('powers')
    expect(codes(w)).toContain('sin')
    const u = catalog.upgrades.find(
      (u) => u.power && !u.sin && u.unitIds.includes('court.sorcerer'),
    )!
    const next = toggleUpgrade({ ...w, allegiance: 'wrath' }, w.units[0]!.id, u.id)
    expect(codes(next)).not.toContain('powers')
    expect(codes(next)).not.toContain('sin')
  })
  it('reports unknown revisions and incomplete totals instead of silently recalculating', () => {
    const w = { ...withUnit('heretic', 'heretic.priest'), revision: 'not-installed' }
    expect(warbandCost(catalog, w).complete).toBe(false)
    expect(codes(w)).toContain('edition')
  })
  it('never treats unimplemented source rules as proven valid', () => {
    const result = validateWarband(catalog, withUnit('heretic', 'heretic.priest'))
    expect(result.status).toBe('needs-review')
    expect(result.diagnostics.some((d) => d.severity === 'manual')).toBe(true)
  })
})
describe('versioned local persistence and portable files', () => {
  const storage = () => {
    const data = new Map<string, string>()
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v)
      },
    }
  }
  it('saves, loads, exports and restores complete configuration without losing edition', () => {
    let w = withUnit('heretic', 'heretic.priest', 'naval')
    w = buyEquipment(w, w.units[0]!.id, offer('heretic', 'Submachine Gun'))
    const s = storage()
    saveWarbands(s, [w])
    expect(loadWarbands(s)).toEqual([w])
    expect(importWarband(exportWarband(w))).toEqual(w)
    expect(w.editionId).toBe('1.6.3')
    expect(w.revision).toBe(catalog.revision)
  })
  it('duplicates all identities while retaining configuration', () => {
    const w = withUnit('heretic', 'heretic.priest'),
      copy = duplicateWarband(w)
    expect(copy.id).not.toBe(w.id)
    expect(copy.units[0]!.id).not.toBe(w.units[0]!.id)
    expect(copy.units[0]!.unitId).toBe(w.units[0]!.unitId)
    expect(copy.revision).toBe(w.revision)
  })
  it('rejects malformed, oversized and future exports; retains corrupt storage', () => {
    for (const text of [
      '{',
      '{}',
      JSON.stringify({ format: 'trench-crusade-warband', version: 2 }),
      'x'.repeat(2_000_001),
    ])
      expect(() => importWarband(text)).toThrow()
    const s = storage()
    s.setItem(STORAGE_KEY, '{"version":99,"warbands":[]}')
    expect(() => loadWarbands(s)).toThrow()
    expect(s.getItem(STORAGE_KEY)).toContain('99')
  })
  it('round-trips Cyrillic text through a share link without a server', () => {
    const w = {
        ...withUnit('heretic', 'heretic.priest'),
        name: 'Знамя ☦ Великой войны',
        notes: 'Слава и искупление',
      },
      url = shareWarband(w, 'https://example.com/toolkit/')
    expect(importShare(url.split('/import/')[1]!)).toEqual(w)
  })
})

describe('source-backed special equipment regressions', () => {
  it('resolves full weapon profiles even when a variant first mentions a short reference', () => {
    for (const english of ['Heavy Flamethrower', 'Anti-Materiel Rifle']) {
      const item = catalog.items.find((i) => i.englishName === english)!
      expect(item.hands).toBe(2)
      expect(item.keywords).toContain('HEAVY')
    }
  })
  it('stacks the documented alchemist armour modifier with a shield', () => {
    let w = withUnit('sultanate', 'sultanate.captain')
    const id = w.units[0]!.id
    w = buyEquipment(w, id, offer('sultanate', 'Alchemist Armour'))
    expect(modelStats(catalog, w, w.units[0]!)?.armour).toBe('-2')
    w = buyEquipment(w, id, offer('sultanate', 'Trench Shield'))
    expect(modelStats(catalog, w, w.units[0]!)?.armour).toBe('-3')
  })
  it('does not apply STRONG one-handed melee use to ranged weapons', () => {
    let w = withUnit('heretic', 'heretic.anointed')
    const id = w.units[0]!.id
    w = buyEquipment(
      buyEquipment(w, id, offer('heretic', 'Machine Gun')),
      id,
      offer('heretic', 'Machine Gun'),
    )
    expect(codes(w)).toContain('hands')
  })
  it('uses the resurrected pilgrim base cost rather than charging both bases', () => {
    let w = withUnit('pilgrims', 'pilgrims.pilgrim')
    w = toggleUpgrade(w, w.units[0]!.id, 'resurrection')
    expect(warbandCost(catalog, w)).toEqual({ cost: { ducats: 45, glory: 0 }, complete: true })
    expect(modelStats(catalog, w, w.units[0]!)?.melee).toBe('+1D')
  })
  it('checks the explicit Gargantuan prerequisites', () => {
    let w = withUnit('sultanate', 'sultanate.homunculus', 'wisdom')
    w = toggleUpgrade(w, w.units[0]!.id, 'gargantuan')
    expect(codes(w)).toContain('formula-compatibility')
    for (const id of ['human-hands', 'inhuman-strength', 'massive-size'])
      w = toggleUpgrade(w, w.units[0]!.id, id)
    expect(codes(w)).not.toContain('formula-compatibility')
  })
})
