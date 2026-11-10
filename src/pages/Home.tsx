import { ArrowRight, BookOpen, Dice5, Flag, Search, ChevronRight, Crosshair } from 'lucide-react'
import { assetUrl, catalog, edition, ruleHref } from '../data/registry'
const descriptions: Record<string, string> = {
  heretic: 'Проклятые легионы. Клятвы, скреплённые кровью.',
  pilgrims: 'Вера крепче стали. Искупление в огне войны.',
  sultanate: 'За Железной Стеной. Алхимия и тайное знание.',
  antioch: 'Последний бастион. Дисциплина против тьмы.',
  grail: 'Дары Вельзевула. Чума, не знающая смерти.',
  court: 'Семь грехов. Одна бесконечная война.',
}
export function Home({ onSearch, warbandCount }: { onSearch: () => void; warbandCount: number }) {
  return (
    <div className="home">
      <section className="hero">
        <div
          className="hero-art"
          style={{ backgroundImage: `url("${assetUrl('art/hero.jpeg')}")` }}
        />
        <div className="hero-grid" />
        <div className="hero-content">
          <div className="edition-label">
            <span className="status-dot" />
            ПОЛЕВОЙ АРХИВ · РЕДАКЦИЯ 1.6.3
          </div>
          <p className="hero-kicker">1914 · На пороге последней битвы</p>
          <h1>
            ВЕРА. СТАЛЬ.
            <br />
            <em>НИЧЕЙНАЯ ЗЕМЛЯ.</em>
          </h1>
          <p className="hero-description">
            Ваш полевой компаньон в Великой войне.
            <br className="desktop-only" /> Правила, расчёты и отряды — всегда под рукой.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#/warbands">
              <Flag size={17} />
              Собрать отряд
              <ArrowRight size={17} />
            </a>
            <a className="button button-outline" href="#/rules">
              Открыть правила
              <ChevronRight size={17} />
            </a>
          </div>
          <div className="hero-caption">
            <Crosshair size={13} />
            ЛОКАЛЬНЫЕ СОХРАНЕНИЯ · БЕЗ РЕГИСТРАЦИИ
          </div>
        </div>
        <span className="hero-coordinate">
          48° 18′ N / 04° 13′ E<br />
          NO MAN’S LAND
        </span>
        <div className="hero-stamp">
          TRENCH
          <br />
          <strong>CRUSADE</strong>
          <br />
          FIELD TOOLKIT
        </div>
      </section>
      <div className="section-intro">
        <div>
          <span className="eyebrow">ИНСТРУМЕНТЫ ПОЛЕВОГО ШТАБА</span>
          <h2>Всё необходимое для партии</h2>
        </div>
        <span className="tiny-label">I / III</span>
      </div>
      <section className="tool-grid" aria-label="Инструменты">
        <a href="#/rules" className="tool-card">
          <span className="tool-number">01</span>
          <BookOpen className="tool-icon" size={26} strokeWidth={1.4} />
          <h3>Справочник правил</h3>
          <p>От основ игры до последнего ключевого слова. Поиск и ссылки на связанные правила.</p>
          <span className="tool-bottom">
            {edition.articles.length} материалов
            <ArrowUp />
          </span>
        </a>
        <a href="#/calculator" className="tool-card">
          <span className="tool-number">02</span>
          <Dice5 className="tool-icon" size={26} strokeWidth={1.4} />
          <h3>Калькулятор вероятностей</h3>
          <p>Знайте свои шансы до броска. Точные вероятности действий и ранений.</p>
          <span className="tool-bottom">
            Точная математика
            <ArrowUp />
          </span>
        </a>
        <a href="#/warbands" className="tool-card">
          <span className="tool-number">03</span>
          <Flag className="tool-icon" size={26} strokeWidth={1.4} />
          <h3>Варбанд-билдер</h3>
          <p>Соберите, экипируйте и сохраните свой отряд. С проверкой игровых ограничений.</p>
          <span className="tool-bottom">
            {warbandCount ? `Сохранено отрядов: ${warbandCount}` : 'Ваш первый отряд ждёт'}
            <ArrowUp />
          </span>
        </a>
      </section>
      <div className="section-intro faction-intro">
        <div>
          <span className="eyebrow">СТОРОНЫ ВЕЛИКОЙ ВОЙНЫ</span>
          <h2>Под каким знаменем вы встанете?</h2>
        </div>
        <a className="text-link" href="#/factions">
          Все фракции
          <ArrowRight size={16} />
        </a>
      </div>
      <section className="faction-grid" aria-label="Фракции">
        {catalog.factions.map((f, i) => (
          <a className="faction-card" href={`#/factions/${f.id}`} key={f.id}>
            <img src={assetUrl(f.image)} alt="" loading="lazy" />
            <div className="faction-shade" />
            <div className="faction-card-content">
              <span className="faction-index">0{i + 1} / ФРАКЦИЯ</span>
              <h3>{f.name}</h3>
              <p>{descriptions[f.id]}</p>
              <span className="faction-bottom">
                {catalog.variants.filter((v) => v.factionId === f.id).length || 'Без'} вариантов
                <ArrowRight size={17} />
              </span>
            </div>
          </a>
        ))}
      </section>
      <section className="field-note">
        <div className="field-note-icon">
          <Search size={23} />
        </div>
        <div>
          <h3>Нужное правило — в одном поиске</h3>
          <p>
            Попробуйте «HEAVY», «Повален» или имя бойца. На компьютере — <kbd>Ctrl K</kbd>.
          </p>
        </div>
        <button className="button button-outline" onClick={onSearch}>
          Найти в архиве
          <ArrowRight size={16} />
        </button>
      </section>
      <div className="source-note">
        <span className="status-dot" />
        <p>
          Архив основан на предоставленных русских PDF редакции 1.6.3. Дополнение «Союзники и
          наёмники» — без указанного номера редакции.{' '}
          <a href="#/about">Источники и точность данных</a>
        </p>
        <a href={ruleHref(catalog.keywords[0]!.ruleId)}>
          Термины
          <ChevronRight size={14} />
        </a>
      </div>
    </div>
  )
}
function ArrowUp() {
  return <ArrowRight className="diagonal-arrow" size={19} />
}
