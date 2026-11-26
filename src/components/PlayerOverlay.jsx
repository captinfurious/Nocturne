import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AudioLines,
  Captions,
  Check,
  ExternalLink,
  LoaderCircle,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipForward,
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

// How far the rewind and fast-forward buttons (and the arrow keys) jump.
const SKIP_SECONDS = 10

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

function parseVttTimestamp(value) {
  const match = String(value).trim().match(/^(?:(\d{1,3}):)?(\d{1,2}):(\d{2})[.,](\d{3})$/)
  if (!match) return null
  const hours = Number(match[1] || 0)
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  const millis = Number(match[4])
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis
}

function cleanCueText(text) {
  return String(text)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim()
}

// Render subtitles ourselves instead of handing a blob to <track>. Native
// track rendering is inconsistent across browsers and fails silently when a
// Plex conversion produces no cues; parsing here lets us detect that case and
// restart with Plex burn-in instead of leaving the viewer with no captions.
function parseVttCues(text) {
  const cues = []
  const blocks = String(text)
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)

  for (const block of blocks) {
    const lines = block.split('\n')
    const timingIndex = lines.findIndex((line) => line.includes('-->'))
    if (timingIndex < 0) continue

    const timing = lines[timingIndex].match(
      /^\s*((?:\d{1,3}:)?\d{1,2}:\d{2}[.,]\d{3})\s+-->\s+((?:\d{1,3}:)?\d{1,2}:\d{2}[.,]\d{3})/,
    )
    if (!timing) continue

    const start = parseVttTimestamp(timing[1])
    const end = parseVttTimestamp(timing[2])
    if (start === null || end === null || end <= start) continue

    const body = cleanCueText(lines.slice(timingIndex + 1).join('\n'))
    if (body) cues.push({ start, end, text: body })
  }

  return cues.sort((left, right) => left.start - right.start)
}

