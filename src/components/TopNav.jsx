import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useNocturne } from '../app-context.js'
import { initials } from '../lib/format.js'
import { NocturneBrand } from './Logo.jsx'

function navClass({ isActive }) {
  return `topnav__link${isActive ? ' is-active' : ''}`
}

export function TopNav() {
  const { health, libraries } = useNocturne()
  const navigate = useNavigate()
  const location = useLocation()
  const searchRef = useRef(null)
  const [scrolled, setScrolled] = useState(false)
  const [term, setTerm] = useState('')
  const movies = libraries.find((library) => library.type === 'movie')
  const shows = libraries.find((library) => library.type === 'show')
  const accountName = health?.account?.username || health?.account?.title || 'Nocturne'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (location.pathname !== '/search') return
    setTerm(new URLSearchParams(location.search).get('q') || '')
  }, [location.pathname, location.search])

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
      if (window.matchMedia('(min-width: 981px)').matches) {
        searchRef.current?.focus()
      } else {
        navigate('/search')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])

  const submitSearch = (event) => {
    event.preventDefault()
    const query = term.trim()
    navigate(query ? `/search?q=${encodeURIComponent(query)}` : '/search')
  }

  return (
    <header className={`topnav${scrolled ? ' is-scrolled' : ''}`}>
      <Link to="/" className="topnav__brand" aria-label="Nocturne home">
        <NocturneBrand tagline={false} />
      </Link>

      <nav className="topnav__links" aria-label="Main navigation">
        <NavLink to="/" end className={navClass}>Home</NavLink>
        {shows ? (
          <NavLink to={`/library/${shows.key}`} className={navClass}>TV Shows</NavLink>
        ) : null}
        {movies ? (
          <NavLink to={`/library/${movies.key}`} className={navClass}>Movies</NavLink>
        ) : null}
        <NavLink to="/my-list" className={navClass}>My List</NavLink>
      </nav>

      <div className="topnav__actions">
        <form className="nav-search" onSubmit={submitSearch} role="search">
          <Search size={18} className="nav-search__icon" aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            className="nav-search__input"
            placeholder="Titles, genres"
            aria-label="Search your Plex library"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            autoComplete="off"
            spellCheck="false"
          />
          <kbd className="nav-search__hint">/</kbd>
        </form>

        <Link to="/search" className="nav-search__compact" aria-label="Search your Plex library">
          <Search size={21} />
        </Link>

        <Link
          to="/settings"
          className="profile-button"
          title={`${accountName} · Settings`}
          aria-label="Open settings"
        >
          <span className="profile-button__avatar">{initials(accountName)}</span>
          <span className={`profile-button__status${health?.reachable ? ' is-online' : ' is-offline'}`}>
            <span className="sr-only">
              {health?.reachable ? 'Plex connected' : 'Plex offline'}
            </span>
          </span>
        </Link>
      </div>
    </header>
  )
}
