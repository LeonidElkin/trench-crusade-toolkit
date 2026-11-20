import {
  BookOpen,
  Database,
  ExternalLink,
  FileText,
  GitBranch,
  Info,
  ShieldCheck,
} from 'lucide-react'
import { catalog, edition } from '../data/registry'
import { sourcePdfUrl } from '../data/portraits'
import { RuleLink } from '../components/Common'
export function About() {
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">ПРОИСХОЖДЕНИЕ И ТОЧНОСТЬ</span>
        <h1>О полевом архиве</h1>
        <p>
          Правила должны быть проверяемыми. Здесь — источники, версия базы и границы автоматической
          проверки.
        </p>
      </div>
      <div className="about-stats">
        {[
          [catalog.factions.length, 'фракций'],
          [catalog.variants.length, 'вариантов'],
          [catalog.units.length, 'профилей и альтернатив'],
          [edition.articles.length, 'материалов'],
        ].map(([value, label]) => (
          <div className="panel" key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <section className="panel about-panel">
        <h2>
          <FileText size={21} />
          Источники правил
        </h2>
        <p>
          База 1.6.3 собрана из двух русских PDF. Согласованные поправки применяются к рабочей
          редакции и сопровождаются ссылками на исходные страницы.
        </p>
        {edition.sources.map((s) => (
          <div className="source-document" key={s.id}>
            <BookOpen size={23} />
            <div>
              <h3>{s.id === 'core' ? 'Trench Crusade · Правила игры' : 'Союзники и наёмники'}</h3>
              <p>{s.filename}</p>
              <a
                className="text-link"
                href={sourcePdfUrl(edition.id, s.id)}
                target="_blank"
                rel="noreferrer"
              >
                Открыть PDF <ExternalLink size={13} />
              </a>
              <span className="muted small">
                {s.pages} страниц ·{' '}
                {s.edition ? `Редакция ${s.edition}` : 'Номер редакции в документе не указан'}
              </span>
              <details>
                <summary>Контрольная сумма SHA-256</summary>
                <code>{s.sha256}</code>
              </details>
            </div>
          </div>
        ))}
        <p className="muted small">
          Перевод: Мастерская Кетсу. Создатели игры и иллюстраций: Factory Fortress Inc., Tuomas
          Pirinen, Mike Franchina и Des Hanley. Иллюстрации извлечены из предоставленной книги.
          Проект — неофициальный некоммерческий бесплатный инструмент сообщества; права на мир,
          тексты и изображения принадлежат их правообладателям.
        </p>
        <p className="muted small">
          Проект целиком разрабатывается с помощью AI-агентов: архитектура, код, подготовка данных,
          тестирование, документация и публикация.
        </p>
      </section>
      <section className="panel about-panel">
        <h2>
          <Database size={21} />
          Как устроена база
        </h2>
        <p>
          Справочник, профили фракций и билдер используют один каталог. У каждой сущности есть
          стабильный идентификатор, документ и страницы источника.
        </p>
        <p>
          Полнотекстовый поиск, расчёты и отряды работают в браузере. PDF не загружаются и не
          разбираются приложением. Отряд привязан к редакции <strong>{edition.id}</strong> и ревизии
          базы <code>{edition.revision}</code>. Будущие редакции добавляются независимо.
        </p>
        <p>
          Постраничная сверка охватывает все 190 страниц. Сборка проверяет её актуальность, схемы
          каталога, связи и сохранённые контрольные суммы.
        </p>
      </section>
      <section className="panel about-panel">
        <h2>
          <Info size={21} />
          Неоднозначности источника
        </h2>
        <ul className="issue-list">
          <li>
            <strong>Начало хода (стр. 4 и 11).</strong> Индикатор показывает порядок из раздела
            активаций и принимает подтверждение игроков.
          </li>
          <li>
            <strong>Лимиты кампании (стр. 14 и 19).</strong> Билдер проверяет покупки текущего
            состава. История потерь, трофеев и замен требует ручной сверки.
          </li>
          <li>
            <strong>Тяжёлый баллистический щит (стр. 67 и 127).</strong> Строка арсенала требует
            Машинную броню, а описание брони запрещает щиты. Сочетание помечается для сверки.
          </li>
        </ul>
        <div className="about-links">
          <RuleLink id="core-item-tartarus-claws">Когти Тартара</RuleLink>
          <RuleLink id="core-pilgrim-trench-mortar">Миномёт Анахорета</RuleLink>
          <a className="text-link" href="https://github.com/LeonidElkin/trench-crusade-toolkit/blob/main/docs/RULE-CONFLICTS.md">
            Отчёт о конфликтах и поправках <ExternalLink size={14} />
          </a>
        </div>
      </section>
      <section className="panel about-panel">
        <h2>
          <ShieldCheck size={21} />
          Что означает результат проверки
        </h2>
        <p>
          <strong>Ошибка</strong> — обнаружено нарушение формализованного условия.{' '}
          <strong>Предупреждение</strong> — состояние требует внимания.{' '}
          <strong>Нужна сверка</strong> — условие не подтверждено автоматически. Отсутствие ошибок
          не отменяет необходимости этой сверки.
        </p>
        <p>
          Черновики можно сохранять и экспортировать. При найме и покупке билдер проверяет
          подтверждённые ограничения. Превышение бюджета видно в стоимости и диагностике.
        </p>
      </section>
      <section className="panel about-panel">
        <h2>
          <GitBranch size={21} />
          Открытый проект
        </h2>
        <p>
          Исходный код, инструкции для будущих сессий и воспроизводимые процедуры импорта хранятся в
          репозитории.
        </p>
        <div className="about-links">
          <a
            className="button button-outline"
            href="https://github.com/LeonidElkin/trench-crusade-toolkit"
            target="_blank"
            rel="noreferrer"
          >
            Репозиторий
            <ExternalLink size={15} />
          </a>
          <a
            className="text-link"
            href="https://github.com/LeonidElkin/trench-crusade-toolkit/issues"
            target="_blank"
            rel="noreferrer"
          >
            Сообщить об ошибке
            <ExternalLink size={14} />
          </a>
        </div>
        <p className="muted small">
          Trench Companion использован как функциональный и визуальный референс. Его игровые данные
          не входят в эту базу.
        </p>
      </section>
    </>
  )
}
