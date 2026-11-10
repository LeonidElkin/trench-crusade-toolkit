import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronRight,
  Copy,
  Search,
  Printer,
  BookOpen,
} from 'lucide-react'
import { catalog, ruleHref } from '../data/registry'
import { articles, articlesById } from '../data/content'
import { createSearchIndex, searchArticles } from '../domain/search'
import { Markdown } from '../components/Markdown'
import { RuleLink, Source } from '../components/Common'
import { UnitPortrait } from '../components/UnitPortrait'
const index = createSearchIndex(articles)
const groups = [...new Map(articles.map((a) => [a.category, a.section])).entries()]
const commonGroups = [
  { id: '', name: 'Все материалы' },
  { id: 'rules', name: 'Основные правила' },
  { id: 'keywords', name: 'Ключевые слова' },
  { id: 'ranged', name: 'Оружие' },
  { id: 'allies', name: 'Наёмники' },
]
export function Rules({ articleId }: { articleId?: string }) {
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState(''),
    [bookmarks, setBookmarks] = useState<string[]>(() => {
      try {
        const value: unknown = JSON.parse(localStorage.getItem('trench-toolkit.bookmarks') ?? '[]')
        return Array.isArray(value) && value.every((v) => typeof v === 'string') ? value : []
      } catch {
        return []
      }
    }),
    [onlyBookmarks, setOnlyBookmarks] = useState(false)
  const article = articleId ? articlesById.get(articleId) : undefined
  const results = useMemo(
    () =>
      searchArticles(
        onlyBookmarks ? index.filter((e) => bookmarks.includes(e.article.id)) : index,
        query,
        category,
        query || category || onlyBookmarks ? 500 : 60,
      ),
    [query, category, bookmarks, onlyBookmarks],
  )
  const keyword = article ? catalog.keywords.find((k) => k.ruleId === article.id) : undefined
  const profile = article ? catalog.units.find((u) => u.ruleId === article.id) : undefined
  const related = article
    ? [...catalog.items, ...catalog.units, ...catalog.upgrades].filter((i) =>
        keyword
          ? i.keywords.some(
              (k) => k === keyword.name || (keyword.name === 'BLAST (X)' && k.startsWith('BLAST')),
            )
          : i.ruleId === article.id,
      )
    : []
  const sameSection = article ? articles.filter((a) => a.category === article.category) : []
  function toggleBookmark(id: string) {
    const next = bookmarks.includes(id) ? bookmarks.filter((x) => x !== id) : [...bookmarks, id]
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
  return (
    <div className="rules-layout">
      <aside className="rules-sidebar">
        <div className="sidebar-title">
          <BookOpen size={18} />
          ПОЛЕВОЙ СПРАВОЧНИК
        </div>
        <a className={!articleId ? 'sidebar-all active' : 'sidebar-all'} href="#/rules">
          Все материалы<span>{articles.length}</span>
        </a>
        {groups
          .filter(([id]) => !id.startsWith('scenario-') || id === 'scenario-generator')
          .map(([id, name]) => (
            <details key={id} open={article?.category === id || undefined}>
              <summary>
                {name}
                <ChevronRight size={14} />
              </summary>
              <div>
                {articles
                  .filter((a) => a.category === id)
                  .map((a) => (
                    <a
                      className={a.id === articleId ? 'active' : ''}
                      href={ruleHref(a.id)}
                      key={a.id}
                    >
                      {a.title}
                    </a>
                  ))}
              </div>
            </details>
          ))}
        <details>
          <summary>
            Сценарии
            <ChevronRight size={14} />
          </summary>
          <div>
            {groups
              .filter(([id]) => /^scenario-\d/.test(id))
              .map(([id, name]) => (
                <a key={id} href={ruleHref(articles.find((a) => a.category === id)!.id)}>
                  {name}
                </a>
              ))}
          </div>
        </details>
        <div className="sidebar-foot">
          Редакция 1.6.3
          <br />
          Русский перевод · 190 страниц
        </div>
      </aside>
      <div className="rules-main">
        {article ? (
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
                  onClick={() => {
                    void navigator.clipboard.writeText(window.location.href)
                  }}
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
              СПРАВОЧНИК
              <ChevronRight size={12} />
              {article.section}
            </div>
            <article className="rule-article">
              <h1>{article.title}</h1>
              <div className="article-meta">
                <span className="edition-pill">1.6.3</span>
                <Source source={article} />
              </div>
              {profile && (
                <UnitPortrait
                  editionId={catalog.edition}
                  unitId={profile.id}
                  name={profile.name}
                  zoom
                  className="rule-portrait"
                />
              )}
              <Markdown
                content={article.markdown.replace(/^<!--.*?-->\s*##[^\n]*\n/s, '')}
                currentId={article.id}
              />
            </article>
            {related.length > 0 && (
              <div className="related-panel">
                <span className="eyebrow">СВЯЗАННЫЕ СУЩНОСТИ</span>
                {related.map((i) => (
                  <div key={i.id}>
                    <RuleLink id={i.ruleId}>{i.name}</RuleLink>
                  </div>
                ))}
              </div>
            )}
            <div className="related-panel">
              <span className="eyebrow">В ЭТОМ РАЗДЕЛЕ</span>
              <div className="related-links">
                {sameSection
                  .filter((a) => a.id !== article.id)
                  .slice(0, 24)
                  .map((a) => (
                    <RuleLink id={a.id} key={a.id}>
                      {a.title}
                    </RuleLink>
                  ))}
              </div>
            </div>
            <div className="reader-source">
              <Check size={15} />
              Текст из предоставленных PDF. <a href="#/about">Примечания к источникам</a>
            </div>
          </>
        ) : (
          <>
            <div className="page-heading">
              <span className="eyebrow">АРХИВ ВЕЛИКОЙ ВОЙНЫ</span>
              <h1>Справочник правил</h1>
              <p>Найдите ответ, пока противник готовит следующий ход.</p>
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
              {commonGroups.map((g) => (
                <button
                  className={category === g.id ? 'active' : ''}
                  key={g.id}
                  onClick={() => setCategory(g.id)}
                >
                  {g.name}
                </button>
              ))}
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
                {groups.map(([id, name]) => (
                  <option value={id} key={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <div className="results-heading">
              <span className="eyebrow">{query ? 'РЕЗУЛЬТАТЫ ПОИСКА' : 'МАТЕРИАЛЫ АРХИВА'}</span>
              <span>
                {results.length}
                {!query && !category ? ' из ' + articles.length : ''}
              </span>
            </div>
            <div className="rule-results">
              {results.map((a) => (
                <a key={a.id} href={ruleHref(a.id)}>
                  <div>
                    <span className="eyebrow">{a.section}</span>
                    <h2>{a.title}</h2>
                    <p>
                      {a.text.slice(
                        a.text.indexOf(a.title) + a.title.length,
                        a.text.indexOf(a.title) + a.title.length + 160,
                      )}
                      …
                    </p>
                    <Source source={a} />
                  </div>
                  <ChevronRight size={20} />
                </a>
              ))}
            </div>
            {!results.length && (
              <div className="empty-text">
                Материалы не найдены. Попробуйте другой запрос или раздел.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
