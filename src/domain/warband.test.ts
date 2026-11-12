import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { reconstructCatalog, type RecordValue } from '../../scripts/reconstruct-catalog'
import {
  addModel, buyEquipment, createWarband, effectiveOffer, effectiveUnit, modelCost,
  modelKeywords, modelStats, offerApplies, removeModel, toggleUpgrade, updateModel, warbandCost,
} from './warband'
import { validateWarband } from './validation'
import {
  duplicateWarband, exportWarband, importShare, importWarband, loadWarbands,
  saveWarbands, shareWarband, STORAGE_KEY,
} from './storage'
import type { Warband } from './schema'

// Test inputs are exclusively the independent reconstruction, never the retired catalogue.
const read = (relative: string) => JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'))
const authored = ['core-common', 'factions-first', 'factions-last', 'allies'].map((name) =>
  read(`../../reconstruction/1.6.3/authored/${name}.json`) as RecordValue)
const linksUrl = new URL('../../reconstruction/1.6.3/links.json', import.meta.url)
const linkDefinitions: RecordValue[] = existsSync(fileURLToPath(linksUrl))
  ? read('../../reconstruction/1.6.3/links.json').itemLinks : []
const links = Object.fromEntries(linkDefinitions.filter((link) => link.status !== 'unresolved')
  .map((link) => [link.factionId ? `${link.factionId}:${link.name}` : String(link.name), String(link.itemId)]))
const { catalog } = reconstructCatalog(authored, '1.6.3', 'independent-domain-tests', links, linkDefinitions)
const offer = (faction: string, name: string) => {
  const result = catalog.offers.find((o) => o.factionId === faction && !o.variantId && o.name === name)
  if (!result) throw new Error(`Нет новой исходной покупки: ${faction}/${name}`)
  return result
}
const withUnit = (faction: string, unit: string, variant: string | null = null, format: Warband['format'] = 'battle') =>
  addModel(catalog, createWarband(catalog, faction, variant, format), unit)
const errors = (w: Warband) => validateWarband(catalog, w).diagnostics.filter((d) => d.severity === 'error')
const codes = (w: Warband) => errors(w).map((d) => d.code)
const buy = (w: Warband, name: string, modelIndex = 0) => buyEquipment(w, w.units[modelIndex]!.id, offer(w.factionId, name).id)

describe('independent source-backed costs and fixed equipment', () => {
  it('keeps ducats and glory independent, with provenance on the new purchases (core19)', () => {
    let w = withUnit('heretic', 'core-heretic-priest')
    w = buy(buy(w, 'Стандартная броня'), 'Автоматическая винтовка')
    expect(offer('heretic', 'Автоматическая винтовка').source.pages).toContain(19)
    expect(warbandCost(catalog, w)).toEqual({ cost: { ducats: 95, glory: 2 }, complete: true })
    expect(removeModel(w, w.units[0]!.id).units).toHaveLength(0)
    expect(w.units).toHaveLength(1)
    expect(w.schemaVersion).toBe(2)
  })
  it('automatically buys the compulsory rifle and requires its replacement (core70)', () => {
    let w = withUnit('antioch', 'core-antioch-yeoman')
    expect(w.units[0]!.equipment).toHaveLength(1)
    expect(modelCost(catalog, w, w.units[0]!).cost).toEqual({ ducats: 35, glory: 0 })
    expect(codes(w)).not.toContain('compulsory-purchase')
    w = updateModel(w, w.units[0]!.id, { equipment: [] })
    expect(modelCost(catalog, w, w.units[0]!).cost.ducats).toBe(35)
    expect(errors(w).find((d) => d.code === 'compulsory-purchase')?.source?.pages).toEqual([70])
    w = buy(w, 'Автоматическая винтовка')
    expect(modelCost(catalog, w, w.units[0]!).cost).toEqual({ ducats: 70, glory: 0 })
    expect(codes(w)).not.toContain('compulsory-purchase')
  })
  it('charges a second rifle fully; the compulsory discount applies once', () => {
    const w = buy(withUnit('antioch', 'core-antioch-yeoman'), 'Винтовка')
    expect(modelCost(catalog, w, w.units[0]!).cost.ducats).toBe(45)
  })
  it('preserves included armour and checks additional armour against it (core24)', () => {
    let w = withUnit('heretic', 'core-heretic-anointed')
    expect(modelStats(catalog, w, w.units[0]!)?.armour).toBe('-2')
    expect(warbandCost(catalog, w).cost.ducats).toBe(95)
    w = buy(w, 'Стандартная броня')
    expect(codes(w)).toContain('one-armour')
    expect(validateWarband(catalog, w).diagnostics.find((d) => d.code === 'source-hereti')?.source?.pages).toContain(24)
  })
  it('applies declared variant prices and the explicit allied warlock exception (core28/30)', () => {
    const smg = offer('heretic', 'Пистолет-пулемёт')
    expect(effectiveOffer(catalog, createWarband(catalog, 'heretic', 'naval-raiding-party'), smg.id)?.cost).toEqual({ ducats: 25, glory: 0 })
    const warlock = withUnit('heretic', 'allies-goetic-warlock', 'knights-of-avarice')
    expect(modelCost(catalog, warlock, warlock.units[0]!).cost).toEqual({ ducats: 110, glory: 0 })
    expect(createWarband(catalog, 'antioch', 'core-antioch-papal', 'campaign').budget).toEqual({ ducats: 500, glory: 11 })
  })
  it('uses explicit mechanized profile choices and checks variant bans (core71/79)', () => {
    let w = withUnit('antioch', 'core-antioch-mechanized', 'core-antioch-abyssinia')
    expect(w.units[0]!.loadouts.profile).toBe('reinforced')
    expect(modelStats(catalog, w, w.units[0]!)?.base).toBe('32 мм')
    w = updateModel(w, w.units[0]!.id, { loadouts: { profile: 'machine' } })
    expect(modelCost(catalog, w, w.units[0]!).cost.ducats).toBe(95)
    expect(codes(w)).toContain('profile-choice-ban')
  })
})

