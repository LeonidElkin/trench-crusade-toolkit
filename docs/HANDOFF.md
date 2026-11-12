# Передача контекста

Состояние 2026-11-12. Главная задача: полностью новая база правил по оригинальным PDF, интеграция и публикация существующего сайта. Дополнительная обязательная задача: после публикации исследовать, установить и проверить Docling на CPU для будущих редакций.

## Стратегия и точный остаток

Выбрана **ветка A** инструкции пользователя: осталось **0 страниц**, то есть не больше22. Основной PDF168/168 и дополнение22/22 реконструированы, реально визуально просмотрены авторами и независимо повторно сверены другими агентами. Последний логический блок — core1–17 и118–168 (68страниц) — завершён. Все4 review reports сохранены; source/author/entities/section SHA совпадают. assemble.py: readyForIntegration=true, errors=0, heuristics=17 (требуют документировать dispositions, это не новые непросмотренные страницы).

Статусы детально и без выдачи автоматического извлечения за визуальный просмотр: reconstruction/1.6.3/status.json и coverage.json. Необработанных, только автоматически извлечённых и ожидающих визуальной сверки страниц —0. Проверенные с замечаниями к самому источнику выделены отдельно; исходные противоречия не дополнять догадками и не считать причиной повторного импорта всех190страниц.

**Docling пока не установлен и не исследовался.** Порядок: завершить сайт → unit/data/build/E2E → Playwright MCP локально → main/Actions/Pages → production MCP → отдельное сообщение пользователю о готовности сайта → автоматически продолжить Docling. Уведомление о завершении сайта ещё НЕ отправлено. Не ждать подтверждения. Не переимпортировать190проверенных страниц ради Docling; эталон10–15страниц из этой новой базы, отдельное Python-окружение, CPU, стандартный pipeline без OCR/VLM по умолчанию, официальные документация и Agent Skill/library-skills. Исследование Docling обязательно даже при0оставшихся страницах.

## Git и границы

Ветка reconstruction/pdf-visual-1.6.3. Тег backup/pre-visual-reconstruction-2026-11-11 закрепляет исходный05286abc38cc15284244ef5feaed22f90e687747 и уже отправлен в origin. Pipeline checkpoint4f52480. До начала дерево было чистым, main совпадал с origin/main. Production ещё использует прежнюю базу, новая версия НЕ опубликована. Разрешён только LeonidElkin/trench-crusade-toolkit, обычные коммиты/push/main/Pages; никаких force push, чужих репозиториев и глобальных настроек.

## Сохранённый результат

- Единственные источники: public/reference/trench-crusade-1.6.3-ru.pdf(168) и allies-and-mercenaries-ru.pdf(22, edition=null). SHA в reconstruction/1.6.3/manifest.json.
- Новые первичные records: reconstruction/1.6.3/authored/*.json.379смысловых разделов с полным Markdown, новыми сущностями и адресами источников. Готовые Markdown в tools/import-cache/assembled-1.6.3/content/ воспроизводимы через assemble. Старые Markdown/JSON/layout/overrides НЕ использовались для заполнения фактов.
- Независимые отчёты reviews/*.json: все190страниц, все15новых оригинальных схем сценариев. seal_reviews.py добавляет только byte bindings после проверки уже существующих хешей, статусы не создаёт.
- Рендеры180dpi и исходные символы/шрифты/координаты всех190страниц — игнорируемый tools/import-cache/visual-1.6.3. Не перечитывать весь PDF. При споре открывать конкретную страницу/crop.
- links.json явно разделяет подтверждённые текстовые aliases, редакторскую нормализацию, documented-assumption и unresolved. Траншейный нож/Бландербус/Нечестивый амулет не подменяются правдоподобными профилями.
- Новый compiler читает только новые records+reviews+links, schema2; локально уже compiled379articles/70profiles/255offers. Нет копирования старых overrides. Исходный data/editions пока ещё требует полной замены производными файлами (root не завершил export/promote).
- Домен warband/validation/rules и UI адаптированы;26новых доменных тестов по новым records прошли у domain_v2. TypeScript и UI content tests прошли, но общий check/E2E ещё НЕ завершены. Новые v2storage и явный отказ старого v1, бесплатные loadouts Мамлюка/profile/ability/bound-alchemist, новые UI/aliases сохранены.
- Калькулятор: bloodbath увеличивает исходный пул перед ±DICE; значения берёт из новых procedures. Добавлена регрессия математики. Новые E2E для bloodbath, отказаv1 и сохранности старого ключа подготовлены UI-агентом.

## Что завершить по сайту

1. Закрыть17heuristics и переписать KNOWN-ISSUES по новым issues. Важное последнее finding: core67 продаёт HeavyBallisticShield только моделям в MachineArmour, а core127 запрещает MachineArmour с любым щитом. Это конфликт источника: комбинация должна быть manual, а не бесспорный error/valid. Reviewer подтвердил обе страницы, но не успел сохранить quality-review/KNOWN-ISSUES из-за лимита.
2. Довести нормализатор: source-backed aliases фиксированной экипировки, явные условия item inheritance; неизвестное не превращать в0. Не сливать разные описания Посоха/Когтей core20 против125. Проверенные исключения наследования не возвращать обратно (Дервиш без Strong, Банши безUnholyHymns).
3. Создать export новой data/editions/1.6.3 (полностью удалить старый набор, восстановление черезGit), catalog.json/articles/content/sources/coverage/issues/lock; обновить validate-data/freeze/tests/CI. Старый tools/audit_content.py не критерий достоверности и должен уйти из workflow. UI-агент обновляет DATA/ARCHITECTURE/EDITIONS и Skills validate/add-edition; проверить его сохранённый результат.
4. npmci, npmruncheck, unit/data/build/E2E, локальный PlaywrightMCP. Исправлять конкретные failures, не повторять пройденные исследования без причины. Проверить166? нет — все190уже сверены, не начинать заново.
5. Обновить README/HANDOFF/отчёт, meaningful commits; проверить origin и обычный push, merge main, Actions/Pages, production PlaywrightMCP. Уведомить пользователя о готовности сайта и продолжить Docling.

## Среда и экономия

Обычныйexec может завершаться bwrap FailedRTM_NEWADDR; require_escalated для разрешённых операций проходит review. Sandbox не перенастраивать. После смены среды /tmp/tc-reconstruction-venv исчез; системныйPython безfitz, но pdftoppm доступен. Для текущих проверок rawdict/PNG уже сохранены в workspace. GH_TOKEN готовится оболочкой: не читать/печатать секреты, не делатьghauthlogin. GitHubMCP только чтение, gh/Git для записи. PlaywrightMCP обязателен. Использовать небольшие выводы, scripts вместо массового чтения, не запускать новых LLM-агентов без явной пользы. Не полагаться на фоновые процессы после остановки сессии.
