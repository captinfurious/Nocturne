import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { MediaCard } from './MediaCard.jsx'

export function MediaRow({ row, viewAllHref = null, index = 0 }) {
  const railRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const titleId = useId()
  const ranked = row.layout === 'ranked'

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
      left: rail.clientWidth * 0.86 * direction,
      behavior: 'smooth',
    })
  }

  if (!row?.items?.length) return null

  return (
    <section
      className={`media-row${ranked ? ' media-row--ranked' : ''}`}
      aria-labelledby={titleId}
      style={{ '--row-delay': `${Math.min(index * 45, 260)}ms` }}
    >
      <div className="media-row__header">
        <h2 id={titleId}>{row.title}</h2>
        <div className="media-row__tools">
          {viewAllHref ? (
            <Link to={viewAllHref} className="media-row__view-all">
              Explore all
              <ArrowRight size={13} />
            </Link>
          ) : null}
          <div className="media-row__arrows">
            <button
              type="button"
              className="media-row__arrow"
              onClick={() => scroll(-1)}
              disabled={!canScrollLeft}
              aria-label={`Scroll ${row.title} left`}
            >
              <ChevronLeft size={19} />
            </button>
            <button
              type="button"
              className="media-row__arrow"
              onClick={() => scroll(1)}
              disabled={!canScrollRight}
              aria-label={`Scroll ${row.title} right`}
            >
              <ChevronRight size={19} />
            </button>
          </div>
        </div>
      </div>

      <div
        className={`media-row__rail${ranked ? ' media-row__rail--ranked' : ''}`}
        ref={railRef}
        onScroll={updateScrollState}
        tabIndex={0}
        aria-label={`${row.title} carousel`}
      >
        {row.items.map((item, cardIndex) => (
          <MediaCard
            key={`${row.id}-${item.ratingKey}`}
            item={item}
            layout={ranked ? 'ranked' : row.layout || 'poster'}
            index={cardIndex}
            rank={ranked ? cardIndex + 1 : null}
          />
        ))}
      </div>
    </section>
  )
}
