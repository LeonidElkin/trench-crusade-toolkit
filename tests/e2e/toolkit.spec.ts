import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
async function createBand(page: Page, name: string, faction = 'heretic', variant = '') {
  await page.goto('./#/warbands')
  await page.getByRole('button', { name: 'Создать отряд', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: 'Название нового отряда' }).fill(name)
  await dialog.getByRole('combobox', { name: 'Фракция нового отряда' }).selectOption(faction)
  if (variant)
    await dialog.getByRole('combobox', { name: 'Вариант нового отряда' }).selectOption(variant)
  await dialog.getByRole('button', { name: 'Создать отряд', exact: true }).click()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
}
async function addUnit(page: Page, name: string) {
  await page.getByRole('button', { name: 'Добавить бойца', exact: true }).click()
  await page.getByRole('button', { name: `Добавить: ${name}`, exact: true }).click()
  await expect(page.locator('.fighter-editor')).toBeVisible()
}
test('finds a keyword, follows contextual rules and deep links directly', async ({ page }) => {
  await page.goto('./#/rules')
  await page.getByRole('textbox', { name: 'Поиск в справочнике', exact: true }).fill('HEAVY')
  await page
    .locator('.rule-results')
    .getByRole('link', { name: /^Ключевые слова HEAVY/ })
    .click()
  await expect(page.getByRole('heading', { name: 'HEAVY', exact: true })).toBeVisible()
  await expect(page.locator('.article-meta')).toContainText('стр. 13')
  const url = page.url()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'HEAVY', exact: true })).toBeVisible()
  expect(page.url()).toBe(url)
  await page.getByRole('button', { name: 'Добавить закладку' }).click()
  await page.getByRole('link', { name: 'К справочнику', exact: true }).click()
  await page.getByRole('button', { name: 'Закладки', exact: true }).click()
  await expect(page.locator('.rule-results h2')).toContainText(['HEAVY'])
})
test('navigates all six faction dossiers', async ({ page }) => {
  await page.goto('./#/factions')
  for (const name of [
    'Легион Еретиков',
    'Паломники Траншей',
    'Железный Султанат',
    'Новое Антиохийское Княжество',
    'Культ Чёрного Грааля',
    'Двор Семиглавого Змея',
  ]) {
    if (name === 'Легион Еретиков')
      await page
        .locator('.faction-card')
        .filter({ has: page.getByRole('heading', { name, exact: true }) })
        .click()
    else await page.locator('.faction-tabs').getByRole('link', { name, exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible()
    expect(await page.locator('.unit-card').count()).toBeGreaterThan(5)
  }
})
test('calculates exact action and injury probabilities with cancellation', async ({ page }) => {
  await page.goto('./#/calculator')
  await expect(page.locator('.probability-value')).toHaveText(['41,67%', '55,56%', '2,78%'])
  await page.getByRole('button', { name: 'Увеличить +DICE', exact: true }).click()
  await expect(page.locator('.probability-value').last()).toHaveText('7,41%')
  await page.getByRole('button', { name: 'Увеличить −DICE', exact: true }).click()
  await expect(page.locator('.probability-value')).toHaveText(['41,67%', '55,56%', '2,78%'])
  await page.getByRole('tab', { name: /Таблица ранений/ }).click()
  await expect(page.locator('.probability-value')).toHaveText([
    '0,00%',
    '41,67%',
    '30,56%',
    '27,78%',
  ])
  await page.getByRole('spinbutton', { name: 'Отрицательный модификатор', exact: true }).fill('3')
  await expect(page.locator('.probability-value').first()).toHaveText('16,67%')
})
test('creates a six-model band, equips, diagnoses, saves, restores, exports and imports', async ({
  page,
}) => {
  const name = 'Последняя литания — E2E'
  await createBand(page, name)
  await page.getByRole('button', { name: /^Проверка/ }).click()
  await expect(page.locator('.diagnostic-error')).toContainText(['Священник Еретиков'])
  await page.getByRole('button', { name: /^Состав/ }).click()
  await addUnit(page, 'Священник Еретиков')
  await page.getByRole('textbox', { name: 'Имя бойца', exact: true }).fill('Отец Севериан')
  await page.getByRole('button', { name: 'Купить: Винтовка', exact: true }).click()
  await page.getByRole('tab', { name: 'Броня', exact: true }).click()
  await page.getByRole('button', { name: 'Купить: Стандартная броня', exact: true }).click()
  await page.getByRole('button', { name: 'Способности и правила профиля', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('dialog').locator('.prose')).toContainText('Хозяин Марионеток')
  await page.getByRole('button', { name: 'Закрыть окно', exact: true }).click()
  for (let n = 0; n < 3; n++) {
    await addUnit(page, 'Пехота Еретиков')
    await page.getByRole('button', { name: 'Купить: Винтовка', exact: true }).click()
  }
  await page.getByRole('checkbox', { name: 'Легионер: ближний бой', exact: true }).check()
  await addUnit(page, 'Помазанная Тяжёлая Пехота')
  await addUnit(page, 'Еретический Коммандос Смерти')
  await page.getByLabel('Показать недоступные покупки').check()
  await page.getByRole('button', { name: 'Купить: Винтовка', exact: true }).click()
  await page.getByRole('button', { name: /^Проверка/ }).click()
  await expect(page.locator('.diagnostic-error')).toContainText(['недоступен этому бойцу'])
  await page.getByRole('button', { name: /^Состав/ }).click()
  await page.getByRole('button', { name: 'Снять: Винтовка', exact: true }).click()
  await expect(page.locator('.warband-meta')).toContainText('6 бойцов')
  const bandURL = page.url()
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('trench-toolkit.warbands.v1') ?? '{}'),
  )
  expect(saved.warbands[0].units).toHaveLength(6)
  expect(saved.warbands[0].revision).toBe('ru-1.6.3-r1')
  await page.reload()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  await expect(page.locator('.warband-meta')).toContainText('6 бойцов')
  const pendingDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Экспортировать отряд', exact: true }).click()
  const download = await pendingDownload,
    file = await download.path()
  const text = await readFile(file!, 'utf8'),
    parsed = JSON.parse(text)
  expect(parsed.format).toBe('trench-crusade-warband')
  expect(parsed.warband.units).toHaveLength(6)
  await page.getByRole('link', { name: 'Мои отряды', exact: true }).last().click()
  await page.getByRole('button', { name: 'Импорт', exact: true }).click()
  await page.getByLabel('Файл отряда', { exact: true }).setInputFiles(file!)
  await expect(page.getByRole('textbox', { name: 'JSON для импорта' })).toHaveValue(text)
  await page.getByRole('button', { name: 'Импортировать отряд', exact: true }).click()
  await expect(page.locator('.warband-meta')).toContainText('6 бойцов')
  expect(page.url()).not.toBe(bandURL)
  await page.getByRole('button', { name: 'Поделиться отрядом', exact: true }).click()
  const share = await page.getByRole('textbox', { name: 'Ссылка на отряд' }).inputValue()
  await page.getByRole('button', { name: 'Закрыть окно', exact: true }).click()
  await page.goto(share)
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Импортировать отряд', exact: true }).click()
  await expect(page.locator('.warband-meta')).toContainText('6 бойцов')
})
test('preserves variant currency and rejects malformed import', async ({ page }) => {
  await createBand(page, 'Кавалькада E2E', 'pilgrims', 'plague')
  await addUnit(page, 'Коммуникант')
  await expect(page.locator('.budget-strip')).toContainText('3 Славы')
  await page.goto('./#/warbands')
  await page.getByRole('button', { name: 'Импорт', exact: true }).click()
  await page.getByRole('textbox', { name: 'JSON для импорта' }).fill('{"version":99}')
  await page.getByRole('button', { name: 'Импортировать отряд', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('не поддерживается')
})
test('has no page overflow on five viewport sizes and keeps tables locally scrollable', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Viewport sweep is run once')
  const keyword = 'core-heavy'
  for (const [width, height] of [
    [1440, 1000],
    [1280, 800],
    [834, 1112],
    [390, 844],
    [320, 740],
  ]) {
    await page.setViewportSize({ width: width!, height: height! })
    for (const route of ['', 'calculator', 'factions/heretic', `rules/${keyword}`]) {
      await page.goto(`./#/${route}`)
      await expect(page.locator('main h1').first()).toBeVisible()
      const size = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        viewport: innerWidth,
      }))
      expect(size.scroll, `${width}: ${route}`).toBeLessThanOrEqual(size.viewport)
    }
    await page.goto('./#/')
    await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`), fullPage: true })
  }
})
