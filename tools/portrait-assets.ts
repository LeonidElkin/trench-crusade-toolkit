import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'
import type { PortraitIndex } from '../src/data/portrait-schema.ts'

export const root = resolve(import.meta.dirname, '..')
export const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex')
export type PortraitAsset = PortraitIndex['assets'][number]
export async function optimizePortrait(
  input: string,
  editionId: string,
  asset: Pick<PortraitAsset, 'id' | 'source' | 'caption' | 'origin' | 'originalSha256'>,
): Promise<PortraitAsset> {
  if (!/^[\w.-]+$/.test(editionId) || !/^[a-z0-9-]+$/.test(asset.id))
    throw new Error('Unsafe asset ID')
  const full = await sharp(input)
    .resize({ width: 840, height: 1000, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 87, effort: 6 })
    .toBuffer({ resolveWithObject: true })
  const thumbnail = await sharp(input)
    .resize({ width: 280, height: 320, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 83, effort: 6 })
    .toBuffer()
  const path = `portraits/${editionId}/${asset.id}.webp`
  const thumbPath = `portraits/${editionId}/${asset.id}-thumb.webp`
  await mkdir(resolve(root, 'public/portraits', editionId), { recursive: true })
  await writeFile(resolve(root, 'public', path), full.data)
  await writeFile(resolve(root, 'public', thumbPath), thumbnail)
  return {
    ...asset,
    path,
    thumbnail: thumbPath,
    width: full.info.width,
    height: full.info.height,
    bytes: full.data.length,
    sha256: hash(full.data),
    thumbnailBytes: thumbnail.length,
    thumbnailSha256: hash(thumbnail),
  }
}
export async function readJson(path: string) {
  return JSON.parse(await readFile(path, 'utf8'))
}
