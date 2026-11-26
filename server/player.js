import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import { getCredentials } from './config.js'
import { fetchSubtitleVtt, getChildren, getMarkers, getMetadata } from './plex.js'
import { normalizeItem } from './nocturne.js'
import { PlexError, plexHeaders } from './plexAuth.js'

const SESSION_TTL_MS = 6 * 60 * 60 * 1000
const MAX_SESSIONS = 8

const sessions = new Map()

const DIRECT_CONTAINERS = new Set(['mp4', 'm4v', 'mov', 'webm'])
const BROWSER_VIDEO = new Set(['h264', 'avc', 'avc1', 'vp8', 'vp9', 'av1'])
const BROWSER_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis'])
const TEXT_SUBTITLE_CODECS = new Set([
  'srt', 'subrip', 'vtt', 'webvtt', 'txt', 'text', 'mov_text', 'timedtext', 'eia_608', 'cea608',
  'ass', 'ssa', 'sami', 'smi', 'ttml', 'dfxp', 'microdvd', 'subviewer', 'jacosub',
])

function now() {
  return Date.now()
}

function plexError(message, code, status = 502, detail = null) {
  return new PlexError(message, { status, code, detail })
}

function requireCredentials() {
  const credentials = getCredentials()
  if (!credentials.token || !credentials.server?.uri) {
    throw plexError(
      'Nocturne is not connected to Plex yet. Sign in on the setup screen first.',
      'NOT_CONFIGURED',
      503,
    )
  }
  return credentials
}

function plexUrl(pathWithQuery) {
  const { server } = requireCredentials()
  if (typeof pathWithQuery !== 'string' || !pathWithQuery.startsWith('/')) {
    throw plexError('Nocturne built an invalid Plex playback address.', 'BAD_PLAYER_PATH', 500)
  }

  const base = server.uri.replace(/\/+$/, '')
  let url
  try {
    url = new URL(`${base}${pathWithQuery}`)
  } catch {
    throw plexError('Nocturne built an invalid Plex playback address.', 'BAD_PLAYER_PATH', 500)
  }

  if (url.origin !== new URL(base).origin) {
    throw plexError('Nocturne refused an unexpected playback address.', 'BAD_PLAYER_PATH', 500)
  }
  return url
}

// Plex ignores audioStreamID/subtitleStreamID on the HLS request more often
// than it honours them: its transcoder resolves both through the streams saved
// on the part (that is what Plex's own clients update). Writing the choice here
// before the transcode starts is what actually switches the track.
async function savePlexStreamSelection(part, { audioStreamId = null, subtitleStreamId = null } = {}) {
  const partId = String(part?.id ?? '')
  if (!/^\d+$/.test(partId)) return

  const query = new URLSearchParams({ allParts: '0' })
  if (/^\d+$/.test(String(audioStreamId ?? ''))) query.set('audioStreamID', String(audioStreamId))
  if (/^\d+$/.test(String(subtitleStreamId ?? ''))) {
    query.set('subtitleStreamID', String(subtitleStreamId))
  }
  if (!query.has('audioStreamID') && !query.has('subtitleStreamID')) return

  const { token, clientIdentifier } = requireCredentials()

  try {
    const response = await fetch(plexUrl(`/library/parts/${partId}?${query.toString()}`), {
      method: 'PUT',
      headers: plexHeaders(clientIdentifier, token),
      signal: AbortSignal.timeout(6000),
    })
    if (!response.ok) {
      console.warn(
        `[Nocturne] Plex did not save the chosen tracks for part ${partId} (HTTP ${response.status}).`,
      )
    }
  } catch (error) {
    // Saving the preference must never block playback; the transcode request
    // still carries the stream IDs as a second attempt.
    console.warn(
      `[Nocturne] Could not save the chosen tracks for part ${partId}.`,
      error?.message || '',
    )
  }
}

function playbackHeaders(playbackSessionId) {
  const { token, clientIdentifier } = requireCredentials()
  return {
    ...plexHeaders(clientIdentifier, token),
    Accept: '*/*',
    'X-Plex-Playback-Session-Id': playbackSessionId,
    'X-Plex-Playback-Client': 'Nocturne',
  }
}

function safePartKey(value) {
  if (typeof value !== 'string') return null
  if (!value.startsWith('/library/parts/')) return null
  if (value.length > 2048 || value.includes('..') || value.includes('\\') || value.includes('\0')) {
    return null
  }
  return value
}

