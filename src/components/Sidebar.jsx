import { Film, House, Search, Settings2, Tv } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import { useNova } from '../app-context.js'
import { NovaBrand } from './Logo.jsx'

function navClass({ isActive }) {
  return `nav-link${isActive ? ' is-active' : ''}`
}

export function Sidebar({ onNavigate, className = '' }) {
  const { health, libraries } = useNova()
  const online = Boolean(health?.reachable)
  const movieLibraries = libraries.filter((library) => library.type === 'movie')
  const showLibraries = libraries.filter((library) => library.type === 'show')

  return (
    <aside className={`sidebar ${className}`.trim()}>
      <Link to="/" className="sidebar__brand" onClick={onNavigate} aria-label="NOVA home">
        <NovaBrand />
      </Link>

      <nav className="sidebar__nav" aria-label="Main navigation">
        <p className="nav-label">Discover</p>
        <NavLink to="/" end className={navClass} onClick={onNavigate}>
          <House size={18} strokeWidth={1.8} />
          <span>Home</span>
        </NavLink>
        <NavLink to="/search" className={navClass} onClick={onNavigate}>
          <Search size={18} strokeWidth={1.8} />
          <span>Search</span>
        </NavLink>

        {movieLibraries.length || showLibraries.length ? (
          <>
            <p className="nav-label nav-label--spaced">Your libraries</p>
            {movieLibraries.map((library) => (
              <NavLink
                key={library.key}
                to={`/library/${library.key}`}
                className={navClass}
                onClick={onNavigate}
              >
                <Film size={18} strokeWidth={1.8} />
                <span>{library.title || 'Movies'}</span>
              </NavLink>
            ))}
            {showLibraries.map((library) => (
              <NavLink
                key={library.key}
                to={`/library/${library.key}`}
                className={navClass}
                onClick={onNavigate}
              >
                <Tv size={18} strokeWidth={1.8} />
                <span>{library.title || 'TV Shows'}</span>
              </NavLink>
            ))}
          </>
        ) : null}
      </nav>

      <div className="sidebar__bottom">
        <Link to="/settings" className="server-card" onClick={onNavigate}>
          <span className="server-card__status">
            <span className={`status-dot ${online ? 'status-dot--online' : 'status-dot--offline'}`} />
            {online ? 'Plex connected' : 'Plex offline'}
            <Settings2 size={14} />
          </span>
          <span className="server-card__name">
            {health?.server?.name || 'Plex Media Server'}
          </span>
          {health?.account?.username ? (
            <span className="server-card__account">{health.account.username}</span>
          ) : null}
        </Link>
        <p className="sidebar__version">NOVA 1.0</p>
      </div>
    </aside>
  )
}
