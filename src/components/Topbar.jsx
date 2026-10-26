import { useEffect, useState } from 'react'
import { Menu, Search } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useNova } from '../app-context.js'
import { initials } from '../lib/format.js'
import { NovaMark } from './Logo.jsx'

export function Topbar({ onMenu }) {
  const { health } = useNova()
  const navigate = useNavigate()
  const location = useLocation()
  const [scrolled, setScrolled] = useState(false)
  const isSearch = location.pathname === '/search'
  const accountName = health?.account?.username || health?.account?.title || 'NOVA'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 14)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      const typing = target instanceof HTMLElement && (
        target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.tagName === 'SELECT'
        || target.isContentEditable
      )
      if (typing) return
      event.preventDefault()
      navigate('/search')
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])

  return (
    <header className={`topbar${scrolled ? ' is-scrolled' : ''}`}>
      <div className="topbar__mobile-brand">
        <button
          type="button"
          className="icon-button topbar__menu"
          onClick={onMenu}
          aria-label="Open navigation menu"
        >
          <Menu size={21} />
        </button>
        <Link to="/" className="topbar__logo-link" aria-label="NOVA home">
          <NovaMark size={25} />
          <span>NOVA</span>
        </Link>
      </div>

      <button
        type="button"
        className={`search-trigger${isSearch ? ' is-active' : ''}`}
        onClick={() => navigate('/search')}
        aria-label="Search your Plex library"
      >
        <Search size={17} strokeWidth={1.8} />
        <span className="search-trigger__label">
          {isSearch ? 'Search your library' : 'Search films, series, genres'}
        </span>
        <kbd>/</kbd>
      </button>

      <div className="topbar__actions">
        <span className={`topbar__status${health?.reachable ? ' is-online' : ' is-offline'}`}>
          <span className={`status-dot ${health?.reachable ? 'status-dot--online' : 'status-dot--offline'}`} />
          <span className="topbar__status-label">{health?.reachable ? 'Plex online' : 'Plex offline'}</span>
        </span>
        <Link
          to="/settings"
          className="avatar"
          title={`${accountName} · Settings`}
          aria-label="Open settings"
        >
          {initials(accountName)}
        </Link>
      </div>
    </header>
  )
}
