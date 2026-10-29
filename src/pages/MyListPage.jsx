import { ListPlus, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { MediaCard } from '../components/MediaCard.jsx'
import { EmptyState } from '../components/StateMessage.jsx'
import { usePageTitle } from '../hooks/usePageTitle.js'
import { useMyList } from '../lib/myList.js'

export function MyListPage() {
  usePageTitle('My List')
  const { items, count } = useMyList()

  return (
    <div className="page page--my-list">
      <header className="page-header page-header--split">
        <div>
          <p className="eyebrow">
            <Sparkles size={14} />
            Saved by you
          </p>
          <h1>My List</h1>
          <p className="page-header__meta">
            {count ? `${count} ${count === 1 ? 'title' : 'titles'} saved` : 'Nothing saved yet'}
          </p>
        </div>
      </header>

      {items.length ? (
        <>
          <div className="poster-grid">
            {items.map((item, index) => (
              <MediaCard key={item.ratingKey} item={item} variant="grid" index={index} />
            ))}
          </div>
          <p className="my-list__note">
            My List is stored in this browser on this PC. Removing a title here does not delete
            anything from Plex.
          </p>
        </>
      ) : (
        <EmptyState
          icon={ListPlus}
          eyebrow="Your list is empty"
          title="Save something for later"
          message="Use the + button on any poster, or the My List button on a title page. Saved films and series appear here and on your home screen."
          action={
            <Link className="button button--primary" to="/">
              Browse Nocturne
            </Link>
          }
        />
      )}
    </div>
  )
}
