/** Inventory and register existing built-in image_gen outputs. Never calls a paid API. */
import { parseArgs } from 'node:util'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { PortraitIndexSchema } from '../src/data/portrait-schema.ts'
import { compileContent } from '../scripts/compile-content.ts'
import { hash, optimizePortrait, readJson, root } from './portrait-assets.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    edition: { type: 'string', default: '1.6.3' },
    unit: { type: 'string' },
    file: { type: 'string' },
    check: { type: 'boolean', default: false },
  },
})
const id = values.edition!
if (!/^[\w.-]+$/.test(id)) throw new Error('Invalid edition ID')
const dir = resolve(root, 'data/visuals', id)
const indexPath = resolve(dir, 'portraits.json')
const index = PortraitIndexSchema.parse(await readJson(indexPath))
const edition = await compileContent()
if (edition.id !== id || index.editionId !== id)
  throw new Error('Edition not registered; import its own catalog first')
const command = positionals[0] ?? 'status'
if (command === 'status') {
  const missing = edition.catalog.units.filter((u) => !index.units.some((a) => a.unitId === u.id))
  const shared = index.units.filter((u) =>
    index.units.some((v) => v.unitId !== u.unitId && v.assetId === u.assetId),
  )
  console.log(
    JSON.stringify(
      {
        editionId: id,
        profiles: edition.catalog.units.length,
        assets: index.assets.length,
        pdf: index.assets.filter((a) => a.origin.kind === 'pdf').length,
        generated: index.assets.filter((a) => a.origin.kind === 'generated').length,
        missing: missing.map((u) => u.id),
        shared: shared.map((u) => u.unitId),
      },
      null,
      2,
    ),
  )
  if (values.check && (missing.length || shared.length)) process.exitCode = 1
} else if (command === 'add-generated') {
  const unit = edition.catalog.units.find((u) => u.id === values.unit)
  if (!unit || !values.file)
    throw new Error('Use add-generated --unit <stable-ID> --file <existing-image>')
  const assetId = unit.id.replaceAll('.', '-')
  if (index.assets.some((a) => a.id === assetId))
    throw new Error(
      'A dedicated portrait already exists; keep it unless replacement is explicitly requested',
    )
  const promptPath = `data/visuals/${id}/prompts/${assetId}.md`
  const prompt = await readFile(resolve(root, promptPath), 'utf8')
  if (prompt.trim().length < 100) throw new Error('Save a complete prompt first')
  const meta = await sharp(values.file).metadata()
  if (!meta.format || !['png', 'jpeg', 'webp'].includes(meta.format))
    throw new Error('Unsupported image format')
  const inputPath = `assets/generated/${id}/${assetId}.${meta.format}`
  await mkdir(resolve(root, 'assets/generated', id), { recursive: true })
  await copyFile(values.file, resolve(root, inputPath))
  const originalSha256 = hash(await readFile(resolve(root, inputPath)))
  const rule = edition.articles.find((a) => a.id === unit.ruleId)
  const source = {
    source: unit.source.source,
    pages: [
      ...new Set([
        ...unit.source.pages,
        ...(rule?.source === unit.source.source ? rule.pages : []),
      ]),
    ].sort((a, b) => a - b),
  }
  const asset = await optimizePortrait(resolve(root, inputPath), id, {
    id: assetId,
    caption: unit.name,
    source,
    originalSha256,
    origin: { kind: 'generated', tool: 'Codex image_gen', inputPath, promptPath },
  })
  index.assets.push(asset)
  index.units = index.units.filter((a) => a.unitId !== unit.id)
  index.units.push({ unitId: unit.id, assetId })
  const planPath = resolve(dir, 'portrait-plan.json')
  const plan = await readJson(planPath)
  plan.assets.push({
    id: assetId,
    kind: 'generated',
    source: unit.source.source,
    page: unit.source.pages[0],
    pages: source.pages,
    inputPath,
    promptPath,
    caption: unit.name,
  })
  plan.units = index.units
  // Both files are derivatives of the reviewed plan; gameplay files are untouched.
  await writeFile(planPath, JSON.stringify(plan, null, 2) + '\n')
  await writeFile(indexPath, JSON.stringify(PortraitIndexSchema.parse(index), null, 2) + '\n')
  console.log(
    `Registered ${unit.id}: ${asset.bytes} bytes + ${asset.thumbnailBytes} byte thumbnail`,
  )
} else throw new Error('Unknown command. Use status or add-generated.')
