import type { Catalog, Item, Model, SourceRef, Unit, Upgrade } from './schema'

/** Authoring records remain the rule source; these helpers only read their shape. */
export type RuleRecord = Record<string, unknown>
export const record = (value: unknown): RuleRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RuleRecord : {}
export const records = (value: unknown): RuleRecord[] =>
  Array.isArray(value) ? value.map(record) : []
export const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []
export const string = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback
export const number = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
export const rulesOf = (entity: { definition: RuleRecord }): RuleRecord => ({
  ...entity.definition,
  ...record(entity.definition.effects),
  ...record(entity.definition.rules),
})
export const normalizeName = (value: string): string =>
  value.toLowerCase().replaceAll('ё', 'е').replace(/[^а-яa-z0-9]+/g, '')
export const namesEqual = (a: string, b: string): boolean => normalizeName(a) === normalizeName(b)
export function itemNames(item: Item): string[] {
  const d = item.definition
  return [item.name, item.englishName ?? '', string(d.profileName), string(d.sourceTableName),
    string(d.tableName), ...strings(d.aliases)].filter(Boolean)
}
export const itemHasName = (item: Item | undefined, name: string): boolean =>
  Boolean(item && itemNames(item).some((candidate) => namesEqual(candidate, name)))
export function findItem(c: Catalog, name: string, factionId?: string | null): Item | undefined {
  const offer = c.offers.find((o) => (!factionId || o.factionId === factionId) && namesEqual(o.name, name))
  if (offer) return c.items.find((item) => item.id === offer.itemId)
  const candidates = c.items.filter((item) => itemHasName(item, name))
  return candidates.find((item) => factionId && item.id.startsWith(`core-${factionId}-`))
    ?? candidates.find((item) => item.id.startsWith('core-item-')) ?? candidates[0]
}
export const selectedUpgrades = (c: Catalog, model: Model): Upgrade[] =>
  model.upgrades.flatMap((id) => c.upgrades.find((u) => u.id === id) ?? [])
export const profileChoices = (unit: Unit): RuleRecord[] => records(rulesOf(unit).profileChoices)
export const selectedProfile = (unit: Unit, model?: Model): RuleRecord | undefined => {
  const choices = profileChoices(unit)
  return choices.find((choice) => choice.id === model?.loadouts.profile)
    ?? (!model?.loadouts.profile ? choices[0] : undefined)
}
export function sourceFrom(value: unknown, fallback: SourceRef): SourceRef {
  const raw = record(value), source = raw.source ?? raw.document
  if ((source === 'core' || source === 'allies') && Array.isArray(raw.pages) && raw.pages.length)
    return { ...raw, source, pages: raw.pages as number[], sectionId: string(raw.sectionId) || undefined }
  return fallback
}
export function equipmentExceptions(unit: Unit, kind: string): RuleRecord[] {
  return records(rulesOf(unit).equipmentExceptions).filter((exception) => exception.kind === kind)
}

/** An eligibility tree is OR at `any`, AND at `all`, and otherwise conjunctive. */
export function eligibilityMatches(value: unknown, model: Model, keywords: string[], tags: string[] = []): boolean {
  const e = record(value)
  if (Array.isArray(value)) return value.some((v) => eligibilityMatches(v, model, keywords, tags))
  if (Array.isArray(e.any) && !e.any.some((v) => eligibilityMatches(v, model, keywords, tags))) return false
  if (Array.isArray(e.all) && !e.all.every((v) => eligibilityMatches(v, model, keywords, tags))) return false
  if (e.keyword && !keywords.includes(string(e.keyword))) return false
  if (e.keywordAbsent && keywords.includes(string(e.keywordAbsent))) return false
  if (e.unitId && model.unitId !== e.unitId) return false
  if (e.requiresUpgradeId && !model.upgrades.includes(string(e.requiresUpgradeId))) return false
  if (e.tag && !tags.includes(string(e.tag))) return false
  return true
}
