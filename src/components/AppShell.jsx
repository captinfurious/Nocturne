import { useEffect } from 'react'
import { Film, House, ListPlus, RefreshCw, Search, Tv, WifiOff } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useNocturne } from '../app-context.js'
import { TopNav } from './TopNav.jsx'

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
  const { health, libraries, reloadHealth } = useNocturne()
  const movies = libraries.find((library) => library.type === 'movie')
  const shows = libraries.find((library) => library.type === 'show')

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <ScrollToTop />
      <TopNav />

      <main id="main-content" className="main">
        <Outlet />
      </main>

      {health?.configured && health.reachable === false ? (
        <div className="connection-banner" role="status">
          <WifiOff size={17} aria-hidden="true" />
          <div>
            <strong>Plex is offline</strong>
            <span>{health.connectionError || 'Nocturne will reconnect when your server is available.'}</span>
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
        {shows ? (
          <NavLink to={`/library/${shows.key}`} className={mobileNavClass}>
            <Tv size={20} />
            <span>TV</span>
          </NavLink>
        ) : null}
        {movies ? (
          <NavLink to={`/library/${movies.key}`} className={mobileNavClass}>
            <Film size={20} />
            <span>Movies</span>
          </NavLink>
        ) : null}
        <NavLink to="/my-list" className={mobileNavClass}>
          <ListPlus size={20} />
          <span>My List</span>
        </NavLink>
        <NavLink to="/search" className={mobileNavClass}>
          <Search size={20} />
          <span>Search</span>
        </NavLink>
      </nav>
    </div>
  )
}
