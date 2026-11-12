import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { EditionSchema } from '../src/domain/schema.ts'
import { reconstructCatalog, str, record, list, type RecordValue } from './reconstruct-catalog.ts'
import { digest, reviewedRecords } from './verify-reconstruction.ts'

const root = resolve(import.meta.dirname, '..')
const categoryLabels: Record<string, string> = {
  rules: 'Основные правила', keywords: 'Ключевые слова', introduction: 'Введение',
  weapons: 'Оружие', armour: 'Броня и щиты', equipment: 'Снаряжение', allies: 'Союзники и наёмники',
  scenarios: 'Сценарии', 'scenario-generator': 'Генератор случайных сценариев',
}
function categoryOf(section: RecordValue): string {
  if (section.source === 'allies') return 'allies'
  const id = str(section.id), category = str(section.category)
  if (id.startsWith('core-keyword-')) return 'keywords'
  if (/core-scenario-\d+$/.test(id)) return id.replace('core-', '')
  if (/generator|deployment|random-scenario|glorious-feats/.test(id)) return 'scenario-generator'
  if (/^core-(heretic|pilgrim|sultanate|antioch|grail|court|dirge|prussia|alba|abyssinia)-/.test(id)) {
    const faction = id.split('-')[1]!
    return `faction-${['prussia', 'alba', 'abyssinia'].includes(faction) ? 'antioch' : faction === 'dirge' ? 'grail' : faction}`
  }
  if (/Дальнобойное|ближнего боя/.test(category)) return 'weapons'
  if (category === 'Броня') return 'armour'
  if (['Снаряжение', 'Экипировка'].includes(category)) return 'equipment'
  if (category === 'Сценарии') return 'scenarios'
  if (['Введение', 'Лор'].includes(category)) return 'introduction'
  return 'rules'
}

export async function compileContent() {
  const verified = await reviewedRecords(root, '1.6.3')
  let links: Record<string, string> = {}
  let linkDefinitions: RecordValue[] = []
  try {
    const definitions = record(JSON.parse(await readFile(resolve(root, 'reconstruction/1.6.3/links.json'), 'utf8')))
    linkDefinitions = list(definitions.itemLinks)
    links = Object.fromEntries(linkDefinitions.filter((l) => l.status !== 'unresolved')
      .map((l) => [str(l.factionId) ? `${str(l.factionId)}:${str(l.name)}` : str(l.name), str(l.itemId)]))
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
  const integrationIssues = list(record(JSON.parse(await readFile(resolve(root, 'reconstruction/1.6.3/integration-issues.json'), 'utf8'))).issues)
  const { catalog, unresolvedLinks } = reconstructCatalog(verified.records, '1.6.3', str(verified.manifest.revision), links, linkDefinitions, integrationIssues)
  const factionLabels = Object.fromEntries(catalog.factions.map((f) => [`faction-${f.id}`, f.name]))
  const articles = verified.sections.map((section) => {
    const markdown = str(section.markdown), category = categoryOf(section), id = str(section.id)
    return { ...section, category, section: factionLabels[category] ?? categoryLabels[category] ?? str(section.title),
      file: `content/${id}.md`, sha256: digest(markdown), markdown,
      text: markdown.replace(/<!--.*?-->/gs, '').replace(/[#*|]/g, '').replace(/\s+/g, ' ').trim() }
  })
  const edition = EditionSchema.parse({ id: '1.6.3', name: 'Правила 1.6.3 · русский перевод',
    revision: catalog.revision, schemaVersion: 2, sources: verified.sources, catalog, articles })
  const generated = resolve(root, 'src/generated')
  await mkdir(generated, { recursive: true })
  const output: Record<string, unknown> = {
    'edition.json': edition, 'catalog.json': edition.catalog, 'articles.json': edition.articles,
    'manifest.json': { ...edition, catalog: undefined,
      articles: edition.articles.map(({ markdown: _markdown, text: _text, ...metadata }) => metadata) },
    'coverage.json': verified.coverage, 'unresolved-links.json': unresolvedLinks,
  }
  for (const [filename, value] of Object.entries(output)) await writeFile(resolve(generated, filename), JSON.stringify(value))
  console.log(`Compiled ${edition.revision}: ${articles.length} articles, ${catalog.units.length} profiles, ${catalog.offers.length} purchases; all original pages independently reviewed`)
  return edition
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await compileContent()