describe('composition and arsenal restrictions from new records', () => {
  it('checks variant minima, replacements and aggregate assassin limits (core59)', () => {
    let w = withUnit('sultanate', 'core-sultanate-master-assassin', 'fidai')
    expect(codes(w)).not.toContain('min-core-sultanate-yuzbashi')
    for (let i = 0; i < 3; i++) w = addModel(catalog, w, 'core-sultanate-assassin')
    expect(errors(w).find((d) => d.code === 'aggregate-limit')?.source?.pages).toEqual([59])
    const ghosts = withUnit('heretic', 'core-heretic-chorister', 'trench-ghosts')
    expect(codes(ghosts)).toContain('max-core-heretic-chorister')
    expect(effectiveUnit(catalog, ghosts, 'core-heretic-barbed-wire-banshee')?.keywords).toContain('FEAR')
  })
  it('counts both legionary specialties in the same rounded-down ratio (core24)', () => {
    let w = withUnit('heretic', 'core-heretic-trooper')
    w = toggleUpgrade(w, w.units[0]!.id, 'heretic-legionary-melee')
    expect(modelStats(catalog, w, w.units[0]!)?.melee).toBe('+1D')
    expect(codes(w)).toContain('upgrade-ratio')
    w = addModel(catalog, w, 'core-heretic-trooper')
    expect(codes(w)).not.toContain('upgrade-ratio')
    w = toggleUpgrade(w, w.units[1]!.id, 'heretic-legionary-ranged')
    expect(codes(w)).toContain('upgrade-ratio')
  })
  it('checks strict numerical inferiority without inventing a ducat/glory conversion (core27)', () => {
    let w = withUnit('heretic', 'core-heretic-wretch')
    expect(codes(w)).toContain('weapon-required')
    expect(codes(w)).toContain('composition-ratio')
    w = addModel(catalog, w, 'core-heretic-priest')
    expect(codes(w)).toContain('composition-ratio')
    w = addModel(catalog, w, 'core-heretic-trooper')
    expect(codes(w)).not.toContain('composition-ratio')
    w = buy(w, 'Адский меч')
    expect(validateWarband(catalog, w).diagnostics.some((d) => d.code === 'glory-price-bound' && d.source?.pages.includes(27))).toBe(true)
  })
  it('enforces ranged access and keyword-or-unit exceptions from the source (core18/22/24)', () => {
    const commando = withUnit('heretic', 'core-heretic-death-commando')
    expect(offerApplies(catalog, commando, commando.units[0]!, offer('heretic', 'Винтовка'))).toBe(false)
    expect(offerApplies(catalog, commando, commando.units[0]!, offer('heretic', 'Пистолет с глушителем'))).toBe(true)
    const anointed = withUnit('heretic', 'core-heretic-anointed')
    expect(offerApplies(catalog, anointed, anointed.units[0]!, offer('heretic', 'Усиленная броня'))).toBe(true)
    const trooper = withUnit('heretic', 'core-heretic-trooper')
    expect(offerApplies(catalog, trooper, trooper.units[0]!, offer('heretic', 'Жертвенный нож'))).toBe(false)
  })
  it('separates the explicitly campaign-scoped limit from a battle roster (core18)', () => {
    let campaign = withUnit('heretic', 'core-heretic-priest', null, 'campaign')
    campaign = addModel(catalog, campaign, 'core-heretic-trooper')
    campaign = buy(buy(campaign, 'Пулемёт'), 'Пулемёт', 1)
    expect(codes(campaign)).toContain('item-limit')
    expect(codes({ ...campaign, format: 'battle' })).not.toContain('item-limit')
    const limited = validateWarband(catalog, buy(withUnit('heretic', 'core-heretic-priest', null, 'campaign'), 'Пулемёт'))
    expect(limited.diagnostics.some((d) => d.code === 'campaign-item-limit' && d.severity === 'manual')).toBe(true)
  })
  it('retains source issues as manual diagnostics instead of declaring validity', () => {
    const w = withUnit('grail', 'core-dirge-executor', 'core-grail-dirge')
    expect(validateWarband(catalog, w).diagnostics.find((d) => d.code === 'core-issue-dirge-knight-count')?.source?.pages).toEqual([94])
    expect(validateWarband(catalog, w).status).not.toBe('valid')
  })
})

