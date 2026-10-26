import { useCallback, useEffect, useRef, useState } from 'react'
import { Film, Search, SearchX, Tv, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useNocturne } from '../app-context.js'
import { api } from '../api.js'
import { MediaCard } from '../components/MediaCard.jsx'
import { GridSkeleton } from '../components/Skeleton.jsx'
import { ErrorState, StatePanel } from '../components/StateMessage.jsx'
import { usePageTitle } from '../hooks/usePageTitle.js'
import { useRemote } from '../hooks/useRemote.js'

function ResultGroup({ title, items, icon: Icon }) {
  if (!items?.length) return null
  return (
    <section className="search-group">
      <div className="search-group__header">
        <span className="search-group__icon"><Icon size={16} /></span>
        <h2>{title}</h2>
        <span className="search-group__count">{items.length}</span>
      </div>
      <div className="poster-grid">
        {items.map((item, index) => (
          <MediaCard key={item.ratingKey} item={item} variant="grid" index={index} />
        ))}
      </div>
    </section>
  )
}

export function SearchPage() {
  const { libraries } = useNocturne()
  const [searchParams, setSearchParams] = useSearchParams()
  const q = (searchParams.get('q') || '').trim()
  const [term, setTerm] = useState(q)
  const inputRef = useRef(null)
  const moviesLibrary = libraries.find((library) => library.type === 'movie')
  const showsLibrary = libraries.find((library) => library.type === 'show')

  usePageTitle(q ? `Search: ${q}` : 'Search')

  useEffect(() => {
    setTerm(q)
  }, [q])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = term.trim()
      if (next === q) return
      if (next) setSearchParams({ q: next }, { replace: true })
      else setSearchParams({}, { replace: true })
    }, 320)
    return () => window.clearTimeout(timer)
  }, [term, q, setSearchParams])

  const request = useCallback(
    (signal) => (q.length >= 2 ? api.search(q, signal) : Promise.resolve(null)),
    [q],
  )
  const { data, loading, error, reload } = useRemote(request)

  const resultsMatch = data?.query?.toLowerCase() === q.toLowerCase()
  const showLoading = q.length >= 2 && !error && (loading || !resultsMatch)
  const hasResults = Boolean(data && resultsMatch && data.total > 0)

  const submit = (event) => {
    event.preventDefault()
    const next = term.trim()
    if (next) setSearchParams({ q: next }, { replace: true })
  }

  const clear = () => {
    setTerm('')
    setSearchParams({}, { replace: true })
    inputRef.current?.focus()
  }

  return (
    <div className="page page--search">
      <header className="search-header">
        <p className="eyebrow">
          <Search size={14} />
          Search your cinema
        </p>
        <h1>What are we watching?</h1>
        <form className="search-form" onSubmit={submit} role="search">
          <Search size={23} className="search-form__icon" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            className="search-form__input"
            placeholder="Search films, series, genres…"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            aria-label="Search your Plex library"
            autoComplete="off"
            spellCheck="false"
          />
          {term ? (
            <button type="button" className="search-form__clear" onClick={clear} aria-label="Clear search">
              <X size={19} />
            </button>
          ) : (
            <kbd className="search-form__hint">/</kbd>
          )}
        </form>
        <p className="search-header__status" aria-live="polite">
          {q.length >= 2
            ? error
              ? 'Search could not finish. Try again below.'
              : showLoading
                ? 'Searching your Plex library…'
                : data?.total
                  ? `${data.total} ${data.total === 1 ? 'result' : 'results'} for “${data.query}”`
                  : `No results for “${q}”`
            : 'Titles and episodes from every film and TV library in Plex.'}
        </p>
      </header>

      {q.length < 2 ? (
        <StatePanel
          icon={Search}
          eyebrow="Start typing"
          title="Search every corner of your library"
          message="Search by film or series title, episode name, cast, or genre. Results come live from Plex."
        >
          <div className="search-suggestions">
            {moviesLibrary ? (
              <Link to={`/library/${moviesLibrary.key}`} className="suggestion-card">
                <Film size={20} />
                <span>
                  <strong>{moviesLibrary.title}</strong>
                  <small>Browse every film</small>
                </span>
              </Link>
            ) : null}
            {showsLibrary ? (
              <Link to={`/library/${showsLibrary.key}`} className="suggestion-card">
                <Tv size={20} />
                <span>
                  <strong>{showsLibrary.title}</strong>
                  <small>Browse every series</small>
                </span>
              </Link>
            ) : null}
          </div>
        </StatePanel>
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : showLoading ? (
        <GridSkeleton count={10} />
      ) : hasResults ? (
        <div className="search-results">
          <ResultGroup title="Films" items={data.movies} icon={Film} />
          <ResultGroup title="Series & episodes" items={data.shows} icon={Tv} />
        </div>
      ) : (
        <StatePanel
          icon={SearchX}
          eyebrow="Nothing found"
          title={`No match for “${q}”`}
          message="Try a shorter title, check the spelling, or browse a library from the sidebar. Nocturne searches only what is already in your Plex library."
          action={
            <button type="button" className="button button--secondary" onClick={clear}>
              Clear search
            </button>
          }
        />
      )}
    </div>
  )
}
