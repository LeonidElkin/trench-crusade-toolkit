import type { Article, Category, Unit, Variant, Warband } from '../domain/schema'
import { createWarband, factionUnits } from '../domain/warband'
import { articles, articlesById } from './content'
import { catalog, ruleHref } from './registry'

export interface ReferenceLeaf {
  article: Article
  label: string
  href: string
  context?: Warband
  unit?: Unit
  view?: 'arsenal' | 'variant'
}
export interface ReferenceBranch {
  id: string
  label: string
  children: ReferenceNode[]
}
export type ReferenceNode = ReferenceLeaf | ReferenceBranch

const hidden = new Set([
  'core-foundations',
  'core-end-activation',
  'core-keywords-intro',
  'core-model-representation',
  'core-choose-faction',
  'core-recruitment',
  'core-heretic-recruitment',
  'core-pilgrim-recruitment',
  'core-sultanate-recruitment',
  'core-antioch-recruitment',
  'core-heretic-special-equipment',
  'core-pilgrim-special-equipment',
  'core-sultanate-special-equipment',
  'core-sultanate-fidai-equipment',
  'core-sultanate-house-arsenal',
])
const listed = (article: Article) => !hidden.has(article.id) && !article.canonicalRuleId
const branch = (id: string, label: string, children: ReferenceNode[]): ReferenceBranch => ({
  id,
  label,
  children,
})
export const referenceHref = (id: string, context: Warband, unit?: Unit) =>
  `${ruleHref(id)}/${context.factionId}/${context.variantId ?? '_'}${unit ? `/${unit.id}` : ''}`

export function referenceLeaf(article: Article, context?: Warband, unit?: Unit): ReferenceLeaf {
  return {
    article,
    label:
      unit?.name ??
      (article.id === 'core-court-recruitment' ? 'Семь смертных грехов' : article.title),
    href: context ? referenceHref(article.id, context, unit) : ruleHref(article.id),
    context,
    unit,
  }
}
const articleLeaf = (id: string, context?: Warband) => referenceLeaf(articlesById.get(id)!, context)
const profileLeaves = (context: Warband, mercenaries = false) =>
  factionUnits(catalog, context, mercenaries).map((unit) =>
    referenceLeaf(articlesById.get(unit.ruleId)!, context, unit),
  )

const variantExtras: Partial<Record<string, string[]>> = {
  'knights-of-avarice': ['core-heretic-mammon-quote'],
  'saint-methodius': ['core-pilgrim-anchorite-upgrades'],
  'house-of-wisdom': [
    'core-sultanate-house-secrets',
    'core-sultanate-takwin-recruitment',
    'core-sultanate-alchemical-formulas',
  ],
  'core-antioch-abyssinia': ['core-antioch-abyssinia-lore'],
}
export function variantReferences(variant: Variant) {
  const itemArticles = new Set(
    catalog.offers.filter((o) => o.variantId === variant.id).map((o) => o.ruleId),
  )
  const otherArticles = new Set([
    ...(variantExtras[variant.id] ?? []),
    ...catalog.upgrades.filter((u) => u.variantId === variant.id).map((u) => u.ruleId),
  ])
  const units = new Set(
    catalog.units.filter((u) => u.variantId === variant.id).map((u) => u.ruleId),
  )
  return {
    items: articles.filter((a) => a.id !== variant.ruleId && itemArticles.has(a.id) && listed(a)),
    rules: articles.filter((a) => a.id !== variant.ruleId && otherArticles.has(a.id) && listed(a)),
    ids: new Set([variant.ruleId, ...itemArticles, ...otherArticles, ...units]),
  }
}
const arsenal = (context: Warband) => ({
  ...articleLeaf(catalog.factions.find((f) => f.id === context.factionId)!.arsenalRuleId, context),
  label: 'Арсенал',
  view: 'arsenal' as const,
})
function factionBranch(faction: (typeof catalog.factions)[number]): ReferenceBranch {
  const context = createWarband(catalog, faction.id)
  const variants = catalog.variants.filter((v) => v.factionId === faction.id)
  const variantIds = new Set(variants.flatMap((v) => [...variantReferences(v).ids]))
  const articlesOfFaction = articles.filter(
    (a) =>
      a.category === `faction-${faction.id}` &&
      listed(a) &&
      !variantIds.has(a.id) &&
      a.id !== faction.arsenalRuleId,
  )
  const itemCategory = new Map(catalog.items.map((item) => [item.ruleId, item.category]))
  const localItems = articlesOfFaction.filter((a) => itemCategory.has(a.id))
  if (faction.id === 'heretic') localItems.push(articlesById.get('core-item-tartarus-claws')!)
  const equipment = (label: string, suffix: string, categories: Category[]) =>
    branch(
      `${faction.id}-${suffix}`,
      label,
      localItems
        .filter((a) => categories.includes(itemCategory.get(a.id)!))
        .map((a) => referenceLeaf(a, context)),
    )
  const unitRules = new Set(
    catalog.units.filter((u) => u.factionId === faction.id).map((u) => u.ruleId),
  )
  const special = articlesOfFaction.filter((a) => !itemCategory.has(a.id) && !unitRules.has(a.id))
  return branch(faction.id, faction.name, [
    ...special.map((a) => referenceLeaf(a, context)),
    branch(
      `${faction.id}-equipment`,
      'Экипировка',
      [
        arsenal(context),
        equipment('Оружие', 'weapons', ['ranged', 'melee']),
        equipment('Снаряжение', 'gear', ['equipment']),
        equipment('Броня и щиты', 'armour', ['armour']),
      ].filter((node) => !('children' in node) || node.children.length),
    ),
    branch(`${faction.id}-units`, 'Юниты', profileLeaves(context)),
    branch(`${faction.id}-allies`, 'Союзники и наёмники', profileLeaves(context, true)),
    ...variants.map((variant) => {
      const scope = createWarband(catalog, faction.id, variant.id)
      const parts = variantReferences(variant)
      return branch(`variant-${variant.id}`, variant.name, [
        {
          ...articleLeaf(variant.ruleId, scope),
          label: 'Особые правила варианта фракции',
          view: 'variant',
        },
        ...parts.rules.map((a) => referenceLeaf(a, scope)),
        branch(`${variant.id}-units`, 'Юниты', profileLeaves(scope)),
        branch(`${variant.id}-equipment`, 'Особое снаряжение фракции', [
          arsenal(scope),
          ...parts.items.map((a) => referenceLeaf(a, scope)),
        ]),
        branch(`${variant.id}-allies`, 'Наёмники', profileLeaves(scope, true)),
      ])
    }),
  ])
}
const fromCategory = (category: string) =>
  articles.filter((a) => a.category === category && listed(a)).map((a) => referenceLeaf(a))
