import { useEffect, useRef, useState } from 'react'
import {
  Check,
  CircleAlert,
  Download,
  ExternalLink,
  Laptop,
  LoaderCircle,
  MonitorPlay,
  Power,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Server,
  ShieldCheck,
  Unplug,
  Upload,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { api } from '../api.js'
import { useNocturne } from '../app-context.js'
import { usePageTitle } from '../hooks/usePageTitle.js'

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch('/api/health', { cache: 'no-store' })
      if (response.ok) {
        const body = await response.json()
        if (body?.product === 'Nocturne') return true
      }
    } catch {
      // The server is expected to be down for a moment during a restart.
    }
    await new Promise((resolve) => setTimeout(resolve, 750))
  }
  return false
}

export function SettingsPage() {
  usePageTitle('Settings')
  const { health, reloadHealth } = useNocturne()
  const [busy, setBusy] = useState(null)
  const [notice, setNotice] = useState(null)
  const [problem, setProblem] = useState(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [confirmStopServer, setConfirmStopServer] = useState(false)
  const [update, setUpdate] = useState(null)
  const [updateFile, setUpdateFile] = useState(null)
  const [updateAddress, setUpdateAddress] = useState('')
  const updateFileRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    api.updateInfo()
      .then((info) => {
        if (cancelled) return
        setUpdate(info)
        setUpdateAddress(info?.source?.url || '')
      })
      .catch(() => {
        if (!cancelled) setUpdate(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

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
  }, 'Server discovery finished. Nocturne is using the fastest available address.')

  const refreshLibrary = () => run('refresh', async () => {
    await api.home(undefined, { refresh: true })
    return true
  }, 'Library data refreshed from Plex.')

  const disconnect = () => run('disconnect', async () => {
    await api.disconnect()
    return true
  }, null)

  const toggleLan = () => run('lan', async () => {
    const next = !health?.network?.lanEnabled
    await api.setLan(next)
    return next
  }, health?.network?.lanEnabled
    ? 'LAN access is off. Other devices can no longer open Nocturne.'
    : 'LAN access is on. If an address appears below, open it on another device on this Wi-Fi.')

  const restartServer = async () => {
    setBusy('restart-server')
    setNotice('Restarting the local server…')
    setProblem(null)
    try {
      await api.restartServer()
      const returned = await waitForServer()
      if (!returned) {
        throw new Error('The server did not come back. Use the Nocturne control page or start Nocturne again.')
      }
      window.location.reload()
    } catch (failure) {
      setProblem(failure)
      setBusy(null)
    }
  }

  const stopServer = async () => {
    setBusy('stop-server')
    setProblem(null)
    try {
      const result = await api.stopServer()
      setConfirmStopServer(false)
      setNotice('Stopping the local server…')
      window.setTimeout(() => {
        window.location.href = result.controlUrl
      }, 450)
    } catch (failure) {
      setProblem(failure)
      setBusy(null)
    }
  }

  const saveUpdateAddress = () => run('update-source', async () => {
    const result = await api.setUpdateSource(updateAddress.trim())
    setUpdate((current) => (current ? { ...current, source: result.source } : current))
    setUpdateAddress(result.source?.url || '')
    return result
  }, 'Update address saved. Nocturne can install packages from it from now on.')

  const installUpdate = async () => {
    if (!updateFile && !updateAddress.trim()) return
    setBusy('update')
    setProblem(null)
    setNotice('Installing the update. Nocturne restarts when it is done…')

    try {
      const result = await api.installUpdate(
        updateFile ? { file: updateFile } : { url: updateAddress.trim() },
      )
      setUpdateFile(null)
      if (updateFileRef.current) updateFileRef.current.value = ''
      setNotice(`Nocturne ${result.toVersion} is installed. Restarting…`)

      const returned = await waitForServer(60_000)
      if (returned) {
        window.location.reload()
        return
      }

      setNotice(
        `Nocturne ${result.toVersion} is installed. Close and open Nocturne again to use it.`,
      )
      setBusy(null)
    } catch (failure) {
      setProblem(failure)
      setBusy(null)
    }
  }

  const network = health?.network
  const lanUrls = network?.urls || []
  const canShare = Boolean(network?.lanEnabled && lanUrls.length)
  const localClient = network?.localClient !== false
  const control = health?.control
  const controlsAvailable = Boolean(control?.available)
  const online = health?.reachable
  const serverName = health?.server?.name || 'Plex Media Server'
  const accountName = health?.account?.username || health?.account?.title
  const tokenPath = health?.install
    ? '%LOCALAPPDATA%\\Nocturne\\data\\config.json'
    : 'data/config.json'

  return (
    <div className="page page--settings">
      <header className="page-header page-header--settings">
        <p className="eyebrow">Settings</p>
        <h1>Your cinema, behind the curtain.</h1>
        <p className="page-header__lede">
          Nocturne is the interface. Plex stays responsible for your files, playback,
          and watch history. Manage that connection here.
        </p>
      </header>

      {!localClient ? (
        <div className="alert alert--info" role="status">
          <ShieldCheck size={17} />
          <div>
            <strong>Viewing from another device</strong>
            <p>
              You can browse and play from this device. Plex connection and network changes
              must be made on the PC running Nocturne.
            </p>
          </div>
        </div>
      ) : null}

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
              disabled={Boolean(busy) || !localClient}
              title={localClient ? undefined : 'Change this on the PC running Nocturne'}
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

        <section className="settings-card settings-card--network">
          <div className="settings-card__heading">
            <span className="settings-icon">
              {network?.lanEnabled ? <Wifi size={19} /> : <WifiOff size={19} />}
            </span>
            <div>
              <p className="eyebrow">Network</p>
              <h2>Watch from another screen</h2>
            </div>
            <button
              type="button"
              className={`settings-switch${network?.lanEnabled ? ' is-on' : ''}`}
              role="switch"
              aria-checked={Boolean(network?.lanEnabled)}
              aria-label="Allow other devices on this network to open Nocturne"
              onClick={toggleLan}
              disabled={Boolean(busy) || !localClient}
              title={localClient ? undefined : 'Change this on the PC running Nocturne'}
            >
              <span className="settings-switch__knob" />
            </button>
          </div>
          <p className="settings-card__copy">
            Turn this on to open Nocturne in a browser on your phone, tablet, or TV
            on the same Wi-Fi. Your Plex token still stays on this PC; the other
            device only receives Nocturne’s interface and media streams.
          </p>
          {network?.lanEnabled ? (
            canShare ? (
              <>
                <p className="settings-card__label">Open one of these addresses on the other device</p>
                <ul className="settings-urls">
                  {lanUrls.map((url) => (
                    <li key={url}>
                      <a href={url} target="_blank" rel="noreferrer">{url}</a>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="settings-card__footnote">
                No usable network address was found. Check that this PC is connected
                to Wi-Fi or Ethernet. If you set <code>HOST=127.0.0.1</code> in{' '}
                <code>.env</code>, remove that line and restart Nocturne.
              </p>
            )
          ) : (
            <p className="settings-card__footnote">
              Off by default. Only devices on your private network can connect, and
              public internet addresses are always rejected.
            </p>
          )}
          <p className="settings-card__footnote">
            Only use this on a network you trust. Anyone on your Wi-Fi who knows the
            address can open Nocturne and watch your library while it is on. If another
            device cannot connect, allow Node.js or Nocturne through Windows Firewall
            for private networks.
          </p>
        </section>

        <section className="settings-card">
          <div className="settings-card__heading">
            <span className="settings-icon"><MonitorPlay size={19} /></span>
            <div>
              <p className="eyebrow">Playback</p>
              <h2>Your own screening room</h2>
            </div>
          </div>
          <p className="settings-card__copy">
            Play now opens Nocturne’s built-in player. Files the browser can already
            play are streamed directly from Plex; everything else is transcoded by
            your Plex server into a compatible stream. Your Plex token never reaches
            the browser.
          </p>
          <ul className="settings-list">
            <li>Resume points are read from Plex when playback starts.</li>
            <li>Progress and finished titles are written back to Plex history.</li>
            <li>Audio and subtitle tracks are selectable in the player, with Skip Intro and next-episode autoplay.</li>
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
            Nocturne serves the interface and a small API from one local process. The
            API holds your Plex token in <code>{tokenPath}</code> and proxies artwork,
            metadata, and playback. Your token is never sent to the browser.
          </p>
          <p className="settings-card__footnote">
            The server listens for LAN devices, but rejects every non-private address
            and every device while network access is off. Do not port-forward Nocturne
            from your router or expose it to the internet without adding proper
            authentication.
          </p>
        </section>

        <section className="settings-card">
          <div className="settings-card__heading">
            <span className="settings-icon"><Laptop size={19} /></span>
            <div>
              <p className="eyebrow">Desktop app</p>
              <h2>Install it once</h2>
            </div>
          </div>
          {health?.install ? (
            <>
              <p className="settings-card__copy">
                Nocturne is installed as a Windows app for this account. Open it from
                the Start Menu whenever you want to watch; it starts its own local
                server and opens a standalone window. Use <strong>Nocturne → Stop
                Nocturne</strong> in the Start Menu to stop the background server.
              </p>
              <dl className="settings-details">
                <div>
                  <dt>Version</dt>
                  <dd>{health.install.version || 'Unknown'}</dd>
                </div>
                <div>
                  <dt>Starts with Windows</dt>
                  <dd>{health.install.runAtLogin ? 'Yes' : 'No'}</dd>
                </div>
                <div>
                  <dt>Local port</dt>
                  <dd>{health.install.port || 'Default'}</dd>
                </div>
                <div>
                  <dt>App data</dt>
                  <dd className="mono">{health.install.dataDir || 'Not available'}</dd>
                </div>
              </dl>
              <p className="settings-card__footnote">
                Install new versions from the Updates card below. Remove Nocturne
                with {' '}<strong>Uninstall Nocturne</strong> in the Start Menu. Your Plex
                token in {health.install.dataDir || 'your app data folder'} is kept until
                you choose to delete app data during uninstall.
              </p>
            </>
          ) : (
            <>
              <p className="settings-card__copy">
                The Windows installer creates <code>Nocturne.exe</code>, Start Menu and
                desktop shortcuts, and an optional login startup entry. It installs for
                your Windows account only. Plex sign-in data stays in{' '}
                <code>%LOCALAPPDATA%\Nocturne\data</code> and survives updates.
              </p>
              <ol className="settings-steps">
                <li>Open the Nocturne project folder.</li>
                <li>Double-click <code>windows\Install Nocturne.cmd</code>.</li>
                <li>Choose whether Nocturne starts with Windows.</li>
                <li>Use the Nocturne shortcut from then on.</li>
              </ol>
              <p className="settings-card__footnote">
                Remove it later with <strong>Uninstall Nocturne</strong> in the Start
                Menu. The full walkthrough is in <code>TUTORIAL.md</code>.
              </p>
            </>
          )}
        </section>
        <section className="settings-card settings-card--server">
          <div className="settings-card__heading">
            <span className="settings-icon"><Power size={19} /></span>
            <div>
              <p className="eyebrow">Local server</p>
              <h2>Server controls</h2>
            </div>
            <span className={`status-pill ${controlsAvailable ? 'is-online' : 'is-offline'}`}>
              <span className={`status-dot ${controlsAvailable ? 'status-dot--online' : 'status-dot--offline'}`} />
              {controlsAvailable ? 'Running' : 'Not managed'}
            </span>
          </div>
          <p className="settings-card__copy">
            Restart the local server after an update, or stop it completely without
            digging through the Start Menu. The server control page stays on this PC
            and can start Nocturne again after it stops.
          </p>
          {controlsAvailable ? (
            <>
              <div className="settings-actions">
                <button
                  type="button"
                  className="button button--secondary button--small"
                  onClick={restartServer}
                  disabled={Boolean(busy) || !localClient}
                  title={localClient ? undefined : 'Restart the server on the PC running Nocturne'}
                >
                  {busy === 'restart-server'
                    ? <LoaderCircle size={15} className="spin" />
                    : <RotateCw size={15} />}
                  Restart server
                </button>
                <button
                  type="button"
                  className="button button--danger-outline button--small"
                  onClick={() => setConfirmStopServer(true)}
                  disabled={Boolean(busy) || !localClient}
                  title={localClient ? undefined : 'Stop the server on the PC running Nocturne'}
                >
                  <Power size={15} />
                  Stop server
                </button>
              </div>
              {confirmStopServer ? (
                <div className="settings-confirm">
                  <p>Stop the local Nocturne server? Playback will end, but Plex and your library are not affected.</p>
                  <div>
                    <button
                      type="button"
                      className="button button--danger button--small"
                      onClick={stopServer}
                      disabled={busy === 'stop-server'}
                    >
                      {busy === 'stop-server'
                        ? <LoaderCircle size={15} className="spin" />
                        : <Power size={15} />}
                      Yes, stop Nocturne
                    </button>
                    <button
                      type="button"
                      className="button button--ghost button--small"
                      onClick={() => setConfirmStopServer(false)}
                      disabled={busy === 'stop-server'}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
              <p className="settings-card__footnote">
                The control page is at <code>{control.url}</code>. It is loopback-only, so
                other devices on your Wi-Fi cannot reach it.
              </p>
            </>
          ) : (
            <p className="settings-card__footnote">
              Server controls are available in the installed Nocturne app. When running
              from source with <code>npm run dev</code>, stop it from that terminal.
            </p>
          )}
        </section>
        <section className="settings-card settings-card--updates">
          <div className="settings-card__heading">
            <span className="settings-icon"><Download size={19} /></span>
            <div>
              <p className="eyebrow">Updates</p>
              <h2>Keep Nocturne current</h2>
            </div>
            <span className="settings-card__label">
              {update?.version ? `v${update.version}` : 'Version unknown'}
            </span>
          </div>
          <p className="settings-card__copy">
            Install a newer Nocturne in place. Choose the update package that came
            with the new version, or save its address once and update from there
            afterwards. Your Plex sign-in, saved progress, and settings stay exactly
            as they are.
          </p>
          {update?.canInstall ? (
            <>
              <div className="settings-actions">
                <label className="button button--secondary button--small settings-update-pick">
                  <Upload size={15} />
                  {updateFile
                    ? (updateFile.name.length > 28
                      ? `${updateFile.name.slice(0, 26)}…`
                      : updateFile.name)
                    : 'Choose update package'}
                  <input
                    ref={updateFileRef}
                    type="file"
                    accept=".zip,application/zip,application/x-zip-compressed"
                    onChange={(event) => {
                      setUpdateFile(event.target.files?.[0] || null)
                      setNotice(null)
                      setProblem(null)
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="button button--primary button--small"
                  onClick={installUpdate}
                  disabled={Boolean(busy) || (!updateFile && !updateAddress.trim())}
                >
                  {busy === 'update'
                    ? <LoaderCircle size={15} className="spin" />
                    : <Download size={15} />}
                  Install update
                </button>
              </div>
              <div className="settings-update-source">
                <label htmlFor="update-address">
                  Update address <small>optional</small>
                </label>
                <div>
                  <input
                    id="update-address"
                    type="url"
                    inputMode="url"
                    spellCheck={false}
                    placeholder="https://example.com/nocturne-update.zip"
                    value={updateAddress}
                    onChange={(event) => setUpdateAddress(event.target.value)}
                    disabled={Boolean(busy)}
                  />
                  <button
                    type="button"
                    className="button button--ghost button--small"
                    onClick={saveUpdateAddress}
                    disabled={Boolean(busy) || updateAddress.trim() === (update?.source?.url || '')}
                  >
                    {busy === 'update-source'
                      ? <LoaderCircle size={15} className="spin" />
                      : <Check size={15} />}
                    Save
                  </button>
                </div>
              </div>
              <p className="settings-card__footnote">
                Update packages are built with <code>npm run package:update</code> in
                the Nocturne project. Nocturne restarts itself once an update is
                installed.
              </p>
            </>
          ) : (
            <p className="settings-card__footnote">
              {update?.reason
                || 'Nocturne checks how this copy can install updates when the page loads.'}
            </p>
          )}
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
            <p>Disconnect Nocturne from Plex?</p>
            <div>
              <button
                type="button"
                className="button button--danger button--small"
                onClick={disconnect}
                disabled={busy === 'disconnect' || !localClient}
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
            disabled={!localClient}
            title={localClient ? undefined : 'Change this on the PC running Nocturne'}
          >
            <Unplug size={15} />
            Disconnect Plex
          </button>
        )}
      </section>

      <footer className="settings-footer">
        <span className="settings-footer__mark">✦</span>
        <p>Nocturne {health?.install?.version || '1.4'} · A private cinema for the library you already own.</p>
        <span>Built for Plex</span>
      </footer>
    </div>
  )
}
