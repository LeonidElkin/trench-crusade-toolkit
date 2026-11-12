import type { Article } from '../domain/schema'

// The reader and preview already render their own accessible article heading.
export function articleBody(markdown: string): string {
  return markdown
    .replace(/^(?:\s*<!--[\s\S]*?-->\s*)+/, '')
    .replace(/^\s*#{1,2}\s+[^\n]*(?:\n|$)/, '')
    .trim()
}

export function articleIntroduction(markdown: string): string {
  return (
    articleBody(markdown)
      .split(/^#{1,6}\s+/m)[0]
      ?.trim() ?? ''
  )
}

export function articleSection(markdown: string, heading: RegExp): string {
  const lines = articleBody(markdown).split('\n')
  const headingAt = (line: string) => {
    const atx = /^(#{1,6})\s+(.+)$/.exec(line)
    if (atx) return { level: atx[1]!.length, title: atx[2]! }
    const bold = /^\*\*([^*]+)\*\*\s*$/.exec(line)
    return bold ? { level: 2, title: bold[1]! } : undefined
  }
  const start = lines.findIndex((line) => {
    const match = headingAt(line)
    return match ? heading.test(match.title) : false
  })
  if (start === -1) return ''
  const level = headingAt(lines[start]!)!.level
  let end = start + 1
  while (end < lines.length) {
    const match = headingAt(lines[end]!)
    if (match && match.level <= level) break
    end++
  }
  return lines
    .slice(start + 1, end)
    .join('\n')
    .trim()
}

export function articleGroups(articles: Article[]): [string, string][] {
  return [...new Map(articles.map((article) => [article.category, article.section])).entries()]
}

export function articleExcerpt(article: Article): string {
  const body = article.text.trim()
  const text = body.startsWith(article.title) ? body.slice(article.title.length).trim() : body
  return text.length > 160 ? `${text.slice(0, 160)}…` : text
}
