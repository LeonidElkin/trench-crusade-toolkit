import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useState,
  useSyncExternalStore,
  type ErrorInfo,
  type ReactNode,
} from 'react'
import {
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  Cross,
  Dice5,
  Flag,
  Home as HomeIcon,
  Info,
  Menu,
  Search,
  Shield,
  X,
} from 'lucide-react'
import { Home } from './pages/Home'
const SearchDialog = lazy(() =>
  import('./components/Search').then((m) => ({ default: m.SearchDialog })),
)
import { editions } from './data/registry'
import { loadWarbands } from './domain/storage'
const Rules = lazy(() => import('./pages/Rules').then((m) => ({ default: m.Rules })))
const Factions = lazy(() => import('./pages/Factions').then((m) => ({ default: m.Factions })))
const Calculator = lazy(() => import('./pages/Calculator').then((m) => ({ default: m.Calculator })))
const Warbands = lazy(() => import('./pages/Warbands').then((m) => ({ default: m.Warbands })))
const About = lazy(() => import('./pages/About').then((m) => ({ default: m.About })))
const nav = [
  { id: '', name: 'Обзор', icon: HomeIcon },
  { id: 'rules', name: 'Справочник правил', short: 'Правила', icon: BookOpen },
  { id: 'factions', name: 'Фракции', icon: Shield },
  { id: 'calculator', name: 'Калькулятор', short: 'Расчёты', icon: Dice5 },
  { id: 'warbands', name: 'Мои отряды', short: 'Отряды', icon: Flag },
]
const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}
const snapshot = () => window.location.hash
class ErrorBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' }
  static getDerivedStateFromError(error: Error) {
    return { error: error.message }
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* No remote telemetry or user data transmission. */
  }
  render() {
    return this.state.error ? (
      <div className="fatal-error">
        <h1>Не удалось открыть приложение</h1>
        <p>
          Ваши отряды остаются в локальном хранилище. Перезагрузите страницу и попробуйте снова.
        </p>
        <pre>{this.state.error}</pre>
        <button className="button button-primary" onClick={() => window.location.reload()}>
          Перезагрузить
        </button>
      </div>
    ) : (
      this.props.children
    )
  }
}
export function App() {
  return (
    <ErrorBoundary>
      <Shell />
    </ErrorBoundary>
  )
}
function Shell() {
  const hash = useSyncExternalStore(subscribe, snapshot),
    parts = hash.replace(/^#\/?/, '').split('/'),
    page = parts[0] ?? ''
  const [search, setSearch] = useState(false),
    [menu, setMenu] = useState(false)
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearch((value) => !value)
      }
      if (event.key === 'Escape') setMenu(false)
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [])
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    document.title = `${nav.find((n) => n.id === page)?.name ?? 'Полевой архив'} · Trench Crusade Toolkit`
  }, [page, hash])
  let count = 0
  try {
    count = loadWarbands(localStorage).length
  } catch {
    /* Storage warnings are handled in the library. */
  }
  const title =
    nav.find((n) => n.id === page)?.name ??
    (page === 'about' ? 'О проекте' : page === 'import' ? 'Импорт отряда' : 'Полевой архив')
  const body =
    page === '' ? (
      <Home onSearch={() => setSearch(true)} warbandCount={count} />
    ) : page === 'rules' ? (
      <Rules articleId={parts[1] ? decodeURIComponent(parts[1]) : undefined} />
    ) : page === 'factions' ? (
      <Factions factionId={parts[1]} />
    ) : page === 'calculator' ? (
      <Calculator />
    ) : page === 'warbands' ? (
      <Warbands routeId={parts[1]} defaultFaction={parts[2]} />
    ) : page === 'import' ? (
      <Warbands encoded={parts[1] ?? ''} />
    ) : page === 'about' ? (
      <About />
    ) : (
      <div className="empty-state">
        <h1>Страница не найдена</h1>
        <a href="#/" className="button button-primary">
          В полевой штаб
        </a>
      </div>
    )
  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('main-content')?.focus()
        }}
      >
        Перейти к содержимому
      </a>
      {menu && (
        <button
          className="nav-backdrop"
          aria-label="Закрыть навигацию"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`app-sidebar ${menu ? 'is-open' : ''}`} aria-label="Основная навигация">
        <a className="brand" href="#/" onClick={() => setMenu(false)}>
          <span className="brand-sigil">
            <Cross size={34} strokeWidth={1.2} />
          </span>
          <span>
            TRENCH CRUSADE<small>FIELD TOOLKIT</small>
          </span>
        </a>
        <div className="sidebar-divider">
          <span>ПОЛЕВОЙ ШТАБ</span>
          <span>№ 163</span>
        </div>
        <nav>
          {nav.map((n) => (
            <a
              className={`nav-item ${page === n.id ? 'active' : ''}`}
              href={`#/${n.id}`}
              key={n.id}
              onClick={() => setMenu(false)}
            >
              <n.icon size={19} strokeWidth={1.5} />
              <span>{n.name}</span>
              {n.id === 'warbands' && count > 0 && <small>{count}</small>}
              {page === n.id && <ChevronRight className="nav-chevron" size={14} />}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="archive-label">
            <span className="status-dot" />
            АРХИВ РЕДАКЦИИ<strong>1.6.3</strong>
            <span>
              Правила остаются с вами.
              <br />
              Отряды — на вашем устройстве.
            </span>
          </div>
          <a
            className={`nav-item ${page === 'about' ? 'active' : ''}`}
            href="#/about"
            onClick={() => setMenu(false)}
          >
            <Info size={18} />О базе правил
          </a>
          <a
            className="sidebar-github"
            href="https://github.com/LeonidElkin/trench-crusade-toolkit"
            target="_blank"
            rel="noreferrer"
          >
            Открытый исходный код
            <ArrowUpRight size={13} />
          </a>
          <div className="sidebar-motto">
            FAITH IS OUR ARMOUR.
            <br />
            WAR IS OUR PRAYER.
          </div>
        </div>
      </aside>
      <header className="app-header">
        <div className="header-left">
          <button
            className="icon-button menu-toggle"
            aria-label={menu ? 'Закрыть меню' : 'Открыть меню'}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X size={21} /> : <Menu size={21} />}
          </button>
          <a className="mobile-brand" href="#/">
            <Cross size={20} />
            TC / TOOLKIT
          </a>
          <span className="header-breadcrumb">
            <span>Полевой штаб</span>
            <ChevronRight size={13} />
            {title}
          </span>
        </div>
        <div className="header-right">
          <button
            className="header-search"
            onClick={() => setSearch(true)}
            aria-label="Поиск по правилам"
          >
            <Search size={17} />
            <span>Поиск в архиве</span>
            <kbd>⌘ K</kbd>
          </button>
          <label className="edition-select">
            <span className="status-dot" />
            <select aria-label="Редакция архива">
              {editions.map((e) => (
                <option value={e.id} key={e.id}>
                  РЕДАКЦИЯ {e.id}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      <main
        id="main-content"
        className={`app-main ${page === '' ? 'home-main' : ''}`}
        tabIndex={-1}
      >
        <Suspense fallback={<div className="loading-state">Открываем полевой архив…</div>}>
          {body}
        </Suspense>
        <footer className="app-footer">
          <span>
            TRENCH CRUSADE TOOLKIT <span className="footer-cross">✠</span> 1.6.3
          </span>
          <span>Неофициальный компаньон · Сделано для игроков</span>
          <a href="#/about">
            Источники и ограничения
            <ArrowUpRight size={12} />
          </a>
        </footer>
      </main>
      <nav className="mobile-nav" aria-label="Быстрая навигация">
        {nav
          .filter((n) => n.id !== 'factions')
          .map((n) => (
            <a href={`#/${n.id}`} key={n.id} className={page === n.id ? 'active' : ''}>
              <n.icon size={20} strokeWidth={1.5} />
              <span>{n.short ?? n.name}</span>
            </a>
          ))}
      </nav>
      {search && (
        <Suspense fallback={null}>
          <SearchDialog onClose={() => setSearch(false)} />
        </Suspense>
      )}
    </>
  )
}