function pickMedia(raw) {
  const mediaList = Array.isArray(raw?.Media) ? raw.Media : []
  if (!mediaList.length) return null

  const mediaIndex = Math.max(0, mediaList.findIndex((entry) => entry?.selected))
  const media = mediaList[mediaIndex] || mediaList[0]
  const parts = Array.isArray(media?.Part) ? media.Part : []
  if (!parts.length) return null

  const partIndex = Math.max(0, parts.findIndex((entry) => entry?.selected))
  const part = parts[partIndex] || parts[0]
  if (!safePartKey(part?.key)) return null

  return { media, mediaIndex, part, partIndex }
}

function containerOf(media, part) {
  return String(part?.container || media?.container || '').toLowerCase()
}

function canDirectPlay(media, part) {
  const container = containerOf(media, part)
  const video = String(media?.videoCodec || '').toLowerCase()
  const audio = String(media?.audioCodec || '').toLowerCase()

  if (!DIRECT_CONTAINERS.has(container)) return false
  if (video && !BROWSER_VIDEO.has(video)) return false
  if (audio && !BROWSER_AUDIO.has(audio)) return false
  return true
}

function canRemuxVideo(media) {
  const video = String(media?.videoCodec || '').toLowerCase()
  return video === 'h264' || video === 'avc' || video === 'avc1'
}

function streamLabel(stream, fallback) {
  if (stream?.displayTitle) return stream.displayTitle
  const parts = []
  if (stream?.language) parts.push(stream.language)
  if (stream?.codec) parts.push(String(stream.codec).toUpperCase())
  if (Number(stream?.channels) > 0) parts.push(`${Number(stream.channels)}ch`)
  if (stream?.title && !parts.includes(stream.title)) parts.push(stream.title)
  return parts.join(' · ') || fallback
}

function normalizeStreams(part) {
  const audio = []
  const subtitles = []
  const raw = Array.isArray(part?.Stream) ? part.Stream : []

  for (const stream of raw) {
    const id = String(stream?.id ?? '')
    if (!/^\d+$/.test(id)) continue
    const streamType = Number(stream.streamType)

    if (streamType === 2) {
      audio.push({
        id,
        codec: stream.codec || null,
        language: stream.language || null,
        languageCode: stream.languageCode || null,
        title: stream.title || null,
        displayTitle: streamLabel(stream, `Audio ${audio.length + 1}`),
        channels: Number(stream.channels) || null,
        // `default` is the file's own flag; `selected` is the choice saved for
        // this user, which Nocturne itself writes when a track is switched.
        default: Boolean(stream.default),
        selected: Boolean(stream.selected),
      })
      continue
    }

    if (streamType === 3) {
      const codec = String(stream.codec || '').toLowerCase()
      subtitles.push({
        id,
        codec: stream.codec || null,
        language: stream.language || null,
        languageCode: stream.languageCode || null,
        title: stream.title || null,
        displayTitle: streamLabel(stream, `Subtitle ${subtitles.length + 1}`),
        forced: Boolean(stream.forced),
        hearingImpaired: Boolean(stream.hearingImpaired),
        selected: Boolean(stream.selected),
        isImage: Boolean(codec) && !TEXT_SUBTITLE_CODECS.has(codec),
      })
    }
  }

  return { audio, subtitles }
}

function normalizeMarker(marker) {
  if (!marker) return null
  const start = Number(marker.startTimeOffset)
  const end = Number(marker.endTimeOffset)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  return { startMs: Math.round(start), endMs: Math.round(end) }
}

function normalizeMarkers(raw, fallbackMarkers = []) {
  const list = Array.isArray(raw?.Marker) && raw.Marker.length ? raw.Marker : fallbackMarkers
  const markers = Array.isArray(list) ? list : []
  const find = (type) => markers.find((marker) => String(marker?.type).toLowerCase() === type)
  return {
    intro: normalizeMarker(find('intro')),
    credits: normalizeMarker(find('credits')),
  }
}

async function fetchMarkers(ratingKey) {
  try {
    return await getMarkers(ratingKey)
  } catch {
    return []
  }
}

