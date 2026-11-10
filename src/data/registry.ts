import raw from '../generated/manifest.json'
import rawCatalog from '../generated/catalog.json'
import type { Edition, Article, Catalog } from '../domain/schema'
export type EditionIndex = Omit<Edition, 'articles'> & {
  articles: Omit<Article, 'markdown' | 'text'>[]
}
export const edition = { ...raw, catalog: rawCatalog } as unknown as EditionIndex
export const editions = [edition]
export const getEdition = (id: string, revision?: string): EditionIndex | undefined =>
  editions.find((e) => e.id === id && (!revision || e.revision === revision))
export const catalog: Catalog = edition.catalog
export const unitsById = new Map(catalog.units.map((u) => [u.id, u]))
export const itemsById = new Map(catalog.items.map((i) => [i.id, i]))
export const offersById = new Map(catalog.offers.map((o) => [o.id, o]))
export const ruleHref = (id: string) => `#/rules/${encodeURIComponent(id)}`
export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`
export const categoryNames = {
  ranged: 'Дальнобойное оружие',
  melee: 'Оружие ближнего боя',
  armour: 'Броня и щиты',
  equipment: 'Снаряжение',
}