describe('formula access and asymmetric hands', () => {
  it('unlocks only the purchases stated by Human hands and Seal of Solomon (core63–64)', () => {
    let w = withUnit('sultanate', 'core-sultanate-homunculus', 'house-of-wisdom')
    const musket = offer('sultanate', 'Мушкет'), shovel = offer('sultanate', 'Лопата')
    expect(offerApplies(catalog, w, w.units[0]!, musket)).toBe(false)
    w = toggleUpgrade(w, w.units[0]!.id, 'sultanate-formula-human-hands')
    expect(offerApplies(catalog, w, w.units[0]!, musket)).toBe(true)
    expect(offerApplies(catalog, w, w.units[0]!, shovel)).toBe(false)
    expect(offerApplies(catalog, w, w.units[0]!, offer('sultanate', 'Граната'))).toBe(false)
    expect(offerApplies(catalog, w, w.units[0]!, offer('sultanate', 'Стандартная броня'))).toBe(false)
    w = toggleUpgrade(w, w.units[0]!.id, 'sultanate-formula-seal-of-solomon')
    expect(offerApplies(catalog, w, w.units[0]!, shovel)).toBe(true)
  })
  it('requires all Gargantuan prerequisites and applies its base independent of selection order (core64)', () => {
    let w = withUnit('sultanate', 'core-sultanate-homunculus', 'house-of-wisdom')
    w = toggleUpgrade(w, w.units[0]!.id, 'sultanate-formula-gargantuan-size')
    expect(errors(w).find((d) => d.code === 'upgrade-prerequisite')?.source?.pages).toEqual([64])
    for (const id of ['sultanate-formula-massive-size', 'sultanate-formula-human-hands', 'sultanate-formula-inhuman-strength'])
      w = toggleUpgrade(w, w.units[0]!.id, id)
    expect(codes(w)).not.toContain('upgrade-prerequisite')
    expect(modelStats(catalog, w, w.units[0]!)?.base).toBe('60 мм')
    w = buy(buy(w, 'Бомбарда МУРАД'), 'Огненная пушка')
    expect(codes(w)).toContain('specific-weapon-limit')
  })
  it('permits both eye formulas only with Two heads, and binds one homunculus per alchemist (core63)', () => {
    let w = withUnit('sultanate', 'core-sultanate-jabirean-alchemist', 'house-of-wisdom')
    w = addModel(catalog, w, 'core-sultanate-homunculus')
    const homunculus = w.units[1]!
    w = updateModel(w, homunculus.id, { loadouts: { 'bound-alchemist': w.units[0]!.id } })
    for (const id of ['sultanate-formula-hawk-eyes', 'sultanate-formula-hypnotic-eyes']) w = toggleUpgrade(w, homunculus.id, id)
    expect(codes(w)).toContain('upgrade-conditional-exclusion')
    w = toggleUpgrade(w, homunculus.id, 'sultanate-formula-two-heads')
    expect(codes(w)).not.toContain('upgrade-conditional-exclusion')
    expect(codes(w)).not.toContain('bound-alchemist')
    w = addModel(catalog, w, 'core-sultanate-homunculus')
    w = updateModel(w, w.units[2]!.id, { loadouts: { 'bound-alchemist': w.units[0]!.id } })
    expect(codes(w)).toContain('homunculus-ratio')
  })
  it('counts the Amalgam six hands across both weapon categories and caps each type at two (core92)', () => {
    let w = withUnit('grail', 'core-grail-amalgam')
    for (const name of ['Пистолет', 'Пистолет', 'Окопный нож', 'Окопный нож', 'Меч/топор', 'Меч/топор']) w = buy(w, name)
    expect(codes(w)).not.toContain('hands')
    w = buy(w, 'Окопная Дубинка')
    expect(errors(w).find((d) => d.code === 'hands')?.source?.pages).toEqual([92])
    w = buy(w, 'Пистолет')
    expect(codes(w)).toContain('item-per-model-limit')
  })
  it('keeps the Saint limit of three weapons and one two-handed weapon despite STRONG (core116)', () => {
    let w = withUnit('court', 'core-court-desecrated-saint')
    for (const name of ['Окопный нож', 'Окопная Дубинка', 'Меч/топор']) w = buy(w, name)
    expect(codes(w)).not.toContain('weapon-count')
    expect(codes(w)).not.toContain('hands')
    w = buy(w, 'Большой меч/топор')
    expect(codes(w)).toContain('weapon-count')
    w = buy(w, 'Большой молот/кувалда')
    expect(codes(w)).toContain('two-handed-count')
  })
})