async function findNextEpisode(raw) {
  if (raw?.type !== 'episode' || !raw.parentRatingKey || !raw.grandparentRatingKey) return null

  const byIndex = (a, b) => (Number(a.index) || 0) - (Number(b.index) || 0)

  try {
    const siblings = await getChildren(raw.parentRatingKey)
    const episodes = siblings.filter((child) => child.type === 'episode').sort(byIndex)
    const currentIndex = episodes.findIndex(
      (child) => String(child.ratingKey) === String(raw.ratingKey),
    )
    if (currentIndex >= 0 && episodes[currentIndex + 1]) {
      return normalizeItem(episodes[currentIndex + 1])
    }

    const seasons = (await getChildren(raw.grandparentRatingKey))
      .filter((child) => child.type === 'season')
      .sort(byIndex)
    const seasonIndex = seasons.findIndex(
      (season) => String(season.ratingKey) === String(raw.parentRatingKey),
    )
    if (seasonIndex < 0) return null

    for (let index = seasonIndex + 1; index < seasons.length; index += 1) {
      const children = await getChildren(seasons[index].ratingKey)
      const first = children.filter((child) => child.type === 'episode').sort(byIndex)[0]
      if (first) return normalizeItem(first)
    }
  } catch {
    return null
  }

  return null
}

function clampOffset(offsetMs, duration) {
  const offset = Math.max(0, Math.round(Number(offsetMs) || 0))
  if (duration > 0 && offset > duration - 20_000) return 0
  return Math.min(offset, SESSION_TTL_MS)
}

