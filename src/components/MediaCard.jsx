import { Play, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import {
  detailHref,
  formatEpisodeCode,
  formatRating,
  formatRemaining,
  formatYear,
  initials,
  isPlayable,
  itemLabel,
} from '../lib/format.js'
import { Artwork } from './Artwork.jsx'

export function MediaCard({ item, layout = 'poster', variant = 'rail', index = 0 }) {
  const playable = isPlayable(item)
  const href = detailHref(item)
  const rating = formatRating(item.audienceRating || item.rating)
  const episodeCode = formatEpisodeCode(item)
  const remaining = formatRemaining(item)
  const progress = item.type === 'show' ? item.showProgress : item.progress
  const label = item.type === 'episode'
    ? `${item.title}, ${[episodeCode, item.episodeTitle].filter(Boolean).join(', ')}`
    : item.title
  const image = layout === 'landscape' ? item.images?.wide : item.images?.poster

  return (
    <article
      className={[
        'media-card',
        `media-card--${layout}`,
        `media-card--${variant}`,
        progress > 0 && progress < 0.995 ? 'has-progress' : '',
        item.type === 'episode' ? 'is-episode' : '',
      ].filter(Boolean).join(' ')}
      style={{ '--card-delay': `${Math.min(index * 26, 260)}ms` }}
    >
      <Link className="media-card__main" to={href} aria-label={`Open details for ${label}`}>
        <Artwork
          src={image}
          alt=""
          className="media-card__image"
          fallbackLabel={initials(item.title)}
        />
        <span className="media-card__vignette" aria-hidden="true" />
      </Link>

      <div className="media-card__overlay" aria-hidden="true">
        <div className="media-card__overlay-top">
          {rating ? (
            <span className="media-card__rating">
              <Star size={11} fill="currentColor" />
              {rating}
            </span>
          ) : null}
        </div>
        <div className="media-card__overlay-bottom">
          <span className="media-card__title">{item.title}</span>
          <span className="media-card__meta">
            {item.type === 'episode' ? (
              <>
                {episodeCode ? <span>{episodeCode}</span> : null}
                {item.episodeTitle ? <span className="media-card__episode">{item.episodeTitle}</span> : null}
              </>
            ) : (
              <>
                {formatYear(item.year) ? <span>{formatYear(item.year)}</span> : null}
                {item.contentRating ? <span>{item.contentRating}</span> : null}
                {remaining ? <span>{remaining}</span> : null}
              </>
            )}
          </span>
        </div>
      </div>

      {playable ? (
        <a
          className="media-card__play"
          href={api.playUrl(item.ratingKey)}
          target="_blank"
          rel="noreferrer"
          aria-label={`${item.progress > 0 ? 'Resume' : 'Play'} ${label} in Plex`}
          title="Play in Plex"
        >
          <Play size={17} fill="currentColor" aria-hidden="true" />
        </a>
      ) : null}

      {progress > 0 && progress < 0.995 ? (
        <span
          className="media-card__progress"
          aria-label={`${Math.round(progress * 100)}% watched`}
        >
          <span style={{ width: `${Math.min(100, Math.max(2, progress * 100))}%` }} />
        </span>
      ) : null}

      {variant === 'grid' ? (
        <div className="media-card__caption">
          <span className="media-card__caption-title">{item.title}</span>
          <span className="media-card__caption-meta">{itemLabel(item)}</span>
        </div>
      ) : null}
    </article>
  )
}
