import { ExternalLink, Info, Play, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { formatRating, formatRuntime, formatYear } from '../lib/format.js'
import { usePlayer } from '../player/PlayerProvider.jsx'
import { Artwork } from './Artwork.jsx'

function qualityLabel(resolution) {
  if (!resolution) return null
  const value = String(resolution).toLowerCase()
  if (value === '4k') return '4K'
  if (value === '1080') return '1080p'
  if (value === '720') return '720p'
  return String(resolution).toUpperCase()
}

export function Hero({ hero }) {
  const { openPlayer } = usePlayer()

  if (!hero) return null

  const rating = formatRating(hero.audienceRating || hero.rating)
  const runtime = formatRuntime(hero.duration)
  const year = formatYear(hero.year)
  const quality = qualityLabel(hero.videoResolution)
  const isMovie = hero.type === 'movie'
  const episodeCount = hero.type === 'show' && hero.leafCount ? `${hero.leafCount} episodes` : null
  const metadata = [
    year,
    hero.contentRating,
    rating ? (
      <span className="hero__rating" key="rating">
        <Star size={13} fill="currentColor" />
        {rating}
      </span>
    ) : null,
    isMovie ? runtime : episodeCount,
    quality,
  ].filter(Boolean)

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__backdrop">
        <Artwork
          src={hero.images?.hero || hero.images?.wide}
          alt=""
          className="hero__image"
          loading="eager"
          fetchPriority="high"
          fallbackLabel={hero.title}
        />
        <div className="hero__wash" aria-hidden="true" />
        <div className="hero__grain" aria-hidden="true" />
      </div>

      <div className="hero__content">
        <p className="hero__eyebrow">
          <span className="hero__eyebrow-star" aria-hidden="true">✦</span>
          {hero.eyebrow}
          <span className="hero__eyebrow-rule" aria-hidden="true" />
          From your Plex library
        </p>
        <h1 id="hero-title" className="hero__title">{hero.title}</h1>
        <div className="hero__meta">
          {metadata.map((entry, index) => (
            <span className="hero__meta-item" key={index}>
              {index > 0 ? <span className="meta-dot" aria-hidden="true" /> : null}
              {entry}
            </span>
          ))}
        </div>
        {hero.genres?.length ? (
          <p className="hero__genres">{hero.genres.slice(0, 3).join(' · ')}</p>
        ) : null}
        <p className="hero__summary">{hero.summary}</p>
        <div className="hero__actions">
          {isMovie ? (
            <button
              type="button"
              className="button button--primary button--large"
              onClick={() => openPlayer(hero)}
            >
              <Play size={19} fill="currentColor" aria-hidden="true" />
              {hero.progress > 0 ? 'Resume' : 'Play now'}
            </button>
          ) : (
            <Link className="button button--primary button--large" to={`/title/${hero.ratingKey}`}>
              <Play size={19} fill="currentColor" aria-hidden="true" />
              Explore series
            </Link>
          )}

          {isMovie ? (
            <Link className="button button--glass button--large" to={`/title/${hero.ratingKey}`}>
              <Info size={18} aria-hidden="true" />
              More details
            </Link>
          ) : (
            <a
              className="button button--glass button--large"
              href={api.playUrl(hero.ratingKey)}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={17} aria-hidden="true" />
              Open in Plex
            </a>
          )}
        </div>
        <p className="hero__playback-note">
          <span className="status-dot status-dot--violet" aria-hidden="true" />
          Plays inside Nocturne · progress syncs with Plex
        </p>
      </div>

      <div className="hero__index" aria-hidden="true">
        <span className="hero__index-number">01</span>
        <span className="hero__index-line" />
        <span className="hero__index-label">Now showing</span>
      </div>
    </section>
  )
}
