import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  Copy,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  WifiOff,
} from 'lucide-react'
import { api } from '../api.js'
import { NocturneBrand, NocturneMark } from '../components/Logo.jsx'
import { usePageTitle } from '../hooks/usePageTitle.js'

const TOKEN_HELP_URL = 'https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/'

function Stepper({ phase }) {
  const connected = phase === 'connected'
  const steps = [
    { label: 'Sign in to Plex', active: !connected, done: connected },
    { label: 'Find your server', active: connected, done: false },
    { label: 'Open your cinema', active: false, done: false },
  ]

  return (
    <ol className="setup-steps" aria-label="Connection steps">
      {steps.map((step, index) => (
        <li
          key={step.label}
          className={step.done ? 'is-done' : step.active ? 'is-active' : ''}
        >
          <span className="setup-steps__number">
            {step.done ? <Check size={12} /> : `0${index + 1}`}
          </span>
          {step.label}
        </li>
      ))}
    </ol>
  )
}

export function SetupPage({ onConnected, reason = null }) {
  usePageTitle('Connect Plex')

  const [pin, setPin] = useState(null)
  const [phase, setPhase] = useState('starting')
  const [error, setError] = useState(null)
  const [pollIssue, setPollIssue] = useState(null)
  const [pinNonce, setPinNonce] = useState(0)
  const [copied, setCopied] = useState(false)
  const [connectedServer, setConnectedServer] = useState(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualToken, setManualToken] = useState('')
  const [manualServer, setManualServer] = useState('')
  const [manualBusy, setManualBusy] = useState(false)
  const [manualError, setManualError] = useState(null)
  const copyTimer = useRef(null)
  const failureCount = useRef(0)

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    setPhase('starting')
    setPin(null)
    setError(null)
    setPollIssue(null)
    setCopied(false)
    failureCount.current = 0

    api.startPin(controller.signal)
      .then((result) => {
        if (!active) return
        setPin(result.pin)
        setPhase('pending')
      })
      .catch((failure) => {
        if (!active || failure?.name === 'AbortError') return
        setError(failure)
        setPhase('error')
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [pinNonce])

  useEffect(() => {
    if (phase !== 'pending' || !pin?.id) return undefined

    let cancelled = false
    const check = async () => {
      try {
        const result = await api.checkPin(pin.id)
        if (cancelled) return
        failureCount.current = 0
        setPollIssue(null)

        if (result.status === 'expired') {
          setPhase('expired')
        } else if (result.status === 'connected') {
          setConnectedServer(result.server)
          setPhase('connected')
        }
      } catch (failure) {
        if (cancelled) return
        failureCount.current += 1
        setPollIssue(failure)
        if (failureCount.current >= 4) {
          setError(failure)
          setPhase('error')
        }
      }
    }

    const timer = window.setInterval(check, 2200)
    window.setTimeout(check, 400)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [phase, pin?.id])

  useEffect(() => {
    if (phase !== 'connected') return undefined
    const timer = window.setTimeout(() => onConnected(), 1100)
    return () => window.clearTimeout(timer)
  }, [phase, onConnected])

  useEffect(() => () => window.clearTimeout(copyTimer.current), [])

  const startOver = () => {
    setPinNonce((value) => value + 1)
    setManualError(null)
  }

  const copyCode = async () => {
    if (!pin?.code) return
    try {
      await navigator.clipboard.writeText(pin.code)
      setCopied(true)
      window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  const submitManual = async (event) => {
    event.preventDefault()
    setManualError(null)
    setManualBusy(true)
    try {
      const result = await api.manualConnect({
        token: manualToken.trim(),
        serverUrl: manualServer.trim(),
      })
      setConnectedServer(result.server)
      setManualToken('')
      setManualServer('')
      setPhase('connected')
    } catch (failure) {
      setManualError(failure)
    } finally {
      setManualBusy(false)
    }
  }

  const busy = phase === 'starting'
  const showSignIn = phase === 'pending' && pin
  const showError = ['error', 'expired'].includes(phase)

  return (
    <div className="setup">
      <section className="setup__stage" aria-labelledby="setup-stage-title">
        <div className="setup__ambient" aria-hidden="true">
          <span className="setup__orbit setup__orbit--one" />
          <span className="setup__orbit setup__orbit--two" />
          <span className="setup__star">✦</span>
          <span className="setup__glow" />
        </div>

        <div className="setup__stage-top">
          <NocturneBrand tagline={false} />
          <span className="setup__edition">For Plex</span>
        </div>

        <div className="setup__stage-content">
          <p className="eyebrow">
            <Sparkles size={14} />
            Your library, reimagined
          </p>
          <h1 id="setup-stage-title">
            Every film.
            <br />
            <span>One marquee.</span>
          </h1>
          <p className="setup__lede">
            Nocturne turns the Plex library you already own into a private, cinematic
            streaming room — with its own look, its own rhythm, and none of your
            files ever copied.
          </p>
          <ul className="setup__features">
            <li><span />Real posters, backdrops and metadata from Plex</li>
            <li><span />Continue watching with your existing Plex progress</li>
            <li><span />Search across every film and series you own</li>
          </ul>
        </div>

        <div className="setup__stage-footer">
          <span><ShieldCheck size={14} /> Local-first</span>
          <span>No media copied</span>
          <span>Powered by Plex</span>
        </div>
      </section>

      <section className="setup__panel" aria-labelledby="setup-card-title">
        <div className="setup__card">
          <div className="setup__card-head">
            <NocturneMark size={40} />
            <div>
              <p className="eyebrow">One-time setup</p>
              <h2 id="setup-card-title">Connect your Plex account</h2>
            </div>
          </div>

          <Stepper phase={phase} />

          {reason && phase !== 'connected' ? (
            <div className="alert alert--warning alert--compact" role="status">
              <CircleAlert size={16} />
              <div>
                <strong>The previous Plex connection expired.</strong>
                <p>{reason} Sign in again to reconnect Nocturne.</p>
              </div>
            </div>
          ) : null}

          {busy ? (
            <div className="setup-state setup-state--center" role="status" aria-live="polite">
              <LoaderCircle size={26} className="spin" />
              <div>
                <strong>Preparing a secure sign-in code</strong>
                <p>Nocturne is talking to plex.tv. This takes a moment.</p>
              </div>
            </div>
          ) : null}

          {showSignIn ? (
            <div className="setup-state">
              <p className="setup-state__copy">
                Sign in on Plex’s own website. Nocturne never sees your Plex password.
              </p>

              <a
                className="button button--primary button--large button--full"
                href={pin.authUrl}
                target="_blank"
                rel="noreferrer"
              >
                Sign in to Plex
                <ExternalLink size={16} />
              </a>

              <button type="button" className="pin-code" onClick={copyCode}>
                <span className="pin-code__label">Your one-time code</span>
                <span className="pin-code__value">{pin.code}</span>
                <span className="pin-code__copy">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Copied' : 'Copy code'}
                </span>
              </button>

              <div className="setup-wait" role="status" aria-live="polite">
                <span className="setup-wait__pulse" aria-hidden="true" />
                Waiting for Plex sign-in…
              </div>
              <p className="setup-state__hint">
                After signing in, keep this page open. It connects automatically.
                The code expires in a few minutes.
              </p>

              {pollIssue ? (
                <p className="inline-warning">
                  <CircleAlert size={14} />
                  {pollIssue.message} Still trying…
                </p>
              ) : null}
            </div>
          ) : null}

          {phase === 'connected' ? (
            <div className="setup-state setup-state--success" role="status" aria-live="polite">
              <div className="success-ring"><CheckCircle2 size={32} /></div>
              <strong>You’re in.</strong>
              <p>
                Connected to <b>{connectedServer?.name || 'your Plex server'}</b>.
                Opening your cinema…
              </p>
              <LoaderCircle size={18} className="spin" />
            </div>
          ) : null}

          {phase === 'expired' ? (
            <div className="setup-state">
              <div className="alert alert--warning">
                <CircleAlert size={18} />
                <div>
                  <strong>That sign-in code expired.</strong>
                  <p>No problem — get a fresh code and try again.</p>
                </div>
              </div>
              <button type="button" className="button button--primary button--full" onClick={startOver}>
                <RefreshCw size={16} />
                Get a new code
              </button>
            </div>
          ) : null}

          {phase === 'error' ? (
            <div className="setup-state">
              <div className="alert alert--error">
                <CircleAlert size={18} />
                <div>
                  <strong>{error?.message || 'Nocturne could not connect to Plex.'}</strong>
                  {error?.detail ? <p>{error.detail}</p> : null}
                </div>
              </div>
              <button type="button" className="button button--primary button--full" onClick={startOver}>
                <RefreshCw size={16} />
                Try Plex sign-in again
              </button>
              {error?.attempts ? (
                <details className="technical-details">
                  <summary>Connection details</summary>
                  <pre>{error.attempts}</pre>
                </details>
              ) : null}
            </div>
          ) : null}

          {!showError && phase !== 'connected' ? (
            <button
              type="button"
              className="text-button setup__manual-toggle"
              onClick={() => setManualOpen((open) => !open)}
            >
              <KeyRound size={15} />
              {manualOpen ? 'Hide token sign-in' : 'Use a Plex token instead'}
            </button>
          ) : null}

          {showError ? (
            <button
              type="button"
              className="text-button setup__manual-toggle"
              onClick={() => setManualOpen((open) => !open)}
            >
              <KeyRound size={15} />
              {manualOpen ? 'Hide manual connection' : 'Connect with a token and server address'}
            </button>
          ) : null}

          {manualOpen && phase !== 'connected' ? (
            <form className="manual-form" onSubmit={submitManual}>
              <div className="manual-form__head">
                <Server size={17} />
                <div>
                  <strong>Manual Plex connection</strong>
                  <p>Use this only if Plex sign-in cannot find your server.</p>
                </div>
              </div>

              <label className="field">
                <span>Plex token</span>
                <input
                  type="password"
                  value={manualToken}
                  onChange={(event) => setManualToken(event.target.value)}
                  placeholder="Paste your X-Plex-Token"
                  autoComplete="off"
                  spellCheck="false"
                  required
                />
              </label>

              <label className="field">
                <span>Server address <small>optional</small></span>
                <input
                  type="url"
                  value={manualServer}
                  onChange={(event) => setManualServer(event.target.value)}
                  placeholder="http://127.0.0.1:32400"
                  autoComplete="off"
                  spellCheck="false"
                />
              </label>

              <a className="small-link" href={TOKEN_HELP_URL} target="_blank" rel="noreferrer">
                How to find your Plex token
                <ExternalLink size={12} />
              </a>

              {manualError ? (
                <div className="alert alert--error alert--compact">
                  <CircleAlert size={16} />
                  <div>
                    <strong>{manualError.message}</strong>
                    {manualError.detail ? <p>{manualError.detail}</p> : null}
                  </div>
                </div>
              ) : null}

              <button
                className="button button--secondary button--full"
                type="submit"
                disabled={manualBusy || !manualToken.trim()}
              >
                {manualBusy ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={16} />}
                {manualBusy ? 'Connecting…' : 'Connect with token'}
              </button>
            </form>
          ) : null}

          <div className="setup__privacy">
            <ShieldCheck size={16} />
            <p>
              Your Plex token is stored only on this PC, never in the browser or
              in Nocturne’s code. The local Nocturne server talks to Plex for you.
            </p>
          </div>
        </div>

        <p className="setup__panel-foot">
          <WifiOff size={13} />
          Plex Media Server must be running on this PC for playback.
        </p>
      </section>
    </div>
  )
}
