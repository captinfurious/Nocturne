import { LoaderCircle } from 'lucide-react'

export function InlineSpinner({ label = 'Loading', size = 18 }) {
  return (
    <span className="inline-spinner" role="status">
      <LoaderCircle size={size} className="spin" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  )
}

function PosterSkeleton() {
  return (
    <div className="skeleton-card">
      <div className="skeleton skeleton--poster" />
      <div className="skeleton skeleton--line skeleton--line-short" />
      <div className="skeleton skeleton--line skeleton--line-tiny" />
    </div>
  )
}

export function GridSkeleton({ count = 12 }) {
  return (
    <div className="poster-grid" aria-busy="true" aria-label="Loading titles">
      {Array.from({ length: count }, (_, index) => (
        <PosterSkeleton key={index} />
      ))}
    </div>
  )
}

export function HomeSkeleton() {
  return (
    <div className="home-skeleton" aria-busy="true" aria-label="Loading your cinema">
      <div className="skeleton-hero">
        <div className="skeleton skeleton--eyebrow" />
        <div className="skeleton skeleton--title" />
        <div className="skeleton skeleton--title skeleton--title-short" />
        <div className="skeleton skeleton--copy" />
        <div className="skeleton skeleton--copy skeleton--copy-short" />
        <div className="skeleton-actions">
          <div className="skeleton skeleton--button" />
          <div className="skeleton skeleton--button skeleton--button-ghost" />
        </div>
      </div>
      <div className="skeleton-rows">
        {[0, 1, 2].map((row) => (
          <section className="skeleton-row" key={row}>
            <div className="skeleton skeleton--row-title" />
            <div className="skeleton-row__rail">
              {Array.from({ length: 7 }, (_, index) => (
                <PosterSkeleton key={index} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

export function DetailSkeleton() {
  return (
    <div className="detail-skeleton" aria-busy="true" aria-label="Loading title">
      <div className="detail-skeleton__backdrop skeleton" />
      <div className="detail-skeleton__content">
        <div className="detail-skeleton__poster skeleton" />
        <div className="detail-skeleton__copy">
          <div className="skeleton skeleton--eyebrow" />
          <div className="skeleton skeleton--title" />
          <div className="skeleton skeleton--copy" />
          <div className="skeleton skeleton--copy skeleton--copy-short" />
          <div className="skeleton-actions">
            <div className="skeleton skeleton--button" />
            <div className="skeleton skeleton--button skeleton--button-ghost" />
          </div>
        </div>
      </div>
    </div>
  )
}
