import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { compileContent } from './compile-content.ts'
import { validateEdition } from './validate-data.ts'
import { digest } from './verify-reconstruction.ts'

const root = resolve(import.meta.dirname, '..')
const edition = await compileContent()
const errors = validateEdition(edition)
if (errors.length) throw new Error(errors.join('\n'))
const directory = resolve(root, 'data/editions/1.6.3')
// An explicit export replaces the untrusted first revision. Git retains its backup tag.
await rm(directory, { recursive: true, force: true })
await mkdir(resolve(directory, 'content'), { recursive: true })
const json = async (file: string, value: unknown) => writeFile(resolve(directory, file), JSON.stringify(value, null, 2) + '\n')
await json('sources.json', edition.sources)
await json('catalog.json', edition.catalog)
await json('articles.json', edition.articles.map(({ markdown: _markdown, text: _text, ...metadata }) => metadata))
await json('issues.json', edition.catalog.issues)
await json('coverage.json', JSON.parse(await readFile(resolve(root, 'src/generated/coverage.json'), 'utf8')))
for (const article of edition.articles) await writeFile(resolve(directory, article.file), article.markdown)
const inputs: Record<string, string> = {}
for (const subdirectory of ['authored', 'reviews'])
  for (const file of (await readdir(resolve(root, 'reconstruction/1.6.3', subdirectory))).filter((f) => f.endsWith('.json')).sort()) {
    const path = `reconstruction/1.6.3/${subdirectory}/${file}`
    inputs[path] = digest(await readFile(resolve(root, path)))
  }
for (const file of ['manifest.json', 'links.json', 'integration-issues.json']) {
  const path = `reconstruction/1.6.3/${file}`
  inputs[path] = digest(await readFile(resolve(root, path)))
}
await json('inputs.json', inputs)
const checksums: Record<string, string> = {}
for (const file of ['sources.json', 'catalog.json', 'articles.json', 'issues.json', 'coverage.json', 'inputs.json', ...edition.articles.map((a) => a.file)].sort())
  checksums[file] = digest(await readFile(resolve(directory, file)))
await json('edition-lock.json', { editionId: edition.id, revision: edition.revision, schemaVersion: 2, checksums })
console.log(`Replaced the complete first revision with ${edition.revision}: ${edition.articles.length} Markdown documents, no legacy fallback`)
