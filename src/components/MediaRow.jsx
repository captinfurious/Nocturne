import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { MediaCard } from './MediaCard.jsx'

export function MediaRow({ row, viewAllHref = null, index = 0 }) {
  const railRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const titleId = useId()

  const updateScrollState = useCallback(() => {
    const rail = railRef.current
    if (!rail) return
    setCanScrollLeft(rail.scrollLeft > 8)
    setCanScrollRight(rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 8)
  }, [])

  useEffect(() => {
    const rail = railRef.current
    if (!rail) return undefined

    updateScrollState()
    const observer = new ResizeObserver(updateScrollState)
    observer.observe(rail)
    return () => observer.disconnect()
  }, [row.items.length, updateScrollState])

  const scroll = (direction) => {
    const rail = railRef.current
    if (!rail) return
    rail.scrollBy({
      left: rail.clientWidth * 0.82 * direction,
      behavior: 'smooth',
    })
  }

  if (!row?.items?.length) return null

  return (
    <section
      className="media-row"
      aria-labelledby={titleId}
      style={{ '--row-delay': `${Math.min(index * 55, 300)}ms` }}
    >
      <div className="media-row__header">
        <div className="media-row__heading">
          <h2 id={titleId}>{row.title}</h2>
          {row.subtitle ? <p>{row.subtitle}</p> : null}
        </div>
        <div className="media-row__tools">
          {viewAllHref ? (
            <Link to={viewAllHref} className="media-row__view-all">
              View all
              <ArrowRight size={14} />
            </Link>
          ) : null}
          <div className="media-row__arrows">
            <button
              type="button"
              className="icon-button"
              onClick={() => scroll(-1)}
              disabled={!canScrollLeft}
              aria-label={`Scroll ${row.title} left`}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => scroll(1)}
              disabled={!canScrollRight}
              aria-label={`Scroll ${row.title} right`}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      <div
        className="media-row__rail"
        ref={railRef}
        onScroll={updateScrollState}
        tabIndex={0}
        aria-label={`${row.title} carousel`}
      >
        {row.items.map((item, cardIndex) => (
          <MediaCard
            key={`${row.id}-${item.ratingKey}`}
            item={item}
            layout={row.layout || 'poster'}
            index={cardIndex}
          />
        ))}
      </div>
    </section>
  )
}
