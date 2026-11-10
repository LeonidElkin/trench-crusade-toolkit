# Сборка и GitHub Pages

Целевой репозиторий — только `LeonidElkin/trench-crusade-toolkit`. Основная ветка `main`, прямой обычный push разрешён. Не использовать force push и не менять глобальную конфигурацию аккаунта.

```sh
npm ci
APP_BASE_PATH=/trench-crusade-toolkit/ npm run check
npm run test:e2e
```

Preview обязан использовать тот же base, что и сборка. Это уже настроено в Playwright config. Для отдельного запуска: `npm run preview -- --base /trench-crusade-toolkit/ --port 4173`.

Workflow `.github/workflows/pages.yml`:

1. `verify`: lint, типы, схемы/ссылки, unit, build, аудит текста, Chromium E2E. Сохраняет browser evidence.
2. `deploy`: после verify публикует артефакт Pages, только для main. Выделенные permissions `pages:write` и `id-token:write`.
3. `production-smoke`: проверяет поиск/глубокую ссылку, калькулятор и создание/восстановление/перенос отряда на публичном URL.

Официальные Actions закреплены полными SHA. Приложению не нужны GitHub Secrets: используется встроенный GITHUB_TOKEN для Pages/OIDC, локальный PAT не передаётся в CI.

## Контроль публикации

```sh
gh run list --repo LeonidElkin/trench-crusade-toolkit --limit 5
gh run view RUN_ID --repo LeonidElkin/trench-crusade-toolkit
gh run view RUN_ID --repo LeonidElkin/trench-crusade-toolkit --log-failed
gh api repos/LeonidElkin/trench-crusade-toolkit/pages
```

GitHub Pages должен иметь `build_type: workflow`. При первичной настройке разрешён `gh api --method POST repos/LeonidElkin/trench-crusade-toolkit/pages -f build_type=workflow`; существующую конфигурацию сначала читать. Токен уже настроен через GH_TOKEN, не читать файл секретов и не выполнять auth login.

После успеха открыть https://leonidelkin.github.io/trench-crusade-toolkit/ через Playwright MCP. Проверить ресурсы, внутренние маршруты и интерактивность. При ошибке исправить, обычный commit/push и новый полный цикл. Не считать один успешный push доказательством публикации.

## Обновление вкладок после deployment

GitHub Pages может отдавать закешированный HTML, ссылающийся на удалённые JS старой сборки. `public/recover.js` намеренно остаётся обычным неизменяемым по имени public-ресурсом перед модульным входом. Он работает даже при недоступности самого entry bundle, ловит ошибки script и `vite:preloadError` и один раз открывает свежий HTML с сохранением hash-маршрута. Пятиминутный cooldown в sessionStorage предотвращает цикл; при offline, недоступном sessionStorage или маркере несохранённого отряда автоматический reload не выполняется. Кнопка «Перезагрузить» позволяет явно повторить попытку.

Поведение Vite описано в [официальной документации](https://vite.dev/guide/build.html#load-error-handling). E2E реально прерывает загрузку entry/lazy JS, проверяет восстановление, ограничение повторов, ручной повтор и побитовое сохранение localStorage. Эти сценарии запускаются также на публичном сайте в production-smoke.
