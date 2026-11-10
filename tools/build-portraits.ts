/** Explicit asset import. Normal development and builds never execute this file. */
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { PortraitIndexSchema } from '../src/data/portrait-schema.ts'
import { hash, optimizePortrait } from './portrait-assets.ts'
import type { SourceRef } from '../src/domain/schema.ts'

const root = resolve(import.meta.dirname, '..')
const editionId = process.argv[2] ?? '1.6.3'
if (!/^[\w.-]+$/.test(editionId)) throw new Error('Invalid edition ID')
const directory = resolve(root, 'data/visuals', editionId)
const planPath = resolve(directory, 'portrait-plan.json')
const plan = JSON.parse(await readFile(planPath, 'utf8')) as {
  editionId: string
  attribution: string
  units: { unitId: string; assetId: string; note?: string }[]
  assets: {
    id: string
    kind: 'pdf' | 'generated'
    source: SourceRef['source']
    page: number
    pages?: number[]
    xref?: number
    caption: string
    inputPath?: string
    promptPath?: string
  }[]
}
if (plan.editionId !== editionId) throw new Error('Portrait plan edition mismatch')
const temp = await mkdtemp(resolve(tmpdir(), 'tc-portraits-'))
try {
  execFileSync(
    process.env.PDF_PYTHON ?? 'python3',
    [resolve(root, 'tools/extract_portraits.py'), '--plan', planPath, '--out', temp],
    { stdio: 'inherit' },
  )
  const extracted = JSON.parse(await readFile(resolve(temp, 'extracted.json'), 'utf8')) as {
    id: string
    source: SourceRef['source']
    page: number
    xref: number
    caption: string
    originalSha256: string
  }[]
  const assets = []
  for (const asset of extracted) {
    const input = resolve(temp, `${asset.id}.png`)
    assets.push(
      await optimizePortrait(input, editionId, {
        id: asset.id,
        originalSha256: asset.originalSha256,
        source: { source: asset.source, pages: [asset.page] },
        origin: { kind: 'pdf', xref: asset.xref },
        caption: asset.caption,
      }),
    )
  }
  for (const asset of plan.assets.filter((a) => a.kind === 'generated')) {
    if (!asset.inputPath || !asset.promptPath)
      throw new Error(`${asset.id}: missing original or prompt`)
    await readFile(resolve(root, asset.promptPath), 'utf8')
    const input = resolve(root, asset.inputPath)
    assets.push(
      await optimizePortrait(input, editionId, {
        id: asset.id,
        caption: asset.caption,
        source: { source: asset.source, pages: asset.pages ?? [asset.page] },
        originalSha256: hash(await readFile(input)),
        origin: {
          kind: 'generated',
          tool: 'Codex image_gen',
          inputPath: asset.inputPath,
          promptPath: asset.promptPath,
        },
      }),
    )
  }
  const index = PortraitIndexSchema.parse({
    schemaVersion: 1,
    editionId,
    attribution: plan.attribution,
    assets,
    units: plan.units,
  })
  if (new Set(index.assets.map((a) => a.id)).size !== index.assets.length)
    throw new Error('Duplicate asset ID')
  for (const unit of index.units)
    if (!index.assets.some((a) => a.id === unit.assetId))
      throw new Error(`Unknown portrait: ${unit.assetId}`)
  await writeFile(resolve(directory, 'portraits.json'), JSON.stringify(index, null, 2) + '\n')
  console.log(
    `${index.units.length} profiles → ${assets.length} illustrations; ${Math.round(assets.reduce((n, a) => n + a.bytes + a.thumbnailBytes, 0) / 1024)} KiB including thumbnails`,
  )
} finally {
  await rm(temp, { recursive: true, force: true })
}
