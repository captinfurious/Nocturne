import { useCallback, useEffect, useRef, useState } from 'react'
import { Clapperboard, LoaderCircle } from 'lucide-react'
import { api } from '../api.js'
import { EmptyState, ErrorState } from './StateMessage.jsx'
import { GridSkeleton } from './Skeleton.jsx'
import { MediaCard } from './MediaCard.jsx'

const PAGE_SIZE = 60

export function HomeLibraryBrowser({ libraries = [] }) {
  const [activeKey, setActiveKey] = useState(libraries[0]?.key || null)
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [moreError, setMoreError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)
  const requestRef = useRef(0)
  const sentinelRef = useRef(null)

  const activeLibrary = libraries.find((library) => library.key === activeKey) || libraries[0] || null

  useEffect(() => {
    if (libraries.length && !libraries.some((library) => library.key === activeKey)) {
      setActiveKey(libraries[0].key)
    }
  }, [libraries, activeKey])

  useEffect(() => {
    if (!activeKey) return undefined

    const controller = new AbortController()
    const requestId = ++requestRef.current

    setLoading(true)
    setLoadingMore(false)
    setError(null)
    setMoreError(null)
    setItems([])
    setTotal(0)

    api.library(activeKey, { start: 0, size: PAGE_SIZE }, controller.signal)
      .then((result) => {
        if (requestRef.current !== requestId) return
        setItems(result.items || [])
        setTotal(result.totalSize || result.items?.length || 0)
        setLoading(false)
      })
      .catch((failure) => {
        if (requestRef.current !== requestId || failure?.name === 'AbortError') return
        setError(failure)
        setLoading(false)
      })

    return () => controller.abort()
  }, [activeKey, reloadToken])

  const loadMore = useCallback(async () => {
    if (!activeKey || loading || loadingMore || error || items.length >= total) return

    const requestId = requestRef.current
    setLoadingMore(true)
    setMoreError(null)

    try {
      const result = await api.library(activeKey, { start: items.length, size: PAGE_SIZE })
      if (requestRef.current !== requestId) return

      setItems((current) => {
        const seen = new Set(current.map((item) => item.ratingKey))
        return [...current, ...(result.items || []).filter((item) => !seen.has(item.ratingKey))]
      })
      setTotal(result.totalSize || Math.max(total, items.length + (result.items?.length || 0)))
    } catch (failure) {
      if (requestRef.current === requestId) setMoreError(failure)
    } finally {
      if (requestRef.current === requestId) setLoadingMore(false)
    }
  }, [activeKey, loading, loadingMore, error, items.length, total])

  useEffect(() => {
    const node = sentinelRef.current
    if (
      !node
      || loading
      || loadingMore
      || error
      || moreError
      || !total
      || items.length >= total
    ) {
      return undefined
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore()
      },
      { rootMargin: '700px 0px' },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [loading, loadingMore, error, moreError, total, items.length, loadMore])

  if (!libraries.length) return null

  const retryInitial = () => setReloadToken((value) => value + 1)

  return (
    <section className="home-library" aria-labelledby="home-library-title">
      <header className="home-library__header">
        <div>
          <p className="eyebrow">Everything you own</p>
          <h2 id="home-library-title">Your whole library</h2>
          <p>
            Every film and series across all {libraries.length} Plex{' '}
            {libraries.length === 1 ? 'library' : 'libraries'}. Keep scrolling — titles load as you go.
          </p>
        </div>
        <span className="home-library__count">
          {loading ? 'Loading…' : `${total.toLocaleString()} ${activeLibrary?.type === 'show' ? 'series' : 'titles'}`}
        </span>
      </header>

      <div className="home-library__tabs" role="tablist" aria-label="Choose a Plex library">
        {libraries.map((library) => (
          <button
            key={library.key}
            type="button"
            role="tab"
            aria-selected={library.key === activeKey}
            className={`home-library__tab${library.key === activeKey ? ' is-active' : ''}`}
            onClick={() => setActiveKey(library.key)}
          >
            {library.title}
          </button>
        ))}
      </div>

      {loading ? (
        <GridSkeleton count={12} />
      ) : error ? (
        <ErrorState error={error} onRetry={retryInitial} compact />
      ) : items.length ? (
        <>
          <div className="poster-grid home-library__grid">
            {items.map((item, index) => (
              <MediaCard key={item.ratingKey} item={item} variant="grid" index={index} />
            ))}
          </div>

          <div className="home-library__status">
            <span>
              Showing {items.length.toLocaleString()} of {total.toLocaleString()}
            </span>
            {items.length < total ? (
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? <LoaderCircle size={14} className="spin" /> : null}
                {loadingMore ? 'Loading more' : 'Load more titles'}
              </button>
            ) : (
              <span className="home-library__complete">Every title is loaded</span>
            )}
          </div>

          {moreError ? (
            <div className="home-library__more-error" role="alert">
              <p>{moreError.message}</p>
              <button type="button" className="text-button" onClick={loadMore}>
                Try again
              </button>
            </div>
          ) : null}

          {items.length < total ? (
            <div ref={sentinelRef} className="home-library__sentinel" aria-hidden="true" />
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={Clapperboard}
          eyebrow="Nothing on this shelf"
          title={`${activeLibrary?.title || 'This library'} is empty`}
          message="Add media in Plex and run a library scan. Nocturne will show it here on the next refresh."
        />
      )}
    </section>
  )
}
