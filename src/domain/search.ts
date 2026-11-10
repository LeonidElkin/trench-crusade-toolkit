import type { Article } from './schema'
export const normalizeSearch = (value: string) =>
  value
    .toLocaleLowerCase('ru')
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}+-]+/gu, ' ')
    .trim()
export interface SearchEntry {
  article: Article
  title: string
  text: string
}
export const createSearchIndex = (articles: Article[]): SearchEntry[] =>
  articles.map((article) => ({
    article,
    title: normalizeSearch(article.title),
    text: normalizeSearch(article.text),
  }))
export function searchArticles(
  index: SearchEntry[],
  query: string,
  category = '',
  limit = 60,
): Article[] {
  const tokens = normalizeSearch(query).split(/\s+/).filter(Boolean)
  return index
    .filter(
      (e) =>
        !category ||
        e.article.category === category ||
        e.article.category.startsWith(category + '-'),
    )
    .map((e) => ({
      ...e,
      score: tokens.reduce(
        (score, token) =>
          score + (e.title.includes(token) ? 15 : e.text.includes(token) ? 1 : -1000),
        0,
      ),
    }))
    .filter((e) => e.score >= 0)
    .sort((a, b) => b.score - a.score || a.article.pages[0]! - b.article.pages[0]!)
    .slice(0, limit)
    .map((e) => e.article)
}
