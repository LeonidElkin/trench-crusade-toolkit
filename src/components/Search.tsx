import { useMemo, useState } from 'react'
import { Search, ArrowUpRight } from 'lucide-react'
import { ruleHref } from '../data/registry'
import { articles } from '../data/content'
import { createSearchIndex, searchArticles } from '../domain/search'
import { Modal, Source } from './Common'
const index = createSearchIndex(articles)
export function SearchDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => searchArticles(index, query, '', query ? 40 : 8), [query])
  return (
    <Modal title="Поиск в полевом архиве" onClose={onClose} wide>
      <div className="search-field large">
        <Search size={20} />
        <input
          autoFocus
          aria-label="Поиск по всем правилам"
          placeholder="Правило, боец или ключевое слово…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <kbd>ESC</kbd>
      </div>
      <p className="muted small">
        {query
          ? `Найдено материалов: ${results.length}${results.length === 40 ? '+' : ''}`
          : 'Начните вводить название или фрагмент правила'}
      </p>
      <div className="search-results">
        {results.map((a) => (
          <a key={a.id} href={ruleHref(a.id)} onClick={onClose}>
            <div>
              <span className="eyebrow">{a.section}</span>
              <h3>{a.title}</h3>
              <Source source={a} />
              <p>{a.text.slice(0, 180)}…</p>
            </div>
            <ArrowUpRight size={20} />
          </a>
        ))}
        {!results.length && (
          <p className="empty-text">
            Ничего не найдено. Попробуйте часть названия или термин на английском.
          </p>
        )}
      </div>
    </Modal>
  )
}