export function PlayerOverlay({
  playback,
  onClose,
  onRestart,
  onRetry,
  onReplay,
  onPlayNext,
  onReport,
  onEnded,
}) {
  const { item, session, phase, error, pendingOffset = 0, nextEpisode = null } = playback
  const containerRef = useRef(null)
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const sessionRef = useRef(session)
  // Plex's HLS transcode keeps the source timestamps when it starts away from
  // the beginning, so video.currentTime can already be the absolute position.
  // timeBaseRef is the number of seconds to add to currentTime to make it so.
  const timeBaseRef = useRef(0)
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
  const [menuOpen, setMenuOpen] = useState(false)
  const [selectedAudioId, setSelectedAudioId] = useState(null)
  const [selectedSubtitleId, setSelectedSubtitleId] = useState(null)
  const [subtitleStatus, setSubtitleStatus] = useState(null)
  const [subtitleCues, setSubtitleCues] = useState([])
  const [subtitleLoading, setSubtitleLoading] = useState(false)
  const [autoPlayOff, setAutoPlayOff] = useState(false)
  const [countdown, setCountdown] = useState(null)
  const subtitleFallbackRef = useRef(false)
  const subtitleRequestRef = useRef(0)

  const audioTracks = session?.streams?.audio || []
  const subtitleTracks = session?.streams?.subtitles || []
  const selectedSubtitle = subtitleTracks.find((track) => track.id === selectedSubtitleId) || null
  // Only text tracks Plex is not already burning into the picture are drawn
  // here, otherwise the same captions appear twice.
  const selectedSubtitleUrl = selectedSubtitle && !selectedSubtitle.isImage && !session?.burnSubtitles
    ? selectedSubtitle.url
    : null
  const introMarker = session?.markers?.intro || null
  const canSkipIntro = Boolean(
    introMarker && timeMs >= introMarker.startMs - 1500 && timeMs < introMarker.endMs - 1000,
  )

  const duration = Math.max(0, session?.durationMs || item?.duration || 0)
  const displayTime = scrubMs ?? timeMs
  const activeCaption = useMemo(() => {
    if (!subtitleCues.length) return ''
    const current = Math.max(0, timeMs)
    return subtitleCues
      .filter((cue) => current >= cue.start && current < cue.end)
      .map((cue) => cue.text)
      .join('\n')
  }, [subtitleCues, timeMs])
  const title = item?.type === 'episode' ? item?.seriesTitle || item?.title : item?.title
  const subtitle = item?.type === 'episode'
    ? episodeLabel(item)
    : [item?.year, item?.contentRating].filter(Boolean).join(' · ')

  // Work out which timeline this HLS playlist uses instead of assuming one.
  // From a start offset Plex keeps the source timestamps, so currentTime is
  // already absolute; some servers reset the clock and start near zero.
  // Reading the wrong one doubled the reported position, and the next track
  // switch or seek then restarted the stream at the wrong place.
  const syncTimeBase = useCallback(() => {
    const video = videoRef.current
    const currentSession = sessionRef.current
    if (!video || !currentSession) return

    if (currentSession.mode === 'direct') {
      timeBaseRef.current = 0
      return
    }

    const startAt = Math.max(0, Number(currentSession.offsetMs) || 0) / 1000
    const current = Math.max(0, Number(video.currentTime) || 0)
    timeBaseRef.current = startAt > 2 && Math.abs(current - startAt) <= 5 ? 0 : startAt
  }, [])

  const readTime = useCallback(() => {
    const video = videoRef.current
    const currentSession = sessionRef.current
    if (!video || !currentSession) return timeRef.current

    const value = currentSession.mode === 'direct'
      ? Math.round(video.currentTime * 1000)
      : Math.round((video.currentTime + timeBaseRef.current) * 1000)
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
    onRestart(target, {
      audioStreamId: selectedAudioId,
      subtitleStreamId: selectedSubtitleId,
      burnSubtitles: Boolean(session?.burnSubtitles),
    })
  }, [duration, onReport, onRestart, readTime, selectedAudioId, selectedSubtitleId, session?.burnSubtitles])

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
    onRestart(Math.max(0, readTime()), {
      audioStreamId: selectedAudioId,
      subtitleStreamId: selectedSubtitleId,
      burnSubtitles: Boolean(session?.burnSubtitles),
    })
  }, [onRestart, readTime, selectedAudioId, selectedSubtitleId, session?.burnSubtitles])

  const chooseAudio = useCallback((track) => {
    if (!track || track.id === selectedAudioId) return
    setSelectedAudioId(track.id)
    onRestart(readTime(), {
      audioStreamId: track.id,
      subtitleStreamId: selectedSubtitleId,
      burnSubtitles: Boolean(session?.burnSubtitles),
    })
  }, [onRestart, readTime, selectedAudioId, selectedSubtitleId, session?.burnSubtitles])

  const chooseSubtitle = useCallback((track) => {
    const nextId = track?.id || null
    if (nextId === selectedSubtitleId) return
    setSelectedSubtitleId(nextId)
    setSubtitleCues([])
    setSubtitleStatus(null)
    subtitleFallbackRef.current = false

    // Image formats only exist inside Plex's transcoded picture. Text tracks
    // are fetched and drawn by Nocturne, but the stream still has to restart
    // to remove a subtitle that was burned into the previous video.
    if (track?.isImage) {
      onRestart(readTime(), {
        audioStreamId: selectedAudioId,
        subtitleStreamId: nextId,
        burnSubtitles: true,
      })
    } else if (session?.burnSubtitles) {
      onRestart(readTime(), {
        audioStreamId: selectedAudioId,
        subtitleStreamId: nextId,
        burnSubtitles: false,
      })
    }
  }, [onRestart, readTime, selectedAudioId, selectedSubtitleId, session?.burnSubtitles])

  const fallBackToBurn = useCallback(() => {
    const current = sessionRef.current
    const track = current?.streams?.subtitles?.find(
      (entry) => entry.id === selectedSubtitleId,
    )

    if (!track || track.isImage || current?.burnSubtitles || subtitleFallbackRef.current) {
      if (!current?.burnSubtitles) {
        setSubtitleStatus({
          kind: 'error',
          text: 'This subtitle track could not be displayed. Try another track or open the title in Plex.',
        })
      }
      return
    }

    subtitleFallbackRef.current = true
    setSubtitleStatus({
      kind: 'working',
      text: 'Plex could not send this subtitle as text. Restarting with burn-in…',
    })
    onRestart(readTime(), {
      audioStreamId: selectedAudioId,
      subtitleStreamId: track.id,
      burnSubtitles: true,
    })
  }, [onRestart, readTime, selectedAudioId, selectedSubtitleId])

  // Fetch and parse the subtitle before showing it. A successful HTTP response
  // is not enough: Plex can return an empty or cue-less conversion, and native
  // <track> rendering then fails without an error. Parsing here catches that.
  useEffect(() => {
    const requestId = ++subtitleRequestRef.current
    setSubtitleCues([])
    setSubtitleLoading(false)

    if (!selectedSubtitleUrl) return undefined

    const controller = new AbortController()
    setSubtitleLoading(true)
    setSubtitleStatus({ kind: 'working', text: 'Loading this subtitle…' })

    fetch(selectedSubtitleUrl, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'text/vtt' },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Subtitle request failed (HTTP ${response.status}).`)
        const body = await response.text()
        if (!body.trim() || !/^\uFEFF?WEBVTT/.test(body.trimStart())) {
          throw new Error('Plex did not return a WebVTT subtitle.')
        }
        if (requestId !== subtitleRequestRef.current) return

        const cues = parseVttCues(body)
        if (!cues.length) throw new Error('Plex returned a subtitle with no readable cues.')

        setSubtitleCues(cues)
        setSubtitleLoading(false)
        setSubtitleStatus(null)
      })
      .catch((error) => {
        if (error?.name === 'AbortError' || requestId !== subtitleRequestRef.current) return
        setSubtitleLoading(false)
        fallBackToBurn()
      })

    return () => controller.abort()
  }, [selectedSubtitleUrl, fallBackToBurn])

  useEffect(() => () => {
    subtitleRequestRef.current += 1
  }, [])

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
    setSelectedAudioId(session.selectedAudioId || null)
    setSelectedSubtitleId(session.selectedSubtitleId || null)
    setSubtitleCues([])
    subtitleFallbackRef.current = false
    setSubtitleStatus(session.burnSubtitles && session.selectedSubtitleId
      ? {
          kind: 'info',
          text: 'Plex is burning this subtitle into the video. It may take a moment to appear.',
        }
      : null)
    setMenuOpen(false)
    setAutoPlayOff(false)
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
    timeBaseRef.current = 0

    const playQuietly = () => {
      const attempt = video.play()
      if (attempt?.catch) {
        attempt.catch(() => {
          if (!cancelled) setNeedsPlay(true)
        })
      }
    }

    const onLoadedMetadata = () => {
      syncTimeBase()
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
  }, [session, syncTimeBase])

  useEffect(() => {
    const onKeyDown = (event) => {
      const insideControl = event.target?.closest?.('input, textarea, select, button')
      if (event.key === 'Escape') {
        if (menuOpen) {
          event.preventDefault()
          setMenuOpen(false)
          return
        }
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
          seekBy(-SKIP_SECONDS * 1000)
          revealControls()
          break
        case 'ArrowRight':
          event.preventDefault()
          seekBy(SKIP_SECONDS * 1000)
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
        case 'c':
          event.preventDefault()
          setMenuOpen((value) => !value)
          revealControls()
          break
        default:
          break
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [handleClose, menuOpen, revealControls, seekBy, togglePlay, toggleFullscreen])

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

  useEffect(() => {
    if (!ended || !nextEpisode || autoPlayOff) {
      setCountdown(null)
      return undefined
    }

    const total = 8
    setCountdown(total)
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      const remaining = total - Math.floor((Date.now() - startedAt) / 1000)
      if (remaining <= 0) {
        window.clearInterval(timer)
        setCountdown(0)
        onPlayNext()
        return
      }
      setCountdown(remaining)
    }, 250)

    return () => window.clearInterval(timer)
  }, [autoPlayOff, ended, nextEpisode, onPlayNext])

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
          onClick={() => {
            setMenuOpen(false)
            togglePlay()
          }}
          onDoubleClick={toggleFullscreen}
          onTimeUpdate={() => {
            // Keep checking until playback really starts: hls.js can report 0
            // first and then jump to the timestamp the segment carries.
            if (!hasStartedRef.current) syncTimeBase()
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
              : (end + timeBaseRef.current) * 1000
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

      {showVideo && activeCaption ? (
        <div className="player-captions" aria-live="off">
          <span>{activeCaption}</span>
        </div>
      ) : null}

      <div className="player-overlay__shade" aria-hidden="true" />

      {showVideo && canSkipIntro ? (
        <button
          type="button"
          className="player-skip"
          onClick={() => {
            seekTo(introMarker.endMs)
            revealControls()
          }}
        >
          Skip intro
          <SkipForward size={17} />
        </button>
      ) : null}

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
          {nextEpisode ? (
            <>
              <p className="eyebrow">Up next</p>
              <h2>{nextEpisode.seriesTitle || nextEpisode.title}</h2>
              <p className="player-ended__next">
                {[nextEpisode.episodeCode, nextEpisode.episodeTitle].filter(Boolean).join(' · ')
                  || 'Next episode'}
              </p>
              <p>
                {countdown > 0
                  ? `Autoplay starts in ${countdown} second${countdown === 1 ? '' : 's'}.`
                  : 'Autoplay is paused.'}
              </p>
              <div className="player-ended__actions">
                <button
                  type="button"
                  className="button button--primary button--large"
                  onClick={onPlayNext}
                >
                  <Play size={17} fill="currentColor" />
                  Play next episode
                </button>
                <button
                  type="button"
                  className="button button--glass button--large"
                  onClick={() => {
                    setAutoPlayOff(true)
                    setCountdown(null)
                  }}
                  disabled={autoPlayOff}
                >
                  Cancel autoplay
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => onClose(timeRef.current)}
                >
                  Back to Nocturne
                </button>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
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
                className="player-icon-button player-icon-button--seek"
                onClick={() => seekBy(-SKIP_SECONDS * 1000)}
                aria-label={`Back ${SKIP_SECONDS} seconds`}
                title={`Back ${SKIP_SECONDS} seconds (←)`}
              >
                <span className="player-seek-icon" aria-hidden="true">
                  <RotateCcw size={23} strokeWidth={1.7} />
                  <span className="player-seek-icon__amount">{SKIP_SECONDS}</span>
                </span>
              </button>
              <button
                type="button"
                className="player-icon-button player-icon-button--seek"
                onClick={() => seekBy(SKIP_SECONDS * 1000)}
                aria-label={`Forward ${SKIP_SECONDS} seconds`}
                title={`Forward ${SKIP_SECONDS} seconds (→)`}
              >
                <span className="player-seek-icon" aria-hidden="true">
                  <RotateCw size={23} strokeWidth={1.7} />
                  <span className="player-seek-icon__amount">{SKIP_SECONDS}</span>
                </span>
              </button>
              <span className="player-time">
                {formatClock(displayTime)}
                <span> / {formatClock(duration)}</span>
              </span>
            </div>

            <div className="player-controls__group player-controls__group--end">
              <button
                type="button"
                className={`player-icon-button${menuOpen ? ' is-active' : ''}`}
                onClick={() => setMenuOpen((value) => !value)}
                aria-label="Audio and subtitles"
                aria-expanded={menuOpen}
                title="Audio and subtitles (C)"
              >
                <Captions size={19} />
              </button>
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

          {menuOpen ? (
            <div className="player-tracks" role="dialog" aria-label="Audio and subtitles">
              <header className="player-tracks__head">
                <div>
                  <p className="eyebrow">Playback</p>
                  <h3>Audio &amp; subtitles</h3>
                </div>
                <button
                  type="button"
                  className="player-icon-button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close audio and subtitle menu"
                >
                  <X size={17} />
                </button>
              </header>

              <div className="player-tracks__columns">
                <section>
                  <h4>
                    <AudioLines size={14} />
                    Audio
                  </h4>
                  {audioTracks.length ? audioTracks.map((track) => (
                    <button
                      key={track.id}
                      type="button"
                      className={`player-tracks__option${track.id === selectedAudioId ? ' is-selected' : ''}`}
                      onClick={() => chooseAudio(track)}
                    >
                      <span className="player-tracks__label">{track.displayTitle}</span>
                      {track.id === selectedAudioId ? <Check size={15} /> : null}
                    </button>
                  )) : (
                    <p className="player-tracks__empty">Plex did not list separate audio tracks.</p>
                  )}
                </section>

                <section>
                  <h4>
                    <Captions size={14} />
                    Subtitles
                    {subtitleLoading ? (
                      <LoaderCircle size={12} className="spin" aria-label="Loading subtitles" />
                    ) : null}
                  </h4>
                  <button
                    type="button"
                    className={`player-tracks__option${!selectedSubtitleId ? ' is-selected' : ''}`}
                    onClick={() => chooseSubtitle(null)}
                  >
                    <span className="player-tracks__label">Off</span>
                    {!selectedSubtitleId ? <Check size={15} /> : null}
                  </button>
                  {subtitleTracks.map((track) => (
                    <button
                      key={track.id}
                      type="button"
                      className={`player-tracks__option${track.id === selectedSubtitleId ? ' is-selected' : ''}`}
                      onClick={() => chooseSubtitle(track)}
                    >
                      <span className="player-tracks__label">
                        {track.displayTitle}
                        <small>
                          {[track.forced ? 'Forced' : null, track.isImage ? 'Burn-in' : 'Text']
                            .filter(Boolean)
                            .join(' · ')}
                        </small>
                      </span>
                      {track.id === selectedSubtitleId ? <Check size={15} /> : null}
                    </button>
                  ))}
                  {!subtitleTracks.length ? (
                    <p className="player-tracks__empty">This file has no subtitle tracks.</p>
                  ) : null}
                </section>
              </div>

              {subtitleStatus ? (
                <p className={`player-tracks__note player-tracks__note--${subtitleStatus.kind}`}>
                  {subtitleStatus.text}
                </p>
              ) : null}

              {subtitleTracks.some((track) => track.isImage) ? (
                <p className="player-tracks__note">
                  Image subtitles restart the stream so Plex can burn them into the picture.
                </p>
              ) : null}

              {subtitleTracks.some((track) => !track.isImage) ? (
                <p className="player-tracks__note">
                  Text subtitles load instantly. If Plex cannot convert one, Nocturne
                  restarts the stream and burns it in automatically.
                </p>
              ) : null}
            </div>
          ) : null}
        </footer>
      ) : null}
    </div>
  )
}
