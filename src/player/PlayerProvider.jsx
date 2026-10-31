import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api.js'
import { PlayerOverlay } from '../components/PlayerOverlay.jsx'

const PlayerContext = createContext(null)

export function usePlayer() {
  const value = useContext(PlayerContext)
  if (!value) {
    throw new Error('usePlayer must be used inside PlayerProvider')
  }
  return value
}

function resumePoint(item) {
  if (!item) return 0
  const offset = Number(item.viewOffset) || 0
  const duration = Number(item.duration) || 0
  if (offset < 5000) return 0
  if (duration > 0 && offset / duration > 0.96) return 0
  return offset
}

export function PlayerProvider({ children }) {
  const [playback, setPlayback] = useState(null)
  const playbackRef = useRef(null)
  const requestRef = useRef(0)
  const lastTimeRef = useRef(0)

  useEffect(() => {
    playbackRef.current = playback
  }, [playback])

  const begin = useCallback(async (
    item,
    offsetMs,
    { audioStreamId = null, subtitleStreamId = null, burnSubtitles = false } = {},
  ) => {
    const requestId = ++requestRef.current
    const startAt = Math.max(0, Math.round(Number(offsetMs) || 0))
    lastTimeRef.current = startAt

    setPlayback({
      item,
      session: null,
      phase: 'starting',
      error: null,
      pendingOffset: startAt,
      selection: { audioStreamId, subtitleStreamId, burnSubtitles: Boolean(burnSubtitles) },
      nextEpisode: null,
    })

    try {
      const result = await api.startPlayback(item.ratingKey, {
        offsetMs: startAt,
        audioStreamId,
        subtitleStreamId,
        burnSubtitles: Boolean(burnSubtitles),
      })
      if (requestRef.current !== requestId) {
        api.stopPlayback(result.session.sessionId, { timeMs: startAt }).catch(() => {})
        return
      }
      setPlayback({
        item,
        session: result.session,
        phase: 'ready',
        error: null,
        pendingOffset: startAt,
        selection: {
          audioStreamId: result.session.selectedAudioId || null,
          subtitleStreamId: result.session.selectedSubtitleId || null,
          burnSubtitles: Boolean(result.session.burnSubtitles),
        },
        nextEpisode: result.session.nextEpisode || null,
      })
    } catch (error) {
      if (requestRef.current !== requestId) return
      setPlayback((previous) => (
        previous ? { ...previous, session: null, phase: 'error', error } : null
      ))
    }
  }, [])

  const openPlayer = useCallback((item, { offsetMs } = {}) => {
    if (!item?.ratingKey) return
    const startAt = Number.isFinite(offsetMs) ? offsetMs : resumePoint(item)
    begin(item, startAt)
  }, [begin])

  const closePlayer = useCallback((timeMs) => {
    const current = playbackRef.current
    requestRef.current += 1
    setPlayback(null)

    if (current?.session) {
      api.stopPlayback(current.session.sessionId, {
        timeMs: Math.max(0, Math.round(Number(timeMs) ?? lastTimeRef.current)),
      }).catch(() => {})
    }
  }, [])

  const restartAt = useCallback((offsetMs, selection = {}) => {
    const current = playbackRef.current
    if (!current?.item) return

    if (current.session) {
      api.stopPlayback(current.session.sessionId, {
        timeMs: Math.max(0, Math.round(lastTimeRef.current)),
      }).catch(() => {})
    }

    const hasAudioChoice = Object.prototype.hasOwnProperty.call(selection, 'audioStreamId')
    const hasSubtitleChoice = Object.prototype.hasOwnProperty.call(selection, 'subtitleStreamId')
    const hasBurnChoice = Object.prototype.hasOwnProperty.call(selection, 'burnSubtitles')

    begin(current.item, offsetMs, {
      audioStreamId: hasAudioChoice
        ? selection.audioStreamId
        : current.selection?.audioStreamId ?? null,
      subtitleStreamId: hasSubtitleChoice
        ? selection.subtitleStreamId
        : current.selection?.subtitleStreamId ?? null,
      burnSubtitles: hasBurnChoice
        ? Boolean(selection.burnSubtitles)
        : Boolean(current.selection?.burnSubtitles),
    })
  }, [begin])

  const retry = useCallback(() => {
    const current = playbackRef.current
    if (!current?.item) return
    begin(current.item, current.pendingOffset ?? lastTimeRef.current, current.selection || {})
  }, [begin])

  const reportProgress = useCallback((timeMs, state) => {
    const current = playbackRef.current
    lastTimeRef.current = Math.max(0, Math.round(Number(timeMs) || 0))
    if (!current?.session) return

    api.playbackProgress(current.session.sessionId, {
      timeMs: lastTimeRef.current,
      state,
    }).catch(() => {})
  }, [])

  const finishPlayback = useCallback(() => {
    const current = playbackRef.current
    if (!current) return

    const duration = current.session?.durationMs || lastTimeRef.current
    lastTimeRef.current = duration
    if (current.session) {
      api.stopPlayback(current.session.sessionId, {
        timeMs: duration,
        completed: true,
      }).catch(() => {})
    }
    const nextEpisode = current.session?.nextEpisode || current.nextEpisode || null
    setPlayback((previous) => (
      previous ? { ...previous, session: null, phase: 'ended', nextEpisode } : null
    ))
  }, [])

  const replay = useCallback(() => {
    const current = playbackRef.current
    if (!current?.item) return
    begin(current.item, 0, current.selection || {})
  }, [begin])

  const playNext = useCallback(() => {
    const current = playbackRef.current
    if (!current?.nextEpisode) return
    begin(current.nextEpisode, 0)
  }, [begin])

  const value = useMemo(() => ({
    openPlayer,
    playback,
    closePlayer,
    restartAt,
    retry,
    replay,
    playNext,
    reportProgress,
    finishPlayback,
  }), [
    openPlayer,
    playback,
    closePlayer,
    restartAt,
    retry,
    replay,
    playNext,
    reportProgress,
    finishPlayback,
  ])

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {playback ? (
        <PlayerOverlay
          playback={playback}
          onClose={closePlayer}
          onRestart={restartAt}
          onRetry={retry}
          onReplay={replay}
          onPlayNext={playNext}
          onReport={reportProgress}
          onEnded={finishPlayback}
        />
      ) : null}
    </PlayerContext.Provider>
  )
}
