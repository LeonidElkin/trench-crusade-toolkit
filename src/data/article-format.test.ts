import { describe, expect, it } from 'vitest'
import type { Article } from '../domain/schema'
import {
  articleBody,
  articleExcerpt,
  articleGroups,
  articleIntroduction,
  articleSection,
} from './article-format'

describe('authored article presentation', () => {
  it('renders one reader title while preserving the full body and table', () => {
    const body =
      'Условия найма.\n\n## Экипировка\n\n| Предмет | Правило |\n| --- | --- |\n| Меч | **HEAVY** |'
    expect(articleBody(`<!-- provenance -->\n# Профиль\n\n${body}`)).toBe(body)
    expect(articleIntroduction(`# Профиль\n\n${body}`)).toBe('Условия найма.')
    expect(articleBody(body)).toBe(body)
  })

  it('keeps complete equipment restrictions in both authored heading formats', () => {
    const restrictions =
      'Разрешено только оружие ближнего боя.\n\nНельзя изменять броню; требуется ручная сверка.'
    for (const [heading, next] of [
      ['## Экипировка', '## Способности'],
      ['**Экипировка**', '**Способности**'],
    ]) {
      expect(
        articleSection(
          `# Профиль\n\n${heading}\n\n${restrictions}\n\n${next}\n\n**FEAR**`,
          /экипировка/i,
        ),
      ).toBe(restrictions)
    }
  })

  it('includes new and scenario categories without a fixed category vocabulary', () => {
    const articles = [
      { category: 'new-category', section: 'Новый раздел' },
      { category: 'scenario-9', section: 'Сценарий 9' },
    ] as Article[]
    expect(articleGroups(articles)).toEqual([
      ['new-category', 'Новый раздел'],
      ['scenario-9', 'Сценарий 9'],
    ])
    expect(
      articleExcerpt({
        title: 'Отсутствующий заголовок',
        text: 'Полный начальный текст.',
      } as Article),
    ).toBe('Полный начальный текст.')
  })
})
