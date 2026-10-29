import { Check, Info, Play, Plus, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
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
import { useMyList } from '../lib/myList.js'
import { usePlayer } from '../player/PlayerProvider.jsx'
import { Artwork } from './Artwork.jsx'

export function MediaCard({ item, layout = 'poster', variant = 'rail', index = 0, rank = null }) {
  const { openPlayer } = usePlayer()
  const { has, toggle } = useMyList()
  const playable = isPlayable(item)
  const href = detailHref(item)
  const rating = formatRating(item.audienceRating || item.rating)
  const episodeCode = formatEpisodeCode(item)
  const remaining = formatRemaining(item)
  const progress = item.type === 'show' ? item.showProgress : item.progress
  const saved = has(item.ratingKey)
  const label = item.type === 'episode'
    ? `${item.title}, ${[episodeCode, item.episodeTitle].filter(Boolean).join(', ')}`
    : item.title
  const image = layout === 'landscape'
    ? item.images?.wide
    : item.images?.poster

  return (
    <article
      className={[
        'media-card',
        `media-card--${layout}`,
        `media-card--${variant}`,
        rank ? 'media-card--ranked' : '',
        progress > 0 && progress < 0.995 ? 'has-progress' : '',
        item.type === 'episode' ? 'is-episode' : '',
      ].filter(Boolean).join(' ')}
      style={{ '--card-delay': `${Math.min(index * 24, 240)}ms` }}
    >
      {rank ? <span className="media-card__rank" aria-hidden="true">{rank}</span> : null}

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
        {rating ? (
          <span className="media-card__rating">
            <Star size={10} fill="currentColor" />
            {rating}
          </span>
        ) : null}
        <div className="media-card__info">
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

      <div className="media-card__actions">
        {playable ? (
          <button
            type="button"
            className="media-card__action media-card__action--play"
            onClick={() => openPlayer(item)}
            aria-label={`${item.progress > 0 ? 'Resume' : 'Play'} ${label}`}
            title={item.progress > 0 ? 'Resume' : 'Play'}
          >
            <Play size={15} fill="currentColor" aria-hidden="true" />
          </button>
        ) : null}

        <button
          type="button"
          className={`media-card__action media-card__action--list${saved ? ' is-saved' : ''}`}
          onClick={() => toggle(item)}
          aria-label={saved ? `Remove ${label} from My List` : `Add ${label} to My List`}
          aria-pressed={saved}
          title={saved ? 'Remove from My List' : 'Add to My List'}
        >
          {saved ? <Check size={15} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
        </button>

        <Link
          className="media-card__action media-card__action--info"
          to={href}
          aria-label={`More information about ${label}`}
          title="More information"
        >
          <Info size={15} aria-hidden="true" />
        </Link>
      </div>

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
