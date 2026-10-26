import { useCallback, useEffect, useState } from 'react'
import { Film, Library, LoaderCircle, Tv } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { api } from '../api.js'
import { usePageTitle } from '../hooks/usePageTitle.js'
import { MediaCard } from '../components/MediaCard.jsx'
import { GridSkeleton } from '../components/Skeleton.jsx'
import { EmptyState, ErrorState } from '../components/StateMessage.jsx'

const SORT_OPTIONS = [
  { value: 'recent', label: 'Recently added' },
  { value: 'title', label: 'A to Z' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'year', label: 'Newest release' },
]

export function LibraryPage() {
  const { key } = useParams()
  const [sort, setSort] = useState('recent')
  const [page, setPage] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [loadMoreError, setLoadMoreError] = useState(null)

  usePageTitle(page?.library?.title || 'Library')

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    setLoading(true)
    setError(null)
    setLoadMoreError(null)
    setItems([])

    api.library(key, { sort, start: 0, size: 60 }, controller.signal)
      .then((result) => {
        if (!active) return
        setPage(result)
        setItems(result.items)
        setLoading(false)
      })
      .catch((failure) => {
        if (!active || failure?.name === 'AbortError') return
        setError(failure)
        setLoading(false)
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [key, sort, reloadToken])

  const loadMore = useCallback(async () => {
    if (loadingMore || !page) return
    setLoadingMore(true)
    setLoadMoreError(null)
    try {
      const result = await api.library(key, { sort, start: items.length, size: 60 })
      setItems((current) => {
        const seen = new Set(current.map((item) => item.ratingKey))
        return [...current, ...result.items.filter((item) => !seen.has(item.ratingKey))]
      })
      setPage((current) => ({ ...current, ...result, items: undefined }))
    } catch (failure) {
      setLoadMoreError(failure)
    } finally {
      setLoadingMore(false)
    }
  }, [items.length, key, loadingMore, page, sort])

  const total = page?.totalSize || items.length
  const hasMore = items.length < total

  if (loading) {
    return (
      <div className="page page--library">
        <header className="page-header">
          <div className="skeleton skeleton--eyebrow" />
          <div className="skeleton skeleton--title" />
          <div className="skeleton skeleton--line skeleton--line-short" />
        </header>
        <GridSkeleton count={12} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="page page--state">
        <ErrorState error={error} onRetry={() => setReloadToken((value) => value + 1)} />
      </div>
    )
  }

  const isShow = page?.library?.type === 'show'
  const TypeIcon = isShow ? Tv : Film

  return (
    <div className="page page--library">
      <header className="page-header page-header--split">
        <div>
          <p className="eyebrow">
            <TypeIcon size={14} />
            Plex library
          </p>
          <h1>{page?.library?.title || 'Library'}</h1>
          <p className="page-header__meta">
            {total ? `${total.toLocaleString()} ${isShow ? 'series' : 'films'}` : 'No titles yet'}
          </p>
        </div>
        <label className="select-wrap">
          <span className="sr-only">Sort library</span>
          <select
            className="select"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </header>

      {items.length ? (
        <>
          <div className="poster-grid">
            {items.map((item, index) => (
              <MediaCard key={item.ratingKey} item={item} variant="grid" index={index} />
            ))}
          </div>

          <div className="library-footer">
            <p>
              Showing {items.length.toLocaleString()} of {total.toLocaleString()}
            </p>
            {hasMore ? (
              <button
                type="button"
                className="button button--secondary"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? <LoaderCircle size={16} className="spin" /> : null}
                {loadingMore ? 'Loading more' : 'Load more'}
              </button>
            ) : null}
            {loadMoreError ? (
              <p className="form-error">{loadMoreError.message}</p>
            ) : null}
          </div>
        </>
      ) : (
        <EmptyState
          icon={Library}
          eyebrow="Nothing on this shelf"
          title={`This ${isShow ? 'series' : 'film'} library is empty`}
          message="Add media in Plex and run a library scan. Nocturne will pick it up on the next refresh."
        />
      )}
    </div>
  )
}