function stopSessionOnPlex(session) {
  const transcodeSession = session.plexSessionId || session.playbackSessionId
  if (!transcodeSession) return

  try {
    const url = plexUrl(`/video/:/transcode/universal/stop?session=${encodeURIComponent(transcodeSession)}`)
    fetch(url, {
      headers: playbackHeaders(session.playbackSessionId),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {})
  } catch {
    // The Plex connection may have been removed while a session was open.
  }
}

function forgetSession(session, { stopTranscode = true } = {}) {
  if (!session || session.closed) return
  session.closed = true
  sessions.delete(session.id)
  if (stopTranscode) stopSessionOnPlex(session)
}

function cleanupSessions() {
  const cutoff = now() - SESSION_TTL_MS
  const ordered = [...sessions.values()].sort((a, b) => a.touchedAt - b.touchedAt)

  for (const session of ordered) {
    if (session.touchedAt < cutoff) forgetSession(session)
  }

  while ([...sessions.values()].length > MAX_SESSIONS) {
    const oldest = [...sessions.values()].sort((a, b) => a.touchedAt - b.touchedAt)[0]
    if (!oldest) break
    forgetSession(oldest)
  }
}

const cleanupTimer = setInterval(cleanupSessions, 10 * 60 * 1000)
cleanupTimer.unref?.()

async function reportTimeline(session, { state, timeMs }) {
  const { token, clientIdentifier } = requireCredentials()
  const time = Math.max(0, Math.min(Math.round(Number(timeMs) || 0), session.duration || 0))
  const query = new URLSearchParams({
    ratingKey: session.ratingKey,
    key: `/library/metadata/${session.ratingKey}`,
    state,
    time: String(time),
    duration: String(session.duration || 0),
    hasMDE: '1',
  })
  const url = plexUrl(`/:/timeline?${query.toString()}`)

  try {
    await fetch(url, {
      headers: {
        ...plexHeaders(clientIdentifier, token),
        'X-Plex-Playback-Session-Id': session.playbackSessionId,
      },
      signal: AbortSignal.timeout(6000),
    })
  } catch {
    // Progress reporting is best-effort; playback should never fail because of it.
  }
}

async function scrobble(session) {
  const { token, clientIdentifier } = requireCredentials()
  const url = plexUrl(
    `/:/scrobble?key=${encodeURIComponent(session.ratingKey)}&identifier=com.plexapp.plugins.library`,
  )
  try {
    await fetch(url, {
      headers: {
        ...plexHeaders(clientIdentifier, token),
        'X-Plex-Playback-Session-Id': session.playbackSessionId,
      },
      signal: AbortSignal.timeout(6000),
    })
  } catch {
    // Best-effort, like the timeline reports.
  }
}

async function pingTranscode(session) {
  if (!session.plexSessionId) return
  if (now() - session.lastPingAt < 12_000) return
  session.lastPingAt = now()

  try {
    await fetch(plexUrl(`/video/:/transcode/segmented/ping?session=${encodeURIComponent(session.plexSessionId)}`), {
      headers: playbackHeaders(session.playbackSessionId),
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    // A missed ping does not break an active stream.
  }
}

function transcodeStartPath(session) {
  const query = new URLSearchParams({
    path: `/library/metadata/${session.ratingKey}`,
    mediaIndex: String(session.mediaIndex),
    partIndex: String(session.partIndex),
    protocol: 'hls',
    fastSeek: '1',
    directPlay: '0',
    // Burn-in changes the picture itself. Allowing Plex to remux/direct-stream
    // the video can leave the subtitles out even though they were requested.
    directStream: session.burnSubtitles ? '0' : (session.remuxVideo ? '1' : '0'),
    subtitleSize: '100',
    audioBoost: '100',
    location: 'lan',
    session: session.playbackSessionId,
    copyts: '1',
    hasMDE: '1',
  })

  if (session.audioStreamId) {
    query.set('audioStreamID', session.audioStreamId)
  }
  if (session.audioChanged) {
    // The chosen track may be AC3, EAC3, DTS or TrueHD, which browsers cannot
    // decode. Copy the video but always transcode the audio to a safe codec.
    query.set('directStreamAudio', '0')
  }
  if (session.burnSubtitles && session.subtitleStreamId) {
    query.set('subtitleStreamID', session.subtitleStreamId)
    query.set('subtitles', 'burn')
  } else {
    // Text subtitles are fetched and drawn by Nocturne. This stops Plex from
    // auto-selecting a different track and burning that one in instead.
    query.set('subtitles', 'none')
  }
  if (session.offsetMs >= 1000) {
    query.set('offset', String(Math.floor(session.offsetMs / 1000)))
  }

  return `/video/:/transcode/universal/start.m3u8?${query.toString()}`
}

function publicSession(session) {
  return {
    sessionId: session.id,
    mode: session.mode,
    src: session.mode === 'hls'
      ? `/api/player/${session.id}/master.m3u8`
      : `/api/player/${session.id}/stream`,
    offsetMs: session.offsetMs,
    durationMs: session.duration,
    ratingKey: session.ratingKey,
    title: session.title,
    subtitle: session.subtitle,
    year: session.year,
    directPlay: session.mode === 'direct',
    transcodeReason: session.transcodeReason,
    selectedAudioId: session.audioStreamId,
    selectedSubtitleId: session.subtitleStreamId,
    burnSubtitles: session.burnSubtitles,
    streams: {
      audio: session.streams.audio,
      subtitles: session.streams.subtitles.map((track) => ({
        ...track,
        url: track.isImage ? null : `/api/player/${session.id}/subtitles/${track.id}`,
      })),
    },
    markers: session.markers,
    nextEpisode: session.nextEpisode,
  }
}

export async function startPlayback(
  ratingKey,
  {
    offsetMs = 0,
    audioStreamId = null,
    subtitleStreamId = null,
    burnSubtitles: forceBurnSubtitles = false,
  } = {},
) {
  requireCredentials()

  const raw = await getMetadata(ratingKey)
  if (!raw || !['movie', 'episode'].includes(raw.type)) {
    throw plexError(
      'That item cannot be played directly. Choose a movie or an episode.',
      'NOT_PLAYABLE',
      400,
    )
  }

  const selected = pickMedia(raw)
  if (!selected) {
    throw plexError(
      'Plex has no playable media file for this title yet. It may still be scanning or the file is missing.',
      'NO_MEDIA_FILE',
      409,
    )
  }

  const { media, mediaIndex, part, partIndex } = selected
  const streams = normalizeStreams(part)
  const requestedAudioId = /^\d+$/.test(String(audioStreamId ?? '')) ? String(audioStreamId) : null
  const requestedSubtitleId = /^\d+$/.test(String(subtitleStreamId ?? ''))
    ? String(subtitleStreamId)
    : null
  const fileDefaultAudio = streams.audio.find((track) => track.default)
    || streams.audio[0]
    || null
  const requestedAudio = streams.audio.find((track) => track.id === requestedAudioId) || null
  const selectedAudio = requestedAudio
    || streams.audio.find((track) => track.selected)
    || fileDefaultAudio
  const selectedSubtitle = streams.subtitles.find(
    (track) => track.id === requestedSubtitleId,
  ) || null
  // Image formats always have to be burned. Text formats are shown by the
  // browser when Plex can convert them, and the player asks for burn-in only
  // when that conversion fails (or when it must survive a previous burn-in).
  const burnSubtitles = Boolean(selectedSubtitle)
    && (selectedSubtitle.isImage || Boolean(forceBurnSubtitles))
  // Direct play hands the file to the browser, which always plays the file's
  // own default audio, so any other selection needs Plex to remux it.
  const audioChanged = Boolean(
    selectedAudio && fileDefaultAudio && selectedAudio.id !== fileDefaultAudio.id,
  )
  const directPlayable = canDirectPlay(media, part)
  const duration = Math.max(0, Number(raw.duration) || Number(media.duration) || 0)
  const offset = clampOffset(offsetMs, duration)
  const direct = directPlayable && !burnSubtitles && !audioChanged

  // Save the user's menu choice on the Plex part so the transcoder uses it.
  // Only explicit choices are written, so plain playback never rewrites the
  // library's own default tracks.
  if (requestedAudio || (burnSubtitles && selectedSubtitle)) {
    await savePlexStreamSelection(part, {
      audioStreamId: requestedAudio?.id || null,
      subtitleStreamId: burnSubtitles ? selectedSubtitle?.id || null : null,
    })
  }

  const [fallbackMarkers, nextEpisode] = await Promise.all([
    Array.isArray(raw.Marker) && raw.Marker.length
      ? Promise.resolve([])
      : fetchMarkers(raw.ratingKey),
    findNextEpisode(raw),
  ])
  const markers = normalizeMarkers(raw, fallbackMarkers)

  const reasons = []
  if (!directPlayable) {
    reasons.push(`${containerOf(media, part) || 'this file'} needs conversion for the browser`)
  }
  if (audioChanged) reasons.push('the chosen audio track needs Plex to remux the file')
  if (burnSubtitles) reasons.push(`${selectedSubtitle.codec || 'these'} subtitles are burned into the picture`)

  const session = {
    id: crypto.randomUUID(),
    playbackSessionId: crypto.randomUUID(),
    created: now(),
    touchedAt: now(),
    lastPingAt: 0,
    ratingKey: String(ratingKey),
    duration,
    offsetMs: offset,
    mediaIndex,
    partIndex,
    partKey: part.key,
    plexSessionId: null,
    closed: false,
    mode: direct ? 'direct' : 'hls',
    remuxVideo: canRemuxVideo(media),
    streams,
    audioStreamId: selectedAudio?.id || null,
    audioChanged,
    subtitleStreamId: selectedSubtitle?.id || null,
    burnSubtitles,
    markers,
    nextEpisode,
    title: raw.type === 'episode' ? raw.grandparentTitle || raw.title : raw.title,
    subtitle: raw.type === 'episode'
      ? [
          raw.parentIndex != null && raw.index != null ? `S${raw.parentIndex} · E${raw.index}` : null,
          raw.title,
        ].filter(Boolean).join(' · ')
      : null,
    year: Number(raw.year) || null,
    transcodeReason: direct ? null : reasons.join('; '),
  }

  sessions.set(session.id, session)
  cleanupSessions()

  await reportTimeline(session, { state: 'buffering', timeMs: offset })

  return publicSession(session)
}

export function getSession(id) {
  const session = sessions.get(String(id))
  if (!session) {
    throw plexError(
      'This playback session has ended. Press play again to restart it.',
      'PLAYBACK_SESSION_GONE',
      410,
    )
  }
  session.touchedAt = now()
  return session
}

function rewritePlaylist(body, baseUrl, session) {
  const base = new URL(baseUrl)

  const proxyUri = (value) => {
    let resolved
    try {
      resolved = new URL(value, base)
    } catch {
      return value
    }

    resolved.searchParams.delete('X-Plex-Token')
    resolved.searchParams.delete('x-plex-token')

    if (resolved.origin !== base.origin) return resolved.toString()
    if (!resolved.pathname.startsWith('/video/:/transcode/universal/')) return resolved.toString()

    const target = `${resolved.pathname}${resolved.search}`
    return `/api/player/${session.id}/hls?u=${encodeURIComponent(target)}`
  }

  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return line
      if (trimmed.startsWith('#')) {
        return trimmed.replace(/URI="([^"]+)"/g, (match, uri) => `URI="${proxyUri(uri)}"`)
      }
      return proxyUri(trimmed)
    })
    .join('\n')
}

