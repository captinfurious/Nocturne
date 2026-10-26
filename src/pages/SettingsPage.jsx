import { useState } from 'react'
import {
  Check,
  CircleAlert,
  ExternalLink,
  LoaderCircle,
  MonitorPlay,
  RefreshCw,
  RotateCcw,
  Server,
  ShieldCheck,
  Unplug,
  X,
} from 'lucide-react'
import { api } from '../api.js'
import { useNova } from '../app-context.js'
import { usePageTitle } from '../hooks/usePageTitle.js'

export function SettingsPage() {
  usePageTitle('Settings')
  const { health, reloadHealth } = useNova()
  const [busy, setBusy] = useState(null)
  const [notice, setNotice] = useState(null)
  const [problem, setProblem] = useState(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  const run = async (action, task, successMessage) => {
    setBusy(action)
    setNotice(null)
    setProblem(null)
    try {
      const result = await task()
      if (successMessage) setNotice(successMessage)
      reloadHealth()
      return result
    } catch (failure) {
      setProblem(failure)
      return null
    } finally {
      setBusy(null)
    }
  }

  const testConnection = () => run('test', async () => {
    const result = await api.health()
    if (!result.reachable) {
      throw new Error(result.connectionError || 'Plex did not answer the connection test.')
    }
    return result
  }, 'Plex answered. The connection is healthy.')

  const rediscover = () => run('rediscover', async () => {
    const result = await api.rediscover()
    return result
  }, 'Server discovery finished. NOVA is using the fastest available address.')

  const refreshLibrary = () => run('refresh', async () => {
    await api.home(undefined, { refresh: true })
    return true
  }, 'Library data refreshed from Plex.')

  const disconnect = () => run('disconnect', async () => {
    await api.disconnect()
    return true
  }, null)

  const online = health?.reachable
  const serverName = health?.server?.name || 'Plex Media Server'
  const accountName = health?.account?.username || health?.account?.title

  return (
    <div className="page page--settings">
      <header className="page-header page-header--settings">
        <p className="eyebrow">Settings</p>
        <h1>Your cinema, behind the curtain.</h1>
        <p className="page-header__lede">
          NOVA is the interface. Plex stays responsible for your files, playback,
          and watch history. Manage that connection here.
        </p>
      </header>

      {notice ? (
        <div className="alert alert--success alert--dismissible" role="status">
          <Check size={17} />
          <p>{notice}</p>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message">
            <X size={15} />
          </button>
        </div>
      ) : null}

      {problem ? (
        <div className="alert alert--error alert--dismissible" role="alert">
          <CircleAlert size={17} />
          <div>
            <p>{problem.message}</p>
            {problem.detail ? <small>{problem.detail}</small> : null}
          </div>
          <button type="button" onClick={() => setProblem(null)} aria-label="Dismiss error">
            <X size={15} />
          </button>
        </div>
      ) : null}

      <div className="settings-grid">
        <section className="settings-card settings-card--connection">
          <div className="settings-card__heading">
            <span className="settings-icon"><Server size={19} /></span>
            <div>
              <p className="eyebrow">Connection</p>
              <h2>{serverName}</h2>
            </div>
            <span className={`status-pill ${online ? 'is-online' : 'is-offline'}`}>
              <span className={`status-dot ${online ? 'status-dot--online' : 'status-dot--offline'}`} />
              {online ? 'Online' : 'Offline'}
            </span>
          </div>

          <dl className="settings-details">
            <div>
              <dt>Account</dt>
              <dd>{accountName || 'Plex account connected'}</dd>
            </div>
            <div>
              <dt>Server version</dt>
              <dd>{health?.server?.version || 'Unknown'}</dd>
            </div>
            <div>
              <dt>Local address</dt>
              <dd className="mono">{health?.server?.uri || 'Not available'}</dd>
            </div>
            <div>
              <dt>Authentication</dt>
              <dd className="settings-detail__secure">
                <ShieldCheck size={14} />
                Token kept on this PC
              </dd>
            </div>
          </dl>

          <div className="settings-actions">
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={testConnection}
              disabled={Boolean(busy)}
            >
              {busy === 'test' ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}
              Test connection
            </button>
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={rediscover}
              disabled={Boolean(busy)}
            >
              {busy === 'rediscover' ? <LoaderCircle size={15} className="spin" /> : <RotateCcw size={15} />}
              Rediscover server
            </button>
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={refreshLibrary}
              disabled={Boolean(busy)}
            >
              {busy === 'refresh' ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}
              Refresh library
            </button>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card__heading">
            <span className="settings-icon"><MonitorPlay size={19} /></span>
            <div>
              <p className="eyebrow">Playback</p>
              <h2>The projector stays with Plex</h2>
            </div>
          </div>
          <p className="settings-card__copy">
            For a reliable first release, every Play action opens the exact title
            in Plex Web. That means your existing codecs, subtitles, audio tracks,
            resume points, and Plex user profiles all keep working.
          </p>
          <ul className="settings-list">
            <li>Resume progress is read from Plex.</li>
            <li>Watching in NOVA still updates Plex history.</li>
            <li>A native NOVA player can replace this handoff later.</li>
          </ul>
          <a
            className="small-link"
            href={health?.server?.uri ? `${health.server.uri}/web` : 'http://127.0.0.1:32400/web'}
            target="_blank"
            rel="noreferrer"
          >
            Open Plex Web
            <ExternalLink size={12} />
          </a>
        </section>

        <section className="settings-card">
          <div className="settings-card__heading">
            <span className="settings-icon"><ShieldCheck size={19} /></span>
            <div>
              <p className="eyebrow">Privacy</p>
              <h2>Local by design</h2>
            </div>
          </div>
          <p className="settings-card__copy">
            NOVA runs two local processes: the React interface and a small API on
            <code>127.0.0.1</code>. The API holds your Plex token in
            <code>data/config.json</code> and proxies artwork and metadata. Your token
            is never sent to the browser.
          </p>
          <p className="settings-card__footnote">
            Keep NOVA’s backend bound to <code>127.0.0.1</code>. Do not expose it to
            the internet without adding proper authentication.
          </p>
        </section>

        <section className="settings-card">
          <div className="settings-card__heading">
            <span className="settings-icon"><Server size={19} /></span>
            <div>
              <p className="eyebrow">After a restart</p>
              <h2>Bring the cinema back</h2>
            </div>
          </div>
          <ol className="settings-steps">
            <li>Start Plex Media Server.</li>
            <li>Open PowerShell in the NOVA folder.</li>
            <li>Run <code>npm start</code>.</li>
            <li>Open <code>http://127.0.0.1:8787</code>.</li>
          </ol>
          <p className="settings-card__footnote">
            The full Windows walkthrough is in <code>README.md</code>.
          </p>
        </section>
      </div>

      <section className="settings-danger">
        <div>
          <p className="eyebrow">Danger zone</p>
          <h2>Disconnect Plex</h2>
          <p>
            This removes the stored Plex token and server details from this PC.
            It does not touch your Plex library, media files, or Plex account.
          </p>
        </div>
        {confirmDisconnect ? (
          <div className="settings-confirm">
            <p>Disconnect NOVA from Plex?</p>
            <div>
              <button
                type="button"
                className="button button--danger button--small"
                onClick={disconnect}
                disabled={busy === 'disconnect'}
              >
                {busy === 'disconnect' ? <LoaderCircle size={15} className="spin" /> : <Unplug size={15} />}
                Yes, disconnect
              </button>
              <button
                type="button"
                className="button button--ghost button--small"
                onClick={() => setConfirmDisconnect(false)}
                disabled={busy === 'disconnect'}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="button button--danger-outline button--small"
            onClick={() => setConfirmDisconnect(true)}
          >
            <Unplug size={15} />
            Disconnect Plex
          </button>
        )}
      </section>

      <footer className="settings-footer">
        <span className="settings-footer__mark">✦</span>
        <p>NOVA 1.0 · A private cinema for the library you already own.</p>
        <span>Built for Plex</span>
      </footer>
    </div>
  )
}
