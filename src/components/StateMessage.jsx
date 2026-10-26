import { CircleAlert, RefreshCw, WifiOff } from 'lucide-react'
import { Link } from 'react-router-dom'

export function StatePanel({
  icon,
  eyebrow,
  title,
  message,
  action,
  children,
  className = '',
}) {
  const Icon = icon || CircleAlert
  return (
    <div className={`state-panel ${className}`.trim()}>
      <div className="state-panel__halo" aria-hidden="true">
        <Icon size={26} strokeWidth={1.6} />
      </div>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h2>{title}</h2>
      {message ? <p className="state-panel__message">{message}</p> : null}
      {children}
      {action ? <div className="state-panel__actions">{action}</div> : null}
    </div>
  )
}

export function ErrorState({ error, onRetry, compact = false }) {
  const needsReconnect = ['PLEX_UNAUTHORIZED', 'NOT_CONFIGURED'].includes(error?.code)
  const offline = ['PLEX_UNREACHABLE', 'NOCTURNE_SERVER_UNREACHABLE'].includes(error?.code)
  const technical = [error?.detail, error?.attempts].filter(Boolean).join('\n')

  return (
    <StatePanel
      icon={offline ? WifiOff : CircleAlert}
      eyebrow={offline ? 'Connection interrupted' : 'Something went wrong'}
      title={needsReconnect ? 'Plex needs to be reconnected' : offline ? 'The theatre is offline' : 'Nocturne hit a snag'}
      message={error?.message || 'Nocturne could not load this right now.'}
      className={compact ? 'state-panel--compact' : ''}
      action={
        <>
          {onRetry ? (
            <button type="button" className="button button--primary" onClick={onRetry}>
              <RefreshCw size={16} />
              Try again
            </button>
          ) : null}
          {needsReconnect ? (
            <Link className="button button--secondary" to="/settings">
              Open settings
            </Link>
          ) : null}
        </>
      }
    >
      {technical ? (
        <details className="technical-details">
          <summary>Technical details</summary>
          <pre>{technical}</pre>
        </details>
      ) : null}
    </StatePanel>
  )
}

export function EmptyState(props) {
  return <StatePanel {...props} />
}
