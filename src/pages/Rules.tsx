import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookOpen,
  ChevronRight,
  Copy,
  Printer,
  Search,
} from 'lucide-react'
import { catalog, ruleHref } from '../data/registry'
import { articlesById } from '../data/content'
import {
  readingOrder,
  referenceHref,
  referenceLeaves,
  referencePage,
  referencePath,
  referenceTree,
  searchableArticles,
  type ReferenceNode,
} from '../data/reference-navigation'
import { articleExcerpt, ruleBody, unitArticle } from '../data/article-format'
import { createSearchIndex, searchArticles } from '../domain/search'
import { factionUnits, getVariant } from '../domain/warband'
import { Markdown } from '../components/Markdown'
import { RuleLink, Source } from '../components/Common'
import { UnitPortrait } from '../components/UnitPortrait'
import { UnitLore, UnitProfileStats, UnitQuantity, UnitRuleLinks } from '../components/UnitDetails'
import { Arsenal } from '../components/Arsenal'

const index = createSearchIndex(searchableArticles)

function Contents({
  nodes,
  active,
  open,
}: {
  nodes: ReferenceNode[]
  active?: string
  open: ReferenceNode[]
}) {
  return nodes.map((node) =>
    'children' in node ? (
      <details key={node.id} open={open.includes(node) || undefined}>
        <summary>
          {node.label}
          <ChevronRight size={14} />
        </summary>
        <div>
          {node.children.length ? (
            <Contents nodes={node.children} active={active} open={open} />
          ) : (
            <span className="small muted">Доступных профилей нет.</span>
          )}
        </div>
      </details>
    ) : (
      <a
        key={node.href}
        className={node.href === active ? 'active' : undefined}
        aria-current={node.href === active ? 'page' : undefined}
        href={node.href}
      >
        {node.unit ? <strong>{node.label}</strong> : node.label}
      </a>
    ),
  )
}

