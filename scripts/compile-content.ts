import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { EditionSchema } from '../src/domain/schema.ts'
const root = resolve(import.meta.dirname, '..')
const dir = resolve(root, 'data/editions/1.6.3')
const json = async (file: string) =>
  JSON.parse(await readFile(resolve(dir, file), 'utf8')) as Record<string, unknown>
export async function compileContent() {
  const base = await json('catalog-base.json')
  const overrides = await json('catalog-overrides.json')
  for (const group of ['units', 'items', 'offers', 'variants'] as const) {
    const patches = overrides[group] as Record<string, Record<string, unknown>>
    base[group] = (base[group] as { id: string }[]).map((entity) => ({
      ...entity,
      ...patches[entity.id],
    }))
  }
  for (const [group, extra] of [
    ['units', 'newUnits'],
    ['items', 'newItems'],
    ['offers', 'newOffers'],
  ] as const) {
    ;(base[group] as unknown[]).push(...(overrides[extra] as unknown[]))
  }
  base.upgrades = overrides.upgrades
  base.constraints = overrides.constraints
  base.revision = 'ru-1.6.3-r1'
  const metadata = (await json('articles.json')) as unknown as { id: string; file: string }[]
  const articles = await Promise.all(
    metadata.map(async (a) => {
      const markdown = await readFile(resolve(dir, a.file), 'utf8')
      return {
        ...a,
        sha256: createHash('sha256').update(markdown).digest('hex'),
        markdown,
        text: markdown
          .replace(/<!--.*?-->/gs, '')
          .replace(/[#*|]/g, '')
          .replace(/\s+/g, ' ')
          .trim(),
      }
    }),
  )
  const sources = await json('sources.json')
  const edition = EditionSchema.parse({
    id: '1.6.3',
    name: 'Правила 1.6.3 · русский перевод',
    revision: base.revision,
    schemaVersion: 1,
    sources,
    catalog: base,
    articles,
  })
  await mkdir(resolve(root, 'src/generated'), { recursive: true })
  await writeFile(resolve(root, 'src/generated/edition.json'), JSON.stringify(edition))
  await writeFile(resolve(root, 'src/generated/catalog.json'), JSON.stringify(edition.catalog))
  await writeFile(resolve(root, 'src/generated/articles.json'), JSON.stringify(edition.articles))
  await writeFile(
    resolve(root, 'src/generated/manifest.json'),
    JSON.stringify({
      ...edition,
      catalog: undefined,
      articles: edition.articles.map(
        ({ markdown: _markdown, text: _text, ...metadata }) => metadata,
      ),
    }),
  )
  console.log(
    `Compiled ${edition.articles.length} articles; ${edition.catalog.units.length} units; ${edition.catalog.offers.length} offers; ${edition.catalog.upgrades.length} upgrades`,
  )
  return edition
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await compileContent()
