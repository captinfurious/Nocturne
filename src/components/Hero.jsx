import { Check, Info, Play, Plus, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatRating, formatRuntime, formatYear } from '../lib/format.js'
import { useMyList } from '../lib/myList.js'
import { usePlayer } from '../player/PlayerProvider.jsx'
import { Artwork } from './Artwork.jsx'

function qualityLabel(resolution) {
  if (!resolution) return 'HD'
  const value = String(resolution).toLowerCase()
  if (value === '4k') return '4K'
  if (value === '1080') return 'HD'
  if (value === '720') return 'HD'
  return String(resolution).toUpperCase()
}

export function Hero({ hero }) {
  const { openPlayer } = usePlayer()
  const { has, toggle } = useMyList()

  if (!hero) return null

  const isMovie = hero.type === 'movie'
  const rating = formatRating(hero.audienceRating || hero.rating)
  const runtime = formatRuntime(hero.duration)
  const year = formatYear(hero.year)
  const saved = has(hero.ratingKey)
  const episodeCount = hero.type === 'show' && hero.leafCount
    ? `${hero.leafCount} ${hero.leafCount === 1 ? 'episode' : 'episodes'}`
    : null
  const metadata = [
    year,
    isMovie ? runtime : episodeCount,
    rating ? (
      <span className="hero__rating" key="rating">
        <Star size={12} fill="currentColor" />
        {rating}
      </span>
    ) : null,
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
      </div>

      <div className="hero__content">
        <p className="hero__eyebrow">
          <span className="hero__eyebrow-tag">Nocturne</span>
          {hero.eyebrow || (isMovie ? 'Featured film' : 'Featured series')}
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

        <p className="hero__summary">
          {hero.summary || 'A title from your Plex library, ready to play.'}
        </p>

        <div className="hero__actions">
          {isMovie ? (
            <button
              type="button"
              className="button button--primary button--large"
              onClick={() => openPlayer(hero)}
            >
              <Play size={20} fill="currentColor" aria-hidden="true" />
              {hero.progress > 0 ? 'Resume' : 'Play'}
            </button>
          ) : (
            <Link className="button button--primary button--large" to={`/title/${hero.ratingKey}`}>
              <Play size={20} fill="currentColor" aria-hidden="true" />
              Explore series
            </Link>
          )}

          <Link className="button button--glass button--large" to={`/title/${hero.ratingKey}`}>
            <Info size={19} aria-hidden="true" />
            More Info
          </Link>

          <button
            type="button"
            className={`hero__list-button${saved ? ' is-saved' : ''}`}
            onClick={() => toggle(hero)}
            aria-label={saved ? `Remove ${hero.title} from My List` : `Add ${hero.title} to My List`}
            aria-pressed={saved}
            title={saved ? 'Remove from My List' : 'Add to My List'}
          >
            {saved ? <Check size={19} aria-hidden="true" /> : <Plus size={20} aria-hidden="true" />}
          </button>
        </div>

        <p className="hero__playback-note">
          Plays inside Nocturne. Progress syncs with Plex.
        </p>
      </div>

      <div className="hero__ratingbox" aria-label="Title rating">
        <span>{hero.contentRating || 'NR'}</span>
        <span>{qualityLabel(hero.videoResolution)}</span>
      </div>
    </section>
  )
}
