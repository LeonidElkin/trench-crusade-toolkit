import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const dir = resolve(import.meta.dirname, '../data/editions/1.6.3')
const metadata = JSON.parse(await readFile(resolve(dir, 'articles.json'), 'utf8')) as {
  file: string
}[]
const files = [
  'sources.json',
  'articles.json',
  'catalog-base.json',
  'catalog-overrides.json',
  ...metadata.map((a) => a.file),
].sort()
const checksums: Record<string, string> = {}
for (const file of files)
  checksums[file] = createHash('sha256')
    .update(await readFile(resolve(dir, file)))
    .digest('hex')
await writeFile(
  resolve(dir, 'edition-lock.json'),
  JSON.stringify(
    { editionId: '1.6.3', revision: 'ru-1.6.3-r1', schemaVersion: 1, checksums },
    null,
    2,
  ) + '\n',
)
console.log(`Frozen ru-1.6.3-r1: ${files.length} canonical files`)
