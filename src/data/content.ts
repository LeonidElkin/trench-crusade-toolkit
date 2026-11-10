import raw from '../generated/articles.json'
import type { Article } from '../domain/schema'
export const articles = raw as Article[]
export const articlesById = new Map(articles.map((a) => [a.id, a]))