const scenarios = articles
  .filter((a) => /^scenario-\d+$/.test(a.category))
  .sort((a, b) => Number(a.category.slice(9)) - Number(b.category.slice(9)))
  .map((a) => referenceLeaf(a))
const weapons = fromCategory('weapons')
const coreRules = fromCategory('rules').filter((node) => node.article.id !== 'core-allies-hiring')
const otherAlliedArticles = fromCategory('allies').filter(
  (node) => !catalog.units.some((u) => u.ruleId === node.article.id),
)

export const referenceTree = [
  branch('rules', 'Основные правила', coreRules),
  branch('keywords', 'Ключевые слова', fromCategory('keywords')),
  branch('equipment', 'Экипировка', [
    branch('weapons', 'Оружие', [
      ...weapons.filter((node) => node.article.originalCategory === 'Дальнобойное оружие'),
      articleLeaf('core-melee-weapons-intro'),
      ...weapons.filter((node) => node.article.originalCategory !== 'Дальнобойное оружие'),
    ]),
    branch(
      'gear',
      'Снаряжение',
      fromCategory('equipment').filter(
        (n) => !['core-melee-weapons-intro', 'core-armour-intro'].includes(n.article.id),
      ),
    ),
    branch('armour', 'Броня и щиты', [articleLeaf('core-armour-intro'), ...fromCategory('armour')]),
  ]),
  branch('factions', 'Фракции', catalog.factions.map(factionBranch)),
  branch('allies', 'Союзники и наёмники', [
    articleLeaf('core-allies-hiring'),
    ...otherAlliedArticles,
  ]),
  branch('scenarios', 'Сценарии', [
    ...fromCategory('scenarios'),
    ...scenarios,
    ...fromCategory('scenario-generator'),
  ]),
]

export function referenceLeaves(nodes: ReferenceNode[]): ReferenceLeaf[] {
  return nodes.flatMap((node) => ('children' in node ? referenceLeaves(node.children) : [node]))
}
export const readingOrder = referenceLeaves(referenceTree)
export const searchableArticles = [
  ...new Map(readingOrder.map(({ article }) => [article.id, article])).values(),
]

export function referencePage(
  id: string,
  factionId?: string,
  variantId?: string,
  unitId?: string,
): ReferenceLeaf | undefined {
  const original = articlesById.get(id)
  const article = original?.canonicalRuleId ? articlesById.get(original.canonicalRuleId) : original
  if (!article) return
  const matched = readingOrder.find(
    (leaf) =>
      leaf.article.id === article.id &&
      (leaf.context?.factionId ?? undefined) === factionId &&
      (leaf.context?.variantId ?? undefined) === variantId &&
      (leaf.unit?.id ?? undefined) === unitId,
  )
  if (matched) return matched
  return readingOrder.find((leaf) => leaf.article.id === article.id) ?? referenceLeaf(article)
}

export function referencePath(nodes: ReferenceNode[], href: string): ReferenceNode[] {
  for (const node of nodes) {
    if ('children' in node) {
      const descendants = referencePath(node.children, href)
      if (descendants.length) return [node, ...descendants]
    } else if (node.href === href) return [node]
  }
  return []
}
