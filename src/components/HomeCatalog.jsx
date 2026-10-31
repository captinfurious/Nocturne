import { useCallback, useEffect, useRef, useState } from 'react'
import { Clapperboard, LoaderCircle } from 'lucide-react'
import { api } from '../api.js'
import { EmptyState, ErrorState } from './StateMessage.jsx'
import { GridSkeleton } from './Skeleton.jsx'
import { MediaCard } from './MediaCard.jsx'

const PAGE_SIZE = 60

export function HomeCatalog({ type, libraries = [] }) {
  const matching = libraries.filter((library) => library.type === type)
  const isMovies = type === 'movie'
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [nextStart, setNextStart] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [moreError, setMoreError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)
  const requestRef = useRef(0)
  const sentinelRef = useRef(null)

  useEffect(() => {
    if (!matching.length) return undefined

    const controller = new AbortController()
    const requestId = ++requestRef.current

    setLoading(true)
    setError(null)
    setMoreError(null)
    setItems([])
    setTotal(0)
    setNextStart(0)

    api.homeAll(type, { start: 0, size: PAGE_SIZE }, controller.signal)
      .then((result) => {
        if (requestRef.current !== requestId) return
        setItems(result.items || [])
        setTotal(result.totalSize || result.items?.length || 0)
        setNextStart(result.nextStart ?? result.items?.length ?? 0)
        setLoading(false)
      })
      .catch((failure) => {
        if (requestRef.current !== requestId || failure?.name === 'AbortError') return
        setError(failure)
        setLoading(false)
      })

    return () => controller.abort()
    // The library list only changes when Plex libraries are added or removed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, reloadToken, matching.length])

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || error || nextStart >= total) return

    const requestId = requestRef.current
    setLoadingMore(true)
    setMoreError(null)

    try {
      const result = await api.homeAll(type, { start: nextStart, size: PAGE_SIZE })
      if (requestRef.current !== requestId) return

      setItems((current) => {
        const seen = new Set(current.map((item) => item.ratingKey))
        return [...current, ...(result.items || []).filter((item) => !seen.has(item.ratingKey))]
      })
      setTotal(result.totalSize || Math.max(total, nextStart + (result.items?.length || 0)))
      setNextStart(result.nextStart ?? nextStart + (result.items?.length || 0))
    } catch (failure) {
      if (requestRef.current === requestId) setMoreError(failure)
    } finally {
      if (requestRef.current === requestId) setLoadingMore(false)
    }
  }, [type, loading, loadingMore, error, nextStart, total])

  useEffect(() => {
    const node = sentinelRef.current
    if (
      !node
      || loading
      || loadingMore
      || error
      || moreError
      || !total
      || nextStart >= total
    ) {
      return undefined
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore()
      },
      { rootMargin: '900px 0px' },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [loading, loadingMore, error, moreError, total, nextStart, loadMore])

  if (!matching.length) return null

  const retryInitial = () => setReloadToken((value) => value + 1)
  const noun = isMovies ? 'film' : 'series'

  return (
    <section className="home-catalog" aria-labelledby={`home-catalog-${type}`}>
      <header className="home-catalog__header">
        <div>
          <p className="eyebrow">{isMovies ? 'Films' : 'Series'}</p>
          <h2 id={`home-catalog-${type}`}>{isMovies ? 'All movies' : 'All shows'}</h2>
          <p>
            Every {noun} in your Plex library, in one place. Keep scrolling — more load as you go.
          </p>
        </div>
        <span className="home-catalog__count">
          {loading ? 'Loading…' : `${total.toLocaleString()} ${isMovies ? 'films' : 'shows'}`}
        </span>
      </header>

      {loading ? (
        <GridSkeleton count={12} />
      ) : error ? (
        <ErrorState error={error} onRetry={retryInitial} compact />
      ) : items.length ? (
        <>
          <div className="poster-grid home-catalog__grid">
            {items.map((item, index) => (
              <MediaCard key={item.ratingKey} item={item} variant="grid" index={index} />
            ))}
          </div>

          <div className="home-catalog__status">
            <span>
              Showing {items.length.toLocaleString()} of {total.toLocaleString()}
            </span>
            {nextStart < total ? (
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? <LoaderCircle size={14} className="spin" /> : null}
                {loadingMore ? 'Loading more' : 'Load more'}
              </button>
            ) : (
              <span className="home-catalog__complete">Everything is loaded</span>
            )}
          </div>

          {moreError ? (
            <div className="home-catalog__more-error" role="alert">
              <p>{moreError.message}</p>
              <button type="button" className="text-button" onClick={loadMore}>
                Try again
              </button>
            </div>
          ) : null}

          {nextStart < total ? (
            <div ref={sentinelRef} className="home-catalog__sentinel" aria-hidden="true" />
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={Clapperboard}
          eyebrow="Nothing on this shelf"
          title={`No ${isMovies ? 'movies' : 'shows'} found`}
          message="Add media in Plex and run a library scan. Nocturne will show it here on the next refresh."
        />
      )}
    </section>
  )
}
