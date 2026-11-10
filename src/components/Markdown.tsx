import { useMemo } from 'react'
import { Marked } from 'marked'
import DOMPurify from 'dompurify'
import { catalog, ruleHref } from '../data/registry'
const parser = new Marked({ gfm: true, breaks: false, async: false })
const keywordMap = new Map(catalog.keywords.map((k) => [k.name, k.ruleId]))
export function Markdown({ content, currentId }: { content: string; currentId?: string }) {
  const html = useMemo(() => {
    const rendered = parser.parse(content, { async: false }) as string
    const doc = new DOMParser().parseFromString(DOMPurify.sanitize(rendered), 'text/html')
    for (const strong of doc.querySelectorAll('strong')) {
      const text = strong.textContent?.trim() ?? ''
      const key = text.replace(/^[+]\d+\s*DICE$/, '+DICE').replace(/^-\d+\s*DICE$/, '-DICE')
      const target = keywordMap.get(key)
      if (target && target !== currentId && !strong.closest('a')) {
        const anchor = doc.createElement('a')
        anchor.href = ruleHref(target)
        anchor.className = 'keyword-link'
        anchor.textContent = text
        strong.replaceChildren(anchor)
      }
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
  }, [content, currentId])
  return <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
}
