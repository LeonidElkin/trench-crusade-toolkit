import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PortraitAliasesSchema, PortraitIndexSchema } from '../src/data/portrait-schema.ts'
import type { Edition } from '../src/domain/schema.ts'

export async function validateVisuals(edition: Edition): Promise<string[]> {
  const root = resolve(import.meta.dirname, '..')
  const errors: string[] = []
  const check = (value: unknown, message: string) => {
    if (!value) errors.push(message)
  }
  const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
  const index = PortraitIndexSchema.parse(
    JSON.parse(await readFile(resolve(root, 'data/visuals', edition.id, 'portraits.json'), 'utf8')),
  )
  const aliases = PortraitAliasesSchema.parse(
    JSON.parse(
      await readFile(resolve(root, 'data/visuals', edition.id, 'unit-aliases.json'), 'utf8'),
    ),
  )
  check(index.editionId === edition.id, 'Portrait edition mismatch')
  check(aliases.editionId === edition.id, 'Portrait alias edition mismatch')
  check(
    new Set(aliases.units.map((unit) => unit.unitId)).size === aliases.units.length,
    'Duplicate portrait alias unit ID',
  )
  check(
    new Set(index.units.map((u) => u.unitId)).size === index.units.length,
    'Duplicate portrait unit ID',
  )
  check(
    new Set(index.assets.map((a) => a.id)).size === index.assets.length,
    'Duplicate portrait asset ID',
  )
  check(
    new Set(index.units.map((u) => u.assetId)).size === index.units.length,
    'Different profiles share a portrait',
  )
  for (const unit of edition.catalog.units)
    check(
      aliases.units.some((alias) => alias.unitId === unit.id),
      `${unit.id}: portrait assignment or explicit omission missing`,
    )
  for (const alias of aliases.units) {
    check(
      edition.catalog.units.some((unit) => unit.id === alias.unitId),
      `${alias.unitId}: unknown portrait alias unit`,
    )
    if (alias.visualUnitId === null) {
      check(
        alias.note?.trim(),
        `${alias.unitId}: missing portrait must have an explicit explanation`,
      )
      continue
    }
    check(
      index.units.some((unit) => unit.unitId === alias.visualUnitId),
      `${alias.unitId}: broken portrait alias`,
    )
    const shared = aliases.units.filter((other) => other.visualUnitId === alias.visualUnitId)
    check(
      shared.length === 1 || alias.sharedPortraitReason,
      `${alias.unitId}: shared portrait requires an explanation`,
    )
  }
  for (const assignment of index.units) {
    check(
      index.assets.some((a) => a.id === assignment.assetId),
      `${assignment.unitId}: broken portrait link`,
    )
  }
  for (const asset of index.assets) {
    for (const [path, checksum, size] of [
      [asset.path, asset.sha256, asset.bytes],
      [asset.thumbnail, asset.thumbnailSha256, asset.thumbnailBytes],
    ] as const) {
      const bytes = await readFile(resolve(root, 'public', path))
      check(digest(bytes) === checksum && bytes.length === size, `${path}: image bytes changed`)
      check(bytes.subarray(8, 12).toString() === 'WEBP', `${path}: not a WebP image`)
    }
    check(
      asset.bytes <= 400_000 && asset.thumbnailBytes <= 60_000,
      `${asset.id}: excessive image size`,
    )
    const source = edition.sources.find((s) => s.id === asset.source.source)
    check(
      source && asset.source.pages.every((p) => p <= source.pages),
      `${asset.id}: invalid illustration description source`,
    )
    if (asset.origin.kind === 'generated') {
      const prompt = await readFile(resolve(root, asset.origin.promptPath), 'utf8')
      check(prompt.trim().length > 100, `${asset.id}: prompt missing`)
      check(
        digest(await readFile(resolve(root, asset.origin.inputPath))) === asset.originalSha256,
        `${asset.id}: generated original changed`,
      )
    }
  }
  const manifest = JSON.parse(
    await readFile(resolve(root, 'tools/import-manifests', `${edition.id}.json`), 'utf8'),
  ) as { sources: { id: string; path: string }[] }
  for (const source of edition.sources) {
    const path = manifest.sources.find((s) => s.id === source.id)?.path
    check(
      path && digest(await readFile(resolve(root, path))) === source.sha256,
      `${source.id}: published PDF differs from game source`,
    )
  }
  return errors
}
