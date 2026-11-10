import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { compileContent } from './compile-content.ts'
import { EditionSchema, type Edition } from '../src/domain/schema.ts'
import { pathToFileURL } from 'node:url'
import { validateVisuals } from './validate-visuals.ts'
export function validateEdition(data: unknown): string[] {
  const parsed = EditionSchema.safeParse(data)
  if (!parsed.success) return parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
  const e = parsed.data,
    c = e.catalog,
    errors: string[] = []
  const check = (condition: unknown, message: string) => {
    if (!condition) errors.push(message)
  }
  const all = [
    ...c.factions,
    ...c.variants,
    ...c.units,
    ...c.items,
    ...c.offers,
    ...c.upgrades,
    ...c.keywords,
    ...c.constraints,
  ]
  for (const group of [
    e.articles,
    c.factions,
    c.variants,
    c.units,
    c.items,
    c.offers,
    c.upgrades,
    c.keywords,
    c.constraints,
  ])
    check(new Set(group.map((x) => x.id)).size === group.length, 'Duplicate entity ID')
  const rules = new Set(e.articles.map((a) => a.id)),
    units = new Set(c.units.map((u) => u.id)),
    items = new Set(c.items.map((i) => i.id)),
    upgrades = new Set(c.upgrades.map((i) => i.id)),
    factions = new Set(c.factions.map((f) => f.id)),
    variants = new Set(c.variants.map((v) => v.id))
  for (const x of all) {
    check(rules.has(x.ruleId), `${x.id}: unknown rule ${x.ruleId}`)
    const source = e.sources.find((s) => s.id === x.source.source)
    for (const page of x.source.pages)
      check(source && page <= source.pages, `${x.id}: invalid source page ${page}`)
  }
  for (const a of e.articles) check(a.markdown.trim(), `${a.id}: empty article`)
  for (const o of c.offers) {
    check(items.has(o.itemId), `${o.id}: unknown item`)
    check(factions.has(o.factionId), `${o.id}: unknown faction`)
    for (const id of o.allowedUnitIds ?? []) check(units.has(id), `${o.id}: unknown unit ${id}`)
    for (const id of o.requiresItemIds ?? [])
      check(items.has(id), `${o.id}: unknown required item ${id}`)
  }
  for (const u of c.units) {
    check(!u.factionId || factions.has(u.factionId), `${u.id}: unknown faction`)
    check(!u.variantId || variants.has(u.variantId), `${u.id}: unknown variant`)
    check(u.max === null || u.max >= u.min, `${u.id}: contradictory quantity range`)
    for (const id of [
      ...(u.allowedItemIds ?? []),
      ...(u.forbiddenItemIds ?? []),
      ...(u.rangedItemIds ?? []),
    ])
      check(items.has(id), `${u.id}: unknown allowed item ${id}`)
  }
  for (const v of c.variants) {
    check(factions.has(v.factionId), `${v.id}: unknown faction`)
    for (const id of [...Object.keys(v.unitLimits ?? {}), ...Object.keys(v.unitMinimums ?? {})])
      check(units.has(id), `${v.id}: unknown unit ${id}`)
    for (const id of [...Object.keys(v.offerOverrides ?? {}), ...(v.banItemIds ?? [])])
      check(items.has(id), `${v.id}: unknown item ${id}`)
  }
  for (const u of c.upgrades) {
    for (const id of u.unitIds) check(units.has(id), `${u.id}: unknown unit ${id}`)
    for (const id of [...(u.requiresUpgradeIds ?? []), ...(u.forbiddenUpgradeIds ?? [])])
      check(upgrades.has(id), `${u.id}: unknown prerequisite ${id}`)
  }
  check(e.id === c.edition && e.revision === c.revision, 'Catalog edition/revision mismatch')
  return errors
}
export async function validateCurrent(): Promise<Edition> {
  const edition = await compileContent(),
    errors = validateEdition(edition)
  errors.push(...(await validateVisuals(edition)))
  const audit = JSON.parse(
    await readFile(
      resolve(import.meta.dirname, '../data/editions/1.6.3/import-audit.json'),
      'utf8',
    ),
  ) as { pages: { source: string; page: number; retainedCharacters: number }[] }
  for (const source of edition.sources) {
    const pages = audit.pages.filter((p) => p.source === source.id)
    if (pages.length !== source.pages || new Set(pages.map((p) => p.page)).size !== source.pages)
      errors.push(`${source.id}: incomplete page coverage`)
    for (const page of pages.filter((p) => p.retainedCharacters > 100))
      if (!edition.articles.some((a) => a.source === page.source && a.pages.includes(page.page)))
        errors.push(`Missing article for ${page.source} p${page.page}`)
  }
  const lockPath = resolve(import.meta.dirname, '../data/editions/1.6.3/edition-lock.json')
  try {
    const lock = JSON.parse(await readFile(lockPath, 'utf8')) as {
      editionId: string
      revision: string
      checksums: Record<string, string>
    }
    if (lock.editionId !== edition.id || lock.revision !== edition.revision)
      errors.push('Edition lock revision mismatch')
    for (const [file, expected] of Object.entries(lock.checksums)) {
      const actual = createHash('sha256')
        .update(await readFile(resolve(import.meta.dirname, '../data/editions/1.6.3', file)))
        .digest('hex')
      if (actual !== expected)
        errors.push(
          `Published edition changed: ${file}; create a reviewed new revision, do not silently change old warbands`,
        )
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      errors.push('Edition lock or a locked canonical file is missing')
    else throw error
  }
  if (errors.length) throw new Error(errors.join('\n'))
  console.log(
    `Data valid: ${audit.pages.length} pages; ${edition.catalog.factions.length} factions; ${edition.catalog.variants.length} variants; ${edition.catalog.units.length} profiles; all references resolved`,
  )
  return edition
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await validateCurrent()
