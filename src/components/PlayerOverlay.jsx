import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ExternalLink,
  LoaderCircle,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  TriangleAlert,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { api } from '../api.js'

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function formatClock(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function storedVolume() {
  try {
    const raw = window.localStorage.getItem('nocturne.volume')
    if (raw === null) return 1
    const value = Number(raw)
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 1
  } catch {
    return 1
  }
}

function episodeLabel(item) {
  if (!item) return ''
  return [item.episodeCode, item.episodeTitle].filter(Boolean).join(' · ')
}

export function PlayerOverlay({
  playback,
  onClose,
  onRestart,
  onRetry,
  onReplay,
  onReport,
  onEnded,
}) {
  const { item, session, phase, error, pendingOffset = 0 } = playback
  const containerRef = useRef(null)
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const sessionRef = useRef(session)
  const firstTimeRef = useRef(0)
  const hasStartedRef = useRef(false)
  const timeRef = useRef(session?.offsetMs || 0)
  const hideTimerRef = useRef(null)
  const previousFocusRef = useRef(null)

  const [timeMs, setTimeMs] = useState(session?.offsetMs || 0)
  const [bufferedMs, setBufferedMs] = useState(0)
  const [scrubMs, setScrubMs] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [loading, setLoading] = useState(true)
  const [needsPlay, setNeedsPlay] = useState(false)
  const [streamError, setStreamError] = useState(null)
  const [volume, setVolume] = useState(storedVolume)
  const [muted, setMuted] = useState(false)

  const duration = Math.max(0, session?.durationMs || item?.duration || 0)
  const displayTime = scrubMs ?? timeMs
  const title = item?.type === 'episode' ? item?.seriesTitle || item?.title : item?.title
  const subtitle = item?.type === 'episode'
    ? episodeLabel(item)
    : [item?.year, item?.contentRating].filter(Boolean).join(' · ')

  const readTime = useCallback(() => {
    const video = videoRef.current
    const currentSession = sessionRef.current
    if (!video || !currentSession) return timeRef.current

    const value = currentSession.mode === 'direct'
      ? Math.round(video.currentTime * 1000)
      : Math.round(
        currentSession.offsetMs + Math.max(0, video.currentTime - firstTimeRef.current) * 1000,
      )
    timeRef.current = value
    return value
  }, [])

  const revealControls = useCallback(() => {
    setControlsVisible(true)
    window.clearTimeout(hideTimerRef.current)
    if (videoRef.current && !videoRef.current.paused) {
      hideTimerRef.current = window.setTimeout(() => setControlsVisible(false), 3400)
    }
  }, [])

  const handleClose = useCallback(() => {
    onClose(readTime())
  }, [onClose, readTime])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    revealControls()
    if (video.paused) {
      setNeedsPlay(false)
      const attempt = video.play()
      if (attempt?.catch) {
        attempt.catch(() => setNeedsPlay(true))
      }
    } else {
      video.pause()
    }
  }, [revealControls])

  const seekTo = useCallback((targetMs) => {
    const video = videoRef.current
    const currentSession = sessionRef.current
    if (!video || !currentSession) return

    const max = duration || currentSession.durationMs || 0
    const target = clamp(Math.round(Number(targetMs) || 0), 0, Math.max(0, max - 500))
    const current = readTime()
    setScrubMs(null)

    if (currentSession.mode === 'direct') {
      video.currentTime = target / 1000
      timeRef.current = target
      setTimeMs(target)
      onReport(target, video.paused ? 'paused' : 'playing')
      return
    }

    if (Math.abs(target - current) < 1500) {
      const relative = clamp(video.currentTime + (target - current) / 1000, 0, video.duration || 0)
      video.currentTime = relative
      timeRef.current = target
      setTimeMs(target)
      onReport(target, video.paused ? 'paused' : 'playing')
      return
    }

    timeRef.current = target
    setTimeMs(target)
    onReport(target, 'buffering')
    onRestart(target)
  }, [duration, onReport, onRestart, readTime])

  const seekBy = useCallback((deltaMs) => {
    seekTo(readTime() + deltaMs)
  }, [readTime, seekTo])

  const toggleFullscreen = useCallback(() => {
    const node = containerRef.current
    if (!node) return
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {})
    } else {
      node.requestFullscreen?.().catch(() => {})
    }
  }, [])

  const retryStream = useCallback(() => {
    setStreamError(null)
    onRestart(Math.max(0, readTime()))
  }, [onRestart, readTime])

  useEffect(() => {
    sessionRef.current = session
    if (!session) return
    setTimeMs(session.offsetMs || 0)
    setBufferedMs(0)
    setScrubMs(null)
    setStreamError(null)
    setLoading(true)
    setNeedsPlay(false)
    hasStartedRef.current = false
    timeRef.current = session.offsetMs || 0
  }, [session])

  useEffect(() => {
    previousFocusRef.current = document.activeElement
    document.body.classList.add('is-player-open')
    containerRef.current?.focus()

    return () => {
      document.body.classList.remove('is-player-open')
      previousFocusRef.current?.focus?.()
    }
  }, [])

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  useEffect(() => {
    revealControls()
    return () => window.clearTimeout(hideTimerRef.current)
  }, [revealControls, isPlaying])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return undefined
    video.volume = volume
    video.muted = muted || volume === 0
    return undefined
  }, [volume, muted, session])

  useEffect(() => {
    if (!session) return undefined
    const interval = window.setInterval(() => {
      const video = videoRef.current
      if (!video || video.paused || video.ended) return
      onReport(readTime(), 'playing')
    }, 10_000)

    return () => window.clearInterval(interval)
  }, [session, onReport, readTime])

  useEffect(() => {
    if (!session) return undefined
    const sessionId = session.sessionId

    const onBeforeUnload = () => {
      try {
        navigator.sendBeacon(
          `/api/player/${encodeURIComponent(sessionId)}/stop`,
          new Blob([JSON.stringify({ timeMs: readTime() })], { type: 'application/json' }),
        )
      } catch {
        // The browser may refuse beacons in private modes.
      }
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [session, readTime])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !session) return undefined

    let cancelled = false
    let hls = null
    firstTimeRef.current = 0

    const playQuietly = () => {
      const attempt = video.play()
      if (attempt?.catch) {
        attempt.catch(() => {
          if (!cancelled) setNeedsPlay(true)
        })
      }
    }

    const onLoadedMetadata = () => {
      firstTimeRef.current = video.currentTime || 0
      if (session.mode === 'direct' && session.offsetMs > 1000) {
        const target = session.offsetMs / 1000
        const max = Number.isFinite(video.duration) ? Math.max(0, video.duration - 1) : target
        video.currentTime = Math.min(target, max)
      }
    }

    video.addEventListener('loadedmetadata', onLoadedMetadata)

    if (session.mode === 'direct') {
      video.src = session.src
      video.load()
      playQuietly()
    } else {
      import('hls.js')
        .then(({ default: Hls }) => {
          if (cancelled) return
          if (!Hls.isSupported()) {
            setStreamError(new Error(
              'This browser cannot play Plex’s HLS stream. Try Microsoft Edge, Chrome, or update your browser.',
            ))
            setLoading(false)
            return
          }

          hls = new Hls({
            enableWorker: true,
            backBufferLength: 120,
            maxBufferLength: 60,
            manifestLoadingTimeOut: 20_000,
          })
          hlsRef.current = hls

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (!cancelled) playQuietly()
          })

          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (!data?.fatal || cancelled) return
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError()
              return
            }
            setLoading(false)
            setStreamError(new Error(
              data.type === Hls.ErrorTypes.NETWORK_ERROR
                ? 'Plex stopped sending the video stream. Check that Plex is still running, then try again.'
                : 'This video could not be decoded in the browser. Try again or open it in Plex.',
            ))
          })

          hls.loadSource(session.src)
          hls.attachMedia(video)
        })
        .catch(() => {
          if (cancelled) return
          setLoading(false)
          setStreamError(new Error('Nocturne could not load the HLS player for this stream.'))
        })
    }

    return () => {
      cancelled = true
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      if (hls) hls.destroy()
      hlsRef.current = null
      video.removeAttribute('src')
      video.load()
    }
  }, [session])

  useEffect(() => {
    const onKeyDown = (event) => {
      const insideControl = event.target?.closest?.('input, textarea, select, button')
      if (event.key === 'Escape') {
        if (document.fullscreenElement) return
        event.preventDefault()
        handleClose()
        return
      }
      if (insideControl || event.metaKey || event.ctrlKey || event.altKey) return

      switch (event.key) {
        case ' ':
        case 'k':
          event.preventDefault()
          togglePlay()
          revealControls()
          break
        case 'ArrowLeft':
          event.preventDefault()
          seekBy(-10_000)
          revealControls()
          break
        case 'ArrowRight':
          event.preventDefault()
          seekBy(10_000)
          revealControls()
          break
        case 'j':
          event.preventDefault()
          seekBy(-30_000)
          revealControls()
          break
        case 'l':
          event.preventDefault()
          seekBy(30_000)
          revealControls()
          break
        case 'ArrowUp':
          event.preventDefault()
          setVolume((value) => clamp(Number((value + 0.05).toFixed(2)), 0, 1))
          setMuted(false)
          revealControls()
          break
        case 'ArrowDown':
          event.preventDefault()
          setVolume((value) => clamp(Number((value - 0.05).toFixed(2)), 0, 1))
          revealControls()
          break
        case 'f':
          event.preventDefault()
          toggleFullscreen()
          break
        case 'm':
          event.preventDefault()
          setMuted((value) => !value)
          revealControls()
          break
        default:
          break
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [handleClose, revealControls, seekBy, togglePlay, toggleFullscreen])

  const durationForSlider = Math.max(duration, 1)
  const playedPercent = clamp((displayTime / durationForSlider) * 100, 0, 100)
  const bufferedPercent = clamp((bufferedMs / durationForSlider) * 100, 0, 100)
  const starting = phase === 'starting'
  const fatalError = streamError || (phase === 'error' ? error : null)
  const ended = phase === 'ended'
  const showVideo = Boolean(session) && !ended && !fatalError
  const startLabel = pendingOffset > 5000
    ? `Resuming at ${formatClock(pendingOffset)}`
    : 'Opening your Plex stream'

  return (
    <div
      className={`player-overlay${controlsVisible ? '' : ' is-idle'}${isFullscreen ? ' is-fullscreen' : ''}`}
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Playing ${title || 'video'}`}
      tabIndex={-1}
      onMouseMove={revealControls}
      onTouchStart={revealControls}
    >
      <div
        className="player-overlay__ambient"
        style={item?.images?.hero ? { backgroundImage: `url("${item.images.hero}")` } : undefined}
        aria-hidden="true"
      />

      {showVideo ? (
        <video
          ref={videoRef}
          className="player-video"
          playsInline
          preload="auto"
          onClick={togglePlay}
          onDoubleClick={toggleFullscreen}
          onTimeUpdate={() => {
            if (!hasStartedRef.current && videoRef.current && session?.mode === 'hls' && session.offsetMs > 1000) {
              const current = videoRef.current.currentTime
              if (Math.abs(current - session.offsetMs / 1000) < 3) {
                firstTimeRef.current = current
              }
            }
            const next = readTime()
            setTimeMs(next)
          }}
          onProgress={() => {
            const video = videoRef.current
            const currentSession = sessionRef.current
            if (!video || !currentSession) return
            const end = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0
            const absolute = currentSession.mode === 'direct'
              ? end * 1000
              : currentSession.offsetMs + Math.max(0, end - firstTimeRef.current) * 1000
            setBufferedMs(Math.round(absolute))
          }}
          onWaiting={() => setLoading(true)}
          onPlaying={() => {
            hasStartedRef.current = true
            setLoading(false)
            setIsPlaying(true)
            setNeedsPlay(false)
            onReport(readTime(), 'playing')
          }}
          onCanPlay={() => setLoading(false)}
          onPause={() => {
            setIsPlaying(false)
            onReport(readTime(), 'paused')
            revealControls()
          }}
          onEnded={() => {
            timeRef.current = duration || readTime()
            setTimeMs(timeRef.current)
            onEnded()
          }}
          onError={() => {
            if (session?.mode !== 'direct') return
            setLoading(false)
            setStreamError(new Error(
              'The browser could not play this file directly. Try again, or open it in Plex.',
            ))
          }}
        />
      ) : null}

      <div className="player-overlay__shade" aria-hidden="true" />

      <header className="player-chrome player-chrome--top">
        <button type="button" className="player-icon-button" onClick={handleClose} aria-label="Close player">
          <X size={21} />
        </button>
        <div className="player-heading">
          <p className="player-heading__eyebrow">
            {item?.type === 'episode' ? 'Episode' : 'Now playing'}
          </p>
          <h2>{title}</h2>
          {subtitle ? <p className="player-heading__meta">{subtitle}</p> : null}
        </div>
        {session ? (
          <span className="player-badge">
            <span className="status-dot status-dot--violet" aria-hidden="true" />
            {session.directPlay ? 'Direct play' : 'Plex transcode'}
          </span>
        ) : null}
      </header>

      {showVideo && (needsPlay || (!isPlaying && !loading)) ? (
        <button type="button" className="player-center-play" onClick={togglePlay} aria-label="Play">
          <Play size={34} fill="currentColor" />
        </button>
      ) : null}

      {starting || (loading && showVideo && !fatalError) ? (
        <div className="player-status" role="status" aria-live="polite">
          <LoaderCircle size={28} className="spin" aria-hidden="true" />
          <span>{starting ? startLabel : 'Buffering'}</span>
          {!session?.directPlay && session ? (
            <small>Plex is preparing this video for the browser.</small>
          ) : null}
        </div>
      ) : null}

      {fatalError ? (
        <div className="player-failure" role="alert">
          <div className="player-failure__icon" aria-hidden="true">
            <TriangleAlert size={26} />
          </div>
          <p className="eyebrow">{phase === 'error' ? 'Playback did not start' : 'The stream stopped'}</p>
          <h2>{phase === 'error' ? 'Nocturne could not open this title' : 'Plex stopped sending video'}</h2>
          <p>{fatalError.message || 'Something interrupted playback.'}</p>
          {fatalError.detail ? (
            <details className="technical-details">
              <summary>Technical details</summary>
              <pre>{fatalError.detail}</pre>
            </details>
          ) : null}
          <div className="player-failure__actions">
            {phase === 'error' ? (
              <button type="button" className="button button--primary" onClick={onRetry}>
                <RotateCw size={16} />
                Try again
              </button>
            ) : (
              <button type="button" className="button button--primary" onClick={retryStream}>
                <RotateCw size={16} />
                Restart stream
              </button>
            )}
            <a
              className="button button--glass"
              href={api.playUrl(item.ratingKey)}
              target="_blank"
              rel="noreferrer"
              onClick={handleClose}
            >
              <ExternalLink size={16} />
              Open in Plex
            </a>
            <button type="button" className="button button--ghost" onClick={handleClose}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      {ended ? (
        <div className="player-ended">
          <p className="eyebrow">End of playback</p>
          <h2>{title}</h2>
          <p>
            {item?.type === 'episode'
              ? 'This episode is finished and Plex has been updated.'
              : 'The credits have rolled, and your Plex watch history is up to date.'}
          </p>
          <div className="player-ended__actions">
            <button type="button" className="button button--primary button--large" onClick={onReplay}>
              <RotateCcw size={17} />
              Play again
            </button>
            <button
              type="button"
              className="button button--glass button--large"
              onClick={() => onClose(timeRef.current)}
            >
              Back to Nocturne
            </button>
          </div>
        </div>
      ) : null}

      {showVideo ? (
        <footer className="player-chrome player-chrome--bottom">
          <div className="player-scrub">
            <span className="player-scrub__track" aria-hidden="true" />
            <span
              className="player-scrub__buffered"
              style={{ width: `${bufferedPercent}%` }}
              aria-hidden="true"
            />
            <span
              className="player-scrub__played"
              style={{ width: `${playedPercent}%` }}
              aria-hidden="true"
            />
            <input
              type="range"
              min="0"
              max={durationForSlider}
              step="1000"
              value={clamp(Math.round(displayTime), 0, durationForSlider)}
              aria-label="Seek"
              aria-valuetext={`${formatClock(displayTime)} of ${formatClock(duration)}`}
              onChange={(event) => setScrubMs(Number(event.target.value))}
              onPointerUp={(event) => seekTo(Number(event.currentTarget.value))}
              onKeyUp={(event) => {
                if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
                  seekTo(Number(event.currentTarget.value))
                }
              }}
            />
          </div>

          <div className="player-controls">
            <div className="player-controls__group">
              <button
                type="button"
                className="player-icon-button player-icon-button--primary"
                onClick={togglePlay}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
              </button>
              <button
                type="button"
                className="player-icon-button"
                onClick={() => seekBy(-10_000)}
                aria-label="Back 10 seconds"
                title="Back 10 seconds (←)"
              >
                <RotateCcw size={18} />
              </button>
              <button
                type="button"
                className="player-icon-button"
                onClick={() => seekBy(10_000)}
                aria-label="Forward 10 seconds"
                title="Forward 10 seconds (→)"
              >
                <RotateCw size={18} />
              </button>
              <span className="player-time">
                {formatClock(displayTime)}
                <span> / {formatClock(duration)}</span>
              </span>
            </div>

            <div className="player-controls__group player-controls__group--end">
              <button
                type="button"
                className="player-icon-button"
                onClick={() => setMuted((value) => !value)}
                aria-label={muted || volume === 0 ? 'Unmute' : 'Mute'}
              >
                {muted || volume === 0 ? <VolumeX size={19} /> : <Volume2 size={19} />}
              </button>
              <input
                className="player-volume"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={muted ? 0 : volume}
                aria-label="Volume"
                onChange={(event) => {
                  const next = Number(event.target.value)
                  setVolume(next)
                  setMuted(next === 0)
                  try {
                    window.localStorage.setItem('nocturne.volume', String(next))
                  } catch {
                    // Storage is optional.
                  }
                }}
              />
              <button
                type="button"
                className="player-icon-button"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              >
                {isFullscreen ? <Minimize size={19} /> : <Maximize size={19} />}
              </button>
            </div>
          </div>
        </footer>
      ) : null}
    </div>
  )
}