export function Rules({
  articleId,
  factionId,
  variantId,
  unitId,
}: {
  articleId?: string
  factionId?: string
  variantId?: string
  unitId?: string
}) {
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState('')
  const [onlyBookmarks, setOnlyBookmarks] = useState(false)
  const [bookmarks, setBookmarks] = useState<string[]>(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem('trench-toolkit.bookmarks') ?? '[]')
      return Array.isArray(value) && value.every((v) => typeof v === 'string') ? value : []
    } catch {
      return []
    }
  })
  const leaf = articleId ? referencePage(articleId, factionId, variantId, unitId) : undefined
  const article = leaf?.article
  const unit = leaf?.unit
  const path = leaf ? referencePath(referenceTree, leaf.href) : []
  const position = leaf ? readingOrder.indexOf(leaf) : -1
  const next = position >= 0 ? readingOrder[position + 1] : undefined
  const section = path.at(-2)
  const results = useMemo(() => {
    const group = referenceTree.find((node) => node.id === category)
    const ids = group && new Set(referenceLeaves([group]).map((node) => node.article.id))
    const scoped = index.filter(
      ({ article }) =>
        (!ids || ids.has(article.id)) && (!onlyBookmarks || bookmarks.includes(article.id)),
    )
    return query.trim()
      ? searchArticles(scoped, query, '', scoped.length)
      : scoped.slice(0, group || onlyBookmarks ? scoped.length : 60).map((entry) => entry.article)
  }, [bookmarks, category, onlyBookmarks, query])

  const keyword = article && catalog.keywords.find((k) => k.ruleId === article.id)
  const related = article
    ? [
        ...new Set(
          [...catalog.items, ...catalog.units, ...catalog.upgrades]
            .filter((entity) =>
              keyword
                ? entity.keywords.some(
                    (key) =>
                      key === keyword.name ||
                      (keyword.name === 'BLAST (X)' && key.startsWith('BLAST')),
                  )
                : 'linkedRuleIds' in entity && entity.linkedRuleIds.includes(article.id),
            )
            .map((entity) => entity.ruleId),
        ),
      ]
        .filter((id) => id !== article.id && !articlesById.get(id)?.canonicalRuleId)
        .map((id) => articlesById.get(id)!)
        .filter(Boolean)
    : []
  const memberLinks =
    section && 'children' in section
      ? section.children
          .filter((entry) => !('children' in entry) && entry.href !== leaf?.href)
          .slice(0, 24)
      : []

  function toggleBookmark(id: string) {
    const next = bookmarks.includes(id)
      ? bookmarks.filter((value) => value !== id)
      : [...bookmarks, id]
    setBookmarks(next)
    try {
      localStorage.setItem('trench-toolkit.bookmarks', JSON.stringify(next))
    } catch {
      /* Bookmarks remain available for this tab. */
    }
  }
  if (articleId && !article)
    return (
      <div className="empty-state">
        <BookOpen size={40} />
        <h1>Материал не найден</h1>
        <a href="#/rules" className="button button-primary">
          Открыть справочник
        </a>
      </div>
    )

  const context = leaf?.context
  const variant = context && getVariant(catalog, context)
  const unitVariant = variant && unit && leaf?.view !== 'variant'
  const title =
    unit?.name ??
    (leaf?.view === 'arsenal' && variant
      ? `Арсенал · ${variant.name}`
      : article?.id === 'core-court-recruitment'
        ? 'Семь смертных грехов'
        : article?.title)
  return (
    <div className="rules-layout">
      <aside className="rules-sidebar" aria-label="Оглавление">
        <div className="sidebar-title">
          <BookOpen size={18} />
          ОГЛАВЛЕНИЕ
        </div>
        <a className={!articleId ? 'sidebar-all active' : 'sidebar-all'} href="#/rules">
          Все материалы<span>{searchableArticles.length}</span>
        </a>
        <Contents nodes={referenceTree} active={leaf?.href} open={path} />
      </aside>
      <div className="rules-main">
        <details className="mobile-reference rules-sidebar" key={leaf?.href ?? 'index'}>
          <summary>
            <BookOpen size={16} />
            Оглавление
            <ChevronRight size={14} />
          </summary>
          <div>
            <Contents nodes={referenceTree} active={leaf?.href} open={path} />
          </div>
        </details>
        {article && leaf ? (
          <>
            <div className="reader-toolbar">
              <a className="back-link" href="#/rules">
                <ArrowLeft size={15} />К справочнику
              </a>
              <div className="reader-actions">
                <button
                  className={`icon-button ${bookmarks.includes(article.id) ? 'selected' : ''}`}
                  aria-label={
                    bookmarks.includes(article.id) ? 'Удалить закладку' : 'Добавить закладку'
                  }
                  onClick={() => toggleBookmark(article.id)}
                >
                  <Bookmark
                    size={18}
                    fill={bookmarks.includes(article.id) ? 'currentColor' : 'none'}
                  />
                </button>
                <button
                  className="icon-button"
                  aria-label="Копировать ссылку на правило"
                  onClick={() => void navigator.clipboard.writeText(window.location.href)}
                >
                  <Copy size={18} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Распечатать правило"
                  onClick={() => window.print()}
                >
                  <Printer size={18} />
                </button>
              </div>
            </div>
            <div className="reader-breadcrumb">
              {path.slice(0, -1).map((entry) => (
                <span key={entry.label}>{entry.label}</span>
              ))}
            </div>
            <article className="rule-article">
              <h1>{title}</h1>
              <div className="article-meta">
                <span className="edition-pill">1.6.3</span>
                <Source source={article} />
              </div>
              {unit && (
                <>
                  <UnitPortrait
                    editionId={catalog.edition}
                    unitId={unit.id}
                    name={unit.name}
                    zoom
                    className="rule-portrait"
                  />
                  <UnitQuantity unit={unit} cost />
                  <UnitProfileStats unit={unit} />
                  <div className="tags">
                    {unit.keywords.map((key) => (
                      <strong key={key} className="tag">
                        {key}
                      </strong>
                    ))}
                  </div>
                  <UnitRuleLinks c={catalog} unit={unit} currentId={article.id} />
                </>
              )}
              {context && leaf.view === 'arsenal' ? (
                <Arsenal c={catalog} band={context} />
              ) : (
                <Markdown
                  content={
                    unit
                      ? unitArticle(article.markdown).body
                      : ruleBody(article.id, article.markdown)
                  }
                  currentId={article.id}
                />
              )}
              {unitVariant && context && variant.ruleId !== article.id && (
                <a className="text-link" href={referenceHref(variant.ruleId, context)}>
                  {variant.name} · особые правила
                </a>
              )}
              {unit && <UnitLore unit={unit} />}
              {leaf.view === 'variant' && context && variant && (
                <div className="variant-reference">
                  <h2>Юниты</h2>
                  <ul>
                    {factionUnits(catalog, context).map((profile) => (
                      <li key={profile.id}>
                        <a href={referenceHref(profile.ruleId, context, profile)}>{profile.name}</a>
                        <UnitQuantity unit={profile} />
                      </li>
                    ))}
                  </ul>
                  <h2>Особое снаряжение фракции</h2>
                  <Arsenal c={catalog} band={context} specialOnly />
                  <h2>Наёмники</h2>
                  <ul>
                    {factionUnits(catalog, context, true).map((profile) => (
                      <li key={profile.id}>
                        <a href={referenceHref(profile.ruleId, context, profile)}>{profile.name}</a>
                      </li>
                    ))}
                  </ul>
                  {!factionUnits(catalog, context, true).length && <p>Доступных наёмников нет.</p>}
                </div>
              )}
            </article>
            {related.length > 0 && (
              <div className="related-panel">
                <span className="eyebrow">СВЯЗАННЫЕ СУЩНОСТИ</span>
                <div className="related-links">
                  {related.map((entry) => (
                    <RuleLink key={entry.id} id={entry.id}>
                      {entry.title}
                    </RuleLink>
                  ))}
                </div>
              </div>
            )}
            {memberLinks.length > 0 && (
              <div className="related-panel">
                <span className="eyebrow">В ЭТОМ РАЗДЕЛЕ</span>
                <div className="related-links">
                  {memberLinks.map(
                    (entry) =>
                      !('children' in entry) && (
                        <a className="text-link" key={entry.href} href={entry.href}>
                          {entry.label}
                        </a>
                      ),
                  )}
                </div>
              </div>
            )}
            <div className="reader-next">
              {next && next.href !== leaf.href ? (
                <a className="button button-primary" href={next.href}>
                  <span>
                    Следующий раздел <strong>{next.label}</strong>
                  </span>
                  <ArrowRight size={18} />
                </a>
              ) : (
                <a className="button button-outline" href="#/rules">
                  Вернуться к оглавлению
                  <ArrowRight size={18} />
                </a>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="page-heading">
              <span className="eyebrow">АРХИВ ВЕЛИКОЙ ВОЙНЫ</span>
              <h1>Справочник правил</h1>
            </div>
            <div className="search-field large">
              <Search size={21} />
              <input
                aria-label="Поиск в справочнике"
                placeholder="Название, ключевое слово или фрагмент правила…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  className="icon-button"
                  onClick={() => setQuery('')}
                  aria-label="Очистить поиск"
                >
                  ×
                </button>
              )}
            </div>
            <div className="filter-chips">
              <button className={!category ? 'active' : ''} onClick={() => setCategory('')}>
                Все материалы
              </button>
              <button
                className={onlyBookmarks ? 'active' : ''}
                onClick={() => setOnlyBookmarks(!onlyBookmarks)}
              >
                <Bookmark size={14} />
                Закладки
              </button>
            </div>
            <label className="select-label">
              Раздел
              <select
                aria-label="Раздел справочника"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">Все разделы</option>
                {referenceTree.map((group) => (
                  <option value={group.id} key={group.id}>
                    {group.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="results-heading">
              <span className="eyebrow">{query ? 'РЕЗУЛЬТАТЫ ПОИСКА' : 'МАТЕРИАЛЫ АРХИВА'}</span>
              <span>
                {results.length}
                {!query && !category && !onlyBookmarks ? ` из ${searchableArticles.length}` : ''}
              </span>
            </div>
            <div className="rule-results">
              {results.map((entry) => (
                <a key={entry.id} href={referencePage(entry.id)?.href ?? ruleHref(entry.id)}>
                  <div>
                    <span className="eyebrow">{entry.section}</span>
                    <h2>
                      {entry.id === 'core-court-recruitment' ? 'Семь смертных грехов' : entry.title}
                    </h2>
                    <p>{articleExcerpt(entry)}</p>
                    <Source source={entry} />
                  </div>
                  <ChevronRight size={20} />
                </a>
              ))}
            </div>
            {!results.length && <div className="empty-text">Материалы не найдены.</div>}
          </>
        )}
      </div>
    </div>
  )
}
