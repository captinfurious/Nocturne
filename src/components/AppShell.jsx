import { useEffect, useState } from 'react'
import { Film, House, RefreshCw, Search, Tv, WifiOff } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useNova } from '../app-context.js'
import { Sidebar } from './Sidebar.jsx'
import { Topbar } from './Topbar.jsx'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])
  return null
}

function mobileNavClass({ isActive }) {
  return `mobile-nav__link${isActive ? ' is-active' : ''}`
}

export function AppShell() {
  const { health, libraries, reloadHealth } = useNova()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const movies = libraries.find((library) => library.type === 'movie')
  const shows = libraries.find((library) => library.type === 'show')

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.body.classList.add('is-drawer-open')
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.classList.remove('is-drawer-open')
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <ScrollToTop />
      <Sidebar className="sidebar--desktop" />
      <Topbar onMenu={() => setMenuOpen(true)} />

      <div className={`drawer${menuOpen ? ' is-open' : ''}`} aria-hidden={!menuOpen}>
        <button
          type="button"
          className="drawer__backdrop"
          onClick={() => setMenuOpen(false)}
          aria-label="Close navigation menu"
          tabIndex={menuOpen ? 0 : -1}
        />
        <div className="drawer__panel">
          <Sidebar className="sidebar--drawer" onNavigate={() => setMenuOpen(false)} />
        </div>
      </div>

      <main id="main-content" className="main">
        <Outlet />
      </main>

      {health?.configured && health.reachable === false ? (
        <div className="connection-banner" role="status">
          <WifiOff size={17} aria-hidden="true" />
          <div>
            <strong>Plex is offline</strong>
            <span>{health.connectionError || 'NOVA will reconnect when your server is available.'}</span>
          </div>
          <button type="button" className="button button--small button--secondary" onClick={reloadHealth}>
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      ) : null}

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <NavLink to="/" end className={mobileNavClass}>
          <House size={20} />
          <span>Home</span>
        </NavLink>
        {movies ? (
          <NavLink to={`/library/${movies.key}`} className={mobileNavClass}>
            <Film size={20} />
            <span>Movies</span>
          </NavLink>
        ) : null}
        {shows ? (
          <NavLink to={`/library/${shows.key}`} className={mobileNavClass}>
            <Tv size={20} />
            <span>TV</span>
          </NavLink>
        ) : null}
        <NavLink to="/search" className={mobileNavClass}>
          <Search size={20} />
          <span>Search</span>
        </NavLink>
      </nav>
    </div>
  )
}
