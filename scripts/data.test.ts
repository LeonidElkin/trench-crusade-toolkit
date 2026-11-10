import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { validateEdition } from './validate-data'
import { createSearchIndex, searchArticles } from '../src/domain/search'
import type { Edition } from '../src/domain/schema'
const edition = JSON.parse(
  await readFile(resolve(import.meta.dirname, '../src/generated/edition.json'), 'utf8'),
) as Edition
describe('rules database invariants', () => {
  it('validates the complete real database and source references', () => {
    expect(validateEdition(edition)).toEqual([])
    expect(edition.sources.map((s) => s.pages)).toEqual([168, 22])
    expect(edition.sources.find((s) => s.id === 'allies')?.edition).toBeNull()
    expect(edition.catalog.factions).toHaveLength(6)
    expect(edition.catalog.variants).toHaveLength(14)
    expect(edition.catalog.units).toHaveLength(66)
    expect(new Set(edition.catalog.units.filter(u => u.mercenary).map(u => u.ruleId)).size).toBe(10)
  })
  it('detects a broken rule link and duplicate ID instead of accepting partial data', () => {
    const broken = structuredClone(edition)
    broken.catalog.units[0]!.ruleId = 'missing-rule'
    broken.catalog.units.push(broken.catalog.units[0]!)
    expect(validateEdition(broken).some((e) => e.includes('unknown rule'))).toBe(true)
    expect(validateEdition(broken).some((e) => e.includes('Duplicate'))).toBe(true)
  })
  it('finds Russian ё spellings, English terms and AND queries', () => {
    const index = createSearchIndex(edition.articles)
    expect(searchArticles(index, 'heavy')[0]?.title).toBe('HEAVY')
    expect(
      searchArticles(index, 'огнемет').some(
        (a) =>
          a.title.toLowerCase().includes('огнемёт') || a.title.toLowerCase().includes('огнемет'),
      ),
    ).toBe(true)
    expect(
      searchArticles(index, 'железный султанат').every(
        (a) => (a.title + ' ' + a.text).toLowerCase().includes('железн') && (a.title + ' ' + a.text).toLowerCase().includes('султанат'),
      ),
    ).toBe(true)
  })
})
