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
          Единственные источники игровых механик этой базы — два предоставленных PDF. Актуальные
          правила других сайтов не использовались для исправления редакции 1.6.3.
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
          Текст хранится в редактируемых Markdown-файлах, характеристики и ограничения — в
          валидируемых JSON-данных. У каждой сущности есть стабильный идентификатор, документ и
          страницы источника.
        </p>
        <p>
          Полнотекстовый поиск, расчёты и отряды работают в браузере. PDF не загружаются и не
          разбираются приложением. Отряд привязан к редакции <strong>{edition.id}</strong> и ревизии
          базы <code>{edition.revision}</code>. Будущие редакции добавляются независимо.
        </p>
        <p>
          Выполнены автоматический перенос и восстановление таблиц, проверка покрытия 190 страниц,
          схем и ссылок, а также выборочная ручная сверка критических профилей и правил. Это не
          постраничная корректура всего текста; возможны остаточные дефекты переноса.
        </p>
      </section>
      <section className="panel about-panel">
        <h2>
          <Info size={21} />
          Неоднозначности источника
        </h2>
        <ul className="issue-list">
          <li>
            <strong>HERETI у Помазанника (стр. 24).</strong> В строке ключевых слов напечатано
            HERETI. Значение сохранено; при проверке численного превосходства HERETIC не
            подставляется автоматически.
          </li>
          <li>
            <strong>Лимиты кампании (стр. 14, 19).</strong> Формулировки о количестве доступных
            предметов за кампанию различаются. Автоматический лимит относится к текущему составу;
            историю потерь и замен нужно проверять отдельно.
          </li>
          <li>
            <strong>Коллекция оружия Дома Мудрости (стр. 61).</strong> Указания «выберите два
            оружия» и «только одно оружие» требуют интерпретации. Выбор предметов сохраняется, но
            его игровая допустимость требует сверки.
          </li>
          <li>
            <strong>Траншейный миномёт (стр. 45).</strong> Дальность 48″ в таблице отличается от
            указанных в описании 36″. Сохранены оба значения; приложение не выбирает одно из них.
          </li>
          <li>
            <strong>Йомены (стр. 70).</strong> Базовые 30 дукатов и обязательная винтовка за 5
            дукатов учитываются раздельно. Замены за Очки Славы и кампанийная история требуют
            сверки.
          </li>
          <li>
            <strong>Кампанийные улучшения и трофеи.</strong> Билдер не знает историю гибели и
            воскрешения, потерянного снаряжения, предметов противника и договорённостей игроков. Для
            таких правил выводится отдельная диагностика.
          </li>
        </ul>
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
          Временно невалидные отряды можно создавать, сохранять и экспортировать. Неизвестные версии
          экспорта отклоняются; недоступная редакция никогда не заменяется текущей.
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