describe('source-backed goetic and allied exceptions', () => {
  it('uses allegiance-specific Praetor maximum and power eligibility (core106)', () => {
    let w = withUnit('court', 'core-court-praetor')
    expect(codes(w)).toContain('allegiance')
    w = { ...w, allegiance: 'wrath' }
    for (const id of ['core-court-power-charge-hatred', 'core-court-power-blind-rage']) w = toggleUpgrade(w, w.units[0]!.id, id)
    expect(errors(w).find((d) => d.code === 'powers')?.source?.pages).toEqual([106])
    expect(codes({ ...w, allegiance: 'envy' })).toContain('upgrade-access')
    const sorcerer = withUnit('court', 'core-court-sorcerer')
    expect(codes(sorcerer)).toContain('powers')
  })
  it('treats Mamluk personal arsenal as free fixed equipment with a selected profile (allies16)', () => {
    let w = withUnit('sultanate', 'allies-mamluk-faris')
    const model = w.units[0]!
    expect(model.loadouts['personal-arsenal']).toBe('polearm-shield')
    expect(modelStats(catalog, w, model)?.armour).toBe('-3')
    expect(warbandCost(catalog, w).cost).toEqual({ ducats: 0, glory: 4 })
    expect(effectiveUnit(catalog, w, model.unitId, model)?.fixedItems.some((g) => g.name === 'Окопный Щит')).toBe(true)
    w = updateModel(w, model.id, { loadouts: { 'personal-arsenal': 'sword-pistol' } })
    expect(modelStats(catalog, w, w.units[0]!)?.armour).toBe('-2')
    expect(warbandCost(catalog, w).cost).toEqual({ ducats: 0, glory: 4 })
    expect(offerApplies(catalog, w, w.units[0]!, offer('sultanate', 'Мушкет'))).toBe(false)
  })
  it('adds Mamluk and paid-dog FIRETEAMs to the normal faction limit (allies16/18)', () => {
    let w = withUnit('sultanate', 'core-sultanate-yuzbashi')
    w = addModel(catalog, w, 'allies-mamluk-faris')
    w = updateModel(updateModel(w, w.units[0]!.id, { fireteam: 'sworn' }), w.units[1]!.id, { fireteam: 'sworn' })
    expect(codes(w)).not.toContain('fireteam-access')
    expect(codes(w)).not.toContain('fireteam-limit')
    expect(modelKeywords(catalog, w, w.units[1]!)).toContain('FIRETEAM')
    w = addModel(catalog, w, 'allies-trench-dog')
    w = addModel(catalog, w, 'core-sultanate-azeb')
    w = toggleUpgrade(w, w.units[2]!.id, 'allies-dog-fireteam')
    w = updateModel(updateModel(w, w.units[2]!.id, { fireteam: 'dog' }), w.units[3]!.id, { fireteam: 'dog' })
    expect(codes(w)).not.toContain('fireteam-limit')
    expect(codes(w)).not.toContain('mercenary-faction')
    expect(warbandCost(catalog, w).cost.glory).toBe(6)
  })
  it('requires ELITE for the Mamluk partner and forbids ordinary allied membership (core67/allies16)', () => {
    let w = withUnit('antioch', 'core-antioch-yeoman')
    w = addModel(catalog, w, 'allies-mamluk-faris')
    w = updateModel(updateModel(w, w.units[0]!.id, { fireteam: 'x' }), w.units[1]!.id, { fireteam: 'x' })
    expect(errors(w).find((d) => d.code === 'fireteam-partner')?.source?.pages).toEqual([16])
    let normal = withUnit('antioch', 'core-antioch-lieutenant')
    normal = addModel(catalog, normal, 'allies-observer')
    normal = updateModel(updateModel(normal, normal.units[0]!.id, { fireteam: 'x' }), normal.units[1]!.id, { fireteam: 'x' })
    expect(codes(normal)).toContain('fireteam-mercenary')
  })
  it('does not apply variant bonuses or generic mercenary bans where the source exempts allies (core16)', () => {
    const w = withUnit('heretic', 'allies-sin-eater', 'knights-of-avarice')
    expect(codes(w)).not.toContain('minimum-model-cost')
    const ghosts = withUnit('heretic', 'allies-sin-eater', 'trench-ghosts')
    expect(codes(ghosts)).toContain('mercenary-ban')
    const guardian = withUnit('court', 'allies-scripture-guardian')
    expect(codes(guardian)).not.toContain('mercenary-faction')
  })
  it('refuses to declare unknown revisions complete', () => {
    const w = { ...withUnit('heretic', 'core-heretic-priest'), revision: 'retired' }
    expect(warbandCost(catalog, w).complete).toBe(false)
    expect(codes(w)).toContain('edition')
  })
})

