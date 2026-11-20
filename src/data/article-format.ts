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


export function unitArticle(markdown: string): { body: string; lore: string } {
  const lore: string[] = []
  const parts = articleBody(markdown).split(/\n\s*\n/)
  const firstTable = parts.findIndex((part) => /^\|[^\n]*Движ/iu.test(part))
  let inLore = false
  const body = parts.flatMap((part, index) => {
    if (/^#{2,4}\s+(Описание|Лор)\s*$/iu.test(part)) {
      inLore = true
      return []
    }
    if (inLore && /^#{1,6}\s/m.test(part)) inLore = false
    const explicitLore = /^>\s*\*\*Лор:\*\*/iu.test(part)
    if (inLore || explicitLore || (index < firstTable && /^\*[^*][\s\S]*\*$/u.test(part))) {
      lore.push(part.replace(/^>\s*(?:\*\*Лор:\*\*\s*)?/gmu, ''))
      return []
    }
    if (index === firstTable || /^#{2,4}\s+Профиль характеристик\s*$/iu.test(part)) return []
    if (index < firstTable && /^(?:\*\*)?(?:0[-–]\d+\s+|\d+\s+)?[^\n]*\(Стоимость:/iu.test(part)) {
      const position = part.search(/\(Стоимость:/iu)
      const end = part.indexOf(')', position)
      const rest = end >= 0 ? part.slice(end + 1).replace(/^\*\*/, '').trim() : ''
      return rest ? [rest] : []
    }
    return [part.replace(/^(\*\*)?0\s*[-–]\s*\d+\s+/gmu, '$1')]
  }).join('\n\n').trim()
  return { body, lore: lore.join('\n\n') }
}

export function ruleBody(id: string, markdown: string): string {
  const body = articleBody(markdown)
  if (id === 'core-injuries')
    return body.replace(
      /\*\*Модификаторы к броскам на таблице ранений:\*\*[\s\S]*?(\*\*Цель в состоянии[^\n]+)[\s\S]*?(?=\*\*Без эффекта:)/u,
      '$1\n\n',
    )
  if (id === 'core-activation')
    return body + '\n\nПровал **RISKY ACTION** завершает активацию. После активации всех моделей переходите к [фазе морали](#/rules/core-morale).'
  if (id === 'core-grail-special' || id === 'core-court-recruitment')
    return body.replace(/^Создание отряда\s*\n+У вас есть [^\n]+\s*/mu, '')
  return body
}
