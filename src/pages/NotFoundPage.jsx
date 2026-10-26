import { Compass } from 'lucide-react'
import { Link } from 'react-router-dom'
import { StatePanel } from '../components/StateMessage.jsx'
import { usePageTitle } from '../hooks/usePageTitle.js'

export function NotFoundPage() {
  usePageTitle('Not found')
  return (
    <div className="page page--state">
      <StatePanel
        icon={Compass}
        eyebrow="404 · Scene missing"
        title="This part of the story isn’t here."
        message="The page may have moved, or the title left your Plex library. The rest of your cinema is still waiting."
        action={<Link className="button button--primary" to="/">Return home</Link>}
      />
    </div>
  )
}