describe('v2 local persistence and portable files', () => {
  const storage = () => {
    const data = new Map<string, string>()
    return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
  }
  it('round-trips loadouts and allegiance without losing the independent revision', () => {
    const w = withUnit('sultanate', 'allies-mamluk-faris'), s = storage()
    saveWarbands(s, [w])
    expect(loadWarbands(s)).toEqual([w])
    expect(importWarband(exportWarband(w))).toEqual(w)
    const url = shareWarband({ ...w, name: 'Знамя ☦' }, 'https://example.com/toolkit/')
    expect(importShare(url.split('/import/')[1]!).name).toBe('Знамя ☦')
  })
  it('duplicates model identities and bound-alchemist references together', () => {
    let w = withUnit('sultanate', 'core-sultanate-jabirean-alchemist', 'house-of-wisdom')
    w = addModel(catalog, w, 'core-sultanate-homunculus')
    w = updateModel(w, w.units[1]!.id, { loadouts: { 'bound-alchemist': w.units[0]!.id } })
    const copy = duplicateWarband(w)
    expect(copy.id).not.toBe(w.id)
    expect(copy.units[1]!.loadouts['bound-alchemist']).toBe(copy.units[0]!.id)
    expect(copy.revision).toBe(w.revision)
  })
  it('rejects old revision formats and retains malformed storage', () => {
    for (const text of ['{', '{}', JSON.stringify({ format: 'trench-crusade-warband', version: 1 }), 'x'.repeat(2_000_001)])
      expect(() => importWarband(text)).toThrow()
    const s = storage()
    s.setItem(STORAGE_KEY, '{"version":99,"warbands":[]}')
    expect(() => loadWarbands(s)).toThrow()
    expect(s.getItem(STORAGE_KEY)).toContain('99')
  })
})

it('preserves the source conflict for Machine Armour and Heavy Ballistic Shield (core67/127)', () => {
  let w = addModel(catalog, createWarband(catalog, 'antioch'), 'core-antioch-lieutenant')
  for (const englishName of ['Machine Armour', 'Heavy Ballistic Shield']) {
    const item = catalog.items.find((i) => i.englishName === englishName)!
    const purchase = catalog.offers.find((o) => o.factionId === 'antioch' && o.itemId === item.id)!
    w = buyEquipment(w, w.units[0]!.id, purchase.id)
  }
  const diagnostics = validateWarband(catalog, w).diagnostics
  expect(diagnostics.some((d) => d.code === 'shield-source-conflict' && d.severity === 'manual')).toBe(true)
  expect(diagnostics.some((d) => d.code === 'shield-prohibited')).toBe(false)
})
