import { useCallback } from 'react'
import { Clapperboard, Settings2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { usePageTitle } from '../hooks/usePageTitle.js'
import { useRemote } from '../hooks/useRemote.js'
import { Hero } from '../components/Hero.jsx'
import { MediaRow } from '../components/MediaRow.jsx'
import { HomeSkeleton } from '../components/Skeleton.jsx'
import { EmptyState, ErrorState } from '../components/StateMessage.jsx'

export function HomePage() {
  usePageTitle()
  const request = useCallback((signal) => api.home(signal), [])
  const { data, loading, error, reload } = useRemote(request)

  if (loading && !data) return <HomeSkeleton />

  if (error && !data) {
    return (
      <div className="page page--state">
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }

  if (!data) return <HomeSkeleton />

  if (!data.rows?.length && !data.hero) {
    return (
      <div className="page page--state">
        <EmptyState
          icon={Clapperboard}
          eyebrow="Your library is quiet"
          title="No films or series yet"
          message="Nocturne only shows what is already inside Plex. Add or scan a Movies or TV Shows library in Plex, then refresh this page."
          action={
            <Link className="button button--secondary" to="/settings">
              <Settings2 size={16} />
              Open settings
            </Link>
          }
        />
      </div>
    )
  }

  const movieLibrary = data.libraries?.find((library) => library.type === 'movie')
  const showLibrary = data.libraries?.find((library) => library.type === 'show')

  return (
    <div className="page page--home">
      {data.hero ? (
        <Hero hero={data.hero} />
      ) : (
        <header className="page-header page-header--home-fallback">
          <p className="eyebrow">Your private cinema</p>
          <h1>Welcome to Nocturne</h1>
          <p>Everything below comes directly from your Plex library.</p>
        </header>
      )}

      <div className="home-rows">
        {data.rows.map((row, index) => {
          let viewAllHref = null
          if (row.id === 'popular-movies' || row.id === 'top-rated') {
            viewAllHref = movieLibrary ? `/library/${movieLibrary.key}` : null
          }
          if (row.id === 'tv-shows') {
            viewAllHref = showLibrary ? `/library/${showLibrary.key}` : null
          }
          return (
            <MediaRow
              key={row.id}
              row={row}
              index={index}
              viewAllHref={viewAllHref}
            />
          )
        })}
      </div>

      <footer className="home-footer">
        <div>
          <span className="home-footer__mark" aria-hidden="true">✦</span>
          <p>
            <strong>Nocturne</strong> is your private screening room. Plex keeps the media — Nocturne
            just makes it feel like the movies.
          </p>
        </div>
        <Link to="/settings" className="home-footer__link">
          {data.server?.name || 'Plex Media Server'}
          <Settings2 size={14} />
        </Link>
      </footer>
    </div>
  )
}
