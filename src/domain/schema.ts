import { z } from 'zod'
export const CostSchema = z
  .object({ ducats: z.number().int().nonnegative(), glory: z.number().int().nonnegative() })
  .strict()
export type Cost = z.infer<typeof CostSchema>
const id = z.string().min(1)
const ids = z.array(id)
const numberMap = z.record(z.string(), z.number().int().nonnegative())
export const SourceSchema = z.object({
  source: z.enum(['core', 'allies']),
  pages: z.array(z.number().int().positive()).min(1),
  sectionId: z.string().optional(),
  bbox: z.array(z.number()).length(4).optional(),
}).passthrough()
export type SourceRef = z.infer<typeof SourceSchema>
const provenance = { source: SourceSchema, ruleId: id }
export const CategorySchema = z.enum(['ranged', 'melee', 'armour', 'equipment'])
export type Category = z.infer<typeof CategorySchema>
const categories = z.array(CategorySchema)
const definition = z.record(z.string(), z.unknown()).default({})
const LoadoutGroupSchema = z.object({
  id,
  name: id,
  min: z.number().int().nonnegative(),
  max: z.number().int().positive(),
  choices: z.array(z.object({
    id,
    name: id,
    equipment: ids,
    armour: z.string().optional(),
    ignoredKeywords: ids.optional(),
  })),
  source: SourceSchema,
})
const StatsSchema = z.object({
  name: z.string(),
  movement: z.string(),
  ranged: z.string(),
  melee: z.string(),
  armour: z.string(),
  base: z.string(),
})
export type Stats = z.infer<typeof StatsSchema>
export const FactionSchema = z.object({
  id,
  name: id,
  ...provenance,
  arsenalRuleId: id,
  image: id,
  startingBudget: CostSchema,
  battleBudget: CostSchema,
  loreRuleId: id.optional(),
  specialRuleIds: ids.default([]),
  fireteamLimit: z.number().int().nonnegative().default(0),
  definition,
})
export const ItemSchema = z.object({
  id,
  name: id,
  englishName: z.string().nullable(),
  category: CategorySchema,
  hands: z.number().int().min(0).max(6).nullable(),
  range: z.string().nullable(),
  modifiers: z.string().nullable(),
  keywords: ids,
  ...provenance,
  unresolved: z.boolean().optional(),
  shield: z.boolean().nullable().optional(),
  headgear: z.boolean().nullable().optional(),
  carriedHands: z.number().int().nonnegative().nullable().optional(),
  armourModifier: z.number().int().nullable().optional(),
  countsAsItemName: z.string().nullable().optional(),
  prerequisites: z.array(z.unknown()).default([]),
  definition,
})
export type Item = z.infer<typeof ItemSchema>
export const OfferSchema = z.object({
  id,
  factionId: id,
  itemId: id,
  name: id,
  category: CategorySchema,
  cost: CostSchema,
  limit: z.number().int().nonnegative().nullable(),
  notes: z.string(),
  ...provenance,
  allowedUnitIds: ids.nullable(),
  requiredKeywords: ids,
  forbiddenKeywords: ids,
  keywordsOrUnits: z.boolean().optional(),
  requiresItemIds: ids.optional(),
  exemptLimitUnitIds: ids.optional(),
  variantId: id.optional(),
  unitIds: ids.optional(),
  manualCheck: z.boolean().optional(),
  limitScope: z.enum(['campaign', 'warband', 'unspecified']).default('unspecified'),
  definition,
})
export type Offer = z.infer<typeof OfferSchema>
const OfferOverrideSchema = z.object({
  cost: CostSchema.optional(),
  limit: z.number().int().nonnegative().optional(),
  requiredKeywords: ids.optional(),
  forbiddenKeywords: ids.optional(),
})
export const VariantSchema = z.object({
  id,
  name: id,
  factionId: id,
  ...provenance,
  manualCheck: z.boolean(),
  unitLimits: numberMap.optional(),
  unitMinimums: numberMap.optional(),
  offerOverrides: z.record(z.string(), OfferOverrideSchema).optional(),
  banMercenaries: z.boolean().optional(),
  banKeywords: ids.optional(),
  banItemIds: ids.optional(),
  keywords: ids.optional(),
  minimumModelDucats: z.number().optional(),
  minimumCostExempt: ids.optional(),
  banWeaponKeywords: ids.optional(),
  weaponKeywordExceptions: ids.optional(),
  unitCostOverrides: z.record(z.string(), CostSchema).optional(),
  foreignArsenals: ids.optional(),
  banUpgradeIds: ids.optional(),
  fireteamLimit: z.number().int().nonnegative().optional(),
  keywordsByUnit: z.record(z.string(), ids).optional(),
  startingBudget: CostSchema.optional(),
  battleBudget: CostSchema.optional(),
  heavyRangedLimit: z.number().int().optional(),
  definition,
})
export type Variant = z.infer<typeof VariantSchema>
export const UnitSchema = z.object({
  id,
  name: id,
  factionId: id.nullable(),
  mercenary: z.boolean(),
  cost: CostSchema,
  min: z.number().int().nonnegative(),
  max: z.number().int().nonnegative().nullable(),
  stats: StatsSchema,
  profileRows: z.array(z.array(z.string())),
  keywords: ids,
  ...provenance,
  equipmentLocked: z.boolean(),
  fixedItems: z.array(z.object({ name: id, category: CategorySchema })),
  allowedCategories: categories,
  manualCheck: z.boolean(),
  variantId: id.optional(),
  rangedItemIds: ids.optional(),
  maxItemDucats: z.number().int().nonnegative().optional(),
  requireWeapon: z.boolean().optional(),
  requireArmour: z.boolean().optional(),
  forbidGloryItems: z.boolean().optional(),
  allowedItemIds: ids.optional(),
  forbiddenItemIds: ids.optional(),
  specialRules: ids.optional(),
  powerMin: z.number().int().nonnegative().optional(),
  powerMax: z.number().int().nonnegative().optional(),
  allowedFactions: ids.optional(),
  equipmentPolicy: z.string().optional(),
  equipmentAccessNote: z.string().optional(),
  abilityIds: ids.default([]),
  linkedRuleIds: ids.default([]),
  loadoutGroups: z.array(LoadoutGroupSchema).default([]),
  definition,
})
export type Unit = z.infer<typeof UnitSchema>
export const UpgradeSchema = z.object({
  id,
  name: id,
  cost: CostSchema,
  unitIds: ids,
  factionId: id.nullable(),
  variantId: id.nullable(),
  group: id.nullable(),
  limit: z.number().int().nonnegative().nullable(),
  keywords: ids,
  statChanges: z.record(z.string(), z.number().int()),
  ...provenance,
  manualCheck: z.boolean(),
  forbiddenKeywords: ids.optional(),
  requiredKeywords: ids.optional(),
  statSet: z.record(z.string(), z.string()).optional(),
  locksEquipment: z.boolean().optional(),
  base: z.string().optional(),
  noArmour: z.boolean().optional(),
  noRanged: z.boolean().optional(),
  sin: id.nullable().optional(),
  power: z.boolean().optional(),
  replacesBaseCost: z.boolean().optional(),
  removesKeywords: ids.optional(),
  requiresUpgradeIds: ids.optional(),
  forbiddenUpgradeIds: ids.optional(),
  groupLimitPerModel: z.number().int().positive().default(1),
  definition,
})
export type Upgrade = z.infer<typeof UpgradeSchema>
export const CatalogSchema = z.object({
  schemaVersion: z.literal(2),
  edition: id,
  revision: id,
  factions: z.array(FactionSchema),
  variants: z.array(VariantSchema),
  units: z.array(UnitSchema),
  items: z.array(ItemSchema),
  offers: z.array(OfferSchema),
  upgrades: z.array(UpgradeSchema),
  keywords: z.array(z.object({ id, name: id, ...provenance })),
  abilities: z.array(z.object({ id, name: id, unitIds: ids, ...provenance })),
  procedures: z.array(z.object({ id, ...provenance }).passthrough()),
  issues: z.array(z.object({ id, message: id, ...provenance })),
  constraints: z.array(
    z.object({
      id,
      message: id,
      severity: z.enum(['error', 'warning', 'manual', 'info']),
      factionId: id.optional(),
      variantId: id.optional(),
      ...provenance,
    }),
  ),
})
export type Catalog = z.infer<typeof CatalogSchema>
export const ArticleSchema = z.object({
  id,
  title: id,
  source: z.enum(['core', 'allies']),
  pages: z.array(z.number().int().positive()).min(1),
  category: id,
  section: id,
  originalSection: z.string().optional(),
  file: id,
  sha256: id,
  markdown: z.string(),
  text: z.string(),
})
export type Article = z.infer<typeof ArticleSchema>
export const EditionSchema = z.object({
  id,
  name: id,
  revision: id,
  schemaVersion: z.literal(2),
  sources: z.array(
    z.object({
      id,
      filename: id,
      edition: id.nullable(),
      pages: z.number().int().positive(),
      sha256: id,
    }),
  ),
  catalog: CatalogSchema,
  articles: z.array(ArticleSchema),
})
export type Edition = z.infer<typeof EditionSchema>

export const ModelSchema = z
  .object({
    id,
    unitId: id,
    name: z.string().max(200),
    equipment: z
      .array(z.object({ id, offerId: id, quantity: z.number().int().min(1).max(99) }).strict())
      .max(200),
    upgrades: ids.max(100),
    notes: z.string().max(10000),
    fireteam: z.string().max(50).default(''),
    loadouts: z.record(z.string(), z.string()).default({}),
  })
  .strict()
export type Model = z.infer<typeof ModelSchema>
export const WarbandSchema = z
  .object({
    schemaVersion: z.literal(2),
    id,
    name: z.string().min(1).max(200),
    editionId: id,
    revision: id,
    factionId: id,
    variantId: id.nullable(),
    format: z.enum(['campaign', 'battle', 'custom']),
    budget: CostSchema,
    units: z.array(ModelSchema).max(300),
    notes: z.string().max(20000),
    allegiance: z.string().max(100).default(''),
    foreignOfferIds: ids.max(20).default([]),
    leaderId: z.string().default(''),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict()
export type Warband = z.infer<typeof WarbandSchema>
export const ExportSchema = z
  .object({
    format: z.literal('trench-crusade-warband'),
    version: z.literal(2),
    warband: WarbandSchema,
  })
  .strict()