function extractTranscodeSession(playlist, session) {
  const match = playlist.match(/session\/([^/?#]+)\/base/)
  if (match?.[1] && match[1] !== session.plexSessionId) {
    session.plexSessionId = match[1]
  }
}

async function fetchUpstream(session, pathWithQuery, { range, timeout = 45000 } = {}) {
  const { token, clientIdentifier } = requireCredentials()
  const url = plexUrl(pathWithQuery)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  let response
  try {
    response = await fetch(url, {
      headers: {
        ...plexHeaders(clientIdentifier, token),
        Accept: '*/*',
        'X-Plex-Playback-Session-Id': session.playbackSessionId,
        'X-Plex-Playback-Client': 'Nocturne',
        ...(range ? { Range: range } : {}),
      },
      signal: controller.signal,
      redirect: 'follow',
    })
  } catch (error) {
    clearTimeout(timer)
    const timedOut = error?.name === 'AbortError' || error?.name === 'TimeoutError'
    throw plexError(
      timedOut
        ? 'Plex took too long to start this video. It may be busy transcoding another stream.'
        : 'Nocturne could not reach Plex while starting playback. Check that Plex is running.',
      'PLEX_PLAYBACK_UNREACHABLE',
      502,
      error?.message || null,
    )
  }

  clearTimeout(timer)
  return { response, controller }
}

function pipeUpstream(res, upstream, controller) {
  res.status(upstream.status)

  for (const header of [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'content-encoding',
  ]) {
    const value = upstream.headers.get(header)
    if (value) res.setHeader(header, value)
  }

  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Accel-Buffering', 'no')

  if (!upstream.body) {
    res.end()
    return
  }

  const stream = Readable.fromWeb(upstream.body)
  const abort = () => {
    controller.abort()
    stream.destroy()
  }
  res.on('close', abort)
  stream.on('error', () => {
    if (!res.headersSent) res.status(502)
    res.end()
  })
  stream.pipe(res)
}

async function readErrorMessage(response) {
  try {
    const text = await response.text()
    const data = JSON.parse(text)
    return data?.error?.message || text.slice(0, 180) || null
  } catch {
    return null
  }
}

export async function streamDirect(req, res, id) {
  const session = getSession(id)
  if (session.mode !== 'direct') {
    throw plexError('This playback session is not a direct stream.', 'WRONG_PLAYBACK_MODE', 409)
  }

  const { response, controller } = await fetchUpstream(session, session.partKey, {
    range: req.get('Range'),
    timeout: 30000,
  })

  if (!response.ok && response.status !== 206) {
    const detail = await readErrorMessage(response)
    controller.abort()
    throw plexError(
      response.status === 404
        ? 'Plex could not find the video file for this title. Rescan the library in Plex.'
        : 'Plex refused to stream this video file.',
      'PLEX_STREAM_FAILED',
      502,
      detail || `Plex returned HTTP ${response.status}`,
    )
  }

  res.setHeader('Content-Disposition', 'inline')
  pipeUpstream(res, response, controller)
}

export async function streamSubtitle(req, res, id, streamId) {
  const session = getSession(id)
  const track = session.streams.subtitles.find((entry) => entry.id === String(streamId))
  if (!track) {
    throw plexError(
      'That subtitle track is not part of this playback session.',
      'SUBTITLE_NOT_FOUND',
      404,
    )
  }
  if (track.isImage) {
    throw plexError(
      'This subtitle format has to be burned into the video by Plex.',
      'SUBTITLE_NEEDS_BURN',
      409,
    )
  }

  let vtt
  try {
    vtt = await fetchSubtitleVtt(track.id)
  } catch (error) {
    console.warn(
      `[Nocturne] Could not load subtitle ${track.id} (${track.codec || 'unknown'}).`,
      error.message,
    )
    throw error
  }
  // Plex returns the track on the file's own timeline, which is the same clock
  // the player reports positions in. Shifting the cues to the transcode's start
  // made every caption fall outside the current position, so they never showed
  // on a resumed or transcoded title.
  res.setHeader('Content-Type', 'text/vtt; charset=utf-8')
  res.setHeader('Cache-Control', 'private, max-age=3600')
  res.send(vtt)
}

export async function streamMaster(req, res, id) {
  const session = getSession(id)
  if (session.mode !== 'hls') {
    throw plexError('This playback session is not transcoded.', 'WRONG_PLAYBACK_MODE', 409)
  }

  const startPath = transcodeStartPath(session)
  const { response, controller } = await fetchUpstream(session, startPath, { timeout: 60000 })

  if (!response.ok) {
    const detail = await readErrorMessage(response)
    controller.abort()
    throw plexError(
      response.status === 401 || response.status === 403
        ? 'Plex rejected this playback request. Reconnect your Plex account in Settings.'
        : 'Plex could not start a transcode for this title.',
      'PLEX_TRANSCODE_FAILED',
      502,
      detail || `Plex returned HTTP ${response.status}`,
    )
  }

  const playlist = await response.text()
  if (!playlist.trimStart().startsWith('#EXTM3U')) {
    throw plexError(
      'Plex did not return a playable transcode playlist for this title.',
      'PLEX_TRANSCODE_FAILED',
      502,
      playlist.slice(0, 180) || null,
    )
  }

  extractTranscodeSession(playlist, session)
  await pingTranscode(session)

  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
  res.setHeader('Cache-Control', 'no-store')
  res.send(rewritePlaylist(playlist, response.url || plexUrl(startPath).toString(), session))
}

function validateHlsTarget(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) {
    throw plexError('Nocturne rejected an invalid stream address.', 'BAD_STREAM_PATH', 400)
  }
  if (value.length > 4096 || value.includes('..') || value.includes('\\') || value.startsWith('//')) {
    throw plexError('Nocturne rejected an invalid stream address.', 'BAD_STREAM_PATH', 400)
  }

  let parsed
  try {
    parsed = new URL(value, 'http://nocturne.local')
  } catch {
    throw plexError('Nocturne rejected an invalid stream address.', 'BAD_STREAM_PATH', 400)
  }

  if (parsed.origin !== 'http://nocturne.local') {
    throw plexError('Nocturne rejected an invalid stream address.', 'BAD_STREAM_PATH', 400)
  }
  if (!parsed.pathname.startsWith('/video/:/transcode/universal/')) {
    throw plexError('Nocturne rejected an invalid stream address.', 'BAD_STREAM_PATH', 400)
  }

  parsed.searchParams.delete('X-Plex-Token')
  parsed.searchParams.delete('x-plex-token')
  return `${parsed.pathname}${parsed.search}`
}

export async function streamHls(req, res, id) {
  const session = getSession(id)
  if (session.mode !== 'hls') {
    throw plexError('This playback session is not transcoded.', 'WRONG_PLAYBACK_MODE', 409)
  }

  const target = validateHlsTarget(req.query.u)
  const { response, controller } = await fetchUpstream(session, target, {
    range: req.get('Range'),
    timeout: 60000,
  })

  if (!response.ok && response.status !== 206) {
    const detail = await readErrorMessage(response)
    controller.abort()
    throw plexError(
      'Plex stopped sending the video stream. The transcode may have failed on the server.',
      'PLEX_STREAM_FAILED',
      502,
      detail || `Plex returned HTTP ${response.status}`,
    )
  }

  const contentType = response.headers.get('content-type') || ''
  const isPlaylist = target.split('?')[0].endsWith('.m3u8')
    || contentType.includes('mpegurl')

  if (isPlaylist) {
    const body = await response.text()
    if (!body.trimStart().startsWith('#EXTM3U')) {
      throw plexError(
        'Plex returned an invalid HLS playlist for this title.',
        'PLEX_TRANSCODE_FAILED',
        502,
        body.slice(0, 180) || null,
      )
    }

    extractTranscodeSession(body, session)
    await pingTranscode(session)
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
    res.setHeader('Cache-Control', 'no-store')
    res.send(rewritePlaylist(body, response.url || plexUrl(target).toString(), session))
    return
  }

  await pingTranscode(session)
  pipeUpstream(res, response, controller)
}

export async function progressPlayback(id, { timeMs, state = 'playing' } = {}) {
  const session = getSession(id)
  const allowed = new Set(['playing', 'paused', 'buffering', 'stopped'])
  const nextState = allowed.has(state) ? state : 'playing'

  await reportTimeline(session, { state: nextState, timeMs })
  return { ok: true }
}

export async function stopPlayback(id, { timeMs, completed = false } = {}) {
  const session = sessions.get(String(id))
  if (!session) return { ok: true }

  await reportTimeline(session, { state: 'stopped', timeMs })
  if (completed || (session.duration > 0 && Number(timeMs) >= session.duration * 0.92)) {
    await scrobble(session)
  }

  forgetSession(session)
  return { ok: true }
}

export function activeSessionCount() {
  return sessions.size
}
