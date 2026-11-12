import { useMemo } from 'react'
import { Marked } from 'marked'
import DOMPurify from 'dompurify'
import { catalog, ruleHref } from '../data/registry'
const parser = new Marked({ gfm: true, breaks: false, async: false })
const keywordMap = new Map(catalog.keywords.map((k) => [k.name, k.ruleId]))
const keywordPattern = new RegExp(
  `(?<![\\p{L}\\p{N}_])(?:${[...keywordMap.keys()]
    .sort((a, b) => b.length - a.length)
    .map((name) => {
      if (name === '+DICE') return '\\+\\s*(?:\\d+\\s*)?DICE'
      if (name === '-DICE') return '[-−]\\s*(?:\\d+\\s*)?DICE'
      if (name === 'BLAST (X)' || name === 'LIMIT (X)')
        return `${name.split(' ')[0]}\\s*\\(\\s*(?:\\d+|X|D\\d+)\\s*\\)`
      return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('|')})(?![\\p{L}\\p{N}_])`,
  'gu',
)
export function Markdown({
  content,
  currentId,
  minimumHeadingLevel = 2,
}: {
  content: string
  currentId?: string
  minimumHeadingLevel?: 2 | 3 | 4
}) {
  const html = useMemo(() => {
    const rendered = parser.parse(content, { async: false }) as string
    const doc = new DOMParser().parseFromString(DOMPurify.sanitize(rendered), 'text/html')
    for (const heading of doc.querySelectorAll('h1, h2, h3')) {
      const level = Number(heading.tagName.slice(1))
      if (level >= minimumHeadingLevel) continue
      const replacement = doc.createElement(`h${minimumHeadingLevel}`)
      replacement.append(...heading.childNodes)
      heading.replaceWith(replacement)
    }
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    while (walker.nextNode()) nodes.push(walker.currentNode as Text)
    for (const node of nodes) {
      if (node.parentElement?.closest('a, code, pre')) continue
      const text = node.textContent ?? ''
      const matches = [...text.matchAll(keywordPattern)]
      if (!matches.length) continue
      const fragment = doc.createDocumentFragment()
      let cursor = 0
      for (const match of matches) {
        fragment.append(text.slice(cursor, match.index))
        const term = match[0]
        const key = term
          .replace(/^[+]\s*\d*\s*DICE$/, '+DICE')
          .replace(/^[-−]\s*\d*\s*DICE$/, '-DICE')
          .replace(/^(BLAST|LIMIT)\s*\([^)]*\)$/, '$1 (X)')
        const target = keywordMap.get(key)
        const strong = doc.createElement('strong')
        if (target && target !== currentId) {
          const anchor = doc.createElement('a')
          anchor.href = ruleHref(target)
          anchor.className = 'keyword-link'
          anchor.textContent = term
          strong.append(anchor)
        } else strong.textContent = term
        if (node.parentElement?.closest('strong')) fragment.append(...strong.childNodes)
        else fragment.append(strong)
        cursor = match.index + term.length
      }
      fragment.append(text.slice(cursor))
      node.replaceWith(fragment)
    }
    for (const table of doc.querySelectorAll('table')) {
      const wrapper = doc.createElement('div')
      wrapper.className = 'table-scroll'
      wrapper.tabIndex = 0
      wrapper.setAttribute('role', 'region')
      wrapper.setAttribute('aria-label', 'Таблица правил, прокручивается по горизонтали')
      table.replaceWith(wrapper)
      wrapper.append(table)
    }
    return DOMPurify.sanitize(doc.body.innerHTML)
  }, [content, currentId, minimumHeadingLevel])
  return <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
}
