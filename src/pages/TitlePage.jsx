import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Calendar,
  Check,
  ExternalLink,
  Film,
  Layers,
  Play,
  Star,
  Tv,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { Artwork } from '../components/Artwork.jsx'
import { MediaCard } from '../components/MediaCard.jsx'
import { DetailSkeleton, InlineSpinner } from '../components/Skeleton.jsx'
import { ErrorState, StatePanel } from '../components/StateMessage.jsx'
import { usePageTitle } from '../hooks/usePageTitle.js'
import { useRemote } from '../hooks/useRemote.js'
import { usePlayer } from '../player/PlayerProvider.jsx'
import {
  formatDate,
  formatRating,
  formatRuntime,
  formatYear,
  initials,
} from '../lib/format.js'

function qualityLabel(resolution) {
  if (!resolution) return null
  const value = String(resolution).toLowerCase()
  if (value === '4k') return '4K'
  if (value === '1080') return '1080p'
  if (value === '720') return '720p'
  return String(resolution).toUpperCase()
}

function EpisodeListSkeleton() {
  return (
    <div className="episode-list" aria-busy="true" aria-label="Loading episodes">
      {[0, 1, 2].map((index) => (
        <div className="episode episode--skeleton" key={index}>
          <div className="skeleton episode__thumb-skeleton" />
          <div className="episode__body">
            <div className="skeleton skeleton--line skeleton--line-tiny" />
            <div className="skeleton skeleton--line skeleton--line-short" />
            <div className="skeleton skeleton--copy skeleton--copy-short" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function TitlePage() {
  const { key } = useParams()
  const navigate = useNavigate()
  const { openPlayer } = usePlayer()
  const [seasonKey, setSeasonKey] = useState(null)

  const request = useCallback((signal) => api.title(key, signal), [key])
  const { data, loading, error, reload } = useRemote(request)
  const item = data?.item

  usePageTitle(item?.title || 'Title')

  useEffect(() => {
    if (item?.type === 'episode' && item.seriesRatingKey && item.seriesRatingKey !== key) {
      navigate(`/title/${item.seriesRatingKey}`, { replace: true })
    }
  }, [item, key, navigate])

  useEffect(() => {
    if (!data?.seasons?.length) {
      setSeasonKey(null)
      return
    }
    const sorted = [...data.seasons].sort((a, b) => (a.index ?? 999) - (b.index ?? 999))
    const first = sorted.find((season) => season.index > 0) || sorted[0]
    setSeasonKey(first.ratingKey)
  }, [data?.item?.ratingKey, data?.seasons])

  const seasonRequest = useCallback(
    (signal) => (seasonKey ? api.season(seasonKey, signal) : Promise.resolve(null)),
    [seasonKey],
  )
  const {
    data: seasonData,
    loading: seasonLoading,
    error: seasonError,
    reload: reloadSeason,
  } = useRemote(seasonRequest)

  const currentSeason = seasonData?.season?.ratingKey === seasonKey ? seasonData : null
  const episodes = currentSeason?.episodes || []

  const nextEpisode = useMemo(() => {
    if (data?.resumeEpisode?.progress > 0) return data.resumeEpisode
    if (!episodes.length) return data?.resumeEpisode || null
    return episodes.find((episode) => episode.progress > 0)
      || episodes.find((episode) => !episode.viewCount)
      || episodes[0]
  }, [data?.resumeEpisode, episodes])

  if (loading && !data) return <DetailSkeleton />

  if (error) {
    return (
      <div className="page page--state">
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }

  if (!item) return <DetailSkeleton />

  const isShow = item.type === 'show'
  const rating = formatRating(item.audienceRating || item.rating)
  const year = formatYear(item.year)
  const runtime = formatRuntime(item.duration)
  const quality = qualityLabel(item.videoResolution)
  const TypeIcon = isShow ? Tv : Film
  const playTarget = isShow && nextEpisode ? nextEpisode : item
  const movieProgress = !isShow ? data.resumeItem?.progress || item.progress : 0
  const playLabel = isShow
    ? nextEpisode
      ? `${nextEpisode.progress > 0 ? 'Resume' : 'Play'} ${nextEpisode.episodeCode || 'episode'}`
      : 'Open in Plex'
    : movieProgress > 0
      ? 'Resume'
      : 'Play now'

  return (
    <div className="title-page">
      <section className="title-hero" aria-labelledby="title-heading">
        <div className="title-hero__backdrop">
          <Artwork
            src={item.images?.hero || item.images?.wide}
            alt=""
            className="title-hero__image"
            loading="eager"
            fetchPriority="high"
            fallbackLabel={item.title}
          />
          <div className="title-hero__wash" aria-hidden="true" />
          <div className="title-hero__grain" aria-hidden="true" />
        </div>

        <div className="title-hero__inner">
          <Link to="/" className="back-link">
            <ArrowLeft size={16} />
            Back to browse
          </Link>

          <div className="title-hero__grid">
            <div className="title-poster">
              <Artwork
                src={item.images?.poster}
                alt={`${item.title} poster`}
                className="title-poster__image"
                fallbackLabel={initials(item.title)}
              />
              <span className="title-poster__edge" aria-hidden="true" />
            </div>

            <div className="title-copy">
              <p className="title-kicker">
                <TypeIcon size={14} />
                {isShow ? 'Series' : 'Film'}
                {year ? <><span className="meta-dot" />{year}</> : null}
              </p>
              <h1 id="title-heading">{item.title}</h1>
              {item.tagline ? <p className="title-tagline">“{item.tagline}”</p> : null}

              <div className="title-meta">
                {rating ? (
                  <span className="title-rating">
                    <Star size={14} fill="currentColor" />
                    {rating}
                    <small>/10</small>
                  </span>
                ) : null}
                {item.contentRating ? <span className="chip">{item.contentRating}</span> : null}
                {!isShow && runtime ? <span>{runtime}</span> : null}
                {isShow && item.leafCount ? <span>{item.leafCount} episodes</span> : null}
                {quality ? <span className="chip chip--quiet">{quality}</span> : null}
                {item.studio ? <span>{item.studio}</span> : null}
              </div>

              <div className="title-actions">
                {isShow && !nextEpisode ? (
                  <a
                    className="button button--primary button--large"
                    href={api.playUrl(item.ratingKey)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={19} aria-hidden="true" />
                    Open in Plex
                  </a>
                ) : (
                  <button
                    type="button"
                    className="button button--primary button--large"
                    onClick={() => openPlayer(playTarget)}
                  >
                    <Play size={19} fill="currentColor" aria-hidden="true" />
                    {playLabel}
                  </button>
                )}
                {isShow ? (
                  <a
                    className="button button--glass button--large"
                    href={api.playUrl(item.ratingKey)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={17} aria-hidden="true" />
                    Series in Plex
                  </a>
                ) : null}
              </div>
              <p className="title-playback-note">
                Plays inside Nocturne. Progress is written back to Plex as you watch.
              </p>

              <p className="title-summary">{item.summary || 'No description is available for this title yet.'}</p>

              {isShow && item.leafCount ? (
                <div className="title-watch-progress">
                  <div className="title-watch-progress__labels">
                    <span><Layers size={14} /> Series progress</span>
                    <span>{item.viewedLeafCount || 0} of {item.leafCount} watched</span>
                  </div>
                  <div className="progress-track">
                    <span style={{ width: `${Math.max(0, Math.min(100, item.showProgress * 100))}%` }} />
                  </div>
                </div>
              ) : null}

              <div className="title-facts">
                {item.genres?.length ? (
                  <div>
                    <span>Genres</span>
                    <p>{item.genres.join(' · ')}</p>
                  </div>
                ) : null}
                {item.directors?.length ? (
                  <div>
                    <span>Director</span>
                    <p>{item.directors.join(' · ')}</p>
                  </div>
                ) : null}
                {item.cast?.length ? (
                  <div>
                    <span>Cast</span>
                    <p>{item.cast.slice(0, 6).map((person) => person.name).join(' · ')}</p>
                  </div>
                ) : null}
                {item.originallyAvailableAt ? (
                  <div>
                    <span>Released</span>
                    <p>{formatDate(item.originallyAvailableAt)}</p>
                  </div>
                ) : null}
                {item.container || item.videoCodec ? (
                  <div>
                    <span>Source</span>
                    <p>
                      {[quality, item.videoCodec, item.audioCodec].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="title-body">
        {isShow ? (
          <section className="title-section" aria-labelledby="episodes-heading">
            <div className="title-section__header">
              <div>
                <p className="eyebrow">The full story</p>
                <h2 id="episodes-heading">Episodes</h2>
              </div>
              {seasonData?.season && seasonData.season.ratingKey === seasonKey && seasonLoading ? (
                <InlineSpinner label="Loading season" />
              ) : null}
            </div>

            {data.seasons?.length ? (
              <div className="season-tabs" role="tablist" aria-label="Choose a season">
                {data.seasons.map((season) => (
                  <button
                    key={season.ratingKey}
                    type="button"
                    role="tab"
                    aria-selected={season.ratingKey === seasonKey}
                    className={`season-tab${season.ratingKey === seasonKey ? ' is-active' : ''}`}
                    onClick={() => setSeasonKey(season.ratingKey)}
                  >
                    {season.title}
                    {season.leafCount ? <span>{season.leafCount}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}

            {seasonError ? (
              <ErrorState error={seasonError} onRetry={reloadSeason} compact />
            ) : seasonLoading && !currentSeason ? (
              <EpisodeListSkeleton />
            ) : episodes.length ? (
              <div className="episode-list">
                {episodes.map((episode) => {
                  const progress = episode.progress
                  const watched = episode.viewCount > 0 && progress <= 0
                  return (
                    <article className="episode" key={episode.ratingKey}>
                      <button
                        type="button"
                        className="episode__thumb"
                        onClick={() => openPlayer(episode)}
                        aria-label={`Play ${episode.episodeCode || ''} ${episode.episodeTitle || ''}`}
                      >
                        <Artwork
                          src={episode.images?.episode || episode.images?.wide}
                          alt=""
                          className="episode__image"
                          fallbackLabel={initials(item.title)}
                        />
                        <span className="episode__thumb-shade" aria-hidden="true" />
                        <span className="episode__play-icon" aria-hidden="true">
                          <Play size={16} fill="currentColor" />
                        </span>
                        {progress > 0 ? (
                          <span className="episode__progress" aria-label={`${Math.round(progress * 100)}% watched`}>
                            <span style={{ width: `${Math.min(100, progress * 100)}%` }} />
                          </span>
                        ) : null}
                      </button>

                      <div className="episode__body">
                        <div className="episode__meta">
                          {episode.index ? <span>Episode {episode.index}</span> : null}
                          {formatRuntime(episode.duration) ? <span>{formatRuntime(episode.duration)}</span> : null}
                          {watched ? (
                            <span className="episode__watched">
                              <Check size={12} />
                              Watched
                            </span>
                          ) : null}
                          {progress > 0 ? <span>{Math.round(progress * 100)}% watched</span> : null}
                        </div>
                        <h3>{episode.episodeTitle || `Episode ${episode.index || ''}`}</h3>
                        {episode.summary ? <p>{episode.summary}</p> : null}
                      </div>

                      <button
                        type="button"
                        className="episode__action"
                        onClick={() => openPlayer(episode)}
                      >
                        <Play size={15} fill="currentColor" />
                        {progress > 0 ? 'Resume' : 'Play'}
                      </button>
                    </article>
                  )
                })}
              </div>
            ) : (
              <StatePanel
                icon={Calendar}
                eyebrow="No episodes found"
                title="This season has no episodes yet"
                message="Plex may still be scanning, or this season has no available files."
                className="state-panel--compact"
              />
            )}
          </section>
        ) : null}

        {data.related?.length ? (
          <section className="title-section" aria-labelledby="related-heading">
            <div className="title-section__header">
              <div>
                <p className="eyebrow">Stay in the story</p>
                <h2 id="related-heading">More like this</h2>
              </div>
            </div>
            <div className="poster-grid">
              {data.related.map((related, index) => (
                <MediaCard key={related.ratingKey} item={related} variant="grid" index={index} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
