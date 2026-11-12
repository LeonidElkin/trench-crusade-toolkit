import { z } from 'zod'
import { SourceSchema } from '../domain/schema'

const checksum = z.string().regex(/^[a-f0-9]{64}$/)
const imagePath = z.string().regex(/^portraits\/[\w.-]+\/[\w-]+(?:-thumb)?\.webp$/)
export const PortraitIndexSchema = z.object({
  schemaVersion: z.literal(1),
  editionId: z.string().min(1),
  attribution: z.string().min(1),
  assets: z
    .array(
      z.object({
        id: z.string().min(1),
        path: imagePath,
        thumbnail: imagePath,
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        bytes: z.number().int().positive(),
        sha256: checksum,
        thumbnailBytes: z.number().int().positive(),
        thumbnailSha256: checksum,
        originalSha256: checksum,
        source: SourceSchema,
        origin: z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('pdf'), xref: z.number().int().positive() }),
          z.object({
            kind: z.literal('generated'),
            tool: z.literal('Codex image_gen'),
            promptPath: z.string().regex(/^data\/visuals\/[\w.-]+\/prompts\/[\w-]+\.md$/),
            inputPath: z.string().regex(/^assets\/generated\/[\w.-]+\/[\w-]+\.(png|jpeg|webp)$/),
          }),
        ]),
        caption: z.string().min(1),
      }),
    )
    .min(1),
  units: z
    .array(
      z.object({
        unitId: z.string().min(1),
        assetId: z.string().min(1),
        note: z.string().optional(),
      }),
    )
    .min(1),
})
export type PortraitIndex = z.infer<typeof PortraitIndexSchema>

export const PortraitAliasesSchema = z.object({
  schemaVersion: z.literal(1),
  editionId: z.string().min(1),
  description: z.string().min(1),
  units: z
    .array(
      z.object({
        unitId: z.string().min(1),
        visualUnitId: z.string().min(1).nullable(),
        note: z.string().min(1).optional(),
        sharedPortraitReason: z.string().min(1).optional(),
      }),
    )
    .min(1),
})
